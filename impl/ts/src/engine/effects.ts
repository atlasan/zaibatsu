import type { Coord } from "../domain/hex.ts";
import type { PawnOnBoard } from "../domain/pawn_board.ts";
import { blockSpace } from "../domain/pawn_board.ts";
import {
  blockById,
  pawnById,
  playerById,
  type BlockEffect,
  type CardEffect,
  type CardEffectTrigger,
  type GameData,
  type GameState,
} from "../domain/types.ts";
import { resolveDeleteAreaAtCoord, type DeleteAreaResult } from "./combat.ts";
import { canEndOn } from "./movement.ts";

export type BlockEffectTrigger = "inCybernet" | "underControl";
export type EffectResolution =
  | { kind: "area-attack"; result: DeleteAreaResult }
  | { kind: "place-pawn"; pawn: PawnOnBoard }
  | { kind: "gain-bonus"; playerId: string; amount: number };

function skullsFromEffect(effect: Exclude<BlockEffect, string>): number {
  return Number.isInteger(effect.amount) && effect.amount! > 0 ? effect.amount! : 1;
}

function amountFromCardEffect(effect: CardEffect): number {
  return Number.isInteger(effect.amount) && effect.amount! > 0 ? effect.amount! : 1;
}

function firstOpenSpace(
  s: GameState,
  gd: GameData,
  coord: Coord,
  pawnId: string,
): string | undefined {
  const placed = s.cybernet.at(coord);
  if (!placed) return undefined;
  const block = blockById(gd, placed.blockId);
  if (!block) return undefined;
  for (const space of block.spaces ?? []) {
    if (!blockSpace(block, space.id)) continue;
    if (canEndOn(gd, s.cybernet, coord, space.id, pawnId) === undefined) return space.id;
  }
  return undefined;
}

function placePawnEffect(
  s: GameState,
  gd: GameData,
  playerId: string,
  coord: Coord,
  pawnId: string | undefined,
): EffectResolution | undefined {
  if (!pawnId || !playerById(s, playerId) || !pawnById(gd, pawnId) || s.cybernet.pawnById(pawnId)) return undefined;
  const spaceId = firstOpenSpace(s, gd, coord, pawnId);
  if (!spaceId) return undefined;
  const eliminatedIndex = s.eliminated.indexOf(pawnId);
  if (eliminatedIndex >= 0) s.eliminated.splice(eliminatedIndex, 1);
  const pawn: PawnOnBoard = { pawnId, ownerId: playerId, coord: { ...coord }, spaceId };
  s.cybernet.placePawn(pawn);
  return { kind: "place-pawn", pawn };
}

function applyTypedBlockEffect(
  s: GameState,
  gd: GameData,
  coord: Coord,
  effect: Exclude<BlockEffect, string> | undefined,
): EffectResolution | undefined {
  if (!effect) return undefined;
  switch (effect.kind) {
    case "area-attack":
      return { kind: "area-attack", result: resolveDeleteAreaAtCoord(s, gd, coord, skullsFromEffect(effect)) };
    case "place-pawn": {
      const ownerId = s.cybernet.at(coord)?.ownerId ?? "";
      return ownerId ? placePawnEffect(s, gd, ownerId, coord, effect.target) : undefined;
    }
    default:
      return undefined;
  }
}

export function applyBlockEffect(
  s: GameState,
  gd: GameData,
  coord: Coord,
  effect: BlockEffect | undefined,
): EffectResolution | undefined {
  if (!effect || typeof effect === "string") return undefined;
  return applyTypedBlockEffect(s, gd, coord, effect);
}

export function applyBlockEffectForTrigger(
  s: GameState,
  gd: GameData,
  coord: Coord,
  trigger: BlockEffectTrigger,
): EffectResolution | undefined {
  const placed = s.cybernet.at(coord);
  if (!placed) return undefined;
  const block = blockById(gd, placed.blockId);
  if (!block) return undefined;
  return applyBlockEffect(s, gd, coord, trigger === "inCybernet" ? block.effects?.inCybernet : block.effects?.underControl);
}

function cardEffectsForTrigger(
  gd: GameData,
  cardId: string,
  trigger: CardEffectTrigger,
): CardEffect[] {
  const card = gd.cards.find((entry) => entry.id === cardId);
  return (card?.effects ?? []).filter((effect) => (effect.trigger ?? "on-play") === trigger);
}

function applyCardEffect(
  s: GameState,
  gd: GameData,
  playerId: string,
  coord: Coord | undefined,
  effect: CardEffect,
): EffectResolution | undefined {
  switch (effect.kind) {
    case "place-pawn":
      return coord ? placePawnEffect(s, gd, playerId, coord, effect.target) : undefined;
    case "gain-bonus": {
      const player = playerById(s, playerId);
      if (!player) return undefined;
      const amount = amountFromCardEffect(effect);
      player.bonusCounters += amount;
      return { kind: "gain-bonus", playerId, amount };
    }
    default:
      return undefined;
  }
}

export function applyCardEffectsForTrigger(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  trigger: CardEffectTrigger,
  coord?: Coord,
): EffectResolution[] {
  return cardEffectsForTrigger(gd, cardId, trigger)
    .map((effect) => applyCardEffect(s, gd, playerId, coord, effect))
    .filter((effect): effect is EffectResolution => !!effect);
}
