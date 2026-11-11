import {blockById,type Block,type BlockEffect,type GameData,type GameState} from "../domain/types.ts";
import type {Coord} from "../domain/hex.ts";
import type {EngineEvent} from "./index.ts";
import {controlMarkerAllocations} from "./control-markers.ts";

export function validateMarkerHandDiscard(block:Block):void {
 for(const trigger of ["inCybernet","underControl"] as const) {
  const e=block.effects?.[trigger];if(!e || typeof e==="string")continue;
  if(e.kind!=="discard-hands-above-markers") {if(e.markerThreshold!==undefined)throw new Error("misplaced marker hand discard threshold");continue;}
  if(trigger!=="underControl" || !Number.isInteger(e.markerThreshold) || e.markerThreshold!<1 || e.amount!==undefined || e.target!==undefined || e.scope!==undefined || e.optional!==undefined || e.minimumControlledPawns!==undefined)throw new Error("marker hand discard requires under-control timing and a positive exclusive threshold without other costs/targets");
 }
}

/** Counts physical Cybernet allocations, including Idoru's counted control-card marker. */
export function cybernetControlMarkerCount(s:GameState,playerId:string):number {
 return controlMarkerAllocations(s).filter(a=>a.playerId===playerId).reduce((n,a)=>n+a.amount,0);
}

export function discardHandsAboveMarkers(s:GameState,gd:GameData,coord:Coord,e:Exclude<BlockEffect,string>,events:EngineEvent[]):void {
 const placed=s.cybernet.at(coord),block=placed&&blockById(gd,placed.blockId);
 if(!s.rulesVersion || !placed || !block || !s.players.some(p=>p.id===placed.ownerId))throw new Error("marker hand discard requires a controlled source block");
 validateMarkerHandDiscard(block);
 if(e.kind!=="discard-hands-above-markers" || e.markerThreshold!==((block.effects?.underControl as Exclude<BlockEffect,string>)?.markerThreshold))throw new Error("marker hand discard requires the source descriptor");
 const affected=s.players.filter(p=>cybernetControlMarkerCount(s,p.id)>e.markerThreshold!);
 for(const p of affected) {
  events.push({type:"block-hand-discarded",playerId:p.id,...(p.hand.length?{amount:p.hand.length}:{}),element:"block",elementId:block.id});
  for(const cardId of p.hand) {s.discard.push(cardId);events.push({type:"card-discarded",playerId:p.id,cardId});}
  p.hand=[];
 }
}
