import {blockById,playerById,type Block,type GameData,type GameState} from "../domain/types.ts";
import {playerAttachmentModifiers} from "./attach.ts";
export interface HandSizeProfile {base:number;attachments:number;spaces:number;maximum:number;}
export function validateHandSizeSpaces(block:Block):void {
 for(const space of block.spaces??[]) {const m=space.modifier;if(m?.kind==="hand-size" && (!Number.isInteger(m.amount) || m.amount===0 || m.dice!==undefined))throw new Error("hand-size space requires a nonzero signed amount without defense dice");}
}
/** Current stopped pawns contribute space modifiers to their controller at recycling. */
export function handSizeProfile(s:GameState,gd:GameData,playerId:string):HandSizeProfile {
 const player=playerById(s,playerId);if(!player)throw new Error("hand-size profile requires a registered player");
 const attachments=playerAttachmentModifiers(s,gd,playerId).handModifier;let spaces=0;
 if(s.rulesVersion)for(const pawn of s.cybernet.pawns.filter(p=>p.ownerId===playerId)) {
  const block=blockById(gd,s.cybernet.at(pawn.coord)?.blockId??""),m=block?.spaces?.find(sp=>sp.id===pawn.spaceId)?.modifier;
  if(m?.kind==="hand-size") {validateHandSizeSpaces(block!);spaces+=m.amount!;}
 }
 return {base:player.maxHandSize,attachments,spaces,maximum:Math.max(0,player.maxHandSize+attachments+spaces)};
}
