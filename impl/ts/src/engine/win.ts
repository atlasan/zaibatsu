// Win condition. Mirrors the checkWin/Winner logic in
// impl/go/internal/engine/engine.go. A player wins the instant they have placed
// all their control markers.

import type { GameState } from "../domain/types.ts";

/** Sets winnerId for the first player who has placed all markers. */
export function checkWin(s: GameState): void {
  if (s.winnerId) return;
  for (const p of s.players) {
    if (p.controlMarkersPlaced >= p.controlMarkersTotal) {
      s.winnerId = p.id;
      return;
    }
  }
}

/** Returns the winning player's id, or undefined if the game is ongoing. */
export function winner(s: GameState): string | undefined {
  return s.winnerId;
}
