// The Zaibatsu rules engine: setup and the turn-phase state machine. A pure
// reducer (state × action → state) with no I/O. Mirrors
// impl/go/internal/engine. See DOCS/turn-flow.md and DOCS/parity.md.

import { newRng } from "../domain/rng.ts";
import { newCybernet } from "../domain/hex.ts";
import {
  centralCore,
  currentPlayer,
  markersRemaining,
  type GameData,
  type GameState,
  type Mode,
  type Player,
} from "../domain/types.ts";

import { checkWin } from "./win.ts";

export * from "./placement.ts";
export * from "./movement.ts";
export * from "./combat.ts";
export * from "./icebreaker.ts";
export * from "./abilities.ts";
export * from "./cards.ts";
export { winner } from "./win.ts";

export interface Config {
  data: GameData;
  playerNames: string[];
  seed: number | bigint;
}

export type ActionType = "pass" | "place-marker";

export interface Action {
  type: ActionType;
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

/** Validates and applies a single action during the action phase. */
export function applyAction(s: GameState, a: Action): void {
  const p = currentPlayer(s);
  switch (a.type) {
    case "pass":
      return;
    case "place-marker":
      if (markersRemaining(p) <= 0) {
        throw new Error(`player ${p.id} has no control markers left`);
      }
      p.controlMarkersPlaced++;
      checkWin(s);
      return;
    default:
      throw new Error(`unknown action "${(a as Action).type}"`);
  }
}

/**
 * Executes the four phases of the current player's turn, applying the given
 * action-phase actions in order, then advances to the next player.
 */
export function runTurn(s: GameState, actions: Action[] = []): void {
  // 1. Beginning: clear once-per-turn markers; (begin-of-turn effects: planned).
  s.phase = "beginning";
  currentPlayer(s).oncePerTurnUsed = {};

  // 2. Action.
  s.phase = "action";
  for (const a of actions) {
    if (s.winnerId) break;
    applyAction(s, a);
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
