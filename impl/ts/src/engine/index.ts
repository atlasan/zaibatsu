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
import { moveHex } from "./movement.ts";
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
  targetId?: string;
  targetIds?: string[];
  coord?: Coord;
  dir?: number;
  rotation?: number;
  extraSkulls?: number;
  extraRollDice?: number;
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
export function applyAction(s: GameState, gd: GameData, a: Action): void {
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

/**
 * Executes the four phases of the current player's turn, applying the given
 * action-phase actions in order, then advances to the next player.
 */
export function runTurn(s: GameState, gd: GameData, actions: Action[] = []): void {
  // 1. Beginning: clear once-per-turn markers; (begin-of-turn effects: planned).
  s.phase = "beginning";
  currentPlayer(s).oncePerTurnUsed = {};

  // 2. Action.
  s.phase = "action";
  for (const a of actions) {
    if (s.winnerId) break;
    applyAction(s, gd, a);
  }

  // 3. Recycle: refill/trim hand to max hand size.
  s.phase = "recycle";
  recycle(s, currentPlayer(s));

  // 4. End: check win, advance.
  s.phase = "end";
  checkWin(s);
  if (!s.winnerId) {
    s.currentPlayer = (s.currentPlayer + 1) % s.players.length;
    s.turn++;
    s.phase = "beginning";
  }
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
