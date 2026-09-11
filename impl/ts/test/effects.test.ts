import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import { blockById, type DefenseDie, type GameData } from "../src/domain/types.ts";
import { neighbor, opposite } from "../src/domain/hex.ts";
import { newGame, placeBlock, applyBlockEffectForTrigger, applyBlockEffect, icebreakBlock } from "../src/engine/index.ts";

const ORIGIN = { q: 0, r: 0 };

function allFacesDefense(): DefenseDie[] {
  return [1, 2, 3, 4, 5, 6].map((value) => ({ value, shielded: false }));
}

function effectData(): GameData {
  const d = structuredClone(loadDefault("speedrunners"));
  d.pawns = d.pawns.map((pawn) =>
    pawn.id === "speedrunner-yellow" ? { ...pawn, defense: allFacesDefense() } : pawn
  );
  d.blocks = d.blocks.map((block) =>
    block.id === "data-haven"
      ? {
        ...block,
        effects: {
          inCybernet: { kind: "area-attack", amount: 1 },
          underControl: { kind: "area-attack", amount: 1 },
        },
      }
      : block
  );
  return d;
}

function rotFacing(data: GameData, blockId: string, dir: number): number {
  const b = blockById(data, blockId)!;
  for (let rot = 0; rot < 6; rot++) {
    const local = (((opposite(dir) - rot) % 6) + 6) % 6;
    if (b.edges![local]) return rot;
  }
  throw new Error(`block ${blockId} cannot face direction ${dir}`);
}

describe("block effects", () => {
  test("typed area-attack effects resolve against every pawn on the block", () => {
    const d = effectData();
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    placeBlock(s, ORIGIN, 0, d, "data-haven", rotFacing(d, "data-haven", 0));
    const coord = neighbor(ORIGIN, 0);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a" });
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord, spaceId: "a" });

    const res = applyBlockEffect(s, d, coord, { kind: "area-attack", amount: 1 })!;

    expect(res.kind).toBe("area-attack");
    expect(res.result.targets.map((target) => target.targetPawnId)).toEqual(["speedrunner-red", "speedrunner-yellow"]);
    expect(s.cybernet.pawnById("speedrunner-yellow")).toBeUndefined();
  });

  test("trigger lookup reads the placed block's typed effect", () => {
    const d = effectData();
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    placeBlock(s, ORIGIN, 0, d, "data-haven", rotFacing(d, "data-haven", 0));
    const coord = neighbor(ORIGIN, 0);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a" });
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord, spaceId: "a" });

    const res = applyBlockEffectForTrigger(s, d, coord, "inCybernet");

    expect(res?.kind).toBe("area-attack");
    expect(s.cybernet.pawnById("speedrunner-yellow")).toBeUndefined();
  });

  test("under-control place-pawn effects place the authored pawn on successful Icebreak", () => {
    const d = structuredClone(loadDefault("speedrunners"));
    d.blocks = d.blocks.map((block) => (
      block.id === "idoru" ? { ...block, iceFaces: [1, 2, 3, 4, 5, 6] } : block
    ));
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    placeBlock(s, ORIGIN, 0, d, "idoru", rotFacing(d, "idoru", 0));
    const coord = neighbor(ORIGIN, 0);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a" });

    const res = icebreakBlock(s, d, "speedrunner-red", coord);

    expect(res.success).toBe(true);
    expect(s.cybernet.at(coord)?.ownerId).toBe("p1");
    expect(s.cybernet.pawnById("idoru")).toEqual(expect.objectContaining({ ownerId: "p1", coord }));
  });
});
