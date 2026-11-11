import {bonusPlacementError} from "./bonus.ts";
import {abilityUseSpent,spendAbilityUse} from "./use-markers.ts";
import {blockById,pawnById,currentPlayer,type Block,type GameData,type GameState} from "../domain/types.ts";
import {neighbor} from "../domain/hex.ts";
import {effectiveAbility,abilityUsedKey} from "./combat.ts";
import {edgeHasSpace,validPlacements,placeBlock} from "./placement.ts";
import {applyBlockEffectForTrigger} from "./effects.ts";
import {deployThreats} from "./threats.ts";
import {checkWin} from "./win.ts";
import type {Action,EngineEvent} from "./index.ts";

export function supportsSearchBlockEffect(block:Block):boolean {
  const effect=block.effects?.inCybernet;
  return !effect || typeof effect!=="string" && (effect.kind==="place-block-bonus" && effect.amount===1 && effect.target===undefined || effect.kind==="gain-bonus-all-players" && Number.isInteger(effect.amount) && effect.amount!>=1 && effect.target===undefined || effect.kind==="sacrifice-per-player" && effect.amount===1 && Number.isInteger(effect.minimumControlledPawns) && effect.minimumControlledPawns!>=1 && effect.target===undefined || effect.kind==="discard-per-controlled-pawn" && effect.target===undefined && (effect.amount===undefined || effect.amount===0) || effect.kind==="area-attack" && effect.target===undefined && (effect.amount===undefined || Number.isInteger(effect.amount) && effect.amount>=0) || effect.kind==="place-neutral-pawn" && !!effect.target && (effect.amount===undefined || effect.amount===0) && block.spaces?.filter(space=>space.type==="pawn" && space.pawnId===effect.target).length===1);
}

/** Public eligibility only: never inspect the identity/topology of the hidden tile. */
export function searchDeclarationError(s:GameState,gd:GameData,playerId:string,pawnId:string,cardId?:string):string|undefined {
  if(s.winnerId || s.phase!=="action" || s.pendingChoice || s.pendingPhase || s.pendingAttack || s.pendingThreats) return "Search cannot begin during pending resolution or outside the action phase";
  const player=s.players.find(p=>p.id===playerId),placed=s.cybernet.pawnById(pawnId),pawn=pawnById(gd,pawnId);
  if(!player || player.id!==currentPlayer(s).id || !placed || !pawn || placed.ownerId!==playerId) return "only the active player's controlled pawn may Search";
  const ability=effectiveAbility(gd,pawn,placed.attachments,"search");
  if(!ability || ability.activation==="none") return "the pawn cannot activate Search";
  if(!["card","once-per-turn"].includes(ability.activation)) return "unsupported Search activation";
  if(ability.activation==="card" && (!cardId || !player.hand.includes(cardId) || !gd.cards.some(card=>card.id===cardId))) return "Search requires one action card from the controller's hand";
  if(ability.activation==="once-per-turn" && (cardId || abilityUseSpent(s,gd,player,pawnId,"search"))) return "free Search is already spent or cannot use a hand card";
  if(!s.blockPile.length) return "no blocks left in the pile";
  const reference=s.cybernet.at(placed.coord),block=reference&&blockById(gd,reference.blockId);
  if(!reference || !block || ![0,1,2,3,4,5].some(dir=>edgeHasSpace(block,reference.rotation,dir) && !s.cybernet.occupied(neighbor(placed.coord,dir)))) return "the reference block has no open connecting side";
}

/** Commit activation, then draw/reveal into an explicit physical block zone. */
export function beginSearch(s:GameState,gd:GameData,playerId:string,pawnId:string,cardId?:string,events:EngineEvent[]=[]):void {
  const error=searchDeclarationError(s,gd,playerId,pawnId,cardId);if(error) throw new Error(error);
  const placed=s.cybernet.pawnById(pawnId)!,player=s.players.find(p=>p.id===playerId)!;
  const blockId=s.blockPile.at(-1)!,block=blockById(gd,blockId);
  if(!block || block.edges?.length!==6 || !block.edges.some(Boolean) || s.cybernet.blocks.some(b=>b.blockId===blockId)) throw new Error("unsupported drawn block topology or duplicate physical block");
  if(cardId) {player.hand.splice(player.hand.indexOf(cardId),1);s.discard.push(cardId);events.push({type:"card-discarded",cardId});}
  else spendAbilityUse(s,gd,player,pawnId,"search");
  s.blockPile.pop();s.decisionSerial=(s.decisionSerial??0)+1;const id=`search-${s.decisionSerial}`;
  s.pendingChoice={id,playerId,kind:"place-block",effectId:id,pawnId,cardId:cardId??"",blockId,reference:{...placed.coord}};
  events.push({type:"block-drawn",playerId,pawnId,element:"block",elementId:blockId,coord:{...placed.coord}});
}

export function searchPlacementResponses(s:GameState,gd:GameData):Action[] {
  const choice=s.pendingChoice;if(choice?.kind!=="place-block" || !choice.reference || !choice.blockId) return [];
  return validPlacements(s.cybernet,gd,choice.reference,choice.blockId).filter(p=>!bonusPlacementError(s,gd,{blockId:choice.blockId!,coord:neighbor(choice.reference!,p.dir),rotation:p.rotation})).map(p=>({type:"resolve-choice",playerId:choice.playerId,choiceId:choice.id,optionId:`place:${p.dir}:${p.rotation}`}));
}

/** A failed placement keeps the already-paid activation and the same revealed tile. */
export function resolveSearchPlacement(s:GameState,gd:GameData,a:Action,events:EngineEvent[]=[]):void {
  const choice=s.pendingChoice,match=/^place:([0-5]):([0-5])$/.exec(a.optionId??"");
  if(choice?.kind!=="place-block" || a.choiceId!==choice.id || !choice.reference || !choice.blockId || !match) throw new Error("choose a current Search placement response");
  if(a.cardId || a.cardIds?.length || a.targetId || a.targetIds?.length || a.coord || a.spaceId || a.path?.length || a.pawnId && a.pawnId!==choice.pawnId) throw new Error("a Search placement cannot change targets or pay another cost");
  const pawn=s.cybernet.pawnById(choice.pawnId);
  if(!pawn || pawn.ownerId!==choice.playerId || pawn.coord.q!==choice.reference.q || pawn.coord.r!==choice.reference.r) throw new Error("the Search reference pawn is unavailable");
  const block=blockById(gd,choice.blockId);
  if(block && !supportsSearchBlockEffect(block)) throw new Error("unsupported drawn block placement effect");
  const funding=bonusPlacementError(s,gd,{blockId:choice.blockId,coord:neighbor(choice.reference,Number(match[1])),rotation:Number(match[2])});if(funding)throw new Error(funding);
  const bonusKeys=new Set(s.cybernet.bonusIcons.map(icon=>icon.key));
  const pb=placeBlock(s,choice.reference,Number(match[1]),gd,choice.blockId,Number(match[2]));
  delete s.pendingChoice;
  events.push({type:"block-placed",playerId:choice.playerId,pawnId:choice.pawnId,element:"block",elementId:pb.blockId,coord:{...pb.coord}});
  for(const icon of s.cybernet.bonusIcons) if(!bonusKeys.has(icon.key)) {events.push({type:"bonus-icon-created",element:"bonus-icon",elementId:icon.key});if(icon.counterPlaced)events.push({type:"bonus-counter-placed",element:"bonus-icon",elementId:icon.key,amount:1});}
  const result=applyBlockEffectForTrigger(s,gd,pb.coord,"inCybernet",events);
  if(result?.kind==="area-attack") events.push({type:"roll",playerId:choice.playerId,actionType:"resolve-choice",roll:[...result.result.roll]});
  if(result?.kind==="gain-bonus-all-players")for(const playerId of result.playerIds)events.push({type:"bonus-awarded",playerId,element:"block",elementId:pb.blockId,amount:result.amount});
  checkWin(s);
  if(!s.winnerId && !s.pendingBlockSacrifices && !s.pendingBlockDiscards) deployThreats(s,gd,pb.coord);
}
