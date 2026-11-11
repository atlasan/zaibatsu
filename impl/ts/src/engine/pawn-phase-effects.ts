import {pawnById,type GameData,type GameState,type Pawn,type PendingEffect} from "../domain/types.ts";
import type {Action,EngineEvent} from "./index.ts";
import {controllerHandRevealed} from "./player-view.ts";

export function validatePawnPhaseEffects(pawn:Pawn,gd:GameData,strict=false):void {
 if(strict && pawn.phaseEffects?.length)throw new Error("native phase-effect ordering is unresolved in official content");
 if((pawn.phaseEffects?.length??0)>1)throw new Error("unsupported multiple native pawn phase effects");
 for(const effect of pawn.phaseEffects??[]) {
  if(effect.trigger!=="begin-turn" || effect.kind!=="steal-random-card" || effect.amount!==1 || effect.scope!=="cybernet" || effect.target!=="another-pawn" || effect.optional!==true)throw new Error("unsupported native pawn phase effect");
  if(gd.controlCards?.filter(c=>c.subject.kind==="pawn" && c.subject.id===pawn.id).length!==1)throw new Error("native pawn phase effects require one physical control card");
 }
}

export function pawnPhaseEffects(s:GameState,gd:GameData,phase:"beginning"|"action"):PendingEffect[] {
 if(phase!=="beginning")return [];
 return s.cybernet.pawns.filter(p=>p.ownerId===s.players[s.currentPlayer]!.id).flatMap(placed=>{
  const pawn=pawnById(gd,placed.pawnId);if(!pawn)return [];validatePawnPhaseEffects(pawn,gd);
  return (pawn.phaseEffects??[]).map((e,i)=>({...e,id:`${s.turn}:${phase}:${placed.pawnId}:native:${i}`,playerId:placed.ownerId,pawnId:placed.pawnId,cardId:"",source:"pawn" as const}));
 });
}

export function pawnPhaseSourceAvailable(s:GameState,gd:GameData,e:PendingEffect):boolean {
 const placed=s.cybernet.pawnById(e.pawnId);
 return e.kind==="steal-random-card" && e.amount===1 && e.scope==="cybernet" && e.target==="another-pawn" && e.optional===true && !!placed && placed.ownerId===e.playerId && !!s.controlCards?.some(c=>c.subject.kind==="pawn" && c.subject.id===e.pawnId && c.zone==="control" && c.ownerId===e.playerId) && !!pawnById(gd,e.pawnId)?.phaseEffects?.some(p=>p.kind===e.kind && p.trigger===e.trigger);
}

/** Public eligible targets depend on pawn control and hand counts, never card identity. */
export function pawnTheftResponses(s:GameState,gd:GameData):Action[] {
 const choice=s.pendingChoice,e=s.pendingEffects?.[0];
 if(s.phase!=="beginning" || s.pendingPhase!=="beginning" || choice?.playerId!==s.players[s.currentPlayer]?.id || choice?.kind!=="steal-card" || e?.source!=="pawn" || choice.effectId!==e.id || !pawnPhaseSourceAvailable(s,gd,e))return [];
 const base={type:"resolve-choice" as const,choiceId:choice.id,playerId:choice.playerId};
 return [{...base,optionId:"skip"},...s.cybernet.pawns.filter(p=>p.pawnId!==choice.pawnId && pawnById(gd,p.pawnId) && s.players.some(owner=>owner.id===p.ownerId && owner.hand.length>0)).map(p=>({...base,optionId:"steal" as const,targetId:p.pawnId}))];
}

export function resolvePawnTheft(s:GameState,gd:GameData,a:Action,events:EngineEvent[]):void {
 const choice=s.pendingChoice,e=s.pendingEffects?.[0];
 if(choice?.kind!=="steal-card" || a.choiceId!==choice.id || e?.source!=="pawn" || e.kind!=="steal-random-card" || !pawnPhaseSourceAvailable(s,gd,e))throw new Error("unknown or stale pawn theft choice");
 if(a.cardId || a.cardIds?.length || a.targetIds?.length || a.coord || a.spaceId || a.path?.length || a.pawnId && a.pawnId!==choice.pawnId || (a.movementIndex??0)!==0 || (a.dir??0)!==0 || (a.rotation??0)!==0 || (a.extraSkulls??0)!==0 || (a.extraRollDice??0)!==0 || a.joint)throw new Error("a pawn theft cannot spend cards, move or change its source");
 if(!pawnTheftResponses(s,gd).some(r=>r.optionId===a.optionId && r.targetId===a.targetId))throw new Error("select a current pawn theft target or decline");
 if(a.optionId==="steal") {
  const target=s.cybernet.pawnById(a.targetId!)!,from=s.players.find(p=>p.id===target.ownerId)!,to=s.players.find(p=>p.id===choice.playerId)!;
  const at=s.rng.intn(from.hand.length),cardId=from.hand.splice(at,1)[0]!;to.hand.push(cardId);
  events.push({type:"card-stolen",playerId:to.id,pawnId:choice.pawnId,element:"pawn",elementId:target.pawnId,fromOwnerId:from.id,toOwnerId:to.id,cardId,...(controllerHandRevealed(s,gd,from.id)||controllerHandRevealed(s,gd,to.id)?{cardRevealed:true}:{})});
 }
 delete s.pendingChoice;s.pendingEffects!.shift();
}
