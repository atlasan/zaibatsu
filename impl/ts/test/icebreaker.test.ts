import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import type { GameData, GameState } from "../src/domain/types.ts";
import { neighbor, type Coord } from "../src/domain/hex.ts";
import {
  iceFaces,
  icebreakBlock,
  icebreakPawn,
  newGame,
  placeBlock,
} from "../src/engine/index.ts";
import { blockById } from "../src/domain/types.ts";

const data: GameData = loadDefault("speedrunners");
const ORIGIN: Coord = { q: 0, r: 0 };

function rotFacing(blockId: string, dir: number): number {
  const b = blockById(data, blockId)!;
  for (let rot = 0; rot < 6; rot++) {
    const local = (((((dir % 6) + 6 + 3) % 6) - rot) % 6 + 6) % 6;
    if (b.edges![local]) return rot;
  }
  throw new Error(`block ${blockId} cannot face direction ${dir}`);
}

function blockScenario(seed: number, blockId: string): { s: GameState; coord: Coord } {
  const s = newGame({ data, playerNames: ["A", "B"], seed });
  placeBlock(s, ORIGIN, 0, data, blockId, rotFacing(blockId, 0));
  const coord = neighbor(ORIGIN, 0);
  s.cybernet.pawns = [];
  s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a" });
  return { s, coord };
}

describe("iceFaces", () => {
  test("counts by category", () => {
    expect(iceFaces("none")).toEqual([]);
    expect(iceFaces(undefined)).toEqual([]);
    expect(iceFaces("low").length).toBe(3);
    expect(iceFaces("medium").length).toBe(2);
    expect(iceFaces("high").length).toBe(1);
    expect(iceFaces("black").length).toBe(1);
  });
});

describe("icebreakBlock", () => {
  test("gains control and places a marker on success", () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const { s, coord } = blockScenario(seed, "data-haven");
      const before = s.players.find((p) => p.id === "p1")!.controlMarkersPlaced;
      const res = icebreakBlock(s, data, "speedrunner-red", coord, 0);
      if (res.success) {
        found = true;
        expect(s.cybernet.at(coord)!.ownerId).toBe("p1");
        expect(s.players.find((p) => p.id === "p1")!.controlMarkersPlaced).toBe(before + 1);
      }
    }
    expect(found).toBe(true);
  });

  test("rejects an ICE-less block (Central Core)", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: ORIGIN, spaceId: "core" });
    expect(() => icebreakBlock(s, data, "speedrunner-red", ORIGIN, 0)).toThrow();
  });

  test("rejects a block we already control", () => {
    const { s, coord } = blockScenario(2, "data-haven");
    s.cybernet.at(coord)!.ownerId = "p1";
    expect(() => icebreakBlock(s, data, "speedrunner-red", coord, 0)).toThrow();
  });

  test("stealing returns the previous controller's marker", () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const { s, coord } = blockScenario(seed, "data-haven");
      const pb = s.cybernet.at(coord)!;
      pb.ownerId = "p2";
      const p2 = s.players.find((p) => p.id === "p2")!;
      p2.controlMarkersPlaced = 1;
      const res = icebreakBlock(s, data, "speedrunner-red", coord, 0);
      if (res.success) {
        found = true;
        expect(pb.ownerId).toBe("p1");
        expect(p2.controlMarkersPlaced).toBe(0);
        expect(s.players.find((p) => p.id === "p1")!.controlMarkersPlaced).toBe(1);
      }
    }
    expect(found).toBe(true);
  });

  test("Black ICE eliminates the attacker on failure", () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const { s, coord } = blockScenario(seed, "server-farm");
      const res = icebreakBlock(s, data, "speedrunner-red", coord, 0);
      if (!res.success) {
        found = true;
        expect(res.attackerEliminated).toBe(true);
        expect(s.cybernet.pawnById("speedrunner-red")).toBeUndefined();
      }
    }
    expect(found).toBe(true);
  });

  test("deterministic roll", () => {
    const run = () => icebreakBlock(blockScenario(5, "data-haven").s, data, "speedrunner-red", neighbor(ORIGIN, 0), 0).roll;
    expect(run()).toEqual(run());
  });
});

describe("icebreakPawn", () => {
  test("changes owner on success", () => {
    let found = false;
    for (let seed = 1; seed <= 80 && !found; seed++) {
      const s = newGame({ data, playerNames: ["A", "B"], seed });
      s.cybernet.pawns = [];
      s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: ORIGIN, spaceId: "core" });
      s.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p2", coord: ORIGIN, spaceId: "core" });
      const res = icebreakPawn(s, data, "speedrunner-red", "drone-turret", 0);
      if (res.success) {
        found = true;
        expect(s.cybernet.pawnById("drone-turret")!.ownerId).toBe("p1");
      }
    }
    expect(found).toBe(true);
  });

  test("rejects an ICE-less pawn and self", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 2 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: ORIGIN, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: "p2", coord: ORIGIN, spaceId: "core" });
    expect(() => icebreakPawn(s, data, "speedrunner-red", "speedrunner-blue", 0)).toThrow();
    expect(() => icebreakPawn(s, data, "speedrunner-red", "speedrunner-red", 0)).toThrow();
  });
});
