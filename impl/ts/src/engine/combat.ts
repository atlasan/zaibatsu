import {defenseProfile} from "./defense.ts";
import {abilityUseSpent,spendAbilityUse} from "./use-markers.ts";
import {deleteActivationOptions,requireDeleteActivation} from "./delete-profile.ts";
import type { EngineEvent } from "./index.ts";
import { offerEliminationPrevention } from "./prevention.ts";
import { setPawnControl } from "./control.ts";
// Combat: attack rolls, the Delete ability, and pawn elimination. Mirrors
// impl/go/internal/engine/combat.go. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md ("SR-ABILITY-002
// a pawn", "Delete ability", "Eliminating a pawn"). Backlog: T-104.
//
// SCOPE: targeted Delete, Bomb-class area Delete, and multi-target die
// assignment. A pawn's Delete rolls one d6 per skull; if any die matches an
// UNSHIELDED defense die of the target, the target is eliminated. A match on a
// shielded die is blocked. Public threat combat and replacement windows live
// in their dedicated modules; complete component/mode coverage remains open.

import {
  pawnById,
  playerById,
  type DefenseDie,
  type GameData,
  type GameState,
  type Pawn,
  type Ability,
} from "../domain/types.ts";
import type { Coord } from "../domain/hex.ts";
import type { Rng } from "../domain/rng.ts";
import { discardAttachments, effectivePawnClasses } from "./attach.ts";

/** Namespaces a pawn's once-per-turn ability marker. */
export function abilityUsedKey(ability: string, pawnId: string): string {
  return `${ability}:${pawnId}`;
}

/** The named ability on a pawn definition, or undefined. */
export function findAbility(pawn: Pawn, name: string): Ability | undefined {
  return pawn.abilities?.find((a) => a.ability === name);
}

/**
 * Compatibility summary of an effective ability. Source Delete returns the
 * first supported route; action/query callers use deleteActivationOptions and
 * requireDeleteActivation to keep card and free routes independent. Other
 * abilities and explicit frozen data retain the original grants/removes logic.
 */
export function effectiveAbility(
  gd: GameData,
  pawn: Pawn,
  atts: { cardId: string }[] | undefined,
  name: string,
): Ability | undefined {
  if(name==="delete" && gd.regressionFixture!=="provisional-v1") return deleteActivationOptions(gd,pawn,atts)[0];
  const attached = atts ?? [];
  for (const a of attached) {
    if (gd.cards.find((c) => c.id === a.cardId)?.attach?.removes?.includes(name as Ability["ability"])) {
      return undefined;
    }
  }
  const innate = findAbility(pawn, name);
  if (innate) return innate;
  for (const a of attached) {
    if (gd.cards.find((c) => c.id === a.cardId)?.attach?.grants?.includes(name as Ability["ability"])) {
      return { ability: name as Ability["ability"], activation: "card" };
    }
  }
  return undefined;
}

/** Rolls one d6 per skull via the seeded RNG. skulls is clamped to at least 1. */
export function attackRoll(rng: Rng, skulls: number): number[] {
  const n = skulls < 1 ? 1 : skulls;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.intn(6) + 1);
  return out;
}

/** Printed skull modifiers accumulate with the actor's base Delete strength. */
export function effectiveAttackSkulls(gd: GameData, s: GameState, pawnId: string, base: number): number {
  const placed = s.cybernet.pawnById(pawnId);
  if (!placed) return Math.max(1, base);
  let skulls = Math.max(1, base);
  for (const att of placed.attachments ?? []) skulls += gd.cards.find(c => c.id === att.cardId)?.attach?.attackModifier ?? 0;
  const blockId = s.cybernet.at(placed.coord)?.blockId;
  const modifier = gd.blocks.find(b => b.id === blockId)?.spaces?.find(sp => sp.id === placed.spaceId)?.modifier;
  if (modifier?.kind === "attack") skulls += modifier.amount ?? 0;
  return Math.max(1, skulls);
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
  activation:"card"|"once-per-turn"="once-per-turn",
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

  const ability = gd.regressionFixture==="provisional-v1" ? effectiveAbility(gd, atk, atkPob.attachments, "delete") : requireDeleteActivation(gd,atk,atkPob.attachments,activation);
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${attackerId}" cannot activate Delete`);
  }

  const owner = playerById(s, atkPob.ownerId);
  if (!owner) throw new Error(`attacker "${attackerId}" has no controlling player`);
  const key = abilityUsedKey("delete", attackerId);
  if (ability.activation === "once-per-turn" && abilityUseSpent(s,gd,owner,attackerId,"delete")) {
    throw new Error(`pawn "${attackerId}" already used its once-per-turn Delete this turn`);
  }

  let skulls = effectiveAttackSkulls(gd, s, attackerId, ability.skulls ?? 1);
  skulls += extraSkulls;

  if(s.rulesVersion && ability.activation==="once-per-turn") spendAbilityUse(s,gd,owner,attackerId,"delete");
  const roll = attackRoll(s.rng, skulls);
  const eliminated = defeats(roll, defenseProfile(s,gd,tgtPob)) && eliminatePawn(s, targetId, gd);
  if (!s.rulesVersion && ability.activation === "once-per-turn") spendAbilityUse(s,gd,owner,attackerId,"delete");

  return { targetPawnId: targetId, roll, eliminated };
}

/**
 * Removes a pawn from the board and records it in the eliminated pool (for a
 * later Reboot). Attached cards are discarded and any bonus counters they held
 * are returned to the owner.
 */
export function eliminatePawn(s: GameState, pawnId: string, gd?: GameData, cause: "attack"|"black-ice"|"sacrifice" = "attack", events: EngineEvent[] = []): boolean {
  if (gd && offerEliminationPrevention(s,gd,pawnId,cause)) return false;
  return finalizePawnElimination(s,pawnId,gd,events);
}

/** Final cleanup runs only after replacement decisions have finished. */
export function finalizePawnElimination(s: GameState, pawnId: string, gd?: GameData, events: EngineEvent[] = []): boolean {
  const pawn=s.cybernet.pawnById(pawnId);
  if (!pawn) return false;
  if (s.rulesVersion && !gd) throw new Error("source lifecycle elimination requires GameData");
  const definition=gd && pawnById(gd,pawnId);
  const retained = !s.rulesVersion || !!(definition && effectiveAbility(gd!,definition,pawn.attachments,"reboot"));
  const card=s.controlCards?.find(card=>card.subject.kind==="pawn" && card.subject.id===pawnId);
  const previousOwner=card?.ownerId;
  const attached=(pawn.attachments??[]).map(attachment=>attachment.cardId);
  s.cybernet.removePawn(pawnId);
  events.push({type:"elimination",pawnId});
  if(retained) { if(!s.eliminated.includes(pawnId)) s.eliminated.push(pawnId); }
  else {
    s.eliminated=s.eliminated.filter(id=>id!==pawnId);
    if(!(s.reserve??=[]).includes(pawnId)) s.reserve.push(pawnId);
    events.push({type:"pawn-returned-to-reserve",pawnId});
  }
  discardAttachments(s,pawn);
  for(const cardId of attached) events.push({type:"card-discarded",cardId});
  if(!retained) {
    setPawnControl(s,pawnId,"");
    if(previousOwner && card) events.push({type:"control-card-released",playerId:previousOwner,cardId:card.cardId,pawnId});
  }
  return true;
}

/** The outcome for one target of a multi-target Delete assignment. */
export interface MultiTargetResult {
  targetPawnId: string;
  dice: number[];
  eliminated: boolean;
}

export interface DeleteMultiResult {
  roll: number[];
  targets: MultiTargetResult[];
}

export interface AreaTargetResult {
  targetPawnId: string;
  eliminated: boolean;
}

export interface DeleteAreaResult {
  coord: Coord;
  roll: number[];
  targets: AreaTargetResult[];
}

export function resolveDeleteAreaAtCoord(
  s: GameState,
  gd: GameData,
  coord: Coord,
  skulls: number,
): DeleteAreaResult {
  const roll = attackRoll(s.rng, skulls);
  const targetIds = s.cybernet.pawns
    .filter((p) => p.coord.q === coord.q && p.coord.r === coord.r)
    .map((p) => p.pawnId);

  const targets: AreaTargetResult[] = [];
  const eliminatedIds: string[] = [];
  for (const targetId of targetIds) {
    const tgt = pawnById(gd, targetId);
    const eliminated = !!tgt && defeats(roll, defenseProfile(s,gd,s.cybernet.pawnById(targetId)!));
    targets.push({ targetPawnId: targetId, eliminated });
    if (eliminated) eliminatedIds.push(targetId);
  }
  for (const targetId of eliminatedIds) targets.find(target=>target.targetPawnId===targetId)!.eliminated=eliminatePawn(s,targetId,gd);
  return { coord: { ...coord }, roll, targets };
}

/**
 * Resolves a single Delete attack roll split across several co-located targets
 * (Speedrunners / Shadowraiders "Combat Against Multiple Threats"). Rolls one
 * die per skull; the first targetIds.length dice are assigned in order. A target
 * may appear more than once so multiple dice can be concentrated on it. A target
 * is eliminated if any die assigned to it matches an unshielded defense die.
 *
 * SCOPE: area attacks are a later refinement — tracked in tasks/BACKLOG.md.
 */
export function deleteMulti(
  s: GameState,
  gd: GameData,
  attackerId: string,
  targetIds: string[],
  extraSkulls = 0,
  activation:"card"|"once-per-turn"="once-per-turn",
): DeleteMultiResult {
  if (targetIds.length === 0) throw new Error("no targets given");
  const atkPob = s.cybernet.pawnById(attackerId);
  if (!atkPob) throw new Error(`attacker "${attackerId}" is not on the board`);
  const atk = pawnById(gd, attackerId);
  if (!atk) throw new Error(`unknown attacker pawn "${attackerId}"`);
  const ability = gd.regressionFixture==="provisional-v1" ? effectiveAbility(gd, atk, atkPob.attachments, "delete") : requireDeleteActivation(gd,atk,atkPob.attachments,activation);
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${attackerId}" cannot activate Delete`);
  }
  const owner = playerById(s, atkPob.ownerId);
  if (!owner) throw new Error(`attacker "${attackerId}" has no controlling player`);
  const key = abilityUsedKey("delete", attackerId);
  if (ability.activation === "once-per-turn" && abilityUseSpent(s,gd,owner,attackerId,"delete")) {
    throw new Error(`pawn "${attackerId}" already used its once-per-turn Delete this turn`);
  }

  let skulls = effectiveAttackSkulls(gd, s, attackerId, ability.skulls ?? 1);
  skulls += extraSkulls;
  if (targetIds.length > skulls) {
    throw new Error(`cannot attack ${targetIds.length} targets with only ${skulls} skull(s)`);
  }

  for (const tid of targetIds) {
    if (tid === attackerId) throw new Error("a pawn cannot Delete itself");
    const tPob = s.cybernet.pawnById(tid);
    if (!tPob) throw new Error(`target "${tid}" is not on the board`);
    if (tPob.coord.q !== atkPob.coord.q || tPob.coord.r !== atkPob.coord.r) {
      throw new Error(`target "${tid}" is not in the same block`);
    }
  }

  if(s.rulesVersion && ability.activation==="once-per-turn") spendAbilityUse(s,gd,owner,attackerId,"delete");
  const roll = attackRoll(s.rng, skulls);
  const diceByTarget = new Map<string, number[]>();
  const targetOrder: string[] = [];
  targetIds.forEach((tid, i) => {
    const dice = diceByTarget.get(tid);
    if (dice) {
      dice.push(roll[i]!);
      return;
    }
    diceByTarget.set(tid, [roll[i]!]);
    targetOrder.push(tid);
  });

  const targets: MultiTargetResult[] = [];
  for (const tid of targetOrder) {
    const tgt = pawnById(gd, tid);
    const dice = diceByTarget.get(tid) ?? [];
    const eliminated = !!tgt && defeats(dice, defenseProfile(s,gd,s.cybernet.pawnById(tid)!)) && eliminatePawn(s,tid,gd);
    targets.push({ targetPawnId: tid, dice, eliminated });
  }
  if (!s.rulesVersion && ability.activation === "once-per-turn") spendAbilityUse(s,gd,owner,attackerId,"delete");
  return { roll, targets };
}

/**
 * Resolves a Bomb-class area Delete against every pawn in the attacker's block.
 * The same attack roll is applied to every pawn in the area of effect, including
 * the attacker when present in that block. Block-effect dispatch will reuse the
 * same area-attack semantics in a later slice.
 */
export function deleteArea(
  s: GameState,
  gd: GameData,
  attackerId: string,
  extraSkulls = 0,
  activation:"card"|"once-per-turn"="once-per-turn",
): DeleteAreaResult {
  const atkPob = s.cybernet.pawnById(attackerId);
  if (!atkPob) throw new Error(`attacker "${attackerId}" is not on the board`);
  const atk = pawnById(gd, attackerId);
  if (!atk) throw new Error(`unknown attacker pawn "${attackerId}"`);
  if (!effectivePawnClasses(gd, atkPob).includes("bomb")) {
    throw new Error(`pawn "${attackerId}" cannot activate an area Delete`);
  }

  const ability = gd.regressionFixture==="provisional-v1" ? effectiveAbility(gd, atk, atkPob.attachments, "delete") : requireDeleteActivation(gd,atk,atkPob.attachments,activation);
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${attackerId}" cannot activate Delete`);
  }

  const owner = playerById(s, atkPob.ownerId);
  if (!owner) throw new Error(`attacker "${attackerId}" has no controlling player`);
  const key = abilityUsedKey("delete", attackerId);
  if (ability.activation === "once-per-turn" && abilityUseSpent(s,gd,owner,attackerId,"delete")) {
    throw new Error(`pawn "${attackerId}" already used its once-per-turn Delete this turn`);
  }

  let skulls = effectiveAttackSkulls(gd, s, attackerId, ability.skulls ?? 1);
  skulls += extraSkulls;
  if(s.rulesVersion && ability.activation==="once-per-turn") spendAbilityUse(s,gd,owner,attackerId,"delete");
  const result = resolveDeleteAreaAtCoord(s, gd, atkPob.coord, skulls);
  if (!s.rulesVersion && ability.activation === "once-per-turn") spendAbilityUse(s,gd,owner,attackerId,"delete");
  return result;
}
