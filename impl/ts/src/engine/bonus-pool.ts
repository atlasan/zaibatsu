import {type GameState,type Block} from "../domain/types.ts";

export interface BonusPool {supply:number;reserve:number;free:number;invested:number;onBoard:number;}
/** All allocations are public; derive reserve to avoid a second mutable balance. */
export function bonusCounterPool(s:GameState):BonusPool|undefined {
 if(s.bonusCounterSupply===undefined)return;
 const supply=s.bonusCounterSupply,values=[supply,...s.players.map(p=>p.bonusCounters),...s.cybernet.pawns.flatMap(p=>(p.attachments??[]).map(a=>a.bonusPaid??0)),...s.cybernet.blocks.flatMap(b=>(b.attachments??[]).map(a=>a.bonusPaid??0))];
 if(values.some(n=>!Number.isInteger(n)||n<0))throw new Error("invalid physical bonus-counter allocation");
 let onBoard=0;for(const icon of s.cybernet.bonusIcons) {if(icon.counterPlaced && icon.collectedBy || !icon.collectedBy && !icon.counterPlaced)throw new Error("a source bonus icon needs exactly one uncollected physical counter");if(icon.counterPlaced)onBoard++;}
 for(const block of s.cybernet.blocks)if(block.bonusCounter!==undefined){const c=block.bonusCounter;if(!c || typeof c!=="object" || Array.isArray(c) || c.collectedBy!==undefined && (typeof c.collectedBy!=="string" || c.collectedBy && !s.players.some(p=>p.id===c.collectedBy)))throw new Error("invalid physical block bonus-counter allocation");if(!c.collectedBy)onBoard++;}
 const free=s.players.reduce((n,p)=>n+p.bonusCounters,0),invested=values.slice(1+s.players.length).reduce((a,b)=>a+b,0),reserve=supply-free-invested-onBoard;
 if(reserve<0)throw new Error("physical bonus-counter allocations exceed the configured supply");
 return {supply,reserve,free,invested,onBoard};
}
export function requireBonusReserve(s:GameState,amount:number):void {
 if(!Number.isInteger(amount)||amount<0)throw new Error("invalid bonus-counter award amount");if(!amount)return;
 const pool=bonusCounterPool(s);if(!pool && s.rulesVersion)throw new Error("source bonus awards require a configured physical supply");
 if(pool && pool.reserve<amount)throw new Error("bonus reserve shortfall is unresolved; preserve the accepted resolution window");
}
export function grantBonusCounters(s:GameState,playerId:string,amount:number):void {
 const player=s.players.find(p=>p.id===playerId);if(!player)throw new Error("unknown bonus-counter recipient");requireBonusReserve(s,amount);player.bonusCounters+=amount;
}
export function validateGlobalBonusEffect(block:Block,strict=false):void {
 for(const trigger of ["inCybernet","underControl"] as const) {const e=block.effects?.[trigger];if(!e || typeof e==="string" || e.kind!=="gain-bonus-all-players")continue;if(trigger!=="inCybernet" || !Number.isInteger(e.amount) || e.amount!<1 || e.target!==undefined || e.minimumControlledPawns!==undefined)throw new Error("unsupported all-player bonus award descriptor");if(strict)throw new Error("global bonus reserve shortfall policy remains unresolved in official content");}
}
