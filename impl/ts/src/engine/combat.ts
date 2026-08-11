// Combat: attack rolls, the Delete ability, and pawn elimination. Mirrors
// impl/go/internal/engine/combat.go. See DOCS/rules/speedrunners.md ("Attacking
// a pawn", "Delete ability", "Eliminating a pawn"). Backlog: T-104.
//
// SCOPE: single-target Delete. A pawn's Delete rolls one d6 per skull; if any die
// matches an UNSHIELDED defense die of the target, the target is eliminated. A
// match on a shielded die is blocked. Splitting an attack's dice across multiple
// targets, area attacks, and threat/Mark combat are later tasks.

import {
  pawnById,
  playerById,
  type DefenseDie,
  type GameData,
  type GameState,
  type Pawn,
  type Ability,
} from "../domain/types.ts";
import type { Rng } from "../domain/rng.ts";
import { discardAttachments } from "./attach.ts";

/** Namespaces a pawn's once-per-turn ability marker. */
export function abilityUsedKey(ability: string, pawnId: string): string {
  return `${ability}:${pawnId}`;
}

/** The named ability on a pawn definition, or undefined. */
export function findAbility(pawn: Pawn, name: string): Ability | undefined {
  return pawn.abilities?.find((a) => a.ability === name);
}

/** Rolls one d6 per skull via the seeded RNG. skulls is clamped to at least 1. */
export function attackRoll(rng: Rng, skulls: number): number[] {
  const n = skulls < 1 ? 1 : skulls;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.intn(6) + 1);
  return out;
}

/**
 * Whether an attack roll eliminates a pawn with the given defense dice: any
 * attack die value equal to an UNSHIELDED defense die value is a hit.
 */
export function defeats(roll: number[], defense: DefenseDie[]): boolean {
  return roll.some((r) => defense.some((d) => !d.shielded && d.value === r));
}

export interface DeleteResult {
  targetPawnId: string;
  roll: number[];
  eliminated: boolean;
}

/**
 * Resolves the attacker's Delete ability against a co-located target pawn.
 * extraSkulls folds in cumulative skull modifiers. On elimination the target is
 * removed from the board and added to the eliminated pool. Throws on an illegal
 * attempt.
 */
export function deleteAbility(
  s: GameState,
  gd: GameData,
  attackerId: string,
  targetId: string,
  extraSkulls = 0,
): DeleteResult {
  if (attackerId === targetId) throw new Error("a pawn cannot Delete itself");

  const atkPob = s.cybernet.pawnById(attackerId);
  if (!atkPob) throw new Error(`attacker "${attackerId}" is not on the board`);
  const tgtPob = s.cybernet.pawnById(targetId);
  if (!tgtPob) throw new Error(`target "${targetId}" is not on the board`);
  if (atkPob.coord.q !== tgtPob.coord.q || atkPob.coord.r !== tgtPob.coord.r) {
    throw new Error("attacker and target are not in the same block");
  }

  const atk = pawnById(gd, attackerId);
  if (!atk) throw new Error(`unknown attacker pawn "${attackerId}"`);
  const tgt = pawnById(gd, targetId);
  if (!tgt) throw new Error(`unknown target pawn "${targetId}"`);

  const ability = findAbility(atk, "delete");
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${attackerId}" cannot activate Delete`);
  }

  const owner = playerById(s, atkPob.ownerId);
  if (!owner) throw new Error(`attacker "${attackerId}" has no controlling player`);
  const key = abilityUsedKey("delete", attackerId);
  if (ability.activation === "once-per-turn" && owner.oncePerTurnUsed[key]) {
    throw new Error(`pawn "${attackerId}" already used its once-per-turn Delete this turn`);
  }

  let skulls = ability.skulls && ability.skulls >= 1 ? ability.skulls : 1;
  skulls += extraSkulls;

  const roll = attackRoll(s.rng, skulls);
  const eliminated = defeats(roll, tgt.defense);
  if (eliminated) eliminatePawn(s, targetId);
  if (ability.activation === "once-per-turn") owner.oncePerTurnUsed[key] = true;

  return { targetPawnId: targetId, roll, eliminated };
}

/**
 * Removes a pawn from the board and records it in the eliminated pool (for a
 * later Reboot). Attached cards are discarded and any bonus counters they held
 * are returned to the owner.
 */
export function eliminatePawn(s: GameState, pawnId: string): void {
  const pob = s.cybernet.pawnById(pawnId);
  if (pob) discardAttachments(s, pob);
  if (s.cybernet.removePawn(pawnId)) s.eliminated.push(pawnId);
}

/** The outcome for one target of a multi-target Delete. */
export interface MultiTargetResult {
  targetPawnId: string;
  die: number;
  eliminated: boolean;
}

export interface DeleteMultiResult {
  roll: number[];
  targets: MultiTargetResult[];
}

/**
 * Resolves a single Delete attack roll split across several co-located targets —
 * one attack die per target, in order (Speedrunners "Combat Against Multiple
 * Threats"). Rolls one die per skull; the first targets.length dice are assigned
 * one-to-one. A target is eliminated if its die matches an unshielded defense die.
 *
 * SCOPE: one die per target. Concentrating multiple dice on one target (and area
 * attacks) is a later refinement — tracked in tasks/BACKLOG.md.
 */
export function deleteMulti(
  s: GameState,
  gd: GameData,
  attackerId: string,
  targetIds: string[],
  extraSkulls = 0,
): DeleteMultiResult {
  if (targetIds.length === 0) throw new Error("no targets given");
  const atkPob = s.cybernet.pawnById(attackerId);
  if (!atkPob) throw new Error(`attacker "${attackerId}" is not on the board`);
  const atk = pawnById(gd, attackerId);
  if (!atk) throw new Error(`unknown attacker pawn "${attackerId}"`);
  const ability = findAbility(atk, "delete");
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${attackerId}" cannot activate Delete`);
  }
  const owner = playerById(s, atkPob.ownerId);
  if (!owner) throw new Error(`attacker "${attackerId}" has no controlling player`);
  const key = abilityUsedKey("delete", attackerId);
  if (ability.activation === "once-per-turn" && owner.oncePerTurnUsed[key]) {
    throw new Error(`pawn "${attackerId}" already used its once-per-turn Delete this turn`);
  }

  let skulls = ability.skulls && ability.skulls >= 1 ? ability.skulls : 1;
  skulls += extraSkulls;
  if (targetIds.length > skulls) {
    throw new Error(`cannot attack ${targetIds.length} targets with only ${skulls} skull(s)`);
  }

  const seen = new Set<string>();
  for (const tid of targetIds) {
    if (tid === attackerId) throw new Error("a pawn cannot Delete itself");
    if (seen.has(tid)) throw new Error(`target "${tid}" listed more than once`);
    seen.add(tid);
    const tPob = s.cybernet.pawnById(tid);
    if (!tPob) throw new Error(`target "${tid}" is not on the board`);
    if (tPob.coord.q !== atkPob.coord.q || tPob.coord.r !== atkPob.coord.r) {
      throw new Error(`target "${tid}" is not in the same block`);
    }
  }

  const roll = attackRoll(s.rng, skulls);
  const targets: MultiTargetResult[] = [];
  targetIds.forEach((tid, i) => {
    const die = roll[i]!;
    const tgt = pawnById(gd, tid);
    const eliminated = !!tgt && defeats([die], tgt.defense);
    targets.push({ targetPawnId: tid, die, eliminated });
    if (eliminated) eliminatePawn(s, tid);
  });
  if (ability.activation === "once-per-turn") owner.oncePerTurnUsed[key] = true;
  return { roll, targets };
}
