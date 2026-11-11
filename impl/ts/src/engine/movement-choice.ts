import {offerSpaceEffect,spaceStopError} from "./space-effects.ts";
import {spendMovementUse} from "./use-markers.ts";
import {currentPlayer,pawnById,type GameData,type GameState} from "../domain/types.ts";
import {movementOptionAt,canActivateMovementOption,movementUsedKey,consumeGrantedMovementUse,movementStepModifier,stepTargets,canEndOn,movePathWithBudget,type SpaceRef} from "./movement.ts";
import {consumeCard} from "./cards.ts";
import {awakenThreats} from "./threats.ts";
import type {Action,EngineEvent} from "./index.ts";

export function rolledMovementError(s:GameState,gd:GameData,a:Action):string|undefined {
  if(gd.regressionFixture==="provisional-v1") return "rolled movement decisions require source rules";
  if(s.winnerId || s.phase!=="action" || s.pendingChoice || s.pendingPhase || s.pendingAttack || s.pendingThreats) return "resolve pending work before activating movement";
  if(a.path?.length || a.optionId || a.choiceId || a.coord || a.spaceId || a.targetId || a.targetIds?.length || a.cardIds?.length) return "choose the movement path after the roll";
  const placed=s.cybernet.pawnById(a.pawnId??""),pawn=pawnById(gd,a.pawnId??""),player=currentPlayer(s);
  if(!placed || !pawn || placed.ownerId!==player.id || a.playerId && a.playerId!==player.id) return "only the active player's controlled pawn may move";
  let option;try {option=movementOptionAt(gd,pawn,placed.attachments,a.movementIndex??0);}catch {return "selected movement is unavailable";}
  if(!["d6","2d6"].includes(option.movement.type)) return "select a die-based movement ability";
  if(option.rolledPerTurn) return "unsupported source rolled movement-use budget";
  if(option.movement.activation==="card") {
    if(!a.cardId || !player.hand.includes(a.cardId) || !(gd.cards.find(card=>card.id===a.cardId)?.movement!>0)) return "this movement requires a movement card in hand";
  } else if(a.cardId) return "free movement cannot also play a card";
  return canActivateMovementOption(s,player,pawn.id,option);
}

/** Commit activation and publish dice before choosing any path. */
export function beginRolledMovement(s:GameState,gd:GameData,a:Action):{roll:number[]} {
  const error=rolledMovementError(s,gd,a);if(error) throw new Error(error);
  const placed=s.cybernet.pawnById(a.pawnId!)!,pawn=pawnById(gd,a.pawnId!)!,player=currentPlayer(s),index=a.movementIndex??0;
  const option=movementOptionAt(gd,pawn,placed.attachments,index);
  if(a.cardId) consumeCard(s,player,a.cardId);
  if(option.perTurnUses!==undefined) consumeGrantedMovementUse(s,player,pawn.id,option);
  else if(option.movement.activation==="once-per-turn") spendMovementUse(s,pawn.id,option.attachmentIndex,option.grantIndex);
  const roll=Array.from({length:option.movement.type==="2d6"?2:1},()=>s.rng.intn(6)+1);
  const budget=Math.max(0,roll.reduce((sum,die)=>sum+die,0)+movementStepModifier(gd,placed));
  s.decisionSerial=(s.decisionSerial??0)+1;const id=`movement-${s.decisionSerial}`;
  s.pendingChoice={id,playerId:player.id,kind:"move-path",effectId:id,pawnId:pawn.id,cardId:a.cardId??"",movement:{roll:[...roll],budget,origin:{coord:{...placed.coord},spaceId:placed.spaceId},movementIndex:index,movementKey:option.key,stealth:option.stealth}};
  return {roll};
}

function threatening(s:GameState,gd:GameData,coord:SpaceRef["coord"],pawnId:string,stealth:boolean):boolean {
  return !stealth && pawnById(gd,pawnId)?.special!=="does-not-activate-threats" && !!s.threats?.some(t=>t.status!=="eliminated" && t.coord.q===coord.q && t.coord.r===coord.r);
}

/** Pure prefix preview. Occupied intermediate spaces are permitted; stopping there is not. */
export function movementChoicePreview(s:GameState,gd:GameData,path:SpaceRef[]=[]) {
  const choice=s.pendingChoice,m=choice?.movement;
  if(choice?.kind!=="move-path" || !m) throw new Error("no rolled movement path is pending");
  const pawn=s.cybernet.pawnById(choice.pawnId),definition=pawnById(gd,choice.pawnId);
  if(!pawn || !definition || pawn.ownerId!==choice.playerId || pawn.coord.q!==m.origin.coord.q || pawn.coord.r!==m.origin.coord.r || pawn.spaceId!==m.origin.spaceId) throw new Error("the moving pawn or origin is unavailable");
  const option=movementOptionAt(gd,definition,pawn.attachments,m.movementIndex);
  if(option.key!==m.movementKey || !["d6","2d6"].includes(option.movement.type)) throw new Error("the committed movement ability is unavailable");
  if(path.length>m.budget) throw new Error(`path of ${path.length} steps exceeds the movement budget of ${m.budget}`);
  let coord=m.origin.coord,spaceId=m.origin.spaceId;
  for(const [index,step] of path.entries()) {
    if(!Number.isSafeInteger(step.coord?.q) || !Number.isSafeInteger(step.coord?.r) || typeof step.spaceId!=="string") throw new Error("each movement step needs integer coordinates and a space id");
    if(!stepTargets(gd,s.cybernet,coord,spaceId,choice.pawnId).some(t=>t.coord.q===step.coord.q && t.coord.r===step.coord.r && t.spaceId===step.spaceId)) throw new Error(`step ${index+1} is not adjacent or permitted`);
    if(index<path.length-1 && threatening(s,gd,step.coord,choice.pawnId,m.stealth)) throw new Error("movement must stop at the first threatening block");
    coord=step.coord;spaceId=step.spaceId;
  }
  const endError=canEndOn(gd,s.cybernet,coord,spaceId,choice.pawnId) || (path.length?spaceStopError(s,gd,choice.pawnId,{coord,spaceId}):undefined);
  const nextTargets=path.length<m.budget && !(path.length && threatening(s,gd,coord,choice.pawnId,m.stealth))?stepTargets(gd,s.cybernet,coord,spaceId,choice.pawnId):[];
  return structuredClone({pawnId:choice.pawnId,roll:m.roll,budget:m.budget,path,canFinish:!endError,endError:endError??"",nextTargets});
}

export function resolveMovementChoice(s:GameState,gd:GameData,a:Action,events:EngineEvent[]=[]):void {
  const choice=s.pendingChoice,m=choice?.movement;
  if(choice?.kind!=="move-path" || !m || a.choiceId!==choice.id || a.optionId!=="move") throw new Error("choose the current rolled movement path or stop");
  if(a.cardId || a.cardIds?.length || a.targetId || a.targetIds?.length || a.coord || a.spaceId || a.pawnId && a.pawnId!==choice.pawnId) throw new Error("a movement response cannot change targets or pay again");
  const path=a.path??[],preview=movementChoicePreview(s,gd,path);if(!preview.canFinish) throw new Error(preview.endError);
  if(path.length) {const pawn=movePathWithBudget(s,gd,choice.pawnId,path,m.budget,false);events.push({type:"pawn-moved",playerId:choice.playerId,pawnId:choice.pawnId,coord:{...pawn.coord},spaceId:pawn.spaceId});}
  delete s.pendingChoice;
  if(path.length) {awakenThreats(s,gd,choice.pawnId,m.stealth);offerSpaceEffect(s,gd,choice.pawnId);}
}
