import {blockById,playerById,type Block,type GameData,type GameState,type Space} from "../domain/types.ts";
import type {Action,EngineEvent} from "./index.ts";
import type {SpaceRef} from "./movement.ts";
import {discardPawnAttachment} from "./attachment-slots.ts";

export function validateSpaceEffects(block:Block,strict=false):void {
 for(const space of block.spaces??[]) {
  const effect=space.effect;
  if(effect && (space.type!=="effect" || effect.kind!=="discard-attachment" || !["add-on","gadget"].includes(effect.cardType) || effect.scope!=="cybernet" || effect.optional!==true)) throw new Error("unsupported or malformed optional space effect");
  if(strict && (effect || space.type==="effect")) throw new Error("unresolved effect-space targeting or timing in official content");
 }
}

/** Public stop eligibility; neither the live pawn nor its RNG is changed. */
export function spaceStopError(s:GameState,gd:GameData,pawnId:string,destination?:SpaceRef):string|undefined {
 if(!s.rulesVersion || gd.regressionFixture) return;
 const pawn=s.cybernet.pawnById(pawnId);if(!pawn) return "the stopping pawn is unavailable";
 const coord=destination?.coord??pawn.coord,spaceId=destination?.spaceId??pawn.spaceId,placed=s.cybernet.at(coord),block=blockById(gd,placed?.blockId??""),space=block?.spaces?.find(sp=>sp.id===spaceId);
 if(!space?.effect && space?.type!=="effect") return;
 try {if(block)validateSpaceEffects(block);} catch(error) {return (error as Error).message;}
 if(!space?.effect) return "untyped effect space requires source review";
 if(s.pendingAttack || s.pendingThreats || s.threats?.some(t=>t.status!=="eliminated" && t.coord.q===coord.q && t.coord.r===coord.r)) return "effect-space versus threat timing is unresolved";
}

function context(s:GameState,gd:GameData):{space:Space;pawnId:string} {
 const choice=s.pendingChoice,pawn=choice && s.cybernet.pawnById(choice.pawnId);
 if(choice?.kind!=="space-discard" || !pawn || pawn.ownerId!==choice.playerId || !choice.reference || pawn.coord.q!==choice.reference.q || pawn.coord.r!==choice.reference.r || pawn.spaceId!==choice.spaceId) throw new Error("the pending stopping pawn or effect space is unavailable");
 const block=blockById(gd,s.cybernet.at(pawn.coord)?.blockId??"");
 if(!block || block.id!==choice.blockId) throw new Error("the pending effect block is unavailable");
 validateSpaceEffects(block);const space=block.spaces!.find(sp=>sp.id===pawn.spaceId)!;
 if(!space?.effect) throw new Error("the pending space effect is unavailable");
 return {space,pawnId:pawn.pawnId};
}

export function spaceEffectResponses(s:GameState,gd:GameData):Action[] {
 const choice=s.pendingChoice;if(choice?.kind!=="space-discard") return [];
 const {space}=context(s,gd),base={type:"resolve-choice" as const,playerId:choice.playerId,choiceId:choice.id},responses:Action[]=[{...base,optionId:"skip"}],seen=new Set<string>();
 for(const pawn of s.cybernet.pawns) for(const attachment of pawn.attachments??[]) {
  if((gd.cards.find(c=>c.id===attachment.cardId)?.type??gd.cards.find(c=>c.id===attachment.cardId)?.attach?.slot)!==space.effect!.cardType) continue;
  if(!attachment.instanceId || seen.has(attachment.instanceId)) throw new Error("space effects require unique physical attachment ids");
  seen.add(attachment.instanceId);responses.push({...base,optionId:"discard",targetId:pawn.pawnId,attachmentId:attachment.instanceId});
 }
 return responses;
}

/** Called once after positive movement completes, never at intermediate or zero steps. */
export function offerSpaceEffect(s:GameState,gd:GameData,pawnId:string):void {
 if(!s.rulesVersion || gd.regressionFixture) return;
 const error=spaceStopError(s,gd,pawnId);if(error) throw new Error(error);
 const pawn=s.cybernet.pawnById(pawnId)!,block=blockById(gd,s.cybernet.at(pawn.coord)?.blockId??""),space=block?.spaces?.find(sp=>sp.id===pawn.spaceId);if(!space?.effect) return;
 if(s.pendingChoice || s.pendingBlockDiscards || !playerById(s,pawn.ownerId)) throw new Error("resolve pending work before offering a controlled space effect");
 s.decisionSerial=(s.decisionSerial??0)+1;const id=`space-${s.decisionSerial}`;
 s.pendingChoice={id,playerId:pawn.ownerId,kind:"space-discard",effectId:id,pawnId,cardId:"",blockId:block!.id,spaceId:pawn.spaceId,reference:{...pawn.coord}};
 spaceEffectResponses(s,gd); // Reject invalid physical identities within the atomic command boundary.
}

export function resolveSpaceEffect(s:GameState,gd:GameData,a:Action,events:EngineEvent[]=[]):void {
 const choice=s.pendingChoice;
 if(choice?.kind!=="space-discard" || a.choiceId!==choice.id || a.cardId || a.cardIds?.length || a.pawnId || a.targetIds?.length || a.coord || a.spaceId || a.path?.length || a.slotRef || a.joint || a.movementIndex || a.dir || a.rotation || a.extraSkulls || a.extraRollDice) throw new Error("choose only the current optional space response");
 const response=spaceEffectResponses(s,gd).find(r=>r.optionId===a.optionId && r.targetId===(a.targetId||undefined) && r.attachmentId===(a.attachmentId||undefined));if(!response) throw new Error("choose a current physical attachment or decline the space effect");
 if(response.optionId==="discard") {const target=s.cybernet.pawnById(response.targetId!)!,index=target.attachments!.findIndex(att=>att.instanceId===response.attachmentId);discardPawnAttachment(s,gd,target,index,events);}
 delete s.pendingChoice;
}
