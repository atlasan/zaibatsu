// Movement resolution: step budgets, activation gating, occupancy, and hex
// (block-to-block) execution. Mirrors impl/go/internal/engine/movement.go. See
// DOCS/rules/speedrunners.md ("Movement") and DOCS/domain-model.md.
//
// SCOPE (Phase 1): pawn positions, space occupancy, the numeric step budget for
// every movement type (fixed / d6 / 2d6 / hex) including modifiers, activation
// gating (card / once-per-turn / none), and EXECUTION of hex movement (one whole
// block, ignoring spaces & space modifiers — the one movement type the current
// data can resolve correctly).
//
// DEFERRED: space-to-space stepping for steps/d6/2d6 execution needs an
// intra-block + cross-edge SPACE-ADJACENCY graph the provisional data does not
// yet encode (schema extension tracked in tasks/BACKLOG.md). Until then the step
// budget resolves, but only hex movement executes on the board.

import { neighbor, type Coord, type Cybernet } from "../domain/hex.ts";
import { UNLIMITED, blockSpace, spaceCapacityFor, type PawnOnBoard } from "../domain/pawn_board.ts";
import {
  blockById,
  pawnById,
  playerById,
  type GameData,
  type GameState,
  type Movement,
  type Player,
  type Pawn,
} from "../domain/types.ts";
import type { Rng } from "../domain/rng.ts";

/** Namespaces a pawn's once-per-turn movement marker. */
export function movementUsedKey(pawnId: string): string {
  return `move:${pawnId}`;
}

/**
 * Computes how many movement steps one activation yields. Dice types draw from
 * the seeded RNG (deterministic, parity-matched). extraSteps folds in cumulative
 * movement modifiers. For hex, a "step" is one block. Clamped at zero.
 */
export function resolveSteps(m: Movement, rng: Rng, extraSteps = 0): number {
  let base = 0;
  switch (m.type) {
    case "steps":
      base = m.steps ?? 0;
      break;
    case "d6":
      base = rng.intn(6) + 1;
      break;
    case "2d6":
      base = rng.intn(6) + 1 + (rng.intn(6) + 1);
      break;
    case "hex":
      base = 1;
      break;
  }
  const total = base + extraSteps;
  return total < 0 ? 0 : total;
}

/** Whether the player may activate the pawn's movement now (consumes nothing). */
export function canActivateMovement(p: Player, pawn: Pawn): string | undefined {
  switch (pawn.movement.activation) {
    case "none":
      return `pawn "${pawn.id}" cannot activate movement`;
    case "card":
      return undefined; // a card must be played; the caller supplies it
    case "once-per-turn":
      return p.oncePerTurnUsed[movementUsedKey(pawn.id)]
        ? `pawn "${pawn.id}" already used its once-per-turn movement this turn`
        : undefined;
    default:
      return `pawn "${pawn.id}" has unknown movement activation "${pawn.movement.activation}"`;
  }
}

/** The pawn capacity of a space in the Cybernet. Throws if the space is unknown. */
export function spaceCapacityAt(
  gd: GameData,
  cy: Cybernet,
  coord: Coord,
  spaceId: string,
): number {
  const pb = cy.at(coord);
  if (!pb) throw new Error(`no block at (${coord.q},${coord.r})`);
  const block = blockById(gd, pb.blockId);
  if (!block) throw new Error(`unknown block "${pb.blockId}"`);
  const sp = blockSpace(block, spaceId);
  if (!sp) throw new Error(`block "${pb.blockId}" has no space "${spaceId}"`);
  return spaceCapacityFor(sp);
}

/**
 * Whether movingPawnId may finish a move on the given space (capacity permitting;
 * the moving pawn does not count against itself). Returns an error string or
 * undefined if allowed.
 */
export function canEndOn(
  gd: GameData,
  cy: Cybernet,
  coord: Coord,
  spaceId: string,
  movingPawnId: string,
): string | undefined {
  const cap = spaceCapacityAt(gd, cy, coord, spaceId);
  if (cap === UNLIMITED) return undefined;
  const occ = cy
    .spaceOccupants(coord, spaceId)
    .filter((p) => p.pawnId !== movingPawnId).length;
  return occ >= cap
    ? `space "${spaceId}" at (${coord.q},${coord.r}) is full (${occ}/${cap})`
    : undefined;
}

/** The first space at coord that movingPawnId could end on, or undefined. */
function firstOpenSpace(
  gd: GameData,
  cy: Cybernet,
  coord: Coord,
  movingPawnId: string,
): string | undefined {
  const pb = cy.at(coord);
  if (!pb) return undefined;
  const block = blockById(gd, pb.blockId);
  if (!block) return undefined;
  for (const sp of block.spaces ?? []) {
    if (canEndOn(gd, cy, coord, sp.id, movingPawnId) === undefined) return sp.id;
  }
  return undefined;
}

/**
 * Executes one block of hex movement for the pawn in grid direction dir. Hex
 * movement ignores spaces and space modifiers, so it does not require a
 * spaced-edge connection — only that a placed block exists in the target cell
 * with room to land. Records the once-per-turn marker for once-per-turn movers.
 * Throws on an illegal move.
 */
export function moveHex(
  s: GameState,
  gd: GameData,
  pawnId: string,
  dir: number,
): PawnOnBoard {
  if (dir < 0 || dir > 5) throw new Error(`direction ${dir} out of range 0..5`);
  const pob = s.cybernet.pawnById(pawnId);
  if (!pob) throw new Error(`pawn "${pawnId}" is not on the board`);
  const pawn = pawnById(gd, pawnId);
  if (!pawn) throw new Error(`unknown pawn "${pawnId}"`);
  if (pawn.movement.type !== "hex") {
    throw new Error(`pawn "${pawnId}" does not have hex movement`);
  }
  const owner = playerById(s, pob.ownerId);
  if (!owner) throw new Error(`pawn "${pawnId}" has no controlling player`);
  const gate = canActivateMovement(owner, pawn);
  if (gate) throw new Error(gate);

  const target = neighbor(pob.coord, dir);
  if (!s.cybernet.at(target)) {
    throw new Error(`no block at (${target.q},${target.r}) to move onto`);
  }
  const landing = firstOpenSpace(gd, s.cybernet, target, pawnId);
  if (!landing) throw new Error(`no open space to land on at (${target.q},${target.r})`);

  pob.coord = target;
  pob.spaceId = landing;
  if (pawn.movement.activation === "once-per-turn") {
    owner.oncePerTurnUsed[movementUsedKey(pawnId)] = true;
  }
  return pob;
}
