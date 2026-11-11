import {blockById,type Block,type GameData,type GameState} from "../domain/types.ts";
import type {SpaceRef} from "./movement.ts";
import {canEndOn} from "./movement.ts";

/** A controller's optional Core use is a permission, not a new setup Core. */
export function validateControllerCore(block:Block):void {
  for(const trigger of ["inCybernet","underControl"] as const) {
    const effect=block.effects?.[trigger];
    if(typeof effect!=="object" || effect.kind!=="controller-core") continue;
    const spaces=block.spaces?.filter(space=>space.id===effect.target)??[];
    if(trigger!=="underControl" || block.isCentralCore || (effect.amount??0)!==0 || (effect.minimumControlledPawns??0)!==0 || spaces.length!==1 || spaces[0]!.type!=="special" || spaces[0]!.capacity!=="unlimited") throw new Error("controller Core permission requires under-control timing and one unlimited special landing space");
  }
}

/** Detached public options; does not spend cards, use markers or randomness. */
export function rebootDestinations(s:GameState,gd:GameData,playerId:string,pawnId:string):SpaceRef[] {
  if(!s.players.some(p=>p.id===playerId)) return [];
  return s.cybernet.blocks.flatMap(placed=>{
    const block=blockById(gd,placed.blockId);if(!block)return [];
    const effect=block.effects?.underControl;
    const spaceId=block.isCentralCore?block.spaces?.[0]?.id:placed.ownerId===playerId && typeof effect==="object" && effect.kind==="controller-core"?effect.target:undefined;
    if(!spaceId || canEndOn(gd,s.cybernet,placed.coord,spaceId,pawnId)) return [];
    return [{coord:{...placed.coord},spaceId}];
  });
}

export function rebootDestination(s:GameState,gd:GameData,playerId:string,pawnId:string,requested?:SpaceRef):SpaceRef {
  const options=rebootDestinations(s,gd,playerId,pawnId);
  if(requested) {
    const found=options.find(o=>o.coord.q===requested.coord.q && o.coord.r===requested.coord.r && o.spaceId===requested.spaceId);
    if(!found)throw new Error("select an available Reboot Core destination controlled by this player");
    return found;
  }
  const original=options.find(o=>blockById(gd,s.cybernet.at(o.coord)!.blockId)?.isCentralCore);
  if(!original)throw new Error("no Central Core Reboot destination in the Cybernet");
  return original;
}
