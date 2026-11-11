import {rebootDestination} from "./reboot-destinations.ts";
import type {SpaceRef} from "./movement.ts";
import {abilityUseSpent,spendAbilityUse} from "./use-markers.ts";
import { setPawnControl } from "./control.ts";
// The remaining two core abilities: Search (place a block from the pile) and
// Reboot (re-enter an eliminated pawn at the Central Core). Mirrors
// impl/go/internal/engine/abilities.go. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md ("SR-ABILITY-002
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
import { abilityUsedKey, effectiveAbility, findAbility } from "./combat.ts";
import { applyBlockEffectForTrigger } from "./effects.ts";
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
  if(gd.regressionFixture!=="provisional-v1") {
    const choice=s.pendingChoice;if(choice?.kind!=="place-block" || choice.pawnId!==pawnId || !choice.reference || !choice.blockId) throw new Error("declare Search before requesting placement options");
    return validPlacements(s.cybernet,gd,choice.reference,choice.blockId);
  }
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
  if(gd.regressionFixture!=="provisional-v1") throw new Error("source Search requires declaration and placement choices");
  const pob = s.cybernet.pawnById(pawnId);
  if (!pob) throw new Error(`pawn "${pawnId}" is not on the board`);
  const actor = pawnById(gd, pawnId);
  if (!actor) throw new Error(`unknown pawn "${pawnId}"`);
  const ability = effectiveAbility(gd, actor, pob.attachments, "search");
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
  applyBlockEffectForTrigger(s, gd, pb.coord, "inCybernet");
  if (ability.activation === "once-per-turn") owner.oncePerTurnUsed[key] = true;
  return pb;
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
  destination?: SpaceRef,
): PawnOnBoard {
  const controlCard = s.controlCards?.find(card => card.subject.kind === "pawn" && card.subject.id === pawnId);
  if (controlCard && controlCard.ownerId !== playerId) throw new Error("only a pawn you control can Reboot");
  const idx = s.eliminated.indexOf(pawnId);
  if (idx < 0) throw new Error(`pawn "${pawnId}" is not eliminated`);
  const actor = pawnById(gd, pawnId);
  if (!actor) throw new Error(`unknown pawn "${pawnId}"`);
  // Innate only: the pawn is eliminated, so its attachments were already
  // discarded and cannot grant Reboot.
  const ability = findAbility(actor, "reboot");
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${pawnId}" cannot activate Reboot`);
  }
  const owner = s.players.find((p) => p.id === playerId);
  if (!owner) throw new Error(`unknown player "${playerId}"`);
  const key = abilityUsedKey("reboot", pawnId);
  if (ability.activation === "once-per-turn" && abilityUseSpent(s,gd,owner,pawnId,"reboot")) {
    throw new Error(`pawn "${pawnId}" already used its once-per-turn Reboot this turn`);
  }
  const { coord, spaceId: space } = rebootDestination(s, gd, playerId, pawnId, destination);
  const pob: PawnOnBoard = { pawnId, ownerId: playerId, coord, spaceId: space };
  s.cybernet.placePawn(pob);
  setPawnControl(s, pawnId, playerId);
  s.eliminated.splice(idx, 1);
  if (ability.activation === "once-per-turn") spendAbilityUse(s,gd,owner,pawnId,"reboot");
  return pob;
}
