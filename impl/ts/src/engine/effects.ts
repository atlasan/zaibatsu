import { blockById, type BlockEffect, type GameData, type GameState } from "../domain/types.ts";
import type { Coord } from "../domain/hex.ts";
import { resolveDeleteAreaAtCoord, type DeleteAreaResult } from "./combat.ts";

export type BlockEffectTrigger = "inCybernet" | "underControl";

function skullsFromEffect(effect: Exclude<BlockEffect, string>): number {
  return Number.isInteger(effect.amount) && effect.amount! > 0 ? effect.amount! : 1;
}

function applyTypedBlockEffect(
  s: GameState,
  gd: GameData,
  coord: Coord,
  effect: Exclude<BlockEffect, string> | undefined,
): DeleteAreaResult | undefined {
  if (!effect) return undefined;
  switch (effect.kind) {
    case "area-attack":
      return resolveDeleteAreaAtCoord(s, gd, coord, skullsFromEffect(effect));
    default:
      return undefined;
  }
}

export function applyBlockEffect(
  s: GameState,
  gd: GameData,
  coord: Coord,
  effect: BlockEffect | undefined,
): DeleteAreaResult | undefined {
  if (!effect || typeof effect === "string") return undefined;
  return applyTypedBlockEffect(s, gd, coord, effect);
}

export function applyBlockEffectForTrigger(
  s: GameState,
  gd: GameData,
  coord: Coord,
  trigger: BlockEffectTrigger,
): DeleteAreaResult | undefined {
  const placed = s.cybernet.at(coord);
  if (!placed) return undefined;
  const block = blockById(gd, placed.blockId);
  if (!block) return undefined;
  return applyBlockEffect(s, gd, coord, trigger === "inCybernet" ? block.effects?.inCybernet : block.effects?.underControl);
}
