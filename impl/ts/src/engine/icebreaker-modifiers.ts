import {pawnById,type GameData,type IcebreakerModifier} from "../domain/types.ts";
import type {PawnOnBoard} from "../domain/pawn_board.ts";

export function validateIcebreakerAttachment(attach:GameData["cards"][number]["attach"]):void {
 const m=attach?.icebreakerModifier;if(!m) return;
 if(!["pawn","enemy"].includes(attach!.as) || m.rollDice!==undefined && (!Number.isInteger(m.rollDice) || m.rollDice<0) || m.faces && (new Set(m.faces).size!==m.faces.length || m.faces.some(f=>!Number.isInteger(f) || f<1 || f>6)) || m.black!==undefined && typeof m.black!=="boolean" || m.ignoresBlackIce!==undefined && typeof m.ignoresBlackIce!=="boolean") throw new Error("unsupported or malformed acting Icebreaker attachment modifier");
}

/** Acting modifiers are distinct from target ICE and cannot create a target's ICE. */
export function effectiveIcebreakerModifier(gd:GameData,pawn:PawnOnBoard):IcebreakerModifier {
 const parts=[pawnById(gd,pawn.pawnId)?.icebreakerModifier,...(pawn.attachments??[]).map(a=>gd.cards.find(c=>c.id===a.cardId)?.attach?.icebreakerModifier)];
 const faces=[...new Set(parts.flatMap(m=>m?.faces??[]))].sort((a,b)=>a-b),rollDice=parts.reduce((sum,m)=>sum+(m?.rollDice??0),0);
 return {...(faces.length?{faces}:{}),...(rollDice?{rollDice}:{}),...(parts.some(m=>m?.black)?{black:true}:{}),...(parts.some(m=>m?.ignoresBlackIce)?{ignoresBlackIce:true}:{})};
}
