import type {Block,GameData,GameState,SpaceModifier,DefenseDie} from "../domain/types.ts";
import type {PawnOnBoard} from "../domain/pawn_board.ts";
import {effectiveDefenseDice} from "./attach.ts";

export function validateSpaceModifier(modifier:SpaceModifier|undefined,strict=false):void {
  if(!modifier) return;
  if(modifier.dice!==undefined) {
    if(modifier.kind!=="defense" || modifier.amount!==undefined && modifier.amount!==0 || !modifier.dice.length || modifier.dice.length>6 || modifier.dice.some(d=>!Number.isInteger(d.value) || d.value<1 || d.value>6 || typeof d.shielded!=="boolean") || new Set(modifier.dice.map(d=>d.value)).size!==modifier.dice.length) throw new Error("defense-space dice require unique printed faces and shielding without a numeric amount");
  } else if(modifier.kind==="defense" && strict) throw new Error("unresolved numeric defense-space modifier; author printed faces and shielding");
}
export function validateBlockDefenseSpaces(block:Block,strict=false):void {for(const space of block.spaces??[]) validateSpaceModifier(space.modifier,strict);}

/** Source space symbols set shielding of named faces after the pawn/armor profile. */
export function defenseProfile(s:GameState,gd:GameData,pawn:PawnOnBoard):DefenseDie[] {
  const dice=effectiveDefenseDice(gd,pawn);if(gd.regressionFixture==="provisional-v1") return dice;
  const placed=s.cybernet.at(pawn.coord),modifier=gd.blocks.find(b=>b.id===placed?.blockId)?.spaces?.find(space=>space.id===pawn.spaceId)?.modifier;
  validateSpaceModifier(modifier,true);
  if(modifier?.kind==="defense") {
    for(const printed of modifier.dice!) {const face=dice.find(d=>d.value===printed.value);if(face) face.shielded=printed.shielded;else dice.push({...printed});}
    dice.sort((a,b)=>a.value-b.value);
  }
  return dice;
}
