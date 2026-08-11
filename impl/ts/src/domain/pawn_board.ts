// Pawn positions and space occupancy on the Cybernet. Mirrors
// impl/go/internal/domain/pawn_board.go. See DOCS/domain-model.md and
// DOCS/rules/speedrunners.md ("Spaces", "Movement").

import type { Block } from "./types.ts";
import type { Coord } from "./hex.ts";

/** A pawn instance positioned in the Cybernet. */
export interface PawnOnBoard {
  pawnId: string;
  ownerId: string; // player id, or "" if free of player control
  coord: Coord;
  spaceId: string;
}

/** Capacity of special / pawn spaces (no pawn limit). */
export const UNLIMITED = -1;

/** How many pawns a space of the given type may hold. -1 (UNLIMITED) = no limit. */
export function spaceCapacity(spaceType: string): number {
  switch (spaceType) {
    case "normal":
    case "effect":
      return 1;
    case "double":
      return 2;
    case "special":
    case "pawn":
      return UNLIMITED;
    default:
      return 1;
  }
}

/** The space definition with the given id on a block, or undefined. */
export function blockSpace(block: Block, id: string) {
  return block.spaces?.find((s) => s.id === id);
}
