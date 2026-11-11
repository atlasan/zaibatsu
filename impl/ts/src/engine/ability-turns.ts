import {pawnById,playerById,currentPlayer,type GameState,type GameData,type Pawn} from "../domain/types.ts";
import type {Action} from "./index.ts";

const abilityActions=new Set(["roll-delete","delete","delete-multi","delete-area","play-delete","play-delete-multi","play-delete-area","search","play-search","icebreak-block","icebreak-pawn","play-icebreak-block","play-icebreak-pawn","reboot","play-reboot","play-reboot-card"]);

export function validateAbilityTurn(pawn:Pawn):void {
  if(pawn.abilityTurn!==undefined && pawn.abilityTurn!=="any-player-turn") throw new Error("unsupported pawn ability-turn permission");
}

/** The printed exception changes timing only; it never grants an ability or a cost. */
export function permittedAbilityTurn(s:GameState,gd:GameData,a:Action):boolean {
  if(gd.regressionFixture || s.winnerId || s.pendingChoice || s.pendingPhase || s.pendingAttack || s.pendingThreats || !abilityActions.has(a.type) || a.joint) return false;
  const id=a.playerId??currentPlayer(s).id,p=playerById(s,id),def=pawnById(gd,a.pawnId??"");
  if(!p || def?.abilityTurn!=="any-player-turn") return false;
  const placed=s.cybernet.pawnById(def.id),card=s.controlCards?.find(c=>c.subject.kind==="pawn" && c.subject.id===def.id);
  if(!placed && !(["reboot","play-reboot","play-reboot-card"].includes(a.type) && s.eliminated.includes(def.id) && card?.ownerId===id)) return false;
  if(placed && placed.ownerId!==id) return false;
  // Shadowraiders' threat initiative is a separate source composition, not an
  // implicit transfer to the out-of-turn controller.
  return !(s.threats??[]).some(t=>t.status!=="eliminated" && placed && t.coord.q===placed.coord.q && t.coord.r===placed.coord.r);
}

export function permittedAttackAssignment(s:GameState,a:Action):boolean {
  return a.type==="assign-delete" && !!s.pendingAttack && s.pendingAttack.playerId===(a.playerId??currentPlayer(s).id);
}
