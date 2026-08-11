// Produces a canonical, compact JSON string of the meaningful game state for
// cross-mirror comparison and golden-game tests. Mirrors
// impl/go/internal/engine/snapshot.go exactly: same field order, same
// normalization (no omitted fields, empty arrays as [], map keys sorted), so both
// mirrors emit byte-identical snapshots from the same seed + action sequence. The
// RNG's internal state is intentionally excluded. See DOCS/parity.md.

import type { GameState } from "../domain/types.ts";
import type { Attachment } from "../domain/pawn_board.ts";

function snapAtts(atts: Attachment[] | undefined): Array<{ cardId: string; slot: string; bonusPaid: number }> {
  return (atts ?? []).map((a) => ({ cardId: a.cardId, slot: a.slot ?? "", bonusPaid: a.bonusPaid ?? 0 }));
}

function sortedKeys(m: Record<string, boolean>): string[] {
  return Object.keys(m).filter((k) => m[k]).sort();
}

/** Returns the canonical JSON snapshot of s. Key order matches the Go mirror. */
export function snapshot(s: GameState): string {
  const dto = {
    turn: s.turn,
    phase: s.phase,
    currentPlayer: s.currentPlayer,
    winnerId: s.winnerId ?? "",
    players: s.players.map((p) => ({
      id: p.id,
      color: p.color,
      pawnId: p.pawnId,
      markersTotal: p.controlMarkersTotal,
      markersPlaced: p.controlMarkersPlaced,
      bonus: p.bonusCounters,
      hand: p.hand ?? [],
      oncePerTurn: sortedKeys(p.oncePerTurnUsed),
    })),
    deck: s.deck ?? [],
    discard: s.discard ?? [],
    blockPile: s.blockPile ?? [],
    eliminated: s.eliminated ?? [],
    blocks: s.cybernet.blocks.map((b) => ({
      blockId: b.blockId,
      rotation: b.rotation,
      q: b.coord.q,
      r: b.coord.r,
      ownerId: b.ownerId ?? "",
      attachments: snapAtts(b.attachments),
    })),
    pawns: s.cybernet.pawns.map((pw) => ({
      pawnId: pw.pawnId,
      ownerId: pw.ownerId,
      q: pw.coord.q,
      r: pw.coord.r,
      spaceId: pw.spaceId,
      attachments: snapAtts(pw.attachments),
    })),
  };
  return JSON.stringify(dto);
}
