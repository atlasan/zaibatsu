// Icebreaker: gain control of a block or pawn that has an ICE value. Mirrors
// impl/go/internal/engine/icebreaker.go. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md
// ("Icebreaker ability", "Black ICE"). Backlog: T-104.
//
// Roll a d6 (plus any roll-modifier dice); if any die matches one of the target's
// ICE faces, gain control. Controlling a block places one of your control markers
// on it (the real path to the win condition); controlling a pawn changes owner.
// Failing against Black ICE eliminates the attacking pawn.
//
// ICE FACES ARE PROVISIONAL. The data models ICE as a category, not specific die
// faces. iceFaces derives canonical top-N faces so base success probability is
// faithful (low = 3 chances, medium = 2, high = 1, black = 1 high-risk). Real
// face values come with transcription — tracked in tasks/BACKLOG.md.

import { neighbor, type Coord } from "../domain/hex.ts";
import {
  blockById,
  markersRemaining,
  pawnById,
  playerById,
  type GameData,
  type GameState,
  type IceValue,
  type Player,
} from "../domain/types.ts";
import type { PawnOnBoard } from "../domain/pawn_board.ts";
import { abilityUsedKey, eliminatePawn, findAbility } from "./combat.ts";
import { discardAttachments } from "./attach.ts";
import { checkWin } from "./win.ts";

/** The d6 faces that count as a successful Icebreak. Empty for "none". */
export function iceFaces(ice: IceValue | undefined): number[] {
  switch (ice) {
    case "low":
      return [4, 5, 6];
    case "medium":
      return [5, 6];
    case "high":
      return [6];
    case "black":
      return [6];
    default:
      return [];
  }
}

export interface IcebreakResult {
  roll: number[];
  success: boolean;
  attackerEliminated: boolean;
}

function icebreakRoll(s: GameState, extraRollDice: number): number[] {
  const n = 1 + extraRollDice < 1 ? 1 : 1 + extraRollDice;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(s.rng.intn(6) + 1);
  return out;
}

function anyMatch(roll: number[], faces: number[]): boolean {
  return roll.some((r) => faces.includes(r));
}

/** Validates the attacker may activate Icebreaker now; returns owner + position. */
function checkIcebreaker(
  s: GameState,
  gd: GameData,
  attackerId: string,
): { owner: Player; atkPob: PawnOnBoard } {
  const atkPob = s.cybernet.pawnById(attackerId);
  if (!atkPob) throw new Error(`attacker "${attackerId}" is not on the board`);
  const atk = pawnById(gd, attackerId);
  if (!atk) throw new Error(`unknown attacker pawn "${attackerId}"`);
  const ability = findAbility(atk, "icebreaker");
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${attackerId}" cannot activate Icebreaker`);
  }
  const owner = playerById(s, atkPob.ownerId);
  if (!owner) throw new Error(`attacker "${attackerId}" has no controlling player`);
  if (
    ability.activation === "once-per-turn" &&
    owner.oncePerTurnUsed[abilityUsedKey("icebreaker", attackerId)]
  ) {
    throw new Error(`pawn "${attackerId}" already used its once-per-turn Icebreaker this turn`);
  }
  return { owner, atkPob };
}

function markIcebreakerUsed(gd: GameData, owner: Player, attackerId: string): void {
  const atk = pawnById(gd, attackerId);
  const ability = atk && findAbility(atk, "icebreaker");
  if (ability && ability.activation === "once-per-turn") {
    owner.oncePerTurnUsed[abilityUsedKey("icebreaker", attackerId)] = true;
  }
}

function resolveBlackIceFailure(
  s: GameState,
  ice: IceValue | undefined,
  attackerId: string,
  success: boolean,
): boolean {
  if (!success && ice === "black") {
    eliminatePawn(s, attackerId);
    return true;
  }
  return false;
}

/** Attempts to gain control of the block the attacker occupies. */
export function icebreakBlock(
  s: GameState,
  gd: GameData,
  attackerId: string,
  coord: Coord,
  extraRollDice = 0,
): IcebreakResult {
  const { owner, atkPob } = checkIcebreaker(s, gd, attackerId);
  if (atkPob.coord.q !== coord.q || atkPob.coord.r !== coord.r) {
    throw new Error(`attacker "${attackerId}" is not on the target block`);
  }
  const pb = s.cybernet.at(coord);
  if (!pb) throw new Error(`no block at (${coord.q},${coord.r})`);
  const blockDef = blockById(gd, pb.blockId);
  if (!blockDef) throw new Error(`unknown block "${pb.blockId}"`);
  const faces = iceFaces(blockDef.iceValue);
  if (faces.length === 0) {
    throw new Error(`block "${pb.blockId}" has no ICE value and cannot be controlled`);
  }
  if (pb.ownerId === owner.id) {
    throw new Error(`you already control block "${pb.blockId}"`);
  }

  const roll = icebreakRoll(s, extraRollDice);
  const success = anyMatch(roll, faces);
  let attackerEliminated = false;

  if (success) {
    if (markersRemaining(owner) <= 0) {
      throw new Error(`player ${owner.id} has no control markers to place`);
    }
    if (pb.ownerId) {
      const prev = playerById(s, pb.ownerId);
      if (prev && prev.controlMarkersPlaced > 0) prev.controlMarkersPlaced--;
    }
    pb.ownerId = owner.id;
    owner.controlMarkersPlaced++;
    checkWin(s);
  } else {
    attackerEliminated = resolveBlackIceFailure(s, blockDef.iceValue, attackerId, success);
  }

  markIcebreakerUsed(gd, owner, attackerId);
  return { roll, success, attackerEliminated };
}

/** Attempts to gain control of a co-located pawn that has an ICE value. */
export function icebreakPawn(
  s: GameState,
  gd: GameData,
  attackerId: string,
  targetId: string,
  extraRollDice = 0,
): IcebreakResult {
  if (attackerId === targetId) throw new Error("a pawn cannot Icebreak itself");
  const { owner, atkPob } = checkIcebreaker(s, gd, attackerId);
  const tgtPob = s.cybernet.pawnById(targetId);
  if (!tgtPob) throw new Error(`target "${targetId}" is not on the board`);
  if (atkPob.coord.q !== tgtPob.coord.q || atkPob.coord.r !== tgtPob.coord.r) {
    throw new Error("attacker and target are not in the same block");
  }
  if (tgtPob.ownerId === owner.id) {
    throw new Error(`you already control pawn "${targetId}"`);
  }
  const tgt = pawnById(gd, targetId);
  if (!tgt) throw new Error(`unknown target pawn "${targetId}"`);
  const faces = iceFaces(tgt.iceValue);
  if (faces.length === 0) {
    throw new Error(`pawn "${targetId}" has no ICE value and cannot be controlled`);
  }

  const roll = icebreakRoll(s, extraRollDice);
  const success = anyMatch(roll, faces);
  let attackerEliminated = false;

  if (success) {
    // Gaining control of a pawn discards its attached cards (returning any bonus
    // counters to the previous owner) before ownership transfers.
    discardAttachments(s, tgtPob);
    tgtPob.ownerId = owner.id;
  } else {
    attackerEliminated = resolveBlackIceFailure(s, tgt.iceValue, attackerId, success);
  }

  markIcebreakerUsed(gd, owner, attackerId);
  return { roll, success, attackerEliminated };
}
