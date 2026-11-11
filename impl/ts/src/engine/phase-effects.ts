import {pawnPhaseEffects,pawnPhaseSourceAvailable} from "./pawn-phase-effects.ts";
import {offerSpaceEffect,spaceStopError} from "./space-effects.ts";
import {clearControlledUseMarkers} from "./use-markers.ts";
import { discardPawnAttachment } from "./attachment-slots.ts";
import {cloneGameState,type EngineEvent} from "./index.ts";
import { currentPlayer, type GameData, type GameState, type PendingEffect, type PhaseEffect } from "../domain/types.ts";
import { eliminatePawn } from "./combat.ts";
import { draw } from "./deck.ts";
import { canEndOn, movementEntryError, type SpaceRef } from "./movement.ts";
import type { Coord } from "../domain/hex.ts";
import { awakenThreats, resetThreats } from "./threats.ts";

function discardSource(s: GameState, gd:GameData, effect: PendingEffect, events: EngineEvent[]): void {
  const pawn=s.cybernet.pawnById(effect.pawnId);
  const at=pawn?.attachments?.findIndex(att=>att.cardId===effect.cardId)??-1;
  if(pawn && at>=0) discardPawnAttachment(s,gd,pawn,at,events);
}

function sacrifice(s: GameState, gd: GameData, pawnId: string, events: EngineEvent[]): void {
  eliminatePawn(s,pawnId,gd,"sacrifice",events);
}

function finish(s: GameState): void {
  if (s.pendingAttack || s.pendingThreats) return;
  if (s.pendingPhase==="beginning") {
    clearControlledUseMarkers(s,currentPlayer(s).id);
    currentPlayer(s).oncePerTurnUsed={};
    resetThreats(s);
    s.phase="action";
  } else s.phase="recycle";
  delete s.pendingPhase; delete s.pendingEffects; delete s.pendingChoice;
}

function drain(s: GameState, gd: GameData, events: EngineEvent[]): void {
  if (s.pendingChoice || s.pendingAttack || s.pendingThreats) return;
  while (s.pendingEffects?.length) {
    const effect=s.pendingEffects[0]!;
    const pawn=s.cybernet.pawnById(effect.pawnId);
    if (effect.source==="pawn" ? !pawnPhaseSourceAvailable(s,gd,effect) : !pawn || pawn.ownerId!==effect.playerId || !pawn.attachments?.some(att=>att.cardId===effect.cardId)) {s.pendingEffects.shift();continue;}
    const owner=s.players.find(p=>p.id===effect.playerId)!;
    if(effect.source==="pawn") {s.pendingChoice={id:effect.id,playerId:owner.id,kind:"steal-card",effectId:effect.id,pawnId:effect.pawnId,cardId:"",amount:effect.amount};return;}
    const choiceKind = effect.kind === "discard-and-relocate" ? "relocate-pawn" : effect.kind;
    if (choiceKind === "discard-or-sacrifice" || choiceKind === "relocate-pawn" || choiceKind === "discard-cards") {
      s.pendingChoice={id:effect.id,playerId:owner.id,kind:choiceKind,effectId:effect.id,pawnId:effect.pawnId,cardId:effect.cardId,...(effect.amount ? {amount:effect.amount} : {})};
      return;
    }
    if (effect.kind==="discard-self") discardSource(s,gd,effect,events);
    else if (effect.kind==="discard-hand") {for(const cardId of owner.hand) events.push({type:"card-discarded",cardId});s.discard.push(...owner.hand);owner.hand=[];}
    else if (effect.kind === "sacrifice-and-draw") {
      sacrifice(s, gd, effect.pawnId, events);
      for (let index = 0; index < effect.amount!; index++) {
        const cardId = draw(s);
        if (cardId === undefined) break;
        owner.hand.push(cardId);events.push({type:"draw",playerId:owner.id,cardId});
      }
    } else throw new Error(`unsupported phase effect "${effect.kind}"`);
    s.pendingEffects.shift();
  }
  finish(s);
}

/** Resume only after the interrupting choice and combat have completed. */
export function resumePhaseEffects(s: GameState, gd: GameData, events: EngineEvent[] = []): void {
  if (s.pendingPhase && !s.pendingChoice && !s.pendingAttack && !s.pendingThreats) drain(s, gd, events);
}

/** Reject unsupported or malformed data before constructing/starting a match. */
export function validatePhaseEffect(effect: PhaseEffect): void {
  if (!["begin-turn","end-action"].includes(effect.trigger)) throw new Error(`unsupported phase trigger "${effect.trigger}"`);
  if (!["discard-self","discard-hand","discard-or-sacrifice","sacrifice-and-draw","discard-and-relocate","discard-cards"].includes(effect.kind)) throw new Error(`unsupported phase effect "${effect.kind}"`);
  const counted=["sacrifice-and-draw","discard-cards"].includes(effect.kind);
  if (counted && (!Number.isInteger(effect.amount) || effect.amount! < 1)) throw new Error("phase effect requires a positive card amount");
  if (!counted && effect.amount !== undefined) throw new Error("this phase effect cannot carry a card amount");
  if (effect.threatMode !== undefined && (effect.kind !== "discard-and-relocate" || !["normal-movement","placement"].includes(effect.threatMode))) throw new Error("unsupported relocation threat policy");
}

/** Only independent/single triggered effects are accepted until source ordering is resolved. */
export function startPhaseEffects(s: GameState, gd: GameData, phase: "beginning"|"action", events: EngineEvent[] = []): void {
  if (s.pendingChoice || s.pendingPhase) throw new Error("resolve the pending phase decision first");
  const trigger=phase==="beginning"?"begin-turn":"end-action";
  const effects: PendingEffect[]=pawnPhaseEffects(s,gd,phase);
  for (const pawn of s.cybernet.pawns.filter(p=>p.ownerId===currentPlayer(s).id)) for (const [index,att] of (pawn.attachments??[]).entries()) {
    for (const [effectIndex,effect] of (gd.cards.find(c=>c.id===att.cardId)?.attach?.phaseEffects??[]).entries()) if (effect.trigger===trigger) {
      validatePhaseEffect(effect);
      if (effect.kind === "discard-cards" && currentPlayer(s).hand.length < effect.amount!) throw new Error("forced discard shortfall interpretation is unresolved; this combination remains provisional");
      effects.push({...effect,id:`${s.turn}:${phase}:${pawn.pawnId}:${index}:${effectIndex}`,playerId:pawn.ownerId,pawnId:pawn.pawnId,cardId:att.cardId});
    }
  }
  if (effects.length>1) throw new Error("multiple phase-effect ordering is unresolved; this combination remains provisional");
  s.pendingPhase=phase;s.pendingEffects=effects;
  drain(s, gd, events);
}

function threatening(s: GameState, coord: Coord): boolean {
  return (s.threats ?? []).some(threat => threat.coord.q === coord.q && threat.coord.r === coord.r && threat.status !== "eliminated");
}

/** Candidate relocation destinations; never changes state or reveals a random outcome. */
export function phaseChoiceTargets(s: GameState, gd: GameData): SpaceRef[] {
  const choice = s.pendingChoice;
  if (choice?.kind !== "relocate-pawn") return [];
  const effect = s.pendingEffects?.[0];
  const targets: SpaceRef[] = [];
  const preview=cloneGameState(s);if(effect) discardSource(preview,gd,effect,[]);
  const from=preview.cybernet.pawnById(choice.pawnId)?.coord;
  for (const placed of s.cybernet.blocks) {
    const block = gd.blocks.find(block => block.id === placed.blockId);
    if (!block || (!effect?.threatMode && threatening(s, placed.coord))) continue;
    if(effect?.threatMode!=="placement" && from && movementEntryError(gd,preview.cybernet,choice.pawnId,from,placed.coord)) continue;
    for (const space of block.spaces ?? []) {
      if(space.effect && effect?.threatMode!=="placement" && (effect?.threatMode!=="normal-movement" || spaceStopError(preview,gd,choice.pawnId,{coord:placed.coord,spaceId:space.id}))) continue;
      if (!canEndOn(gd, s.cybernet, placed.coord, space.id, choice.pawnId)) targets.push({coord:{...placed.coord},spaceId:space.id});
    }
  }
  return targets;
}

function discardChosen(s: GameState, playerId: string, cardIds: string[], amount: number, events: EngineEvent[]): void {
  const owner = s.players.find(player => player.id === playerId)!;
  const remaining = [...owner.hand];
  if (cardIds.length !== amount) throw new Error(`choose exactly ${amount} physical hand card(s) to discard`);
  for (const cardId of cardIds) {
    const index = remaining.indexOf(cardId);
    if (index < 0) throw new Error("a selected physical hand card is unavailable");
    remaining.splice(index, 1);
  }
  owner.hand = remaining;
  s.discard.push(...cardIds);for(const cardId of cardIds) events.push({type:"card-discarded",cardId});
}

export function resolvePhaseChoice(s: GameState, gd: GameData, choiceId: string|undefined, optionId: string|undefined, cardIds: string[] = [], coord?: Coord, spaceId?: string, events: EngineEvent[] = []): void {
  const choice=s.pendingChoice;
  const effect=s.pendingEffects?.[0];
  let normalStop=false;
  if (!choice || choice.id!==choiceId || effect?.id!==choice.effectId) throw new Error("unknown or stale phase choice");
  if (choice.kind === "discard-or-sacrifice") {
    if (coord || spaceId) throw new Error("discard or sacrifice cannot also relocate a pawn");
    if (optionId === "discard") discardChosen(s,choice.playerId,cardIds,1,events);
    else if (optionId === "sacrifice") {
      if (cardIds.length) throw new Error("sacrifice cannot also discard hand cards");
      sacrifice(s,gd,choice.pawnId,events);
    } else throw new Error("choose discard or sacrifice");
  } else if (choice.kind === "discard-cards") {
    if (optionId !== "discard" || coord || spaceId) throw new Error("choose the required hand cards to discard");
    discardChosen(s,choice.playerId,cardIds,choice.amount!,events);
  } else if (choice.kind === "relocate-pawn") {
    if (optionId !== "relocate" || !coord || !spaceId || cardIds.length) throw new Error("choose one destination space for the relocation");
    if (!Number.isInteger(coord.q) || !Number.isInteger(coord.r)) throw new Error("relocation requires whole board coordinates");
    if (!effect.threatMode && threatening(s,coord)) throw new Error("relocation versus threats interpretation is unresolved");
    const capacity=canEndOn(gd,s.cybernet,coord,spaceId,choice.pawnId);
    if (capacity) throw new Error(capacity);
    const pawn=s.cybernet.pawnById(choice.pawnId);
    if (!pawn || pawn.ownerId!==choice.playerId) throw new Error("the relocating pawn is unavailable");
    if(effect.threatMode!=="placement") {
      const preview=cloneGameState(s);discardSource(preview,gd,effect,[]);
      const restriction=movementEntryError(gd,preview.cybernet,choice.pawnId,pawn.coord,coord);
      if(restriction) throw new Error(effect.threatMode?restriction:"relocation versus movement restrictions interpretation is unresolved");
    }
    const stopError=spaceStopError(s,gd,pawn.pawnId,{coord,spaceId});if(effect.threatMode!=="placement" && stopError) throw new Error(stopError);
    if(!effect.threatMode && gd.blocks.find(b=>b.id===s.cybernet.at(coord)?.blockId)?.spaces?.find(sp=>sp.id===spaceId)?.effect) throw new Error("relocation versus effect-space stopping is unresolved");
    normalStop=effect.threatMode==="normal-movement" && (pawn.coord.q!==coord.q || pawn.coord.r!==coord.r || pawn.spaceId!==spaceId);
    discardSource(s,gd,effect,events);
    pawn.coord={...coord};pawn.spaceId=spaceId;
    events.push({type:"pawn-relocated",pawnId:pawn.pawnId,coord:{...coord},spaceId});
    if (effect.threatMode === "normal-movement") awakenThreats(s,gd,pawn.pawnId);
  } else throw new Error("unsupported pending phase choice");
  delete s.pendingChoice;s.pendingEffects!.shift();if(normalStop) offerSpaceEffect(s,gd,choice.pawnId);drain(s,gd,events);
}
