import {placeBlockBonus,collectBlockBonus} from "./block-bonus.ts";
import {beginBlockDetach} from "./block-detach.ts";
import {discardHandsAboveMarkers} from "./block-hand-discards.ts";
import {beginBlockAttack} from "./block-attacks.ts";
import {placeControlledPawn} from "./controlled-placement.ts";
import type {EngineEvent} from "./index.ts";
import {grantBonusCounters,requireBonusReserve} from "./bonus-pool.ts";
import {beginBlockSacrifices} from "./block-sacrifices.ts";
import {beginBlockDiscards} from "./block-discards.ts";
import { setPawnControl } from "./control.ts";
import { gainPawnControl } from "./control-markers.ts";
import type { Coord } from "../domain/hex.ts";
import type { PawnOnBoard } from "../domain/pawn_board.ts";
import { blockSpace } from "../domain/pawn_board.ts";
import {
  blockById,
  pawnById,
  playerById,
  type BlockEffect,
  type CardEffect,
  type CardEffectTrigger,
  type GameData,
  type GameState,
} from "../domain/types.ts";
import { resolveDeleteAreaAtCoord, type DeleteAreaResult } from "./combat.ts";
import { canEndOn } from "./movement.ts";

export type BlockEffectTrigger = "inCybernet" | "underControl";
export type EffectResolution =
  | {kind:"block-bonus"}
  | {kind:"marker-hand-discard"}
  | {kind:"pending-block-detach"}
  | {kind:"pending-block-attack"}
  | {kind:"controller-core"}
  | {kind:"gain-bonus-all-players";playerIds:string[];amount:number}
  | {kind:"pending-sacrifice"}
  | {kind:"pending-discard"}
  | { kind: "area-attack"; result: DeleteAreaResult }
  | { kind: "place-pawn"; pawn: PawnOnBoard }
  | { kind: "gain-bonus"; playerId: string; amount: number };

function skullsFromEffect(effect: Exclude<BlockEffect, string>): number {
  return Number.isInteger(effect.amount) && effect.amount! > 0 ? effect.amount! : 1;
}

function amountFromCardEffect(effect: CardEffect): number {
  return Number.isInteger(effect.amount) && effect.amount! > 0 ? effect.amount! : 1;
}

function firstOpenSpace(
  s: GameState,
  gd: GameData,
  coord: Coord,
  pawnId: string,
): string | undefined {
  const placed = s.cybernet.at(coord);
  if (!placed) return undefined;
  const block = blockById(gd, placed.blockId);
  if (!block) return undefined;
  for (const space of block.spaces ?? []) {
    if (!blockSpace(block, space.id)) continue;
    if (canEndOn(gd, s.cybernet, coord, space.id, pawnId) === undefined) return space.id;
  }
  return undefined;
}

function placePawnEffect(
  s: GameState,
  gd: GameData,
  playerId: string,
  coord: Coord,
  pawnId: string | undefined,
): EffectResolution | undefined {
  if (s.rulesVersion && pawnId && s.outOfGame?.includes(pawnId)) return undefined;
  if (!pawnId || !playerById(s, playerId) || !pawnById(gd, pawnId) || s.cybernet.pawnById(pawnId)) return undefined;
  const spaceId = firstOpenSpace(s, gd, coord, pawnId);
  if (!spaceId) return undefined;
  const eliminatedIndex = s.eliminated.indexOf(pawnId);
  if (eliminatedIndex >= 0) s.eliminated.splice(eliminatedIndex, 1);
  const pawn: PawnOnBoard = { pawnId, ownerId: playerId, coord: { ...coord }, spaceId };
  if(s.reserve) s.reserve=s.reserve.filter(id=>id!==pawnId);
  s.cybernet.placePawn(pawn);
  gainPawnControl(s, gd, pawnId, playerId);
  return { kind: "place-pawn", pawn };
}

function applyTypedBlockEffect(
  s: GameState,
  gd: GameData,
  coord: Coord,
  effect: Exclude<BlockEffect, string> | undefined,
  events:EngineEvent[],
): EffectResolution | undefined {
  if (!effect) return undefined;
  switch (effect.kind) {
    case "place-block-bonus":placeBlockBonus(s,gd,coord,events);return {kind:"block-bonus"};
    case "collect-block-bonus":collectBlockBonus(s,gd,coord,events);return {kind:"block-bonus"};
    case "discard-hands-above-markers":discardHandsAboveMarkers(s,gd,coord,effect,events);return {kind:"marker-hand-discard"};
    case "discard-pawn-attachments":beginBlockDetach(s,gd,coord);return {kind:"pending-block-detach"};
    case "attack-pawn":beginBlockAttack(s,gd,coord,effect);return {kind:"pending-block-attack"};
    case "place-controlled-pawn": return {kind:"place-pawn",pawn:placeControlledPawn(s,gd,coord,effect.target,events)};
    case "controller-core": return {kind:"controller-core"};
    case "gain-bonus-all-players": {
      if(!Number.isInteger(effect.amount) || effect.amount!<1 || effect.target!==undefined)throw new Error("unsupported all-player bonus award descriptor");
      requireBonusReserve(s,s.players.length*effect.amount!);for(const p of s.players)grantBonusCounters(s,p.id,effect.amount!);return {kind:"gain-bonus-all-players",playerIds:s.players.map(p=>p.id),amount:effect.amount!};
    }
    case "sacrifice-per-player": beginBlockSacrifices(s,gd,coord,effect);return {kind:"pending-sacrifice"};
    case "discard-per-controlled-pawn": beginBlockDiscards(s,gd,coord);return {kind:"pending-discard"};
    case "return-control-marker": throw new Error("Cybernet marker removal is unresolved; Hacktivism remains provisional");
    case "area-attack":
      return { kind: "area-attack", result: resolveDeleteAreaAtCoord(s, gd, coord, skullsFromEffect(effect)) };
    case "place-neutral-pawn": return placeNeutralPawn(s,gd,coord,effect.target);
    case "place-pawn": {
      const ownerId = s.cybernet.at(coord)?.ownerId ?? "";
      return ownerId ? placePawnEffect(s, gd, ownerId, coord, effect.target) : undefined;
    }
    default:
      return undefined;
  }
}

/** Placement-triggered pieces enter on their matching printed pawn space, uncontrolled. */
export function placeNeutralPawn(s:GameState,gd:GameData,coord:Coord,pawnId:string|undefined):EffectResolution {
  if(!s.rulesVersion) throw new Error("neutral block placement requires source rules");
  const placed=s.cybernet.at(coord),block=blockById(gd,placed?.blockId??""),spaces=block?.spaces?.filter(space=>space.type==="pawn" && space.pawnId===pawnId)??[];
  if(!pawnId || !pawnById(gd,pawnId) || spaces.length!==1) throw new Error("neutral placement requires one matching printed pawn space and a known pawn");
  if(s.cybernet.pawnById(pawnId) || !s.reserve?.includes(pawnId) || s.eliminated.includes(pawnId) || s.outOfGame?.includes(pawnId)) throw new Error("neutral placement requires the physical pawn in reserve");
  const cards=s.controlCards?.filter(card=>card.subject.kind==="pawn" && card.subject.id===pawnId)??[];
  if(cards.length!==1 || cards[0]!.ownerId || cards[0]!.zone!=="common") throw new Error("neutral placement requires its physical control card in the common area");
  const full=canEndOn(gd,s.cybernet,coord,spaces[0]!.id,pawnId);if(full) throw new Error(full);
  const pawn:PawnOnBoard={pawnId,ownerId:"",coord:{...coord},spaceId:spaces[0]!.id};
  s.reserve=s.reserve!.filter(id=>id!==pawnId);s.cybernet.placePawn(pawn);setPawnControl(s,pawnId,"");
  return {kind:"place-pawn",pawn};
}

export function applyBlockEffect(
  s: GameState,
  gd: GameData,
  coord: Coord,
  effect: BlockEffect | undefined,
  events:EngineEvent[]=[],
): EffectResolution | undefined {
  if (!effect || typeof effect === "string") return undefined;
  return applyTypedBlockEffect(s, gd, coord, effect,events);
}

export function applyBlockEffectForTrigger(
  s: GameState,
  gd: GameData,
  coord: Coord,
  trigger: BlockEffectTrigger,
  events:EngineEvent[]=[],
): EffectResolution | undefined {
  const placed = s.cybernet.at(coord);
  if (!placed) return undefined;
  const block = blockById(gd, placed.blockId);
  if (!block) return undefined;
  return applyBlockEffect(s, gd, coord, trigger === "inCybernet" ? block.effects?.inCybernet : block.effects?.underControl,events);
}

function cardEffectsForTrigger(
  gd: GameData,
  cardId: string,
  trigger: CardEffectTrigger,
): CardEffect[] {
  const card = gd.cards.find((entry) => entry.id === cardId);
  return (card?.effects ?? []).filter((effect) => (effect.trigger ?? "on-play") === trigger);
}

function applyCardEffect(
  s: GameState,
  gd: GameData,
  playerId: string,
  coord: Coord | undefined,
  effect: CardEffect,
): EffectResolution | undefined {
  switch (effect.kind) {
    case "place-pawn":
      return coord ? placePawnEffect(s, gd, playerId, coord, effect.target) : undefined;
    case "gain-bonus": {
      const player = playerById(s, playerId);
      if (!player) return undefined;
      const amount = amountFromCardEffect(effect);
      grantBonusCounters(s,playerId,amount);
      return { kind: "gain-bonus", playerId, amount };
    }
    default:
      return undefined;
  }
}

export function applyCardEffectsForTrigger(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  trigger: CardEffectTrigger,
  coord?: Coord,
): EffectResolution[] {
  return cardEffectsForTrigger(gd, cardId, trigger)
    .map((effect) => applyCardEffect(s, gd, playerId, coord, effect))
    .filter((effect): effect is EffectResolution => !!effect);
}
