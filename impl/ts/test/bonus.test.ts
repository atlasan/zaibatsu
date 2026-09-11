import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import {
  attachToPawn,
  collectControlledBonusIcons,
  icebreakBlock,
  placeBlock,
  search,
  type Config,
  newGame,
} from "../src/engine/index.ts";

function bonusFixtureData() {
  const data = structuredClone(loadDefault("speedrunners"));
  const core = data.blocks.find((block) => block.isCentralCore);
  if (!core) throw new Error("missing central core");
  const basis = structuredClone(core);
  const bonusBlock = (id: string, bonusCorners: boolean[], iceValue: "none" | "high" = "none") => ({
    ...structuredClone(basis),
    id,
    name: id,
    isCentralCore: false,
    iceValue,
    iceFaces: iceValue === "high" ? [1, 2, 3, 4, 5, 6] : [],
    edges: [true, true, true, true, true, true],
    boundarySpaces: [["a"], ["a"], ["a"], ["a"], ["a"], ["a"]],
    bonusCorners,
    bonusFragments: bonusCorners.filter(Boolean).length,
    spaces: [{ id: "a", type: "special", zoneIds: ["h1"], capacity: "unlimited", neighbors: [] }],
  });
  data.blocks.push(
    bonusBlock("bonus-a", [false, true, false, false, false, false]),
    bonusBlock("bonus-b", [false, false, false, true, false, false]),
    bonusBlock("bonus-c", [false, false, false, false, false, true], "high"),
  );
  data.cards.push({ id: "bonus-cost-card", name: "Bonus Cost Card", attach: { as: "pawn", slot: "gadget", cost: 1 } });
  return data;
}

function bonusGame() {
  const data = bonusFixtureData();
  const cfg: Config = { data, playerNames: ["A", "B"], seed: 7 };
  const state = newGame(cfg);
  placeBlock(state, { q: 0, r: 0 }, 5, data, "bonus-a", 0);
  placeBlock(state, { q: 0, r: 0 }, 0, data, "bonus-b", 0);
  const player = state.players[0]!;
  const scout = state.cybernet.pawnById(player.pawnId)!;
  scout.coord = { q: 0, r: 1 };
  scout.spaceId = "a";
  state.cybernet.at({ q: 0, r: 1 })!.ownerId = player.id;
  state.cybernet.at({ q: 1, r: 0 })!.ownerId = player.id;
  player.controlMarkersPlaced = 2;
  state.blockPile = ["bonus-c"];
  return { data, state, player, scout };
}

describe("bonus icons", () => {
  test("Search creates a bonus icon and Icebreak collects it exactly once", () => {
    const { data, state, player, scout } = bonusGame();

    const placed = search(state, data, scout.pawnId, 0, 0);
    expect(placed.coord).toEqual({ q: 1, r: 1 });
    expect(state.cybernet.bonusIcons).toHaveLength(1);
    expect(state.cybernet.bonusIcons[0]!.coords).toEqual([
      { q: 0, r: 1 },
      { q: 1, r: 0 },
      { q: 1, r: 1 },
    ]);
    expect(state.cybernet.bonusIcons[0]!.collectedBy).toBeUndefined();

    scout.coord = { q: 1, r: 1 };
    const result = icebreakBlock(state, data, scout.pawnId, { q: 1, r: 1 });
    expect(result.success).toBe(true);
    expect(player.bonusCounters).toBe(1);
    expect(state.cybernet.bonusIcons[0]!.collectedBy).toBe(player.id);

    expect(collectControlledBonusIcons(state, player.id)).toEqual([]);
    expect(player.bonusCounters).toBe(1);
  });

  test("board-earned bonus counters can immediately pay attachment costs", () => {
    const { data, state, player, scout } = bonusGame();

    search(state, data, scout.pawnId, 0, 0);
    scout.coord = { q: 1, r: 1 };
    icebreakBlock(state, data, scout.pawnId, { q: 1, r: 1 });
    expect(player.bonusCounters).toBe(1);

    player.hand = ["bonus-cost-card"];
    attachToPawn(state, data, player.id, "bonus-cost-card", scout.pawnId);
    expect(player.bonusCounters).toBe(0);
    expect(state.cybernet.pawnById(scout.pawnId)!.attachments?.[0]?.bonusPaid).toBe(1);
  });
});
