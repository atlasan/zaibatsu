import {permittedAbilityTurn} from "./ability-turns.ts";
import {blockDetachResponses} from "./block-detach.ts";
import {blockAttackResponses} from "./block-attacks.ts";
import {pawnTheftResponses} from "./pawn-phase-effects.ts";
import {rebootDestinations} from "./reboot-destinations.ts";
import {blockSacrificeOptions} from "./block-sacrifices.ts";
import {spaceEffectResponses} from "./space-effects.ts";
import {blockDiscardChoice} from "./block-discards.ts";
import {abilityUseSpent} from "./use-markers.ts";
import {rolledMovementError,movementChoicePreview} from "./movement-choice.ts";
import {searchDeclarationError,searchPlacementResponses} from "./search-choice.ts";
import {deleteActivationOptions,deleteProfile} from "./delete-profile.ts";
import { preventionResponses } from "./prevention.ts";
import { currentPlayer, pawnById, type GameData, type GameState, type Movement } from "../domain/types.ts";
import { neighbor } from "../domain/hex.ts";
import { applyActionWithEvents, cloneGameState, type Action } from "./index.ts";
import { effectiveAbility } from "./combat.ts";
import { effectiveMovementOptions, canActivateMovementOption, stepTargets, movementStepModifier, type SpaceRef } from "./movement.ts";
import { validSearchPlacements } from "./abilities.ts";
import { phaseChoiceTargets } from "./phase-effects.ts";
import { availableAttachmentSlots } from "./attachment-slots.ts";
import { targetIceNullified } from "./attach.ts";

export interface AvailableAction {
  action: Action;
  unresolvedTargets?:Array<{pawnId:string;reason:string}>;
  movement?: Movement;
  targets?: SpaceRef[];
  responses?: Action[];
  maxSteps?: number;
  directions?: number[];
}

/** Engine-owned action templates. Paths and dice assignments are completed by the caller.
 * The query never resolves a random outcome, changes state, or advances the live RNG. */
export function availableActions(s: GameState, gd: GameData,viewerId?:string): AvailableAction[] {
  if (s.winnerId) return [];
  if(!s.pendingChoice && !s.pendingAttack && !s.pendingThreats && !s.pendingPhase && gd.regressionFixture!=="provisional-v1" && (s.phase!=="action" || !!viewerId && viewerId!==s.players[s.currentPlayer]?.id)) return [...(s.phase==="recycle" && (!viewerId || viewerId===s.players[s.currentPlayer]!.id)?[{action:{type:"recycle" as const}}]:[]),...outsideTurnOptions(s,gd,viewerId??s.players[s.currentPlayer]!.id)];
  if(viewerId && !s.pendingBlockSacrifices && !s.pendingBlockDiscards && viewerId!==(s.pendingChoice?.playerId??s.pendingAttack?.playerId??s.players[s.currentPlayer]?.id)) return [];
  if(s.pendingBlockSacrifices) {const id=viewerId??s.pendingChoice?.playerId,d=s.pendingBlockSacrifices.decisions.find(d=>d.playerId===id && !d.submitted);if(!d)return [];const o=blockSacrificeOptions(s,gd,d.id);return [{action:{type:"resolve-choice",playerId:d.playerId,choiceId:d.id,optionId:"sacrifice"},...(o.responses.length?{responses:o.responses}:{}),...(o.unresolvedTargets.length?{unresolvedTargets:o.unresolvedTargets}:{})}];}
  if(s.pendingBlockDiscards) {const id=viewerId??s.pendingChoice?.playerId,d=s.pendingBlockDiscards.decisions.find(d=>d.playerId===id && !d.submitted);return d?[{action:{type:"resolve-choice",playerId:d.playerId,choiceId:d.id,optionId:"discard"}}]:[];}
  if(s.pendingChoice?.kind==="block-detach")return [{action:{type:"resolve-choice",choiceId:s.pendingChoice.id},responses:blockDetachResponses(s,gd)}];
  if(s.pendingChoice?.kind==="block-attack")return [{action:{type:"resolve-choice",choiceId:s.pendingChoice.id},responses:blockAttackResponses(s,gd)}];
  if(s.pendingChoice?.kind==="steal-card")return [{action:{type:"resolve-choice",choiceId:s.pendingChoice.id},responses:pawnTheftResponses(s,gd)}];
  if(s.pendingChoice?.kind==="space-discard") return [{action:{type:"resolve-choice",choiceId:s.pendingChoice.id},responses:spaceEffectResponses(s,gd)}];
  if(s.pendingChoice?.kind==="move-path") {const preview=movementChoicePreview(s,gd);return [{action:{type:"resolve-choice",choiceId:s.pendingChoice.id,optionId:"move"},...(preview.nextTargets.length?{targets:preview.nextTargets}:{}),...(preview.budget?{maxSteps:preview.budget}:{}),...(preview.canFinish?{responses:[{type:"resolve-choice",playerId:s.pendingChoice.playerId,choiceId:s.pendingChoice.id,optionId:"move"}]}:{})}];}
  if (s.pendingChoice) return [{action:{type:"resolve-choice",choiceId:s.pendingChoice.id},...(s.pendingChoice.kind === "relocate-pawn" ? {targets:phaseChoiceTargets(s,gd)} : {}),...(s.pendingChoice.kind === "place-block"?{responses:searchPlacementResponses(s,gd)}:{}),...(s.pendingChoice.kind === "prevent-elimination" ? {responses:preventionResponses(s,gd)} : {})}];
  if (s.pendingAttack) return [{ action: { type: "assign-delete",...(s.pendingAttack.playerId!==s.players[s.currentPlayer]?.id?{playerId:s.pendingAttack.playerId}:{}) } }];
  if (s.pendingThreats?.stage === "retaliation") return [{ action: { type: "assign-threat-attack" } }];
  if (s.phase === "recycle") return [{ action: { type: "recycle" } }];
  if (s.phase !== "action" && !(s.pendingPhase && s.pendingThreats)) return [];
  const p = currentPlayer(s), out: AvailableAction[] = [];
  const add = (action: Action) => out.push({ action });
  if (s.pendingThreats?.stage === "response") add({type:"assign-threat-attack"});
  if (!s.pendingThreats) add({type:"pass"});
  const hand = [...new Set(p.hand)];
  const probe = (action: Action) => {
    if (applyActionWithEvents(cloneGameState(s), gd, action).accepted) add(action);
  };
  for (const placed of s.cybernet.pawns.filter(pawn => pawn.ownerId === p.id)) {
    const pawn = pawnById(gd, placed.pawnId);
    if (!pawn) continue;
    if (!s.pendingThreats) {
      for (const [movementIndex, option] of effectiveMovementOptions(gd,pawn,placed.attachments).entries()) {
        if(gd.regressionFixture!=="provisional-v1" && option.rolledPerTurn) continue;
        const copy = cloneGameState(s);
        if (canActivateMovementOption(copy,currentPlayer(copy),pawn.id,option)) continue;
        const cards = option.movement.activation === "card" ? hand.filter(id => (gd.cards.find(card=>card.id===id)?.movement ?? 0)>0) : [undefined];
        for (const cardId of cards) {
          const type = option.movement.type === "hex" ? "move-hex" : cardId && movementIndex===0 ? "play-move" : "move-steps";
          const action: Action = {type,pawnId:pawn.id,...(cardId?{cardId}:{}),...(movementIndex?{movementIndex}:{})};
          if(gd.regressionFixture!=="provisional-v1" && ["d6","2d6"].includes(option.movement.type)) {const rolled:Action={...action,type:"roll-movement"};if(!rolledMovementError(s,gd,rolled)) out.push({action:rolled,movement:option.movement});continue;}
          if (option.movement.type === "hex") {
            const directions=[0,1,2,3,4,5].filter(dir=>s.cybernet.at(neighbor(placed.coord,dir)) && applyActionWithEvents(cloneGameState(s),gd,{...action,dir}).accepted);
            if (directions.length) out.push({action,movement:option.movement,directions});
          } else {
            const movement = cardId && movementIndex===0 ? {type:"steps" as const,steps:gd.cards.find(card=>card.id===cardId)!.movement!,activation:"card" as const} : option.movement;
            const maximum=Math.max(0,(movement.type==="d6"?6:movement.type==="2d6"?12:movement.steps??0)+movementStepModifier(gd,placed));
            const targets=stepTargets(gd,s.cybernet,placed.coord,placed.spaceId,pawn.id);
            if(gd.regressionFixture!=="provisional-v1") {
              const canStop=applyActionWithEvents(cloneGameState(s),gd,action).accepted;
              if(canStop || maximum>0 && targets.length) out.push({action,movement,...(maximum>0 && targets.length?{targets}:{}),...(maximum?{maxSteps:maximum}:{}),...(canStop?{responses:[action]}:{})});
            } else if (maximum>0 && targets.length) out.push({action,movement,targets,maxSteps:maximum});
          }
        }
      }
      if(gd.regressionFixture!=="provisional-v1" && (pawn.movement.activation==="once-per-turn" || ["d6","2d6"].includes(pawn.movement.type)) && effectiveMovementOptions(gd,pawn,placed.attachments).length) {
        const targets=stepTargets(gd,s.cybernet,placed.coord,placed.spaceId,pawn.id);for(const cardId of hand) {const steps=gd.cards.find(c=>c.id===cardId)?.movement??0;if(steps<=0) continue;const maximum=Math.max(0,steps+movementStepModifier(gd,placed)),action:Action={type:"play-move",pawnId:pawn.id,cardId},canStop=applyActionWithEvents(cloneGameState(s),gd,action).accepted;if(canStop || maximum>0 && targets.length) out.push({action,movement:{type:"steps",steps,activation:"card"},...(maximum>0 && targets.length?{targets}:{}),...(maximum?{maxSteps:maximum}:{}),...(canStop?{responses:[action]}:{})});}
      }
      // Any movement-valued card may also activate a separately granted card move.
      const search=effectiveAbility(gd,pawn,placed.attachments,"search");
      if (search && search.activation!=="none" && !(search.activation==="once-per-turn" && abilityUseSpent(s,gd,p,pawn.id,"search"))) {
        const cards=search.activation==="card"?hand:[undefined];
        if(gd.regressionFixture!=="provisional-v1") {
          for(const cardId of cards) if(!searchDeclarationError(s,gd,p.id,pawn.id,cardId)) add({type:cardId?"play-search":"search",pawnId:pawn.id,...(cardId?{cardId}:{})});
        } else try {
          for (const placement of validSearchPlacements(s,gd,pawn.id)) for (const cardId of cards) add({type:cardId?"play-search":"search",pawnId:pawn.id,...(cardId?{cardId}:{}),dir:placement.dir,rotation:placement.rotation});
        } catch { /* No legal placement or exhausted pile. */ }
      }
    }
    const targets=s.cybernet.pawns.filter(other=>other.pawnId!==pawn.id && other.coord.q===placed.coord.q && other.coord.r===placed.coord.r);
    const threats=(s.threats??[]).filter(t=>t.coord.q===placed.coord.q && t.coord.r===placed.coord.r && t.status!=="eliminated");
    for(const del of deleteActivationOptions(gd,pawn,placed.attachments)) {
    if (del && del.activation!=="none" && !(del.activation==="once-per-turn" && abilityUseSpent(s,gd,p,pawn.id,"delete")) && (targets.length||threats.length)) {
      for (const cardId of del.activation==="card"?hand.filter(id=>gd.cards.find(c=>c.id===id)?.activates?.includes("delete")):[undefined]) {
        add({type:"roll-delete",pawnId:pawn.id,...(cardId?{cardId}:{})});
        if(gd.regressionFixture!=="provisional-v1" && threats.length && s.cybernet.pawns.filter(other=>other.ownerId===p.id && other.coord.q===placed.coord.q && other.coord.r===placed.coord.r && deleteProfile(gd,pawnById(gd,other.pawnId)!,other.attachments).skulls>0).length>1) add({type:"roll-delete",pawnId:pawn.id,joint:true,...(cardId?{cardId}:{})});
        if (!threats.length && !s.pendingThreats) for (const target of targets) add({type:cardId?"play-delete":"delete",pawnId:pawn.id,targetId:target.pawnId,...(cardId?{cardId}:{})});
      }
    }
    }
    if (s.pendingThreats) continue;
    const ice=effectiveAbility(gd,pawn,placed.attachments,"icebreaker");
    if (ice && ice.activation!=="none" && !(ice.activation==="once-per-turn" && abilityUseSpent(s,gd,p,pawn.id,"icebreaker"))) {
      for (const cardId of ice.activation==="card"?hand.filter(id=>gd.cards.find(c=>c.id===id)?.activates?.includes("icebreaker")):[undefined]) {
        const block=s.cybernet.at(placed.coord), def=gd.blocks.find(b=>b.id===block?.blockId);
        if (block && block.ownerId!==p.id && def && ((def.iceFaces?.length??0)>0 || (def.iceValue && def.iceValue!=="none")) && !targetIceNullified(gd,block.attachments) && p.controlMarkersPlaced<p.controlMarkersTotal) add({type:cardId?"play-icebreak-block":"icebreak-block",pawnId:pawn.id,coord:placed.coord,...(cardId?{cardId}:{})});
        for (const target of targets) {
          const def=pawnById(gd,target.pawnId);
          if (target.ownerId!==p.id && def && ((def.iceFaces?.length??0)>0 || (def.iceValue && def.iceValue!=="none")) && !targetIceNullified(gd,target.attachments)) add({type:cardId?"play-icebreak-pawn":"icebreak-pawn",pawnId:pawn.id,targetId:target.pawnId,...(cardId?{cardId}:{})});
        }
      }
    }
    for (const threat of s.threats??[]) if (threat.status==="eliminated") probe({type:"collect-threat",pawnId:pawn.id,targetId:threat.id});
    for (const cardId of hand) {
      const attach=gd.cards.find(c=>c.id===cardId)?.attach;
      if (attach?.as==="pawn") {
        if(gd.regressionFixture==="provisional-v1") probe({type:"attach-pawn",cardId,targetId:pawn.id});
        else for(const slot of availableAttachmentSlots(gd,placed,attach.slot)) probe({type:"attach-pawn",cardId,targetId:pawn.id,slotRef:slot.ref});
      }
      if (attach?.as==="block") probe({type:"attach-block",cardId,pawnId:pawn.id,coord:placed.coord});
      if (attach?.as==="enemy") for (const target of targets) {
        if(gd.regressionFixture==="provisional-v1") probe({type:"attach-enemy",cardId,pawnId:pawn.id,targetId:target.pawnId});
        else for(const slot of availableAttachmentSlots(gd,target,attach.slot)) probe({type:"attach-enemy",cardId,pawnId:pawn.id,targetId:target.pawnId,slotRef:slot.ref});
      }
    }
  }
  if (!s.pendingThreats) for (const pawnId of s.eliminated) {
    const destinations=gd.regressionFixture==="provisional-v1"?[undefined]:rebootDestinations(s,gd,p.id,pawnId);
    for(const destination of destinations) {
      const target=destination?{coord:destination.coord,spaceId:destination.spaceId}:{};
      if(pawnById(gd,pawnId)?.abilities?.some(a=>a.ability==="reboot" && a.activation==="once-per-turn"))probe({type:"reboot",pawnId,...target});
      for (const cardId of hand.filter(id=>gd.cards.find(c=>c.id===id)?.activates?.includes("reboot"))) probe({type:"play-reboot-card",cardId,pawnId,...target});
      if (p.hand.length>=4) probe({type:"play-reboot",cardIds:p.hand.slice(0,4),pawnId,...target});
    }
  }
  return structuredClone(out);
}

function outsideTurnOptions(s:GameState,gd:GameData,viewerId:string):AvailableAction[] {
 const index=s.players.findIndex(p=>p.id===viewerId);if(index<0)return [];
 const candidate=cloneGameState(s);candidate.currentPlayer=index;candidate.phase="action";
 return availableActions(candidate,gd).flatMap(option=>{
  const action={...option.action,playerId:viewerId};
  if(!permittedAbilityTurn(s,gd,action))return [];
  if(!applyActionWithEvents(cloneGameState(s),gd,action).accepted)return [];
  return [{...option,action,...(option.responses?{responses:option.responses.map(a=>({...a,playerId:viewerId}))}:{})}];
 });
}
