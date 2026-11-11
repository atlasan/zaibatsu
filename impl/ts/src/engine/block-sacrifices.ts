import {type Block,type BlockEffect,type GameData,type GameState,type PendingChoice} from "../domain/types.ts";
import type {Coord} from "../domain/hex.ts";
import type {Action,EngineEvent} from "./index.ts";
import {controlledPawnCount} from "./block-discards.ts";
import {eliminatePawn} from "./combat.ts";
import {preventionCards} from "./prevention.ts";
import {deployThreats} from "./threats.ts";

export function validateBlockSacrifices(block:Block,strict=false):void {
 for(const trigger of ["inCybernet","underControl"] as const) {
  const e=block.effects?.[trigger];if(!e || typeof e==="string")continue;
  if(e.kind!=="sacrifice-per-player") {if(e.minimumControlledPawns!==undefined)throw new Error("a sacrifice threshold requires a sacrifice-per-player effect");continue;}
  if(trigger!=="inCybernet" || e.amount!==1 || !Number.isInteger(e.minimumControlledPawns) || e.minimumControlledPawns!<1 || e.target!==undefined)throw new Error("unsupported per-player sacrifice descriptor");
  if(strict)throw new Error("global sacrifice ordering and retained-pawn eligibility remain unresolved in official content");
 }
}
export function blockSacrificeChoice(s:GameState,id?:string):PendingChoice|undefined {
 const batch=s.pendingBlockSacrifices,d=batch?.decisions.find(d=>d.id===id && !d.submitted);
 return batch && d?{id:d.id,playerId:d.playerId,kind:"block-sacrifice",effectId:`block:${batch.blockId}`,pawnId:"",cardId:"",amount:1,blockId:batch.blockId}:undefined;
}
export function beginBlockSacrifices(s:GameState,gd:GameData,coord:Coord,effect:Exclude<BlockEffect,string>):void {
 if(!s.rulesVersion || s.pendingChoice || s.pendingBlockDiscards || s.pendingBlockSacrifices || s.pendingPhase || s.pendingAttack || s.pendingThreats)throw new Error("block sacrifice requires an independent source resolution window");
 const blockId=s.cybernet.at(coord)?.blockId,block=gd.blocks.find(b=>b.id===blockId);if(!block)throw new Error("block sacrifice requires a placed block");validateBlockSacrifices(block);
 if(effect.kind!=="sacrifice-per-player" || effect.amount!==1 || !Number.isInteger(effect.minimumControlledPawns) || effect.minimumControlledPawns!<1)throw new Error("unsupported per-player sacrifice descriptor");
 const serial=(s.decisionSerial??0)+1,decisions=s.players.filter(p=>controlledPawnCount(s,p.id)>=effect.minimumControlledPawns!).map(p=>({id:`sacrifice:${serial}:${p.id}`,playerId:p.id,candidatePawnIds:s.cybernet.pawns.filter(pawn=>pawn.ownerId===p.id).map(pawn=>pawn.pawnId).sort(),submitted:false}));
 if(decisions.some(d=>!d.candidatePawnIds.length))throw new Error("sacrificing an already eliminated retained pawn is unresolved; preserve the pending Search placement");
 if(!decisions.length)return;
 s.decisionSerial=serial;s.pendingBlockSacrifices={blockId:blockId!,coord:{...coord},decisions};s.pendingChoice=blockSacrificeChoice(s,decisions[0]!.id);
}
export interface UnresolvedSacrificeTarget {pawnId:string;reason:string;}
/** Live, owned, unprotected candidates are executable; unsupported replacements stay visible separately. */
export function blockSacrificeOptions(s:GameState,gd:GameData,choiceId:string):{responses:Action[];unresolvedTargets:UnresolvedSacrificeTarget[]} {
 const choice=blockSacrificeChoice(s,choiceId),d=s.pendingBlockSacrifices?.decisions.find(d=>d.id===choiceId),responses:Action[]=[],unresolvedTargets:UnresolvedSacrificeTarget[]=[];
 if(!choice || !d)return {responses,unresolvedTargets};
 for(const pawnId of d.candidatePawnIds) {
  const pawn=s.cybernet.pawnById(pawnId);if(!pawn || pawn.ownerId!==choice.playerId)continue;
  if(preventionCards(s,gd,pawnId).length)unresolvedTargets.push({pawnId,reason:"sacrifice versus elimination prevention remains unresolved"});
  else responses.push({type:"resolve-choice",playerId:choice.playerId,choiceId:choice.id,optionId:"sacrifice",targetId:pawnId});
 }
 return {responses,unresolvedTargets};
}
export function resolveBlockSacrifice(s:GameState,gd:GameData,a:Action,events:EngineEvent[]):void {
 const batch=s.pendingBlockSacrifices,choice=blockSacrificeChoice(s,a.choiceId),playerId=a.playerId??s.players[s.currentPlayer]!.id;
 if(!batch || !choice || playerId!==choice.playerId || a.optionId!=="sacrifice" || !a.targetId || a.cardId || a.cardIds?.length || a.pawnId || a.targetIds?.length || a.coord || a.spaceId || a.path?.length || a.slotRef || a.attachmentId || a.joint || a.extraSkulls || a.extraRollDice || a.movementIndex || a.dir || a.rotation)throw new Error("choose one currently controlled pawn for your required sacrifice");
 const options=blockSacrificeOptions(s,gd,choice.id);
 if(options.unresolvedTargets.some(t=>t.pawnId===a.targetId))throw new Error("sacrifice versus elimination prevention remains unresolved");
 if(!options.responses.some(r=>r.targetId===a.targetId))throw new Error("choose one currently controlled pawn for your required sacrifice");
 const d=batch.decisions.find(d=>d.id===choice.id)!;d.pawnId=a.targetId;d.submitted=true;events.push({type:"pawn-sacrifice-selected",playerId:d.playerId,pawnId:d.pawnId,elementId:batch.blockId});
 const next=batch.decisions.find(d=>!d.submitted);if(next){s.pendingChoice=blockSacrificeChoice(s,next.id);return;}
 // Validate the entire public batch before any piece, attachment or counter is removed.
 for(const selected of batch.decisions) {
  const pawn=selected.pawnId && s.cybernet.pawnById(selected.pawnId);
  if(!pawn || pawn.ownerId!==selected.playerId || !selected.candidatePawnIds.includes(pawn.pawnId))throw new Error("a committed sacrifice pawn is no longer available");
  if(preventionCards(s,gd,pawn.pawnId).length)throw new Error("sacrifice versus elimination prevention remains unresolved");
 }
 for(const selected of batch.decisions)eliminatePawn(s,selected.pawnId!,gd,"sacrifice",events);
 delete s.pendingChoice;delete s.pendingBlockSacrifices;deployThreats(s,gd,batch.coord);
}
