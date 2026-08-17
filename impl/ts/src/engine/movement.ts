// Movement resolution: step budgets, activation gating, occupancy, and hex
// (block-to-block) execution. Mirrors impl/go/internal/engine/movement.go. See
// DOCS/rules/speedrunners/board-and-movement.md ("SR-MOVE-001") and DOCS/domain-model.md.
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

import { neighbor, opposite, type Coord, type Cybernet } from "../domain/hex.ts";
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

/** A gameplay space: the block cell it sits in plus the space id. */
export interface SpaceRef {
  coord: Coord;
  spaceId: string;
}

/**
 * The spaces a pawn on (coord, spaceId) may step to in one step: intra-block
 * neighbours (space.neighbors) plus cross-edge boundary hops into an adjacent
 * block when both blocks encode boundarySpaces and the edge is open. A space's
 * `direction`, when set, restricts its cross-edge exit to that single edge.
 * boundarySpaces and direction are indexed by the block's LOCAL edge; a local
 * edge e faces grid direction (e + rotation) % 6. Mirrors movement.go.
 */
export function stepTargets(
  gd: GameData,
  cy: Cybernet,
  coord: Coord,
  spaceId: string,
): SpaceRef[] {
  const pb = cy.at(coord);
  if (!pb) return [];
  const block = blockById(gd, pb.blockId);
  if (!block) return [];
  const sp = blockSpace(block, spaceId);
  if (!sp) return [];
  const out: SpaceRef[] = [];
  for (const nb of sp.neighbors ?? []) {
    if (blockSpace(block, nb)) out.push({ coord, spaceId: nb });
  }
  const edges = block.edges;
  const bounds = block.boundarySpaces;
  if (bounds && bounds.length === 6 && edges && edges.length === 6) {
    for (let e = 0; e < 6; e++) {
      if (!edges[e] || !(bounds[e] ?? []).includes(spaceId)) continue;
      if (sp.direction !== undefined && sp.direction !== e) continue; // arrow restricts exit edge
      const gridDir = (e + pb.rotation) % 6;
      const ncoord = neighbor(coord, gridDir);
      const npb = cy.at(ncoord);
      if (!npb) continue;
      const nblock = blockById(gd, npb.blockId);
      if (!nblock?.boundarySpaces || nblock.boundarySpaces.length !== 6 || !nblock.edges || nblock.edges.length !== 6) {
        continue;
      }
      const ne = ((opposite(gridDir) - npb.rotation) % 6 + 6) % 6; // neighbour's local edge facing back
      if (!nblock.edges[ne]) continue;
      for (const nsid of nblock.boundarySpaces[ne] ?? []) out.push({ coord: ncoord, spaceId: nsid });
    }
  }
  return out;
}

/**
 * Moves a pawn one step to an adjacent space, validating reachability
 * (stepTargets) and capacity (canEndOn). The primitive the step/d6/2d6 budget
 * chains; it does no activation gating. Throws on an illegal step.
 */
export function moveStep(
  s: GameState,
  gd: GameData,
  pawnId: string,
  target: Coord,
  targetSpaceId: string,
): PawnOnBoard {
  const pob = s.cybernet.pawnById(pawnId);
  if (!pob) throw new Error(`pawn "${pawnId}" is not on the board`);
  const reachable = stepTargets(gd, s.cybernet, pob.coord, pob.spaceId).some(
    (t) => t.coord.q === target.q && t.coord.r === target.r && t.spaceId === targetSpaceId,
  );
  if (!reachable) {
    throw new Error(`space "${targetSpaceId}" at (${target.q},${target.r}) is not adjacent to pawn "${pawnId}"'s space`);
  }
  const full = canEndOn(gd, s.cybernet, target, targetSpaceId, pawnId);
  if (full) throw new Error(full);
  pob.coord = target;
  pob.spaceId = targetSpaceId;
  return pob;
}

/**
 * Walks a pawn along a declared path of adjacent spaces under its resolved step
 * budget. Per SR-MOVE-002 a pawn MAY PASS occupied spaces but MAY END only where
 * capacity permits, and UNUSED STEPS ARE LOST: the path may be shorter than the
 * budget but not longer, each hop must be adjacent, and only the final space is
 * capacity-checked. Gates activation, records the once-per-turn marker. Hex
 * movement uses moveHex. Throws on an illegal move. Mirrors movement.go.
 */
export function moveSteps(
  s: GameState,
  gd: GameData,
  pawnId: string,
  path: SpaceRef[],
): PawnOnBoard {
  const pob = s.cybernet.pawnById(pawnId);
  if (!pob) throw new Error(`pawn "${pawnId}" is not on the board`);
  const pawn = pawnById(gd, pawnId);
  if (!pawn) throw new Error(`unknown pawn "${pawnId}"`);
  if (pawn.movement.type === "hex") throw new Error(`pawn "${pawnId}" has hex movement; use moveHex`);
  if (path.length === 0) throw new Error("empty movement path");
  const owner = playerById(s, pob.ownerId);
  if (!owner) throw new Error(`pawn "${pawnId}" has no controlling player`);
  const gate = canActivateMovement(owner, pawn);
  if (gate) throw new Error(gate);
  // Validate the walk first (no RNG, no mutation): each hop adjacent, only the
  // final space capacity-checked (may pass occupied spaces).
  let curCoord = pob.coord;
  let curSpace = pob.spaceId;
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const reachable = stepTargets(gd, s.cybernet, curCoord, curSpace).some(
      (t) => t.coord.q === step.coord.q && t.coord.r === step.coord.r && t.spaceId === step.spaceId,
    );
    if (!reachable) throw new Error(`step ${i + 1} to space "${step.spaceId}" is not adjacent`);
    if (i === path.length - 1) {
      const full = canEndOn(gd, s.cybernet, step.coord, step.spaceId, pawnId);
      if (full) throw new Error(full);
    }
    curCoord = step.coord;
    curSpace = step.spaceId;
  }
  // Then resolve the budget (d6/2d6 draw the RNG) and require the path to fit.
  const budget = resolveSteps(pawn.movement, s.rng, 0);
  if (path.length > budget) {
    throw new Error(`path of ${path.length} steps exceeds the movement budget of ${budget}`);
  }
  pob.coord = curCoord;
  pob.spaceId = curSpace;
  if (pawn.movement.activation === "once-per-turn") {
    owner.oncePerTurnUsed[movementUsedKey(pawnId)] = true;
  }
  return pob;
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
