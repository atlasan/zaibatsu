import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import { blockById, type Block, type GameData } from "../src/domain/types.ts";
import { neighbor, opposite, type Coord } from "../src/domain/hex.ts";
import {
  canPlace,
  edgeHasSpace,
  newGame,
  placeBlock,
  validPlacements,
} from "../src/engine/index.ts";

const data: GameData = loadDefault("speedrunners");
const ORIGIN: Coord = { q: 0, r: 0 };

function game(seed = 1) {
  return newGame({ data, playerNames: ["A", "B"], seed });
}

// Finds a rotation giving blockId a connecting space toward the reference across
// direction dir (i.e. on the block's edge facing back).
function rotFacing(blockId: string, dir: number): number {
  const b = blockById(data, blockId)!;
  for (let rot = 0; rot < 6; rot++) {
    if (edgeHasSpace(b, rot, opposite(dir))) return rot;
  }
  throw new Error(`block ${blockId} cannot face direction ${dir}`);
}

describe("setup", () => {
  test("places the Central Core at the origin", () => {
    const s = game();
    expect(s.cybernet.blocks.length).toBe(1);
    const core = s.cybernet.at(ORIGIN);
    expect(core).toBeDefined();
    const def = blockById(data, core!.blockId)!;
    expect(def.isCentralCore).toBe(true);
  });
});

describe("edgeHasSpace", () => {
  test("respects rotation", () => {
    const b: Block = {
      id: "x",
      name: "x",
      expansion: "speedrunners",
      edges: [true, false, false, false, false, false],
    };
    expect(edgeHasSpace(b, 0, 0)).toBe(true);
    expect(edgeHasSpace(b, 0, 1)).toBe(false);
    expect(edgeHasSpace(b, 2, 2)).toBe(true);
    expect(edgeHasSpace(b, 2, 0)).toBe(false);
  });
});

describe("canPlace", () => {
  test("rejects an occupied target cell", () => {
    const s = game();
    placeBlock(s, ORIGIN, 0, data, "data-haven", rotFacing("data-haven", 0));
    expect(canPlace(s.cybernet, data, ORIGIN, 0, "firewall-node", 0)).toBeDefined();
  });

  test("rejects an unconnected orientation", () => {
    const s = game();
    const b = blockById(data, "data-haven")!;
    let badRot = -1;
    for (let rot = 0; rot < 6; rot++) {
      if (!edgeHasSpace(b, rot, opposite(0))) {
        badRot = rot;
        break;
      }
    }
    expect(badRot).toBeGreaterThanOrEqual(0);
    expect(canPlace(s.cybernet, data, ORIGIN, 0, "data-haven", badRot)).toBeDefined();
  });
});

describe("placeBlock", () => {
  test("places and occupies the neighbor cell", () => {
    const s = game();
    const rot = rotFacing("data-haven", 2);
    const pb = placeBlock(s, ORIGIN, 2, data, "data-haven", rot);
    const want = neighbor(ORIGIN, 2);
    expect(pb.coord).toEqual(want);
    expect(s.cybernet.at(want)).toBeDefined();
    expect(s.cybernet.blocks.length).toBe(2);
  });
});

describe("validPlacements", () => {
  test("returns only valid options around the core", () => {
    const s = game();
    const opts = validPlacements(s.cybernet, data, ORIGIN, "data-haven");
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(canPlace(s.cybernet, data, ORIGIN, o.dir, "data-haven", o.rotation)).toBeUndefined();
    }
  });
});

describe("hex geometry", () => {
  test("neighbor then opposite round-trips", () => {
    const c: Coord = { q: 3, r: -2 };
    for (let dir = 0; dir < 6; dir++) {
      expect(neighbor(neighbor(c, dir), opposite(dir))).toEqual(c);
    }
  });
});
