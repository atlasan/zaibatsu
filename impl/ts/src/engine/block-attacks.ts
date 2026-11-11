import {blockById,pawnById,type Block,type GameData,type GameState,type BlockEffect} from "../domain/types.ts";
import {neighbor,type Coord} from "../domain/hex.ts";
import type {Action,EngineEvent} from "./index.ts";
import {attackRoll,defeats,eliminatePawn} from "./combat.ts";
import {defenseProfile} from "./defense.ts";

export function validateBlockAttack(block:Block):void {
 for(const trigger of ["inCybernet","underControl"] as const) {
  const e=block.effects?.[trigger];if(!e || typeof e==="string")continue;
  if(e.kind!=="attack-pawn") {if(e.scope && e.kind!=="discard-pawn-attachments" || e.optional)throw new Error("block attack scope/optionality belongs only to a targeted attack");continue;}
  if(trigger!=="underControl" || e.scope!=="adjacent-blocks" || e.optional!==true || !Number.isInteger(e.amount) || e.amount!<1 || e.target!==undefined || (e.minimumControlledPawns??0)!==0)throw new Error("targeted block attack requires under-control timing, adjacent scope, optional choice and positive skulls");
 }
}

export function beginBlockAttack(s:GameState,gd:GameData,coord:Coord,e:Exclude<BlockEffect,string>):void {
 const placed=s.cybernet.at(coord),block=placed&&blockById(gd,placed.blockId);
 if(!s.rulesVersion || !placed || !block || !s.players.some(p=>p.id===placed.ownerId))throw new Error("block attack requires a controlled source block");
 validateBlockAttack(block);
 if(s.pendingChoice || s.pendingAttack || s.pendingThreats || s.pendingEliminations?.length)throw new Error("finish pending resolution before opening a block attack");
 s.decisionSerial=(s.decisionSerial??0)+1;const id=`block-attack-${s.decisionSerial}`;
 s.pendingChoice={id,playerId:placed.ownerId!,kind:"block-attack",effectId:id,pawnId:"",cardId:"",amount:e.amount,blockId:block.id,reference:{...coord}};
}

export function blockAttackResponses(s:GameState,gd:GameData):Action[] {
 const c=s.pendingChoice;if(c?.kind!=="block-attack" || !c.reference || !c.blockId)return [];
 const placed=s.cybernet.at(c.reference),block=placed&&blockById(gd,placed.blockId),e=block?.effects?.underControl;
 if(!placed || placed.blockId!==c.blockId || placed.ownerId!==c.playerId || typeof e!=="object" || e.kind!=="attack-pawn" || e.scope!=="adjacent-blocks" || e.optional!==true || e.amount!==c.amount)return [];
 const base={type:"resolve-choice" as const,playerId:c.playerId,choiceId:c.id};
 return [{...base,optionId:"skip"},...s.cybernet.pawns.filter(p=>pawnById(gd,p.pawnId) && s.cybernet.at(p.coord) && blockById(gd,s.cybernet.at(p.coord)!.blockId) && [0,1,2,3,4,5].some(d=>{const n=neighbor(c.reference!,d);return p.coord.q===n.q && p.coord.r===n.r;})).map(p=>({...base,optionId:"attack" as const,targetId:p.pawnId}))];
}

/** The printed effect fixes its target before rolling, independently of Delete assignment. */
export function resolveBlockAttack(s:GameState,gd:GameData,a:Action,events:EngineEvent[]):void {
 const c=s.pendingChoice;
 if(c?.kind!=="block-attack" || a.choiceId!==c.id || a.cardId || a.cardIds?.length || a.targetIds?.length || a.pawnId || a.coord || a.spaceId || a.path?.length || a.joint || a.movementIndex || a.dir || a.rotation || a.extraSkulls || a.extraRollDice)throw new Error("choose a current block attack target or decline without another action/cost");
 if(!blockAttackResponses(s,gd).some(r=>r.optionId===a.optionId && r.targetId===a.targetId))throw new Error("select one pawn on an adjacent block or decline");
 if(a.optionId==="skip"){delete s.pendingChoice;return;}
 const target=s.cybernet.pawnById(a.targetId!)!,defense=defenseProfile(s,gd,target),roll=attackRoll(s.rng,c.amount!);
 events.push({type:"block-attack-targeted",playerId:c.playerId,pawnId:target.pawnId,element:"block",elementId:c.blockId,coord:{...c.reference!}});
 events.push({type:"roll",playerId:c.playerId,actionType:"resolve-choice",element:"block",elementId:c.blockId,roll});
 delete s.pendingChoice;
 if(defeats(roll,defense))eliminatePawn(s,target.pawnId,gd,"attack",events);
}
