import { pawnById, playerById, type GameData, type GameState } from "../domain/types.ts";
import { setPawnControl } from "./control.ts";
import type {EngineEvent} from "./index.ts";
import { checkWin } from "./win.ts";

/** Public, detached locations of physical markers; block ownership already records its marker. */
export interface ControlMarkerAllocation {playerId:string;kind:"block"|"control-card";elementId:string;amount:number;}
export function controlMarkerAllocations(s: GameState):ControlMarkerAllocation[] {
  return [
    ...s.cybernet.blocks.filter(b => b.ownerId).map(b => ({playerId:b.ownerId!,kind:"block" as const,elementId:`${b.coord.q},${b.coord.r}`,amount:1})),
    ...(s.controlCardMarkers ?? []).map(m => ({playerId:m.playerId,kind:"control-card" as const,elementId:m.cardId,amount:m.amount})),
  ];
}

/** A real gain of control, distinct from synchronizing a card's zone during Reboot. */
export function gainPawnControl(s: GameState, gd: GameData, pawnId: string, ownerId: string, events?:EngineEvent[]): void {
  const previous=s.cybernet.pawnById(pawnId)?.ownerId??s.controlCards?.find(c=>c.subject.kind==="pawn" && c.subject.id===pawnId)?.ownerId??"";
  const changed=()=>{if(previous!==ownerId) events?.push({type:"control-changed",element:"pawn",elementId:pawnId,...(previous || !s.rulesVersion?{fromOwnerId:previous}:{}),toOwnerId:ownerId});};
  if (!s.rulesVersion) { setPawnControl(s,pawnId,ownerId);changed();return; }
  const owner=playerById(s,ownerId);
  if(!owner) throw new Error("pawn control requires a registered player");
  const effect=pawnById(gd,pawnId)?.controlMarkerEffect;
  const cards=(s.controlCards??[]).filter(c=>c.subject.kind==="pawn" && c.subject.id===pawnId);
  const marked=(s.controlCardMarkers??[]).filter(m=>cards.some(c=>c.cardId===m.cardId));
  if(marked.length>1) throw new Error("duplicate control-card marker allocation");
  if(effect && (effect.kind!=="place-on-control-card" || effect.amount!==1)) throw new Error("unsupported control-marker effect");
  if(effect && cards.length!==1) throw new Error("control-marker effect requires one physical control card");
  if(effect && cards[0]!.ownerId===ownerId) return; // zone synchronization never repeats the instruction
  if(marked.some(m=>m.playerId===ownerId)) throw new Error("reacquiring a common card with your own marker needs a source ruling");
  if(marked.some(m=>m.amount!==1 || !playerById(s,m.playerId) || playerById(s,m.playerId)!.controlMarkersPlaced<1)) throw new Error("invalid control-card marker allocation");
  if(effect && owner.controlMarkersPlaced>=owner.controlMarkersTotal) throw new Error("no control marker remains for the control card");
  for(const marker of marked) {playerById(s,marker.playerId)!.controlMarkersPlaced-=marker.amount;events?.push({type:"control-marker-returned",playerId:marker.playerId,cardId:marker.cardId,element:"control-card",elementId:marker.cardId});}
  if(marked.length) s.controlCardMarkers=s.controlCardMarkers!.filter(m=>!marked.includes(m));
  setPawnControl(s,pawnId,ownerId);changed();
  if(effect) {
    (s.controlCardMarkers??=[]).push({playerId:ownerId,cardId:cards[0]!.cardId,amount:1});
    owner.controlMarkersPlaced++;
    events?.push({type:"control-marker-placed",playerId:ownerId,cardId:cards[0]!.cardId,element:"control-card",elementId:cards[0]!.cardId});
    checkWin(s);
  }
}
