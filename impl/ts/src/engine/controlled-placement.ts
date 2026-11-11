import {pawnById,type Block,type GameData,type GameState} from "../domain/types.ts";
import type {Coord} from "../domain/hex.ts";
import {discardAttachments} from "./attach.ts";
import {gainPawnControl} from "./control-markers.ts";
import {canEndOn} from "./movement.ts";
import type {EngineEvent} from "./index.ts";

export function validateControlledPlacement(block:Block,gd:GameData):void {
 for(const trigger of ["inCybernet","underControl"] as const) {
  const e=block.effects?.[trigger];if(typeof e!=="object" || e.kind!=="place-controlled-pawn")continue;
  if(trigger!=="underControl" || !e.target || !pawnById(gd,e.target) || (e.amount??0)!==0 || (e.minimumControlledPawns??0)!==0 || block.spaces?.filter(s=>s.type==="pawn" && s.pawnId===e.target).length!==1 || gd.controlCards?.filter(c=>c.subject.kind==="pawn" && c.subject.id===e.target).length!==1)throw new Error("controlled placement requires under-control timing, a known pawn, one matching space and physical control card");
 }
}

export function placeControlledPawn(s:GameState,gd:GameData,coord:Coord,pawnId:string|undefined,events:EngineEvent[]) {
 const placed=s.cybernet.at(coord),block=gd.blocks.find(b=>b.id===placed?.blockId),owner=s.players.find(p=>p.id===placed?.ownerId),definition=pawnId&&pawnById(gd,pawnId);
 const spaces=block?.spaces?.filter(sp=>sp.type==="pawn" && sp.pawnId===pawnId)??[],cards=s.controlCards?.filter(c=>c.subject.kind==="pawn" && c.subject.id===pawnId)??[];
 if(!s.rulesVersion || !owner || !definition || spaces.length!==1 || cards.length!==1)throw new Error("controlled placement needs a controlled block and matching physical pawn/card");
 const existing=s.cybernet.pawnById(pawnId!),card=cards[0]!,reserve=(s.reserve??[]).filter(id=>id===pawnId).length,retained=s.eliminated.filter(id=>id===pawnId).length;
 if(s.outOfGame?.includes(pawnId!) || s.cybernet.pawns.filter(p=>p.pawnId===pawnId).length+reserve+retained!==1 || (reserve && (card.zone!=="common" || card.ownerId)) || (existing && (card.ownerId!==existing.ownerId || card.zone!==(existing.ownerId?"control":"common"))) || (retained && (card.zone!=="control" || !s.players.some(p=>p.id===card.ownerId))))throw new Error("controlled placement physical pool/control-card mismatch");
 const spaceId=spaces[0]!.id,error=canEndOn(gd,s.cybernet,coord,spaceId,pawnId!);if(error)throw new Error(error);
 if(existing && existing.ownerId!==owner.id) {const ids=(existing.attachments??[]).map(a=>a.cardId);discardAttachments(s,existing);for(const cardId of ids)events.push({type:"card-discarded",cardId});}
 const pawn=existing??{pawnId:pawnId!,ownerId:card.ownerId,coord:{...coord},spaceId};
 const moved=!!existing && (pawn.coord.q!==coord.q || pawn.coord.r!==coord.r || pawn.spaceId!==spaceId);
 pawn.coord={...coord};pawn.spaceId=spaceId;
 if(!existing){s.cybernet.placePawn(pawn);events.push({type:"pawn-placed",element:"pawn",elementId:pawn.pawnId,toOwnerId:owner.id,coord:{...coord},spaceId});}
 else if(moved)events.push({type:"pawn-relocated",pawnId:pawn.pawnId,coord:{...coord},spaceId});
 s.reserve=s.reserve?.filter(id=>id!==pawnId);s.eliminated=s.eliminated.filter(id=>id!==pawnId);
 gainPawnControl(s,gd,pawn.pawnId,owner.id,events);return pawn;
}
