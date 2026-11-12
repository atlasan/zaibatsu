import {handSizeProfile,validateHandSizeSpaces} from "./hand-size.ts";
export {handSizeProfile} from "./hand-size.ts";
import {validateBlockDetach,resolveBlockDetach} from "./block-detach.ts";
import {validateMarkerHandDiscard} from "./block-hand-discards.ts";
export {cybernetControlMarkerCount} from "./block-hand-discards.ts";
import {validateBlockAttack,resolveBlockAttack} from "./block-attacks.ts";
export {blockAttackResponses} from "./block-attacks.ts";
import {validateControlledPlacement} from "./controlled-placement.ts";
import {validateBlockBonus} from "./block-bonus.ts";
import {validateAbilityTurn,permittedAbilityTurn,permittedAttackAssignment} from "./ability-turns.ts";
import {validatePawnPhaseEffects,resolvePawnTheft} from "./pawn-phase-effects.ts";
export {pawnTheftResponses} from "./pawn-phase-effects.ts";
import {validateControllerCore} from "./reboot-destinations.ts";
export * from "./reboot-destinations.ts";
import {bonusCounterPool,validateGlobalBonusEffect} from "./bonus-pool.ts";
import {validateBlockSacrifices,blockSacrificeChoice,resolveBlockSacrifice} from "./block-sacrifices.ts";
import {validateIcebreakerAttachment} from "./icebreaker-modifiers.ts";
import {validateSpaceEffects,offerSpaceEffect,resolveSpaceEffect} from "./space-effects.ts";
import {validateSpaceArrows} from "./space-arrows.ts";
import {blockDiscardChoice,resolveBlockDiscard} from "./block-discards.ts";
import {hasLimitedAttachmentUses,useMarkerAllocations,useMarkerEvents} from "./use-markers.ts";
import {validateBlockDefenseSpaces} from "./defense.ts";
export * from "./defense.ts";
import {beginRolledMovement,resolveMovementChoice} from "./movement-choice.ts";
import {beginSearch,resolveSearchPlacement,supportsSearchBlockEffect} from "./search-choice.ts";
import {supportsAttachmentTiming,validateAttachmentRules} from "./attachment-timing.ts";
import {validateDeleteAttachment,requireDeleteActivation} from "./delete-profile.ts";
import { resolveEliminationChoice } from "./prevention.ts";
// The Zaibatsu rules engine: setup and the turn-phase state machine. A pure
// reducer (state Ã— action â†’ state) with no I/O. Mirrors
// impl/go/internal/engine. See DOCS/turn-flow.md and DOCS/parity.md.

import { newRng } from "../domain/rng.ts";
import { newCybernet, type Coord } from "../domain/hex.ts";
import {
  centralCore,
  currentPlayer,
  markersRemaining,
  playerById,
  pawnById,
  type GameData,
  type GameState,
  type Mode,
  type Player,
} from "../domain/types.ts";

import { checkWin } from "./win.ts";
import { effectiveAbility } from "./combat.ts";
import { moveHexWithOption, moveStepsWithOption, movementOptionAt, type SpaceRef } from "./movement.ts";
import { deleteAbility, deleteArea, deleteMulti } from "./combat.ts";
import { icebreakBlock, icebreakPawn } from "./icebreaker.ts";
import { reboot, search } from "./abilities.ts";
import { consumeCard, playDelete, playDeleteArea, playDeleteMulti, playIcebreakBlock, playIcebreakPawn, playMove, playReboot, playRebootCard, playSearch } from "./cards.ts";
import { attachToBlock, attachToEnemy, attachToPawn, playerAttachmentModifiers } from "./attach.ts";

import { rollDelete, assignDelete, assignThreatAttack, collectThreat, resetThreats, deployThreats, awakenThreats } from "./threats.ts";
import { startPhaseEffects, resolvePhaseChoice, resumePhaseEffects, validatePhaseEffect } from "./phase-effects.ts";
import { draw } from "./deck.ts";
export * from "./threats.ts";
export * from "./placement.ts";
export * from "./movement.ts";
export * from "./combat.ts";
export * from "./delete-profile.ts";
export * from "./icebreaker.ts";
export * from "./abilities.ts";
export * from "./cards.ts";
export * from "./attach.ts";
export * from "./attachment-slots.ts";
export * from "./bonus.ts";
export * from "./effects.ts";
export * from "./control.ts";
export * from "./options.ts";
export * from "./phase-effects.ts";
export * from "./snapshot.ts";
export * from "./search-choice.ts";
export * from "./movement-choice.ts";
export * from "./use-markers.ts";
export type {ControlMarkerAllocation} from "./control-markers.ts";
export {effectiveIcebreakerModifier} from "./icebreaker-modifiers.ts";
export {bonusCounterPool,grantBonusCounters} from "./bonus-pool.ts";
export {blockSacrificeChoice,blockSacrificeOptions} from "./block-sacrifices.ts";
export {spaceEffectResponses,spaceStopError,offerSpaceEffect} from "./space-effects.ts";
export {controlledPawnCount,blockDiscardChoice} from "./block-discards.ts";
export {validateSpaceArrows,arrowAllowsStep} from "./space-arrows.ts";
export {controlMarkerAllocations,gainPawnControl} from "./control-markers.ts";
export { winner } from "./win.ts";

export interface Config {
  data: GameData;
  playerNames: string[];
  seed: number | bigint;
  /** Explicit opt-in for source-review fixtures; never official-match readiness. */
  allowProvisional?: boolean;
}

export type ActionType =
  | "roll-movement"
  | "resolve-choice"
  | "roll-delete"
  | "assign-delete"
  | "assign-threat-attack"
  | "collect-threat"
  | "recycle"
  | "pass"
  | "place-marker"
  | "move-hex"
  | "move-steps"
  | "delete"
  | "delete-area"
  | "delete-multi"
  | "icebreak-block"
  | "icebreak-pawn"
  | "search"
  | "reboot"
  | "play-delete"
  | "play-delete-multi"
  | "play-delete-area"
  | "play-move"
  | "play-icebreak-block"
  | "play-icebreak-pawn"
  | "play-search"
  | "play-reboot-card"
  | "play-reboot"
  | "attach-pawn"
  | "attach-enemy"
  | "attach-block";

/**
 * A single player intent â€” a tagged union whose `type` selects which fields are
 * read. `playerId` defaults to the current player when omitted. Mirrors the Go
 * Action struct. Not every field applies to every type.
 */
export interface Action {
  attachmentId?:string;
  type: ActionType;
  slotRef?: string;
  choiceId?: string;
  optionId?: "attack" | "steal" | "skip" | "discard" | "sacrifice" | "relocate" | "prevent" | "allow" | "move" | `place:${number}:${number}`;
  spaceId?: string;
  playerId?: string;
  joint?: boolean;
  cardId?: string;
  cardIds?: string[];
  pawnId?: string; // acting pawn (attacker/actor/searcher/rebooted)
  path?: SpaceRef[]; // declared space-to-space movement path
  movementIndex?: number; // explicit movement option index: base=0, granted options follow attachment order
  targetId?: string;
  targetIds?: string[]; // ordered die assignments for delete-multi; duplicates concentrate dice
  coord?: Coord;
  dir?: number;
  rotation?: number;
  extraSkulls?: number;
  extraRollDice?: number;
}

/** Trusted engine journal. Project with eventsForPlayer before exposing player history. */
export type EngineEventType =
  | "block-hand-discarded"
  | "block-attachments-discarded"
  | "block-attack-targeted"
  | "card-stolen"
  | "bonus-awarded"
  | "bonus-counter-placed"
  | "pawn-sacrifice-selected"
  | "control-marker-placed"
  | "control-marker-returned"
  | "ability-use-marked"
  | "ability-use-cleared"
  | "ability-marker-retained"
  | "pawn-moved"
  | "block-drawn"
  | "block-placed"
  | "choice-required"
  | "choice-resolved"
  | "card-discarded"
  | "phase-advanced"
  | "action-accepted"
  | "roll"
  | "draw"
  | "bonus-icon-created"
  | "bonus-collected"
  | "pawn-relocated"
  | "pawn-placed"
  | "elimination-prevented"
  | "pawn-returned-to-reserve"
  | "control-card-released"
  | "elimination"
  | "control-changed"
  | "winner-declared"
  | "validation-failed";

export interface EngineEvent {
  cardRevealed?:true;
  amount?:number;
  coord?: Coord;
  spaceId?: string;
  type: EngineEventType;
  playerId?: string;
  actionType?: ActionType;
  fromPhase?: import("../domain/types.ts").Phase;
  toPhase?: import("../domain/types.ts").Phase;
  roll?: number[];
  pawnId?: string;
  element?: "pawn" | "block" | "bonus-icon" | "control-card";
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
  if(mode.bonusCounterSupply!==undefined && (!Number.isInteger(mode.bonusCounterSupply)||mode.bonusCounterSupply<0))throw new Error("invalid configured bonus-counter supply");
  if (cfg.data.regressionFixture && cfg.data.regressionFixture!=="provisional-v1") throw new Error("unsupported regression fixture");
  for (const card of cfg.data.cards) {
    if(cfg.data.regressionFixture!=="provisional-v1") {validateDeleteAttachment(card.attach);validateAttachmentRules(card);validateIcebreakerAttachment(card.attach);}
    if (cfg.data.regressionFixture !== "provisional-v1" && (card.attach?.class?.length || card.attach?.forbiddenClasses?.length) && !["pawn","enemy"].includes(card.attach!.as)) throw new Error("target-class restrictions require a pawn or enemy attachment");
    for (const effect of card.attach?.phaseEffects ?? []) validatePhaseEffect(effect);
    if (card.attach?.eliminationPrevention && card.attach.eliminationPrevention.kind !== "discard-self") throw new Error("unsupported elimination prevention handler");
  }
  if(!cfg.allowProvisional && cfg.data.regressionFixture!=="provisional-v1" && cfg.data.blocks.some(block=>!supportsSearchBlockEffect(block))) throw new Error("unsupported block placement effects in official content");
  if (mode.setup?.length) throw new Error(`unsupported mode setup step "${mode.setup[0]}"`);
  for (const condition of mode.win ?? []) if (condition !== "all-control-markers-placed") throw new Error(`unsupported win condition "${condition}"`);
  if (mode.lose?.length) throw new Error(`unsupported lose condition "${mode.lose[0]}"`);
  if (!mode.provisional && !cfg.allowProvisional && [...cfg.data.blocks,...cfg.data.pawns,...cfg.data.cards,...cfg.data.controlCards??[],...cfg.data.threats??[],...cfg.data.missions??[]].some(record=>record.provisional)) throw new Error("official mode requires non-provisional content; use an explicit experimental profile or source-review fixture");
  if (n < mode.players.min || n > mode.players.max) {
    throw new Error(
      `mode "${mode.id}" supports ${mode.players.min}-${mode.players.max} players, got ${n}`,
    );
  }

  if (mode.allowedPlayerCounts && !mode.allowedPlayerCounts.includes(n)) throw new Error(`mode "${mode.id}" supports player counts ${mode.allowedPlayerCounts.join(", ")}, got ${n}`);
  const rng = newRng(cfg.seed);

  if (!cfg.allowProvisional && !mode.provisional && cfg.data.cards.some(card=>!supportsAttachmentTiming(card))) throw new Error("unsupported attachment-time effects in official content");
  if (!cfg.allowProvisional && !mode.provisional && !cfg.data.regressionFixture && cfg.data.cards.some(hasLimitedAttachmentUses)) throw new Error("unresolved discarded-card use-marker lifetime in official content");
  if(!cfg.data.regressionFixture) for(const block of cfg.data.blocks) {validateBlockDefenseSpaces(block,!cfg.allowProvisional && !mode.provisional);validateSpaceArrows(block);validateBlockAttack(block);validateBlockDetach(block);validateHandSizeSpaces(block);validateMarkerHandDiscard(block);validateControllerCore(block);validateControlledPlacement(block,cfg.data);validateSpaceEffects(block,!cfg.allowProvisional && !mode.provisional);validateBlockSacrifices(block,!cfg.allowProvisional && !mode.provisional);validateGlobalBonusEffect(block,!cfg.allowProvisional && !mode.provisional);validateBlockBonus(block,!cfg.allowProvisional && !mode.provisional);}
  if(!cfg.data.regressionFixture) for(const pawn of cfg.data.pawns) if(pawn.controlMarkerEffect && (pawn.controlMarkerEffect.kind!=="place-on-control-card" || pawn.controlMarkerEffect.amount!==1)) throw new Error("unsupported control-marker effect");
  if(!cfg.data.regressionFixture && !cfg.allowProvisional && !mode.provisional && mode.bonusCounterSupply===undefined)throw new Error("official mode requires a configured physical bonus-counter supply");
  if(!cfg.data.regressionFixture) for(const pawn of cfg.data.pawns){validateAbilityTurn(pawn);validatePawnPhaseEffects(pawn,cfg.data,!cfg.allowProvisional && !mode.provisional);}
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
    color: pawnById(cfg.data, starters[i]!)?.color ?? COLORS[i % COLORS.length]!,
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
    playedCards: [],
    blockPile,
    cybernet,
    eliminated: [],
    rng,
  };

  if (!cfg.data.regressionFixture) {
    state.rulesVersion="source-v21";state.bonusCounterSupply=mode.bonusCounterSupply;state.nativeUseMarkers=[];state.unresolvedUseCards=[];
    state.outOfGame=cfg.data.pawns.filter(pawn=>pawn.isStarter && !cybernet.pawnById(pawn.id)).map(pawn=>pawn.id);
    state.reserve=cfg.data.pawns.filter(pawn=>!cybernet.pawnById(pawn.id) && !state.outOfGame!.includes(pawn.id)).map(pawn=>pawn.id);
  }
  if (cfg.data.threats?.length) {
    state.threats = []; state.threatPile = cfg.data.threats.filter(t => t.type === "token").flatMap(t => Array.from({length: Math.max(1, t.copies ?? 1)}, () => t.id));
    rng.shuffle(state.threatPile); deployThreats(state, cfg.data, origin);
  }
  if (cfg.data.controlCards?.length) state.controlCards = cfg.data.controlCards.map(card => {
    const ownerId=card.subject.kind==="pawn"?players.find(player=>player.pawnId===card.subject.id)?.id??"":"";
    return {cardId:card.id,subject:{...card.subject},ownerId,...(state.rulesVersion?{zone:ownerId?"control" as const:state.outOfGame!.includes(card.subject.id)?"out-of-game" as const:"common" as const}:{})};
  });
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

/**
 * Validates and applies a single action, dispatching on its type to the matching
 * resolver. `playerId` defaults to the current player when omitted. The engine's
 * single reducer entry point (state Ã— action â†’ state).
 */
function executeAction(s: GameState, gd: GameData, a: Action, effects:EngineEvent[]=[]): unknown {
  const pid = a.playerId ?? currentPlayer(s).id;
  const coord = (): Coord => {
    if (!a.coord) throw new Error(`action "${a.type}" requires a coord`);
    return a.coord;
  };

  switch (a.type) {
    case "roll-movement": return beginRolledMovement(s,gd,a);
    case "roll-delete": return rollDelete(s, gd, a.pawnId!, a.cardId, a.joint,pid);
    case "assign-delete": return assignDelete(s, gd, a.targetIds ?? []);
    case "assign-threat-attack": return assignThreatAttack(s, gd, a.targetIds ?? []);
    case "collect-threat": return collectThreat(s, gd, a.pawnId!, a.targetId!);
    case "recycle": {
      const p = currentPlayer(s);
      const cards = a.cardIds ?? [];
      const counts = new Map<string, number>();
      for (const id of p.hand) counts.set(id, (counts.get(id) ?? 0) + 1);
      for (const id of cards) {
        if (!(counts.get(id)! > 0)) throw new Error(`card "${id}" is not available to recycle`);
        counts.set(id, counts.get(id)! - 1);
      }
      for (const id of cards) consumeCard(s, p, id,true);
      recycle(s, gd, p);
      s.phase = "end";
      checkWin(s);
      return;
    }
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
      moveHexWithOption(s, gd, a.pawnId!, a.dir ?? 0, a.movementIndex ?? 0);
      return;
    case "move-steps":
      moveStepsWithOption(s, gd, a.pawnId!, a.path ?? [], a.movementIndex ?? 0);
      return;
    case "delete":
      return deleteAbility(s, gd, a.pawnId!, a.targetId!, a.extraSkulls ?? 0);
    case "delete-area":
      return deleteArea(s, gd, a.pawnId!, a.extraSkulls ?? 0);
    case "delete-multi":
      return deleteMulti(s, gd, a.pawnId!, a.targetIds ?? [], a.extraSkulls ?? 0);
    case "icebreak-block":
      return icebreakBlock(s, gd, a.pawnId!, coord(), a.extraRollDice ?? 0,effects);
    case "icebreak-pawn":
      return icebreakPawn(s, gd, a.pawnId!, a.targetId!, a.extraRollDice ?? 0);
    case "search":
      if(gd.regressionFixture!=="provisional-v1") {if(a.cardId) throw new Error("free Search cannot use a hand card");return beginSearch(s,gd,pid,a.pawnId!,undefined,effects);}
      search(s, gd, a.pawnId!, a.dir ?? 0, a.rotation ?? 0);
      return;
    case "reboot":
      reboot(s, gd, a.pawnId!, pid, rebootTarget(a));
      return;
    case "play-delete":
      return playDelete(s, gd, pid, a.cardId!, a.pawnId!, a.targetId!, a.extraSkulls ?? 0);
    case "play-delete-multi":
      return playDeleteMulti(s, gd, pid, a.cardId!, a.pawnId!, a.targetIds ?? [], a.extraSkulls ?? 0);
    case "play-delete-area":
      return playDeleteArea(s, gd, pid, a.cardId!, a.pawnId!, a.extraSkulls ?? 0);
    case "play-move":
      playMove(s, gd, pid, a.cardId!, a.pawnId!, a.path ?? []);
      return;
    case "play-icebreak-block":
      return playIcebreakBlock(s, gd, pid, a.cardId!, a.pawnId!, coord(), a.extraRollDice ?? 0,effects);
    case "play-icebreak-pawn":
      return playIcebreakPawn(s, gd, pid, a.cardId!, a.pawnId!, a.targetId!, a.extraRollDice ?? 0);
    case "play-search":
      if(gd.regressionFixture!=="provisional-v1") {if(!a.cardId) throw new Error("Search requires one action card from the controller's hand");return beginSearch(s,gd,pid,a.pawnId!,a.cardId,effects);}
      playSearch(s, gd, pid, a.cardId!, a.pawnId!, a.dir ?? 0, a.rotation ?? 0);
      return;
    case "play-reboot-card": return playRebootCard(s, gd, pid, a.cardId!, a.pawnId!,rebootTarget(a));
    case "play-reboot":
      playReboot(s, gd, pid, a.cardIds ?? [], a.pawnId!,rebootTarget(a));
      return;
    case "attach-pawn":
      attachToPawn(s, gd, pid, a.cardId!, a.targetId!, a.slotRef);
      return;
    case "attach-enemy":
      attachToEnemy(s, gd, pid, a.cardId!, a.pawnId!, a.targetId!, a.slotRef,effects);
      return;
    case "attach-block":
      attachToBlock(s, gd, pid, a.cardId!, a.pawnId!, coord());
      return;
    default:
      throw new Error(`unknown action "${(a as Action).type}"`);
  }
}

/** Source states use live authority; only explicit historical fixtures retain phase-free dispatch. */
export function applyAction(s: GameState, gd: GameData, a: Action): void {
  if (s.rulesVersion || s.pendingChoice || s.pendingPhase || a.type === "resolve-choice") {
    const result=applyActionWithEvents(s,gd,a);
    if (!result.accepted) throw new Error(result.error);
    return;
  }
  const backup=cloneGameState(s);
  try { executeAction(s, gd, a); } catch(error) {restoreGameState(s,backup);throw error;}
}

interface StateWatch {
  controlCardMarkers:NonNullable<GameState["controlCardMarkers"]>;
  useMarkers:ReturnType<typeof useMarkerAllocations>;
  reserve: string[];
  controlCardOwners: Map<string,string>;
  discard: string[];
  hands: Map<string, string[]>;
  markers: Map<string, number>;
  pawnOwners: Map<string, string>;
  blockOwners: Map<string, string>;
  bonusIcons: Map<string, string>;
  eliminated: Set<string>;
  winnerId?: string;
}

function watchState(s: GameState): StateWatch {
  return {
    controlCardMarkers:structuredClone(s.controlCardMarkers??[]),
    useMarkers:useMarkerAllocations(s),
    reserve:[...s.reserve??[]],
    controlCardOwners:new Map((s.controlCards??[]).map(card=>[card.cardId,card.ownerId])),
    discard: [...s.discard],
    hands: new Map(s.players.map((p) => [p.id, [...p.hand]])),
    markers: new Map(s.players.map((p) => [p.id, p.controlMarkersPlaced])),
    pawnOwners: new Map(s.cybernet.pawns.map((p) => [p.pawnId, p.ownerId])),
    blockOwners: new Map(s.cybernet.blocks.map((b) => [`${b.coord.q},${b.coord.r}`, b.ownerId ?? ""])),
    bonusIcons: new Map((s.cybernet.bonusIcons ?? []).map((icon) => [icon.key, icon.collectedBy ?? ""])),
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
  const events: EngineEvent[] = useMarkerEvents(s,before.useMarkers);
  for (const player of s.players) {
    for (const cardId of addedCards(before.hands.get(player.id) ?? [], player.hand)) {
      events.push({ type: "draw", playerId: player.id, cardId });
    }
    if ((before.markers.get(player.id) ?? 0) !== player.controlMarkersPlaced) {
      events.push({ type: "control-changed", playerId: player.id, element: "block", elementId: "markers", toOwnerId: String(player.controlMarkersPlaced) });
    }
  }
  for(const marker of before.controlCardMarkers) if(!(s.controlCardMarkers??[]).some(m=>m.cardId===marker.cardId && m.playerId===marker.playerId)) events.push({type:"control-marker-returned",playerId:marker.playerId,cardId:marker.cardId,element:"control-card",elementId:marker.cardId});
  for (const pawn of s.cybernet.pawns) {
    const fromOwnerId = before.pawnOwners.get(pawn.pawnId);
    if (fromOwnerId === undefined) {
      events.push({ type: "pawn-placed", element: "pawn", elementId: pawn.pawnId, ...(pawn.ownerId?{toOwnerId:pawn.ownerId}:{coord:{...pawn.coord},spaceId:pawn.spaceId}) });
      continue;
    }
    if (fromOwnerId !== undefined && fromOwnerId !== pawn.ownerId) {
      events.push({ type: "control-changed", element: "pawn", elementId: pawn.pawnId, ...(fromOwnerId || !s.rulesVersion?{fromOwnerId}:{}), toOwnerId: pawn.ownerId });
    }
  }
  for(const marker of s.controlCardMarkers??[]) if(!before.controlCardMarkers.some(m=>m.cardId===marker.cardId && m.playerId===marker.playerId)) events.push({type:"control-marker-placed",playerId:marker.playerId,cardId:marker.cardId,element:"control-card",elementId:marker.cardId});
  for (const block of s.cybernet.blocks) {
    const elementId = `${block.coord.q},${block.coord.r}`;
    const fromOwnerId = before.blockOwners.get(elementId);
    const toOwnerId = block.ownerId ?? "";
    if (fromOwnerId !== undefined && fromOwnerId !== toOwnerId) {
      events.push({ type: "control-changed", element: "block", elementId, ...(fromOwnerId || !s.rulesVersion?{fromOwnerId}:{}), ...(toOwnerId || !s.rulesVersion?{toOwnerId}:{}) });
    }
  }
  for (const icon of s.cybernet.bonusIcons ?? []) {
    const previous = before.bonusIcons.get(icon.key);
    if (previous === undefined) {
      events.push({ type: "bonus-icon-created", element: "bonus-icon", elementId: icon.key });
      if(icon.counterPlaced)events.push({type:"bonus-counter-placed",element:"bonus-icon",elementId:icon.key,amount:1});
    }
    if ((previous ?? "") === "" && icon.collectedBy) {
      events.push({ type: "bonus-collected", playerId: icon.collectedBy, element: "bonus-icon", elementId: icon.key });
    }
  }
  for (const pawnId of s.eliminated) {
    if (!before.eliminated.has(pawnId)) events.push({ type: "elimination", pawnId });
  }
  for(const pawnId of s.reserve??[]) if(!before.reserve.includes(pawnId) && before.pawnOwners.has(pawnId) && !s.cybernet.pawnById(pawnId)) {
    events.push({type:"elimination",pawnId},{type:"pawn-returned-to-reserve",pawnId});
  }
  for (const cardId of addedCards(before.discard,s.discard)) events.push({type:"card-discarded",cardId});
  for(const card of s.controlCards??[]) {
    const owner=before.controlCardOwners.get(card.cardId);
    if(owner && !card.ownerId) events.push({type:"control-card-released",playerId:owner,cardId:card.cardId,pawnId:card.subject.kind==="pawn"?card.subject.id:undefined});
  }
  if (!before.winnerId && s.winnerId) events.push({ type: "winner-declared", playerId: s.winnerId });
  return events;
}

/** Preserve semantic phase order and retain deltas for unrelated changes exactly once. */
function appendUnreportedDeltas(events: EngineEvent[], deltas: EngineEvent[]): EngineEvent[] {
  const reported=[...events];
  for(const delta of deltas) {
    const index=reported.findIndex(event=>delta.type==="draw" && event.type==="card-stolen" && event.playerId===delta.playerId && event.cardId===delta.cardId || event.type===delta.type && (event.playerId===delta.playerId || delta.type==="card-discarded" && delta.playerId===undefined) && event.cardId===delta.cardId && event.pawnId===delta.pawnId && event.elementId===delta.elementId);
    if(index>=0) reported.splice(index,1);else events.push(delta);
  }
  return events;
}

function rollFrom(result: unknown): number[] | undefined {
  if (typeof result === "object" && result !== null && "roll" in result) {
    const roll = (result as { roll?: unknown }).roll;
    if (Array.isArray(roll) && roll.every((die) => typeof die === "number")) return roll;
  }
  return undefined;
}

/** Independent state and RNG stream for previews and rejected-action rollback. */
export function cloneGameState(s: GameState): GameState {
  const cybernet = newCybernet();
  cybernet.blocks = structuredClone(s.cybernet.blocks);
  cybernet.pawns = structuredClone(s.cybernet.pawns);
  cybernet.bonusIcons = structuredClone(s.cybernet.bonusIcons);
  return { ...s, pendingBlockSacrifices:structuredClone(s.pendingBlockSacrifices),pendingBlockDiscards:structuredClone(s.pendingBlockDiscards),controlCardMarkers:structuredClone(s.controlCardMarkers),nativeUseMarkers:structuredClone(s.nativeUseMarkers),unresolvedUseCards:structuredClone(s.unresolvedUseCards),attachmentSerial:s.attachmentSerial,outOfGame:s.outOfGame?[...s.outOfGame]:undefined, decisionSerial:s.decisionSerial, pendingEliminations:structuredClone(s.pendingEliminations), reserve: s.reserve ? [...s.reserve] : undefined, pendingEffects: structuredClone(s.pendingEffects), pendingChoice: structuredClone(s.pendingChoice), controlCards: structuredClone(s.controlCards), players: structuredClone(s.players), deck: [...s.deck], discard: [...s.discard], playedCardOwners:s.playedCardOwners?[...s.playedCardOwners]:undefined,playedCards: [...s.playedCards ?? []], blockPile: [...s.blockPile], eliminated: [...s.eliminated], threats: structuredClone(s.threats), threatPile: s.threatPile ? [...s.threatPile] : undefined, clearedEvents: s.clearedEvents ? [...s.clearedEvents] : undefined, pendingAttack: structuredClone(s.pendingAttack), pendingThreats: structuredClone(s.pendingThreats), cybernet, rng: s.rng.clone() };
}

/** Remove fields created by a rejected resolution as well as restoring existing ones. */
function restoreGameState(s: GameState, backup: GameState): void {
  for (const key of Object.keys(s)) if (!(key in backup)) delete (s as unknown as Record<string,unknown>)[key];
  Object.assign(s,backup);
}

function validateLiveAction(s: GameState, gd: GameData, a: Action): string | undefined {
  if(a.slotRef && !["attach-pawn","attach-enemy"].includes(a.type)) throw new Error("slotRef is only valid for pawn attachment actions");
  if (s.winnerId) throw new Error("the match has finished");
  if (s.pendingAttack && a.type !== "assign-delete") throw new Error("assign the attack dice first");
  if (s.pendingThreats && !["roll-delete", "assign-delete", "assign-threat-attack"].includes(a.type)) throw new Error("resolve the threat combat first");
  if (a.type === "place-marker") throw new Error("control markers are placed by Icebreaker, not as a free action");
  if (a.extraSkulls || a.extraRollDice) throw new Error("combat modifiers must come from game effects");
  const player = playerById(s,a.playerId??currentPlayer(s).id);
  if(!player) throw new Error("unknown acting player");
  if (["delete", "delete-multi", "delete-area", "play-delete", "play-delete-multi", "play-delete-area"].includes(a.type)) {
    const actor = s.cybernet.pawnById(a.pawnId!);
    if (actor && (s.threats ?? []).some(t => t.coord.q === actor.coord.q && t.coord.r === actor.coord.r && t.status !== "eliminated")) throw new Error("use a public Delete roll to resolve threat combat");
  }
  if (["play-move", "move-steps"].includes(a.type)) {
    const placed = s.cybernet.pawnById(a.pawnId!); const def = pawnById(gd, a.pawnId!);
    const stealth = a.type !== "play-move" && !!placed && !!def && movementOptionAt(gd, def, placed.attachments, a.movementIndex ?? 0).stealth;
    if (!stealth && def?.special !== "does-not-activate-threats") for (const step of (a.path ?? []).slice(0, -1)) if ((s.threats ?? []).some(t => t.status !== "eliminated" && t.coord.q === step.coord.q && t.coord.r === step.coord.r)) throw new Error("movement must stop at the first threatening block");
  }
  if (a.pawnId && a.type !== "reboot" && a.type !== "play-reboot" && a.type !== "play-reboot-card") {
    const pawn = s.cybernet.pawnById(a.pawnId);
    if (!pawn || pawn.ownerId !== player.id) throw new Error("only the active player's pawns may act");
  }
  const abilities: Partial<Record<ActionType, "search" | "delete" | "icebreaker" | "reboot">> = { search: "search", delete: "delete", "delete-area": "delete", "delete-multi": "delete", "icebreak-block": "icebreaker", "icebreak-pawn": "icebreaker", reboot: "reboot" };
  const ability = abilities[a.type];
  if (ability) {
    const pawn = pawnById(gd, a.pawnId!);
    const placed = s.cybernet.pawnById(a.pawnId!);
    if(ability==="delete" && pawn && gd.regressionFixture!=="provisional-v1") requireDeleteActivation(gd,pawn,placed?.attachments,"once-per-turn");
    else if (!pawn || effectiveAbility(gd, pawn, placed?.attachments, ability)?.activation !== "once-per-turn") throw new Error("this ability requires a card activation");
  }
  if (a.type === "move-hex" || a.type === "move-steps") {
    const pawn = pawnById(gd, a.pawnId!);
    const placed = s.cybernet.pawnById(a.pawnId!);
    if (!pawn || !placed) throw new Error("unknown moving pawn");
    const option = movementOptionAt(gd, pawn, placed.attachments, a.movementIndex ?? 0);
    if (option.movement.activation === "card") {
      if (!a.cardId || !player.hand.includes(a.cardId) || !(gd.cards.find((card) => card.id === a.cardId)?.movement! > 0)) throw new Error("this movement requires a movement card in hand");
      return a.cardId;
    }
    if(gd.regressionFixture!=="provisional-v1" && a.cardId) throw new Error("free movement cannot also spend an action card");
  }
}

/** Applies a legal live action or authorized pending response, with atomic rollback. */
export function applyActionWithEvents(s: GameState, gd: GameData, a: Action): TransitionResult {
  if(s.playedCardOwners && (s.playedCardOwners.length!==(s.playedCards??[]).length || s.playedCardOwners.some(id=>!playerById(s,id)))) return {accepted:false,phase:s.phase,error:"played card ownership does not match physical cards",events:[]};
  try{bonusCounterPool(s);}catch(error){return {accepted:false,phase:s.phase,error:(error as Error).message,events:[]};}
  if(a.attachmentId && (a.type!=="resolve-choice" || s.pendingChoice?.kind!=="space-discard")) return {accepted:false,phase:s.phase,error:"attachmentId is only valid for a pending space discard",events:[]};
  if(a.slotRef && !["attach-pawn","attach-enemy"].includes(a.type)) return {accepted:false,phase:s.phase,error:"slotRef is only valid for pawn attachment actions",events:[]};
  if (s.pendingChoice || a.type === "resolve-choice") {
    const playerId=a.playerId??currentPlayer(s).id,choice=s.pendingBlockSacrifices?blockSacrificeChoice(s,a.choiceId):s.pendingBlockDiscards?blockDiscardChoice(s,a.choiceId):s.pendingChoice;
    if (s.winnerId || a.type!=="resolve-choice" || !choice || playerId!==choice.playerId) return {accepted:false,phase:s.phase,error:"only the pending choice's player may resolve it",events:[{type:"validation-failed",playerId,message:"resolve the pending decision first"}]};
    const backup=cloneGameState(s),before=watchState(s),fromPhase=s.phase;
    try {
      const effects: EngineEvent[]=[];
      if(choice.kind==="block-detach") {resolveBlockDetach(s,gd,a,effects);resumePhaseEffects(s,gd,effects);}
      else if(choice.kind==="block-attack") {resolveBlockAttack(s,gd,a,effects);resumePhaseEffects(s,gd,effects);}
      else if(choice.kind==="steal-card") {resolvePawnTheft(s,gd,a,effects);resumePhaseEffects(s,gd,effects);}
      else if(choice.kind==="space-discard") {resolveSpaceEffect(s,gd,a,effects);resumePhaseEffects(s,gd,effects);}
      else if(choice.kind==="block-sacrifice") resolveBlockSacrifice(s,gd,a,effects);
      else if(choice.kind==="block-discard") resolveBlockDiscard(s,gd,a,effects);
      else if (choice.kind==="move-path") resolveMovementChoice(s,gd,a,effects);
      else if (choice.kind==="place-block") resolveSearchPlacement(s,gd,a,effects);
      else if (choice.kind==="prevent-elimination") {resolveEliminationChoice(s,gd,a,effects);resumePhaseEffects(s,gd,effects);}
      else resolvePhaseChoice(s,gd,a.choiceId,a.optionId,a.cardIds,a.coord,a.spaceId,effects);
      const events: EngineEvent[]=[{type:"choice-resolved",playerId,...(choice.cardId?{cardId:choice.cardId}:{}),elementId:choice.id},...effects];
      appendUnreportedDeltas(events,deltaEvents(s,before));
      if(s.phase!==fromPhase) events.push({type:"phase-advanced",playerId:currentPlayer(s).id,fromPhase,toPhase:s.phase});
      if(s.pendingChoice) events.push({type:"choice-required",playerId:s.pendingChoice.playerId,elementId:s.pendingChoice.id});
      return {accepted:true,phase:s.phase,events};
    } catch(error) {
      restoreGameState(s,backup);const message=error instanceof Error?error.message:"invalid choice";
      return {accepted:false,phase:s.phase,error:message,events:[{type:"validation-failed",playerId,message}]};
    }
  }
  const playerId = a.playerId ?? currentPlayer(s).id;
  const permission=permittedAbilityTurn(s,gd,a),assignment=permittedAttackAssignment(s,a);
  const phaseCombat = !!s.pendingPhase && !!(s.pendingAttack || s.pendingThreats) && ["roll-delete", "assign-delete", "assign-threat-attack"].includes(a.type);
  if (!permission && !assignment && !phaseCombat && (a.type === "recycle" ? s.phase !== "recycle" : s.phase !== "action")) {
    return { accepted: false, phase: s.phase, error: `actions are only accepted during the action phase (current: ${s.phase})`, events: [{ type: "validation-failed", playerId, actionType: a.type, message: `actions are only accepted during the action phase (current: ${s.phase})` }] };
  }
  if (s.pendingAttack && !assignment || playerId !== currentPlayer(s).id && !permission && !assignment) {
    return { accepted: false, phase: s.phase, error: "only the active player may act", events: [{ type: "validation-failed", playerId, actionType: a.type, message: "only the active player may act" }] };
  }
  const before = watchState(s);
  const backup = cloneGameState(s);
  try {
    const movementCard = validateLiveAction(s, gd, a);
    const effects:EngineEvent[]=[];
    const result = executeAction(s, gd, a,effects);
    if (movementCard) consumeCard(s, currentPlayer(s), movementCard);
    if (["move-steps", "move-hex", "play-move"].includes(a.type) && (gd.regressionFixture==="provisional-v1" || a.type==="move-hex" || !!a.path?.length)) {
      const placed = s.cybernet.pawnById(a.pawnId!); const def = pawnById(gd, a.pawnId!);
      const stealth = a.type !== "play-move" && !!placed && !!def && movementOptionAt(gd, def, placed.attachments, a.movementIndex ?? 0).stealth;
      awakenThreats(s, gd, a.pawnId!, stealth);
      offerSpaceEffect(s,gd,a.pawnId!);
    }
    if (gd.regressionFixture==="provisional-v1" && ["search", "play-search"].includes(a.type)) for (const b of s.cybernet.blocks) deployThreats(s, gd, b.coord);
    resumePhaseEffects(s, gd, effects);
    const events: EngineEvent[] = [{ type: "action-accepted", playerId, actionType: a.type },...useMarkerEvents(s,before.useMarkers).filter(event=>event.type==="ability-use-marked")];
    const roll = rollFrom(result);
    if (roll) events.push({ type: "roll", playerId, actionType: a.type, roll });
    events.push(...effects);
    appendUnreportedDeltas(events,deltaEvents(s, before));
    if (s.phase !== backup.phase) events.push({type:"phase-advanced",playerId,fromPhase:backup.phase,toPhase:s.phase});
    const pendingChoice=(s as GameState).pendingChoice;
    if (pendingChoice) events.push({type:"choice-required",playerId:pendingChoice.playerId,elementId:pendingChoice.id,...(pendingChoice.cardId?{cardId:pendingChoice.cardId}:{})});
    return { accepted: true, phase: s.phase, events };
  } catch (error) {
    restoreGameState(s, backup);
    const message = error instanceof Error ? error.message : "invalid action";
    return { accepted: false, phase: s.phase, error: message, events: [{ type: "validation-failed", playerId, actionType: a.type, message }] };
  }
}

/** Advances one live turn phase and executes that phase's mandatory bookkeeping. */
export function advancePhase(s: GameState, gd: GameData): TransitionResult {
  try{bonusCounterPool(s);}catch(error){return {accepted:false,phase:s.phase,error:(error as Error).message,events:[]};}
  if (s.winnerId) return { accepted: false, phase: s.phase, error: "the match has finished", events: [{ type: "validation-failed", message: "the match has finished" }] };
  if (s.pendingAttack || s.pendingThreats) return { accepted: false, phase: s.phase, error: "resolve combat before ending the phase", events: [] };
  if (s.pendingChoice) return {accepted:false,phase:s.phase,error:"resolve the pending decision first",events:[]};
  const backup=cloneGameState(s);
  const before = watchState(s);
  const fromPhase = s.phase;
  const effects: EngineEvent[]=[];
  try {
  switch (s.phase) {
    case "beginning":
      startPhaseEffects(s,gd,"beginning",effects);
      break;
    case "action":
      startPhaseEffects(s,gd,"action",effects);
      break;
    case "recycle":
      recycle(s, gd, currentPlayer(s));
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
  const events: EngineEvent[]=[...effects];
  if(s.rulesVersion) appendUnreportedDeltas(events,deltaEvents(s,before));
  if(s.phase!==fromPhase) events.push({type:"phase-advanced",playerId:currentPlayer(s).id,fromPhase,toPhase:s.phase});
  if(!s.rulesVersion) appendUnreportedDeltas(events,deltaEvents(s,before));
  const pending=(s as GameState).pendingChoice;
  if(pending) events.push({type:"choice-required",playerId:pending.playerId,elementId:pending.id,...(pending.cardId?{cardId:pending.cardId}:{})});
  return {accepted:true,phase:s.phase,events};
  } catch(error) { restoreGameState(s,backup);const message=error instanceof Error?error.message:"phase failed";return {accepted:false,phase:s.phase,error:message,events:[{type:"validation-failed",message}]}; }
}

/**
 * Executes the four phases of the current player's turn, applying the given
 * action-phase actions in order, then advances to the next player.
 */
export function runTurn(s: GameState, gd: GameData, actions: Action[] = []): void {
  // Preserve the old convenience API while delegating to the live phase API.
  if (s.pendingChoice) throw new Error("resolve the pending decision first");
  s.phase = "beginning";
  const beginning=advancePhase(s,gd);
  if (!beginning.accepted) throw new Error(beginning.error);
  if (s.pendingChoice || s.pendingAttack || s.pendingThreats) return;
  for (const a of actions) {
    if (s.winnerId) break;
    applyAction(s, gd, a);
  }
  if (s.winnerId) return;
  const actionEnd=advancePhase(s,gd);
  if (!actionEnd.accepted) throw new Error(actionEnd.error);
  if (s.pendingChoice || s.pendingAttack || s.pendingThreats) return;
  const recycleEnd=advancePhase(s,gd);
  if (!recycleEnd.accepted) throw new Error(recycleEnd.error);
  if (s.pendingChoice || s.pendingAttack || s.pendingThreats) return;
  advancePhase(s,gd);
}

/** Brings a player's hand to exactly maxHandSize (draw up / discard down). */
function recycle(s: GameState, gd: GameData, p: Player): void {
  if(s.rulesVersion && s.playedCardOwners) {
    if(s.playedCardOwners.length!==(s.playedCards??[]).length) throw new Error("played card ownership does not match physical cards");
    const kept:string[]=[],owners:string[]=[];
    for(const [i,id] of (s.playedCards??[]).entries()) {if(s.playedCardOwners[i]===p.id)s.discard.push(id);else {kept.push(id);owners.push(s.playedCardOwners[i]!);}}
    s.playedCards=kept;if(kept.length)s.playedCardOwners=owners;else delete s.playedCardOwners;
  } else {s.discard.push(...s.playedCards??[]);s.playedCards=[];}
  const modifiers = playerAttachmentModifiers(s, gd, p.id);
  const maxHandSize = handSizeProfile(s,gd,p.id).maximum;
  const draws = Math.max(0, maxHandSize - p.hand.length + modifiers.drawModifier);
  for (let i = 0; i < draws; i++) {
    const card = draw(s);
    if (card === undefined) break;
    p.hand.push(card);
  }
  while (p.hand.length > maxHandSize) {
    s.discard.push(p.hand.pop()!);
  }
}

export {controllerHandRevealed, playerView, eventsForPlayer} from "./player-view.ts";

function rebootTarget(a:Action):SpaceRef|undefined {
 if(!a.coord && !a.spaceId)return undefined;
 if(!a.coord || !Number.isInteger(a.coord.q) || !Number.isInteger(a.coord.r) || !a.spaceId)throw new Error("select a complete Reboot destination");
 return {coord:a.coord,spaceId:a.spaceId};
}
