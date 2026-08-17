// Block placement in the Cybernet (the Search ability's effect). Mirrors
// impl/go/internal/engine/placement.go. See DOCS/rules/speedrunners/board-and-movement.md ("SR-BOARD-002
// a block") and DOCS/domain-model.md.
//
// Placement rules (Speedrunners p.15), applied relative to a reference block
// (the block the searching pawn occupies):
//   1. The target cell must be empty and adjacent to the reference block.
//   2. The reference block's edge facing the target must expose a space.
//   3. The new block, at the chosen rotation, must expose a space on the edge
//      facing the reference block.
//
// Interpretation: the base rules only require a spaced connection to the
// reference block. We do NOT additionally constrain the new block against other
// incidental neighbors. Documented in DOCS/domain-model.md.

import {
  neighbor,
  opposite,
  type Coord,
  type Cybernet,
  type PlacedBlock,
} from "../domain/hex.ts";
import { blockById, type Block, type GameData, type GameState } from "../domain/types.ts";

/** One legal way to place a block: a direction from the reference plus a rotation. */
export interface Placement {
  dir: number;
  rotation: number;
}

/**
 * Reports whether the given orientation exposes a space on the edge facing
 * gridDir. A block's local edge e faces (e + rotation) mod 6, so the local edge
 * on gridDir is (gridDir - rotation) mod 6.
 */
export function edgeHasSpace(b: Block, rotation: number, gridDir: number): boolean {
  const edges = b.edges;
  if (!edges || edges.length !== 6) return false;
  const local = (((gridDir - rotation) % 6) + 6) % 6;
  return edges[local]!;
}

/** Validates placing blockId at rotation rot in direction dir from refCoord. */
export function canPlace(
  cy: Cybernet,
  data: GameData,
  refCoord: Coord,
  dir: number,
  blockId: string,
  rot: number,
): string | undefined {
  if (dir < 0 || dir > 5) return `direction ${dir} out of range 0..5`;
  if (rot < 0 || rot > 5) return `rotation ${rot} out of range 0..5`;
  const ref = cy.at(refCoord);
  if (!ref) return `no reference block at (${refCoord.q},${refCoord.r})`;
  const target = neighbor(refCoord, dir);
  if (cy.occupied(target)) return `target cell (${target.q},${target.r}) is already occupied`;
  const refBlock = blockById(data, ref.blockId);
  if (!refBlock) return `unknown reference block "${ref.blockId}"`;
  const newBlock = blockById(data, blockId);
  if (!newBlock) return `unknown block "${blockId}"`;
  if (!edgeHasSpace(refBlock, ref.rotation, dir)) {
    return `reference block "${ref.blockId}" has no connecting space on the facing side`;
  }
  if (!edgeHasSpace(newBlock, rot, opposite(dir))) {
    return `block "${blockId}" at rotation ${rot} has no connecting space facing the reference`;
  }
  return undefined;
}

/**
 * Validates and places blockId into the Cybernet. Callers are responsible for
 * having drawn the block id from the block pile (Search wiring is a later
 * backlog item). Throws on an illegal placement.
 */
export function placeBlock(
  s: GameState,
  refCoord: Coord,
  dir: number,
  data: GameData,
  blockId: string,
  rot: number,
): PlacedBlock {
  const err = canPlace(s.cybernet, data, refCoord, dir, blockId, rot);
  if (err) throw new Error(err);
  const pb: PlacedBlock = {
    blockId,
    rotation: rot,
    coord: neighbor(refCoord, dir),
  };
  s.cybernet.blocks.push(pb);
  return pb;
}

/** Returns every legal (dir, rotation) for placing blockId adjacent to refCoord. */
export function validPlacements(
  cy: Cybernet,
  data: GameData,
  refCoord: Coord,
  blockId: string,
): Placement[] {
  const out: Placement[] = [];
  for (let dir = 0; dir < 6; dir++) {
    for (let rot = 0; rot < 6; rot++) {
      if (canPlace(cy, data, refCoord, dir, blockId, rot) === undefined) {
        out.push({ dir, rotation: rot });
      }
    }
  }
  return out;
}
