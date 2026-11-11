import {pawnById,type ActionCard,type GameData,type GameState,type Player,type UseMarker} from "../domain/types.ts";
import type {Attachment} from "../domain/pawn_board.ts";
import type {EngineEvent} from "./index.ts";

export function hasLimitedAttachmentUses(card:ActionCard):boolean {
  return card.attach?.delete?.activation==="once-per-turn" || !!card.attach?.abilityUses?.some(use=>use.activation==="once-per-turn" || !!use.perTurn || !!use.dice);
}

function read(markers:UseMarker[]|undefined,ability:string):number {return markers?.find(marker=>marker.ability===ability)?.uses??0;}
function spend(markers:UseMarker[],ability:string):void {const marker=markers.find(marker=>marker.ability===ability);if(marker) marker.uses++;else markers.push({ability,uses:1});}
function nativeCount(s:GameState,pawnId:string,ability:string):number {return s.nativeUseMarkers?.find(marker=>marker.pawnId===pawnId && marker.ability===ability)?.uses??0;}
function spendNative(s:GameState,pawnId:string,ability:string):void {
  const markers=s.nativeUseMarkers??=[],marker=markers.find(marker=>marker.pawnId===pawnId && marker.ability===ability);
  if(marker) marker.uses++;else markers.push({pawnId,ability,uses:1});
}

export function newAttachmentInstance(s:GameState):string {
  const existing=new Set([...s.cybernet.pawns.flatMap(p=>p.attachments??[]),...s.cybernet.blocks.flatMap(b=>b.attachments??[]),...s.unresolvedUseCards??[]].map(a=>a.instanceId));
  let id:string;do {s.attachmentSerial=(s.attachmentSerial??0)+1;id=`attachment-${s.attachmentSerial}`;} while(existing.has(id));return id;
}
function ensureInstance(s:GameState,att:Attachment):void {att.instanceId??=newAttachmentInstance(s);}

function provider(s:GameState,gd:GameData,pawnId:string,ability:string):Attachment|undefined {
  if(pawnById(gd,pawnId)?.abilities?.some(a=>a.ability===ability && a.activation==="once-per-turn")) return undefined;
  const att=s.cybernet.pawnById(pawnId)?.attachments?.find(att=>{
    const rule=gd.cards.find(card=>card.id===att.cardId)?.attach;
    return ability==="delete" && (rule?.delete?.activation==="once-per-turn" || rule?.abilityUses?.some(use=>use.ability==="delete" && use.activation==="once-per-turn"));
  });
  if(!att) throw new Error("the physical free-ability source is unavailable");return att;
}

export function abilityUseSpent(s:GameState,gd:GameData,owner:Player,pawnId:string,ability:string):boolean {
  if(!s.rulesVersion) return !!owner.oncePerTurnUsed[`${ability}:${pawnId}`];
  const att=provider(s,gd,pawnId,ability);return att?read(att.useMarkers,ability)>0:nativeCount(s,pawnId,ability)>0;
}
export function spendAbilityUse(s:GameState,gd:GameData,owner:Player,pawnId:string,ability:string):void {
  if(!s.rulesVersion) {owner.oncePerTurnUsed[`${ability}:${pawnId}`]=true;return;}
  const att=provider(s,gd,pawnId,ability);if(att) {ensureInstance(s,att);spend(att.useMarkers??=[],ability);}else spendNative(s,pawnId,ability);
}

/** Movement grants identify their physical attachment, never a player/index cache. */
export function movementUsesTaken(s:GameState,pawnId:string,attachmentIndex?:number,grantIndex=0):number {
  if(attachmentIndex===undefined) return nativeCount(s,pawnId,"move");
  const att=s.cybernet.pawnById(pawnId)?.attachments?.[attachmentIndex];if(!att) throw new Error("the physical movement card is unavailable");return read(att.useMarkers,`move:${grantIndex}`);
}
export function spendMovementUse(s:GameState,pawnId:string,attachmentIndex?:number,grantIndex=0):void {
  if(attachmentIndex===undefined) {spendNative(s,pawnId,"move");return;}
  const att=s.cybernet.pawnById(pawnId)?.attachments?.[attachmentIndex];if(!att) throw new Error("the physical movement card is unavailable");ensureInstance(s,att);spend(att.useMarkers??=[],`move:${grantIndex}`);
}

/** Retain evidence instead of inventing whether a discarded ability marker resets. */
export function retainDiscardedUseCards(s:GameState,atts:Attachment[]):void {
  if(!s.rulesVersion) return;
  for(const att of atts) if(att.useMarkers?.some(marker=>marker.uses>0)) {ensureInstance(s,att);(s.unresolvedUseCards??=[]).push(structuredClone(att));}
}
export function requireResolvedCardReuse(s:GameState,cardId:string):void {
  if(s.rulesVersion && s.unresolvedUseCards?.some(att=>att.cardId===cardId)) throw new Error("discarded-card use-marker lifetime or physical-copy identity is unresolved; reattachment is not supported");
}

/** Beginning effects finish before markers clear from cards currently controlled. */
export function clearControlledUseMarkers(s:GameState,playerId:string):void {
  if(!s.rulesVersion) return;
  const owner=(pawnId:string)=>s.controlCards?.find(card=>card.subject.kind==="pawn" && card.subject.id===pawnId)?.ownerId??s.cybernet.pawnById(pawnId)?.ownerId??"";
  s.nativeUseMarkers=(s.nativeUseMarkers??[]).filter(marker=>owner(marker.pawnId)!==playerId);
  for(const pawn of s.cybernet.pawns) if(pawn.ownerId===playerId) for(const att of pawn.attachments??[]) delete att.useMarkers;
}

export function useMarkerAllocations(s:GameState) {
  const allocations:Array<{id:string;pawnId:string;ability:string;uses:number;ownerId:string;cardId?:string;instanceId?:string;unresolved?:boolean}>=[];
  for(const marker of s.nativeUseMarkers??[]) {const ownerId=s.controlCards?.find(card=>card.subject.kind==="pawn" && card.subject.id===marker.pawnId)?.ownerId??s.cybernet.pawnById(marker.pawnId)?.ownerId??"";allocations.push({id:`pawn:${marker.pawnId}:${marker.ability}`,pawnId:marker.pawnId,ability:marker.ability,uses:marker.uses,ownerId});}
  const append=(att:Attachment,pawnId:string,ownerId:string,unresolved=false)=>{for(const marker of att.useMarkers??[]) allocations.push({id:`${att.instanceId??"unidentified"}:${marker.ability}`,pawnId,ability:marker.ability,uses:marker.uses,ownerId,cardId:att.cardId,...(att.instanceId?{instanceId:att.instanceId}:{}),...(unresolved?{unresolved:true}:{})});};
  for(const pawn of s.cybernet.pawns) for(const att of pawn.attachments??[]) append(att,pawn.pawnId,pawn.ownerId);
  for(const att of s.unresolvedUseCards??[]) append(att,"","",true);
  return structuredClone(allocations);
}

export function useMarkerEvents(s:GameState,before:ReturnType<typeof useMarkerAllocations>):EngineEvent[] {
  const now=useMarkerAllocations(s),events:EngineEvent[]=[];
  const emit=(type:"ability-use-marked"|"ability-use-cleared"|"ability-marker-retained",marker:typeof now[number])=>events.push({type,...(marker.ownerId?{playerId:marker.ownerId}:{}),...(marker.pawnId?{pawnId:marker.pawnId}:{}),elementId:marker.id,...(marker.cardId?{cardId:marker.cardId}:{})});
  for(const marker of now) {const old=before.find(m=>m.id===marker.id);for(let i=old?.uses??0;i<marker.uses;i++) emit("ability-use-marked",marker);if(marker.unresolved && !old?.unresolved) emit("ability-marker-retained",marker);}
  for(const old of before) {const current=now.find(m=>m.id===old.id);for(let i=current?.uses??0;i<old.uses;i++) emit("ability-use-cleared",old);}
  return events;
}
