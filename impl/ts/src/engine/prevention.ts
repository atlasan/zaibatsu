import { discardPawnAttachment } from "./attachment-slots.ts";
import type { GameData, GameState, PendingElimination } from "../domain/types.ts";
import type { Action, EngineEvent } from "./index.ts";
import { finalizePawnElimination } from "./combat.ts";

export function preventionCards(s: GameState, gd: GameData, pawnId: string): string[] {
  return [...new Set((s.cybernet.pawnById(pawnId)?.attachments ?? [])
    .filter(attachment => gd.cards.find(card => card.id === attachment.cardId)?.attach?.eliminationPrevention?.kind === "discard-self")
    .map(attachment => attachment.cardId))];
}

/** Opens only the replacement window named by a typed attachment. */
export function offerEliminationPrevention(s: GameState, gd: GameData, pawnId: string, cause: PendingElimination["cause"]): boolean {
  const cards = preventionCards(s,gd,pawnId);
  if (!cards.length) return false;
  if (cause === "sacrifice") throw new Error("sacrifice versus elimination prevention is unresolved; this combination remains provisional");
  if (s.pendingChoice || s.pendingEliminations?.length) throw new Error("simultaneous elimination-prevention ordering is unresolved; this combination remains provisional");
  const pawn = s.cybernet.pawnById(pawnId)!;
  if (!s.players.some(player => player.id === pawn.ownerId)) throw new Error("the prevention decision needs a controlling player");
  s.decisionSerial=(s.decisionSerial??0)+1;
  const id=`elimination:${s.turn}:${s.decisionSerial}`;
  s.pendingEliminations=[{id,pawnId,playerId:pawn.ownerId,cause}];
  s.pendingChoice={id,playerId:pawn.ownerId,kind:"prevent-elimination",effectId:id,pawnId,cardId:cards[0]!,cardIds:cards};
  return true;
}

export function preventionResponses(s: GameState, gd: GameData): Action[] {
  const choice=s.pendingChoice;
  if (choice?.kind!=="prevent-elimination") return [];
  return [
    ...preventionCards(s,gd,choice.pawnId).map(cardId=>({type:"resolve-choice" as const,choiceId:choice.id,playerId:choice.playerId,optionId:"prevent" as const,cardId})),
    {type:"resolve-choice",choiceId:choice.id,playerId:choice.playerId,optionId:"allow"},
  ];
}

/** Authority is checked by the shared live choice adapter. */
export function resolveEliminationChoice(s: GameState, gd: GameData, action: Action, events: EngineEvent[]): void {
  const choice=s.pendingChoice, pending=s.pendingEliminations?.[0];
  if (choice?.kind!=="prevent-elimination" || choice.id!==action.choiceId || pending?.id!==choice.effectId) throw new Error("unknown or stale elimination choice");
  if (action.coord || action.spaceId || action.cardIds?.length || action.targetId || action.targetIds?.length || action.path?.length || action.pawnId || action.extraSkulls || action.extraRollDice || action.joint || action.dir || action.rotation || action.movementIndex) throw new Error("prevention cannot include another payment, target or movement");
  const pawn=s.cybernet.pawnById(choice.pawnId);
  if (!pawn || pawn.ownerId!==choice.playerId) throw new Error("the threatened pawn is unavailable");
  if (action.optionId==="prevent") {
    if (!action.cardId || !preventionCards(s,gd,pawn.pawnId).includes(action.cardId)) throw new Error("choose an attached prevention card");
    const index=pawn.attachments!.findIndex(attachment=>attachment.cardId===action.cardId);
    discardPawnAttachment(s,gd,pawn,index,events);
    events.push({type:"elimination-prevented",pawnId:pawn.pawnId,playerId:choice.playerId,cardId:action.cardId});
  } else if (action.optionId==="allow") {
    if (action.cardId) throw new Error("allowing elimination does not also spend a prevention card");
    finalizePawnElimination(s,pawn.pawnId,gd,events);
  } else throw new Error("choose prevent or allow elimination");
  delete s.pendingChoice;
  delete s.pendingEliminations;
}
