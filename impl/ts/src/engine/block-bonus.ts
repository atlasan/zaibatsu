import {blockById,playerById,type Block,type GameState,type GameData} from "../domain/types.ts";
import type {Coord} from "../domain/hex.ts";
import {requireBonusReserve,bonusCounterPool} from "./bonus-pool.ts";
import type {EngineEvent} from "./index.ts";

/** Typed source pair, never a recurring award or a printed-prose parser. */
export function validateBlockBonus(block:Block,strict=false):void {
 const first=block.effects?.inCybernet,second=block.effects?.underControl;
 const kinds=[first,second].filter(e=>e && typeof e!=="string").map(e=>(e as Exclude<typeof first,string|undefined>).kind);
 if(!kinds.some(kind=>kind==="place-block-bonus" || kind==="collect-block-bonus"))return;
 if(!first || typeof first==="string" || first.kind!=="place-block-bonus" || first.amount!==1 || !second || typeof second==="string" || second.kind!=="collect-block-bonus" || second.amount!==undefined)throw new Error("block bonus requires placement of one counter and collection on control");
 for(const effect of [first,second])if(effect.target!==undefined || effect.scope!==undefined || effect.optional!==undefined || effect.minimumControlledPawns!==undefined || effect.markerThreshold!==undefined)throw new Error("block bonus cannot add a target, optional policy or other costs");
 if(strict)throw new Error("block bonus reserve shortfall policy remains unresolved in official content");
}

export function placeBlockBonus(s:GameState,gd:GameData,coord:Coord,events:EngineEvent[]):void {
 const placed=s.cybernet.at(coord),block=placed && blockById(gd,placed.blockId);
 if(!s.rulesVersion || !placed || !block)throw new Error("block bonus requires a source block");
 validateBlockBonus(block);if(typeof block.effects?.inCybernet!=="object" || block.effects.inCybernet.kind!=="place-block-bonus")throw new Error("no block counter placement effect");
 if(placed.bonusCounter!==undefined)throw new Error("this physical block counter has already been placed");
 requireBonusReserve(s,1);placed.bonusCounter={};events.push({type:"bonus-counter-placed",element:"block",elementId:placed.blockId,coord:{...coord},amount:1});
}

export function collectBlockBonus(s:GameState,gd:GameData,coord:Coord,events:EngineEvent[]):void {
 const placed=s.cybernet.at(coord),block=placed && blockById(gd,placed.blockId),owner=placed?.ownerId && playerById(s,placed.ownerId);
 if(!s.rulesVersion || !placed || !block || !owner)throw new Error("block counter collection requires its controlling player");
 validateBlockBonus(block);bonusCounterPool(s);
 if(typeof block.effects?.underControl!=="object" || block.effects.underControl.kind!=="collect-block-bonus" || !placed.bonusCounter)throw new Error("the placed physical block counter is missing");
 if(placed.bonusCounter.collectedBy)return;
 placed.bonusCounter.collectedBy=owner.id;owner.bonusCounters++;
 events.push({type:"bonus-collected",playerId:owner.id,element:"block",elementId:placed.blockId,coord:{...coord},amount:1});
}
