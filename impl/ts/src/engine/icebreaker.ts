import type {EngineEvent} from "./index.ts";
import {effectiveIcebreakerModifier} from "./icebreaker-modifiers.ts";
import {abilityUseSpent,spendAbilityUse} from "./use-markers.ts";
import { gainPawnControl } from "./control-markers.ts";
// Icebreaker: gain control of a block or pawn that has an ICE value. Mirrors
// impl/go/internal/engine/icebreaker.go. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md
// ("Icebreaker ability", "Black ICE"). Backlog: T-104.
//
// Roll a d6 (plus any roll-modifier dice); if any die matches one of the target's
// ICE faces, gain control. Controlling a block places one of your control markers
// on it (the real path to the win condition); controlling a pawn changes owner.
// Failing against Black ICE eliminates the attacking pawn.
//
// Verified content supplies exact printed ICE faces. Category-derived faces remain
// a historical/provisional fallback; passing those fixtures does not promote data.

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
import { abilityUsedKey, effectiveAbility, eliminatePawn } from "./combat.ts";
import { discardAttachments, targetIceNullified } from "./attach.ts";
import { collectControlledBonusIcons } from "./bonus.ts";
import { applyBlockEffectForTrigger } from "./effects.ts";
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

/** Prefers the target's authored exact faces; falls back to the category faces. */
function iceFacesFor(faces: number[] | undefined, ice: IceValue | undefined): number[] {
  return faces && faces.length > 0 ? faces : iceFaces(ice);
}

function uniqueSortedFaces(faces: number[]): number[] {
  return [...new Set(faces)].sort((a, b) => a - b);
}

function canonicalFacesForCount(count: number): number[] {
  const clamped = Math.max(0, Math.min(6, count));
  const out: number[] = [];
  for (let face = 7 - clamped; face <= 6; face++) out.push(face);
  return out;
}

function adjustIceFaces(baseFaces: number[], deltaDice: number): number[] {
  const unique = uniqueSortedFaces(baseFaces);
  if (unique.length === 0) return unique;
  if (deltaDice === 0) return unique;
  return canonicalFacesForCount(unique.length + deltaDice);
}

function attachmentIceModifier(
  gd: GameData,
  atts: { cardId: string }[] | undefined,
): { faces: number[]; black: boolean; deltaDice: number } {
  const faces: number[] = [];
  let black = false;
  let deltaDice = 0;
  for (const att of atts ?? []) {
    const modifier = gd.cards.find((card) => card.id === att.cardId)?.attach?.iceModifier;
    for (const face of modifier?.faces ?? []) {
      if (!faces.includes(face)) faces.push(face);
    }
    if (modifier?.black) black = true;
    deltaDice += modifier?.deltaDice ?? 0;
  }
  return { faces, black, deltaDice };
}

function spaceIceModifierAmount(gd: GameData, coord: Coord, spaceId: string, s: GameState): number {
  const placed = s.cybernet.at(coord);
  if (!placed) return 0;
  const block = blockById(gd, placed.blockId);
  const space = block?.spaces?.find((candidate) => candidate.id === spaceId);
  return space?.modifier?.kind === "ice" ? space.modifier.amount ?? 0 : 0;
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
  const ability = effectiveAbility(gd, atk, atkPob.attachments, "icebreaker");
  if (!ability || ability.activation === "none") {
    throw new Error(`pawn "${attackerId}" cannot activate Icebreaker`);
  }
  const owner = playerById(s, atkPob.ownerId);
  if (!owner) throw new Error(`attacker "${attackerId}" has no controlling player`);
  if (
    ability.activation === "once-per-turn" &&
    abilityUseSpent(s,gd,owner,attackerId,"icebreaker")
  ) {
    throw new Error(`pawn "${attackerId}" already used its once-per-turn Icebreaker this turn`);
  }
  return { owner, atkPob };
}

function markIcebreakerUsed(
  s:GameState,
  gd: GameData,
  owner: Player,
  attackerId: string,
  atts: { cardId: string }[] | undefined,
): void {
  const atk = pawnById(gd, attackerId);
  const ability = atk && effectiveAbility(gd, atk, atts, "icebreaker");
  if (ability && ability.activation === "once-per-turn") {
    spendAbilityUse(s,gd,owner,attackerId,"icebreaker");
  }
}

function resolveBlackIceFailure(
  s: GameState,
  gd: GameData,
  isBlack: boolean,
  attackerId: string,
  success: boolean,
): boolean {
  if (!success && isBlack) {
    return eliminatePawn(s, attackerId, gd, "black-ice");
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
  events:EngineEvent[]=[],
  beforeRoll?:()=>void,
): IcebreakResult {
  const { owner, atkPob } = checkIcebreaker(s, gd, attackerId);
  if (atkPob.coord.q !== coord.q || atkPob.coord.r !== coord.r) {
    throw new Error(`attacker "${attackerId}" is not on the target block`);
  }
  const pb = s.cybernet.at(coord);
  if (!pb) throw new Error(`no block at (${coord.q},${coord.r})`);
  const blockDef = blockById(gd, pb.blockId);
  if (!blockDef) throw new Error(`unknown block "${pb.blockId}"`);
  if (targetIceNullified(gd, pb.attachments)) {
    throw new Error(`block "${pb.blockId}" has no ICE value and cannot be controlled`);
  }
  const attachmentModifier = attachmentIceModifier(gd, pb.attachments);
  const faces = adjustIceFaces([...new Set([
    ...iceFacesFor(blockDef.iceFaces, blockDef.iceValue),
    ...attachmentModifier.faces,
  ])], attachmentModifier.deltaDice + spaceIceModifierAmount(gd, coord, atkPob.spaceId, s));
  if (faces.length === 0) {
    throw new Error(`block "${pb.blockId}" has no ICE value and cannot be controlled`);
  }
  if (pb.ownerId === owner.id) {
    throw new Error(`you already control block "${pb.blockId}"`);
  }

  const actorModifier = effectiveIcebreakerModifier(gd,atkPob);
  faces.push(...(actorModifier?.faces ?? []));
  beforeRoll?.();
  if(s.rulesVersion) markIcebreakerUsed(s,gd,owner,attackerId,atkPob.attachments);
  const roll = icebreakRoll(s, extraRollDice + (actorModifier?.rollDice ?? 0));
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
    const previousOwner=pb.ownerId;
    pb.ownerId = owner.id;
    owner.controlMarkersPlaced++;
    if(s.rulesVersion)events.push({type:"control-changed",element:"block",elementId:`${coord.q},${coord.r}`,...(previousOwner?{fromOwnerId:previousOwner}:{}),toOwnerId:owner.id});
    const collected=collectControlledBonusIcons(s, owner.id);
    if(s.rulesVersion)for(const icon of collected)events.push({type:"bonus-collected",playerId:owner.id,element:"bonus-icon",elementId:icon.key});
    checkWin(s);
    if(!s.rulesVersion || !s.winnerId) {
      applyBlockEffectForTrigger(s, gd, coord, "underControl",events);
    }
  } else {
    const isBlack = blockDef.iceValue === "black" || blockDef.blackIce === true || attachmentModifier.black || actorModifier?.black === true;
    attackerEliminated = resolveBlackIceFailure(s, gd, isBlack && !actorModifier?.ignoresBlackIce, attackerId, success);
  }

  if(!s.rulesVersion) markIcebreakerUsed(s,gd, owner, attackerId, atkPob.attachments);
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
  if (targetIceNullified(gd, tgtPob.attachments)) {
    throw new Error(`pawn "${targetId}" has no ICE value and cannot be controlled`);
  }
  const attachmentModifier = attachmentIceModifier(gd, tgtPob.attachments);
  const faces = adjustIceFaces([...new Set([
    ...iceFacesFor(tgt.iceFaces, tgt.iceValue),
    ...attachmentModifier.faces,
  ])], attachmentModifier.deltaDice + spaceIceModifierAmount(gd, tgtPob.coord, tgtPob.spaceId, s));
  if (faces.length === 0) {
    throw new Error(`pawn "${targetId}" has no ICE value and cannot be controlled`);
  }

  const actorModifier = effectiveIcebreakerModifier(gd,atkPob);
  faces.push(...(actorModifier?.faces ?? []));
  if(s.rulesVersion) markIcebreakerUsed(s,gd,owner,attackerId,atkPob.attachments);
  const roll = icebreakRoll(s, extraRollDice + (actorModifier?.rollDice ?? 0));
  const success = anyMatch(roll, faces);
  let attackerEliminated = false;

  if (success) {
    // Gaining control of a pawn discards its attached cards (returning any bonus
    // counters to the previous owner) before ownership transfers.
    discardAttachments(s, tgtPob);
    gainPawnControl(s, gd, targetId, owner.id);
  } else {
    attackerEliminated = resolveBlackIceFailure(s, gd, (tgt.iceValue === "black" || attachmentModifier.black || actorModifier?.black === true) && !actorModifier?.ignoresBlackIce, attackerId, success);
  }

  if(!s.rulesVersion) markIcebreakerUsed(s,gd, owner, attackerId, atkPob.attachments);
  return { roll, success, attackerEliminated };
}
