import type { GameState } from "../domain/types.ts";

/** Keep the physical control card in the same control zone as its pawn. */
export function setPawnControl(s: GameState, pawnId: string, ownerId: string): void {
  const pawn = s.cybernet.pawnById(pawnId);
  if (pawn) pawn.ownerId = ownerId;
  for (const card of s.controlCards ?? []) {
    if (card.subject.kind === "pawn" && card.subject.id === pawnId) {
      card.ownerId = ownerId;
      if (s.rulesVersion) card.zone = ownerId ? "control" : "common";
    }
  }
}
