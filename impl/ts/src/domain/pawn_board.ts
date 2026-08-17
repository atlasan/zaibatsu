// Pawn positions and space occupancy on the Cybernet. Mirrors
// impl/go/internal/domain/pawn_board.go. See DOCS/domain-model.md and
// DOCS/rules/speedrunners/board-and-movement.md ("SR-BOARD-001", "SR-MOVE-002").

import type { Block, Space } from "./types.ts";
import type { Coord } from "./hex.ts";

/**
 * An action card attached to a pawn or block, occupying a slot and optionally
 * holding bonus counters paid to attach it. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md
 * ("Attaching cards").
 */
export interface Attachment {
  cardId: string;
  slot?: string;
  bonusPaid?: number;
}

/** A pawn instance positioned in the Cybernet. */
export interface PawnOnBoard {
  pawnId: string;
  ownerId: string; // player id, or "" if free of player control
  coord: Coord;
  spaceId: string;
  attachments?: Attachment[];
}

/** Whether an attachment already occupies the given slot on a pawn. */
export function slotFilled(pob: PawnOnBoard, slot: string): boolean {
  return (pob.attachments ?? []).some((a) => a.slot === slot);
}

/** Capacity of special / pawn spaces (no pawn limit). */
export const UNLIMITED = -1;

/** How many pawns a space of the given type may hold. -1 (UNLIMITED) = no limit. */
export function spaceCapacity(spaceType: string): number {
  switch (spaceType) {
    case "normal": case "effect": return 1;
    case "double": return 2; // legacy data only
    case "special": case "pawn": return UNLIMITED;
    default: return 1;
  }
}

/** Explicit source-reviewed capacity takes precedence over legacy type defaults. */
export function spaceCapacityFor(space: Space): number {
  if (space.capacity !== undefined) return space.capacity === "unlimited" ? UNLIMITED : space.capacity;
  return spaceCapacity(space.type);
}

/** The space definition with the given id on a block, or undefined. */
export function blockSpace(block: Block, id: string) {
  return block.spaces?.find((s) => s.id === id);
}
