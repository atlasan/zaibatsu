import {type GameState,type GameData,type PendingChoice} from "../domain/types.ts";
import type {Coord} from "../domain/hex.ts";
import type {Action,EngineEvent} from "./index.ts";
import {deployThreats} from "./threats.ts";

/** Includes retained controlled pawns; a neutral pawn in the same block is not controlled. */
export function controlledPawnCount(s:GameState,playerId:string):number {
 return new Set([...s.cybernet.pawns.filter(p=>p.ownerId===playerId).map(p=>p.pawnId),...(s.controlCards??[]).filter(c=>c.subject.kind==="pawn" && c.zone==="control" && c.ownerId===playerId).map(c=>c.subject.id)]).size;
}

export function blockDiscardChoice(s:GameState,id?:string):PendingChoice|undefined {
 const batch=s.pendingBlockDiscards,decision=batch?.decisions.find(d=>d.id===id && !d.submitted);
 return batch && decision?{id:decision.id,playerId:decision.playerId,kind:"block-discard",effectId:`block:${batch.blockId}`,pawnId:"",cardId:"",amount:decision.amount,blockId:batch.blockId}:undefined;
}

export function beginBlockDiscards(s:GameState,gd:GameData,coord:Coord):void {
 if(!s.rulesVersion || s.pendingChoice || s.pendingBlockDiscards || s.pendingPhase || s.pendingAttack || s.pendingThreats) throw new Error("block discard requires an independent source resolution window");
 const blockId=s.cybernet.at(coord)?.blockId;if(!blockId) throw new Error("block discard requires a placed block");
 const counts=s.players.map(p=>({playerId:p.id,amount:controlledPawnCount(s,p.id)}));
 if(counts.some(c=>s.players.find(p=>p.id===c.playerId)!.hand.length<c.amount)) throw new Error("Sprawl hand shortfall is unresolved; preserve the pending Search placement for source review");
 const serial=(s.decisionSerial??0)+1,decisions=counts.filter(c=>c.amount>0).map(c=>({id:`block:${serial}:${c.playerId}`,...c,submitted:false}));
 if(!decisions.length) return;
 s.decisionSerial=serial;s.pendingBlockDiscards={blockId,coord:{...coord},decisions};s.pendingChoice=blockDiscardChoice(s,decisions[0]!.id);
}

/** Canonical hand-order selection; duplicate definition ids still represent separate cards. */
function selectedCards(hand:readonly string[],requested:readonly string[],amount:number):string[] {
 if(requested.length!==amount) throw new Error(`choose exactly ${amount} physical hand card(s) to discard`);
 const wanted=[...requested],selected:string[]=[];
 for(const id of hand) {const i=wanted.indexOf(id);if(i>=0) {selected.push(id);wanted.splice(i,1);}}
 if(wanted.length) throw new Error("a selected physical hand card is unavailable");
 return selected;
}

export function resolveBlockDiscard(s:GameState,gd:GameData,a:Action,events:EngineEvent[]):void {
 const batch=s.pendingBlockDiscards,choice=blockDiscardChoice(s,a.choiceId),playerId=a.playerId??s.players[s.currentPlayer]!.id;
 if(!batch || !choice || playerId!==choice.playerId || a.optionId!=="discard" || a.cardId || a.targetId || a.targetIds?.length || a.pawnId || a.coord || a.spaceId || a.path?.length || a.slotRef || a.joint || a.extraSkulls || a.extraRollDice || a.movementIndex || a.dir || a.rotation) throw new Error("choose only your required physical hand cards for the current block decision");
 const owner=s.players.find(p=>p.id===choice.playerId)!,decision=batch.decisions.find(d=>d.id===choice.id)!;
 decision.cardIds=selectedCards(owner.hand,a.cardIds??[],decision.amount);decision.submitted=true;
 const next=batch.decisions.find(d=>!d.submitted);
 if(next) {s.pendingChoice=blockDiscardChoice(s,next.id);return;}
 // Revalidate every commitment before publishing any selection or moving any card.
 const selections=batch.decisions.map(d=>selectedCards(s.players.find(p=>p.id===d.playerId)!.hand,d.cardIds??[],d.amount));
 for(const [i,d] of batch.decisions.entries()) {
  const player=s.players.find(p=>p.id===d.playerId)!;
  for(const cardId of selections[i]!) {player.hand.splice(player.hand.indexOf(cardId),1);s.discard.push(cardId);events.push({type:"card-discarded",playerId:d.playerId,cardId});}
 }
 delete s.pendingChoice;delete s.pendingBlockDiscards;deployThreats(s,gd,batch.coord);
}
