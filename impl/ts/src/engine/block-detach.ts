import {blockById,pawnById,type Block,type GameData,type GameState} from "../domain/types.ts";
import type {Coord} from "../domain/hex.ts";
import type {Action,EngineEvent} from "./index.ts";
import {discardAttachments} from "./attach.ts";

export function validateBlockDetach(block:Block):void {
 for(const trigger of ["inCybernet","underControl"] as const) {
  const e=block.effects?.[trigger];if(!e || typeof e==="string" || e.kind!=="discard-pawn-attachments")continue;
  if(trigger!=="underControl" || e.scope!=="cybernet" || e.optional!==undefined || e.amount!==undefined || e.target!==undefined || e.markerThreshold!==undefined || e.minimumControlledPawns!==undefined)throw new Error("pawn detachment requires mandatory under-control timing and Cybernet scope without extra costs or targets");
 }
}
export function beginBlockDetach(s:GameState,gd:GameData,coord:Coord):void {
 const placed=s.cybernet.at(coord),block=placed&&blockById(gd,placed.blockId);
 if(!s.rulesVersion || !placed || !block || !s.players.some(p=>p.id===placed.ownerId))throw new Error("pawn detachment requires a controlled source block");
 validateBlockDetach(block);const e=block.effects?.underControl;if(typeof e!=="object" || e.kind!=="discard-pawn-attachments")throw new Error("pawn detachment source is unavailable");
 if(s.pendingChoice || s.pendingAttack || s.pendingThreats || s.pendingEliminations?.length)throw new Error("finish pending resolution before opening pawn detachment");
 s.decisionSerial=(s.decisionSerial??0)+1;const id=`block-detach-${s.decisionSerial}`;
 s.pendingChoice={id,playerId:placed.ownerId!,kind:"block-detach",effectId:id,pawnId:"",cardId:"",blockId:block.id,reference:{...coord}};
}
export function blockDetachResponses(s:GameState,gd:GameData):Action[] {
 const c=s.pendingChoice;if(c?.kind!=="block-detach" || !c.reference || !c.blockId)return [];
 const placed=s.cybernet.at(c.reference),block=placed&&blockById(gd,placed.blockId),e=block?.effects?.underControl;
 if(!placed || placed.blockId!==c.blockId || placed.ownerId!==c.playerId || typeof e!=="object" || e.kind!=="discard-pawn-attachments")return [];
 try{validateBlockDetach(block!);}catch{return [];}
 return s.cybernet.pawns.filter(p=>pawnById(gd,p.pawnId) && blockById(gd,s.cybernet.at(p.coord)?.blockId??"")).map(p=>({type:"resolve-choice",playerId:c.playerId,choiceId:c.id,optionId:"discard",targetId:p.pawnId}));
}
export function resolveBlockDetach(s:GameState,gd:GameData,a:Action,events:EngineEvent[]):void {
 const c=s.pendingChoice;
 if(c?.kind!=="block-detach" || a.choiceId!==c.id || a.cardId || a.cardIds?.length || a.targetIds?.length || a.pawnId || a.coord || a.spaceId || a.path?.length || a.attachmentId || a.slotRef || a.joint || a.movementIndex || a.dir || a.rotation || a.extraSkulls || a.extraRollDice)throw new Error("choose one current Cybernet pawn without another action, attachment selection or cost");
 if(!blockDetachResponses(s,gd).some(r=>r.optionId===a.optionId && r.targetId===a.targetId))throw new Error("choose a current pawn in Cybernet; this mandatory effect cannot be declined");
 const target=s.cybernet.pawnById(a.targetId!)!,cards=(target.attachments??[]).map(att=>att.cardId);
 events.push({type:"block-attachments-discarded",playerId:c.playerId,pawnId:target.pawnId,...(cards.length?{amount:cards.length}:{}),element:"block",elementId:c.blockId});
 discardAttachments(s,target);for(const cardId of cards)events.push({type:"card-discarded",cardId});delete s.pendingChoice;
}
