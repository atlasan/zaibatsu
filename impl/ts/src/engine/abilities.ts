// The remaining two core abilities: Search (place a block from the pile) and
// Reboot (re-enter an eliminated pawn at the Central Core). Mirrors
// impl/go/internal/engine/abilities.go. See DOCS/rules/speedrunners.md ("Search
// ability", "Reboot ability"). Backlog: T-104.
//
// Search draws the TOP of the block pile (the player chooses only where/
// orientation) and places it per the placement rules. Reboot returns an
// eliminated pawn to the Central Core under the rebooting player's control.
// Card-cost consumption (Search discards 1 card; Reboot discards 4) is handled by
// the later card-use-resolution task; these functions resolve the effect.

import { type Coord, type PlacedBlock } from "../domain/hex.ts";
import { blockById, pawnById, type GameData, type GameState } from "../domain/types.ts";
import type { PawnOnBoard } from "../domain/pawn_board.ts";
import { abilityUsedKey, findAbility } from "./combat.ts";
import { canPlace, placeBlock, validPlacements, type Placement } from "./placement.ts";

/** The id of the block currently on top of the pile, or undefined. */
export function searchTopBlock(s: GameState): string | undefined {
  return s.blockPile.length === 0 ? undefined : s.blockPile[s.blockPile.length - 1];
}

/** Legal (dir, rotation) options for placing the top-of-pile block. */
export function validSearchPlacements(
  s: GameState,
  gd: GameData,
  pawnId: string,
): Placement[] {
  const pob = s.cybernet.pawnById(pawnId);
  if (!pob) throw new Error(`pawn "${pawnId}" is not on the board`);
  const top = searchTopBlock(s);
  if (!top) throw new Error("no blocks left in the pile");
  return validPlacements(s.cybernet, gd, pob.coord, top);
}

/**
 * Activates a pawn's Search ability: draw the top block of the pile and place it
 * adjacent to the pawn's block. The block is only consumed if the placement is
 * legal, so a rejected attempt leaves the pile intact for a retry. Throws on an
 * illegal attempt.
 */
export function search(
  s: GameState,
  gd: GameData,
  pawnId: string,
  dir: number,
  rot: number,
): PlacedBlock {
  const pob = s.cybernet.pawnById(pawnId);
  if (!pob) throw new Error(`pawn "${pawnId}" is not on the board`);
  const actor = pawnById(gd, pawnId);
  if (!actor) throw new Error(`unknown pawn "${pawnId}"`);
  const ability = findAbility(actor, "search");
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${pawnId}" cannot activate Search`);
  }
  const owner = s.players.find((p) => p.id === pob.ownerId);
  if (!owner) throw new Error(`pawn "${pawnId}" has no controlling player`);
  const key = abilityUsedKey("search", pawnId);
  if (ability.activation === "once-per-turn" && owner.oncePerTurnUsed[key]) {
    throw new Error(`pawn "${pawnId}" already used its once-per-turn Search this turn`);
  }
  if (s.blockPile.length === 0) throw new Error("no blocks left in the pile");
  const blockId = s.blockPile[s.blockPile.length - 1]!;

  // Validate before consuming the block so a failed attempt is retryable.
  const err = canPlace(s.cybernet, gd, pob.coord, dir, blockId, rot);
  if (err) throw new Error(err);
  s.blockPile.pop();
  const pb = placeBlock(s, pob.coord, dir, gd, blockId, rot);
  if (ability.activation === "once-per-turn") owner.oncePerTurnUsed[key] = true;
  return pb;
}

/** The placed Central Core's coordinate and landing space id. */
function centralCorePlacement(s: GameState, gd: GameData): { coord: Coord; space: string } {
  for (const pb of s.cybernet.blocks) {
    const bd = blockById(gd, pb.blockId);
    if (bd?.isCentralCore) {
      return { coord: pb.coord, space: bd.spaces?.[0]?.id ?? "" };
    }
  }
  throw new Error("no Central Core in the Cybernet");
}

/**
 * Re-enters an eliminated pawn at the Central Core under playerId's control. The
 * pawn must have the Reboot ability and be in the eliminated pool. Throws on an
 * illegal attempt.
 */
export function reboot(
  s: GameState,
  gd: GameData,
  pawnId: string,
  playerId: string,
): PawnOnBoard {
  const idx = s.eliminated.indexOf(pawnId);
  if (idx < 0) throw new Error(`pawn "${pawnId}" is not eliminated`);
  const actor = pawnById(gd, pawnId);
  if (!actor) throw new Error(`unknown pawn "${pawnId}"`);
  const ability = findAbility(actor, "reboot");
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${pawnId}" cannot activate Reboot`);
  }
  const owner = s.players.find((p) => p.id === playerId);
  if (!owner) throw new Error(`unknown player "${playerId}"`);
  const key = abilityUsedKey("reboot", pawnId);
  if (ability.activation === "once-per-turn" && owner.oncePerTurnUsed[key]) {
    throw new Error(`pawn "${pawnId}" already used its once-per-turn Reboot this turn`);
  }
  const { coord, space } = centralCorePlacement(s, gd);
  const pob: PawnOnBoard = { pawnId, ownerId: playerId, coord, spaceId: space };
  s.cybernet.placePawn(pob);
  s.eliminated.splice(idx, 1);
  if (ability.activation === "once-per-turn") owner.oncePerTurnUsed[key] = true;
  return pob;
}
