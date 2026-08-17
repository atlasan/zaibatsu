// The Zaibatsu rules engine: setup and the turn-phase state machine. A pure
// reducer (state × action → state) with no I/O. Mirrors
// impl/go/internal/engine. See DOCS/turn-flow.md and DOCS/parity.md.

import { newRng } from "../domain/rng.ts";
import { newCybernet, type Coord } from "../domain/hex.ts";
import {
  centralCore,
  currentPlayer,
  markersRemaining,
  playerById,
  type GameData,
  type GameState,
  type Mode,
  type Player,
} from "../domain/types.ts";

import { checkWin } from "./win.ts";
import { moveHex, moveSteps, type SpaceRef } from "./movement.ts";
import { deleteAbility, deleteMulti } from "./combat.ts";
import { icebreakBlock, icebreakPawn } from "./icebreaker.ts";
import { reboot, search } from "./abilities.ts";
import { playDelete, playIcebreakBlock, playIcebreakPawn, playReboot, playSearch } from "./cards.ts";
import { attachToBlock, attachToEnemy, attachToPawn } from "./attach.ts";

export * from "./placement.ts";
export * from "./movement.ts";
export * from "./combat.ts";
export * from "./icebreaker.ts";
export * from "./abilities.ts";
export * from "./cards.ts";
export * from "./attach.ts";
export * from "./snapshot.ts";
export { winner } from "./win.ts";

export interface Config {
  data: GameData;
  playerNames: string[];
  seed: number | bigint;
}

export type ActionType =
  | "pass"
  | "place-marker"
  | "move-hex"
  | "move-steps"
  | "delete"
  | "delete-multi"
  | "icebreak-block"
  | "icebreak-pawn"
  | "search"
  | "reboot"
  | "play-delete"
  | "play-icebreak-block"
  | "play-icebreak-pawn"
  | "play-search"
  | "play-reboot"
  | "attach-pawn"
  | "attach-enemy"
  | "attach-block";

/**
 * A single player intent — a tagged union whose `type` selects which fields are
 * read. `playerId` defaults to the current player when omitted. Mirrors the Go
 * Action struct. Not every field applies to every type.
 */
export interface Action {
  type: ActionType;
  playerId?: string;
  cardId?: string;
  cardIds?: string[];
  pawnId?: string; // acting pawn (attacker/actor/searcher/rebooted)
  path?: SpaceRef[]; // declared space-to-space movement path
  targetId?: string;
  targetIds?: string[];
  coord?: Coord;
  dir?: number;
  rotation?: number;
  extraSkulls?: number;
  extraRollDice?: number;
}

/** Structured engine output for local clients. It is intentionally presentation-free. */
export type EngineEventType =
  | "phase-advanced"
  | "action-accepted"
  | "roll"
  | "draw"
  | "elimination"
  | "control-changed"
  | "winner-declared"
  | "validation-failed";

export interface EngineEvent {
  type: EngineEventType;
  playerId?: string;
  actionType?: ActionType;
  fromPhase?: import("../domain/types.ts").Phase;
  toPhase?: import("../domain/types.ts").Phase;
  roll?: number[];
  pawnId?: string;
  element?: "pawn" | "block";
  elementId?: string;
  fromOwnerId?: string;
  toOwnerId?: string;
  cardId?: string;
  message?: string;
}

export interface TransitionResult {
  accepted: boolean;
  phase: import("../domain/types.ts").Phase;
  events: EngineEvent[];
  error?: string;
}

const COLORS = [
  "red",
  "blue",
  "green",
  "yellow",
  "cyan",
  "magenta",
  "orange",
  "white",
];

/** Control-marker allotment for a player count under the given mode. */
export function controlMarkersFor(mode: Mode, n: number): number {
  const byCount = mode.controlMarkers[String(n)];
  if (byCount !== undefined) return byCount;
  const def = mode.controlMarkers["default"];
  if (def !== undefined) return def;
  return 8;
}

function starterPawnIds(data: GameData): string[] {
  return data.pawns.filter((p) => p.isStarter).map((p) => p.id);
}

function buildDeck(data: GameData): string[] {
  const deck: string[] = [];
  for (const c of data.cards) {
    const copies = c.copies && c.copies >= 1 ? c.copies : 1;
    for (let i = 0; i < copies; i++) deck.push(c.id);
  }
  return deck;
}

function buildBlockPile(data: GameData): string[] {
  return data.blocks.filter((b) => !b.isCentralCore).map((b) => b.id);
}

/** Sets up a fresh game per the config and the mode rules. */
export function newGame(cfg: Config): GameState {
  if (!cfg.data) throw new Error("newGame: missing data");
  const n = cfg.playerNames.length;
  const mode = cfg.data.mode;
  if (n < mode.players.min || n > mode.players.max) {
    throw new Error(
      `mode "${mode.id}" supports ${mode.players.min}-${mode.players.max} players, got ${n}`,
    );
  }

  const rng = newRng(cfg.seed);

  const starters = starterPawnIds(cfg.data);
  if (starters.length < n) {
    throw new Error(
      `not enough starter pawns (${starters.length}) for ${n} players`,
    );
  }
  rng.shuffle(starters);

  const markers = controlMarkersFor(mode, n);
  const maxHand = mode.maxHandSize && mode.maxHandSize >= 1 ? mode.maxHandSize : 5;

  const players: Player[] = cfg.playerNames.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    color: COLORS[i % COLORS.length]!,
    pawnId: starters[i]!,
    controlMarkersTotal: markers,
    controlMarkersPlaced: 0,
    bonusCounters: 0,
    hand: [],
    maxHandSize: maxHand,
    oncePerTurnUsed: {},
  }));

  const deck = buildDeck(cfg.data);
  rng.shuffle(deck);
  const blockPile = buildBlockPile(cfg.data);
  rng.shuffle(blockPile);

  // Seed the Cybernet with the Central Core at the origin. All pawns start here.
  const core = centralCore(cfg.data);
  if (!core) throw new Error("no Central Core block in data");
  const cybernet = newCybernet();
  const origin = { q: 0, r: 0 };
  cybernet.blocks.push({ blockId: core.id, rotation: 0, coord: origin });
  // Each player's starting pawn begins on the Central Core. Its (special) space
  // has unlimited capacity, so all starting pawns share it.
  const coreSpace = core.spaces?.[0]?.id ?? "";
  for (const p of players) {
    cybernet.placePawn({
      pawnId: p.pawnId,
      ownerId: p.id,
      coord: origin,
      spaceId: coreSpace,
    });
  }

  const state: GameState = {
    players,
    currentPlayer: 0,
    turn: 1,
    phase: "beginning",
    deck,
    discard: [],
    blockPile,
    cybernet,
    eliminated: [],
    rng,
  };

  dealOpeningHands(state, mode);
  return state;
}

/** Applies the (asymmetric) opening deal by seat order. */
function dealOpeningHands(s: GameState, mode: Mode): void {
  s.players.forEach((p, i) => {
    const count = i < (mode.startingHand?.length ?? 0)
      ? mode.startingHand![i]!
      : (mode.maxHandSize ?? 5);
    for (let j = 0; j < count; j++) {
      const card = draw(s);
      if (card !== undefined) p.hand.push(card);
    }
  });
}

/** Pops one card from the deck, reshuffling the discard pile if the deck is empty. */
function draw(s: GameState): string | undefined {
  if (s.deck.length === 0) {
    if (s.discard.length === 0) return undefined;
    s.deck = s.discard;
    s.discard = [];
    s.rng.shuffle(s.deck);
  }
  return s.deck.pop();
}

/**
 * Validates and applies a single action, dispatching on its type to the matching
 * resolver. `playerId` defaults to the current player when omitted. The engine's
 * single reducer entry point (state × action → state).
 */
function executeAction(s: GameState, gd: GameData, a: Action): unknown {
  const pid = a.playerId ?? currentPlayer(s).id;
  const coord = (): Coord => {
    if (!a.coord) throw new Error(`action "${a.type}" requires a coord`);
    return a.coord;
  };

  switch (a.type) {
    case "pass":
      return;
    case "place-marker": {
      const p = playerById(s, pid);
      if (!p) throw new Error(`unknown player "${pid}"`);
      if (markersRemaining(p) <= 0) throw new Error(`player ${p.id} has no control markers left`);
      p.controlMarkersPlaced++;
      checkWin(s);
      return;
    }
    case "move-hex":
      moveHex(s, gd, a.pawnId!, a.dir ?? 0);
      return;
    case "move-steps":
      moveSteps(s, gd, a.pawnId!, a.path ?? []);
      return;
    case "delete":
      deleteAbility(s, gd, a.pawnId!, a.targetId!, a.extraSkulls ?? 0);
      return;
    case "delete-multi":
      deleteMulti(s, gd, a.pawnId!, a.targetIds ?? [], a.extraSkulls ?? 0);
      return;
    case "icebreak-block":
      icebreakBlock(s, gd, a.pawnId!, coord(), a.extraRollDice ?? 0);
      return;
    case "icebreak-pawn":
      icebreakPawn(s, gd, a.pawnId!, a.targetId!, a.extraRollDice ?? 0);
      return;
    case "search":
      search(s, gd, a.pawnId!, a.dir ?? 0, a.rotation ?? 0);
      return;
    case "reboot":
      reboot(s, gd, a.pawnId!, pid);
      return;
    case "play-delete":
      playDelete(s, gd, pid, a.cardId!, a.pawnId!, a.targetId!, a.extraSkulls ?? 0);
      return;
    case "play-icebreak-block":
      playIcebreakBlock(s, gd, pid, a.cardId!, a.pawnId!, coord(), a.extraRollDice ?? 0);
      return;
    case "play-icebreak-pawn":
      playIcebreakPawn(s, gd, pid, a.cardId!, a.pawnId!, a.targetId!, a.extraRollDice ?? 0);
      return;
    case "play-search":
      playSearch(s, gd, pid, a.cardId!, a.pawnId!, a.dir ?? 0, a.rotation ?? 0);
      return;
    case "play-reboot":
      playReboot(s, gd, pid, a.cardIds ?? [], a.pawnId!);
      return;
    case "attach-pawn":
      attachToPawn(s, gd, pid, a.cardId!, a.targetId!);
      return;
    case "attach-enemy":
      attachToEnemy(s, gd, pid, a.cardId!, a.pawnId!, a.targetId!);
      return;
    case "attach-block":
      attachToBlock(s, gd, pid, a.cardId!, a.pawnId!, coord());
      return;
    default:
      throw new Error(`unknown action "${(a as Action).type}"`);
  }
}

/** Compatibility reducer entry point. It deliberately does not impose a phase. */
export function applyAction(s: GameState, gd: GameData, a: Action): void {
  executeAction(s, gd, a);
}

interface StateWatch {
  hands: Map<string, string[]>;
  markers: Map<string, number>;
  pawnOwners: Map<string, string>;
  blockOwners: Map<string, string>;
  eliminated: Set<string>;
  winnerId?: string;
}

function watchState(s: GameState): StateWatch {
  return {
    hands: new Map(s.players.map((p) => [p.id, [...p.hand]])),
    markers: new Map(s.players.map((p) => [p.id, p.controlMarkersPlaced])),
    pawnOwners: new Map(s.cybernet.pawns.map((p) => [p.pawnId, p.ownerId])),
    blockOwners: new Map(s.cybernet.blocks.map((b) => [`${b.coord.q},${b.coord.r}`, b.ownerId ?? ""])),
    eliminated: new Set(s.eliminated),
    winnerId: s.winnerId,
  };
}

function addedCards(before: string[], after: string[]): string[] {
  const counts = new Map<string, number>();
  for (const card of before) counts.set(card, (counts.get(card) ?? 0) + 1);
  return after.filter((card) => {
    const count = counts.get(card) ?? 0;
    if (count > 0) {
      counts.set(card, count - 1);
      return false;
    }
    return true;
  });
}

function deltaEvents(s: GameState, before: StateWatch): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const player of s.players) {
    for (const cardId of addedCards(before.hands.get(player.id) ?? [], player.hand)) {
      events.push({ type: "draw", playerId: player.id, cardId });
    }
    if ((before.markers.get(player.id) ?? 0) !== player.controlMarkersPlaced) {
      events.push({ type: "control-changed", playerId: player.id, element: "block", elementId: "markers", toOwnerId: String(player.controlMarkersPlaced) });
    }
  }
  for (const pawn of s.cybernet.pawns) {
    const fromOwnerId = before.pawnOwners.get(pawn.pawnId);
    if (fromOwnerId !== undefined && fromOwnerId !== pawn.ownerId) {
      events.push({ type: "control-changed", element: "pawn", elementId: pawn.pawnId, fromOwnerId, toOwnerId: pawn.ownerId });
    }
  }
  for (const block of s.cybernet.blocks) {
    const elementId = `${block.coord.q},${block.coord.r}`;
    const fromOwnerId = before.blockOwners.get(elementId);
    const toOwnerId = block.ownerId ?? "";
    if (fromOwnerId !== undefined && fromOwnerId !== toOwnerId) {
      events.push({ type: "control-changed", element: "block", elementId, fromOwnerId, toOwnerId });
    }
  }
  for (const pawnId of s.eliminated) {
    if (!before.eliminated.has(pawnId)) events.push({ type: "elimination", pawnId });
  }
  if (!before.winnerId && s.winnerId) events.push({ type: "winner-declared", playerId: s.winnerId });
  return events;
}

function rollFrom(result: unknown): number[] | undefined {
  if (typeof result === "object" && result !== null && "roll" in result) {
    const roll = (result as { roll?: unknown }).roll;
    if (Array.isArray(roll) && roll.every((die) => typeof die === "number")) return roll;
  }
  return undefined;
}

/** Applies an action only during the action phase and returns client-safe events. */
export function applyActionWithEvents(s: GameState, gd: GameData, a: Action): TransitionResult {
  const playerId = a.playerId ?? currentPlayer(s).id;
  if (s.phase !== "action") {
    return { accepted: false, phase: s.phase, error: `actions are only accepted during the action phase (current: ${s.phase})`, events: [{ type: "validation-failed", playerId, actionType: a.type, message: `actions are only accepted during the action phase (current: ${s.phase})` }] };
  }
  if (playerId !== currentPlayer(s).id) {
    return { accepted: false, phase: s.phase, error: "only the active player may act", events: [{ type: "validation-failed", playerId, actionType: a.type, message: "only the active player may act" }] };
  }
  const before = watchState(s);
  try {
    const result = executeAction(s, gd, a);
    const events: EngineEvent[] = [{ type: "action-accepted", playerId, actionType: a.type }];
    const roll = rollFrom(result);
    if (roll) events.push({ type: "roll", playerId, actionType: a.type, roll });
    events.push(...deltaEvents(s, before));
    return { accepted: true, phase: s.phase, events };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid action";
    return { accepted: false, phase: s.phase, error: message, events: [{ type: "validation-failed", playerId, actionType: a.type, message }] };
  }
}

/** Advances one live turn phase and executes that phase's mandatory bookkeeping. */
export function advancePhase(s: GameState, _gd: GameData): TransitionResult {
  const before = watchState(s);
  const fromPhase = s.phase;
  switch (s.phase) {
    case "beginning":
      currentPlayer(s).oncePerTurnUsed = {};
      s.phase = "action";
      break;
    case "action":
      s.phase = "recycle";
      recycle(s, currentPlayer(s));
      break;
    case "recycle":
      s.phase = "end";
      checkWin(s);
      break;
    case "end":
      if (!s.winnerId) {
        s.currentPlayer = (s.currentPlayer + 1) % s.players.length;
        s.turn++;
        s.phase = "beginning";
      }
      break;
  }
  return { accepted: true, phase: s.phase, events: [{ type: "phase-advanced", playerId: currentPlayer(s).id, fromPhase, toPhase: s.phase }, ...deltaEvents(s, before)] };
}

/**
 * Executes the four phases of the current player's turn, applying the given
 * action-phase actions in order, then advances to the next player.
 */
export function runTurn(s: GameState, gd: GameData, actions: Action[] = []): void {
  // Preserve the old convenience API while delegating to the live phase API.
  s.phase = "beginning";
  advancePhase(s, gd);
  for (const a of actions) {
    if (s.winnerId) break;
    applyAction(s, gd, a);
  }
  advancePhase(s, gd);
  advancePhase(s, gd);
  advancePhase(s, gd);
}

/** Brings a player's hand to exactly maxHandSize (draw up / discard down). */
function recycle(s: GameState, p: Player): void {
  while (p.hand.length < p.maxHandSize) {
    const card = draw(s);
    if (card === undefined) break;
    p.hand.push(card);
  }
  while (p.hand.length > p.maxHandSize) {
    s.discard.push(p.hand.pop()!);
  }
}
