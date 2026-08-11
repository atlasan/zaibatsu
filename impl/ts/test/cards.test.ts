import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import { blockById, type GameData, type GameState } from "../src/domain/types.ts";
import { opposite, type Coord } from "../src/domain/hex.ts";
import {
  newGame,
  playDelete,
  playReboot,
  playSearch,
} from "../src/engine/index.ts";

const data: GameData = loadDefault("speedrunners");
const ORIGIN: Coord = { q: 0, r: 0 };

function game(seed: number): GameState {
  return newGame({ data, playerNames: ["A", "B"], seed });
}

function rotFacing(blockId: string, dir: number): number {
  const b = blockById(data, blockId)!;
  for (let rot = 0; rot < 6; rot++) {
    const local = (((opposite(dir) - rot) % 6) + 6) % 6;
    if (b.edges![local]) return rot;
  }
  throw new Error(`block ${blockId} cannot face direction ${dir}`);
}

function twoPawns(s: GameState, attackerOwner = "p1") {
  s.cybernet.pawns = [];
  s.cybernet.placePawn({ pawnId: "speedrunner-green", ownerId: attackerOwner, coord: { ...ORIGIN }, spaceId: "core" });
  s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
}

describe("playDelete", () => {
  test("consumes the card and resolves (eliminates on hit)", () => {
    let found = false;
    for (let seed = 1; seed <= 50 && !found; seed++) {
      const s = game(seed);
      twoPawns(s);
      const p1 = s.players.find((p) => p.id === "p1")!;
      p1.hand = ["move-1", "move-2"];
      const before = s.discard.length;
      const res = playDelete(s, data, "p1", "move-1", "speedrunner-green", "speedrunner-yellow", 0);
      expect(p1.hand.includes("move-1")).toBe(false);
      expect(s.discard.length).toBe(before + 1);
      if (res.eliminated) {
        found = true;
        expect(s.cybernet.pawnById("speedrunner-yellow")).toBeUndefined();
      }
    }
    expect(found).toBe(true);
  });

  test("rejects a card not in hand", () => {
    const s = game(1);
    twoPawns(s);
    s.players.find((p) => p.id === "p1")!.hand = ["move-2"];
    expect(() => playDelete(s, data, "p1", "move-1", "speedrunner-green", "speedrunner-yellow", 0)).toThrow();
  });

  test("rejects a card that cannot activate Delete, without consuming it", () => {
    const s = game(1);
    twoPawns(s);
    const p1 = s.players.find((p) => p.id === "p1")!;
    p1.hand = ["armor-brainchip"]; // activates only icebreaker
    expect(() => playDelete(s, data, "p1", "armor-brainchip", "speedrunner-green", "speedrunner-yellow", 0)).toThrow();
    expect(p1.hand.includes("armor-brainchip")).toBe(true);
  });

  test("rejects using an opponent's pawn", () => {
    const s = game(1);
    twoPawns(s, "p2"); // attacker owned by p2
    s.players.find((p) => p.id === "p1")!.hand = ["move-1"];
    expect(() => playDelete(s, data, "p1", "move-1", "speedrunner-green", "speedrunner-yellow", 0)).toThrow();
  });
});

describe("playSearch", () => {
  test("discards the card and places the top block", () => {
    const s = game(1);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.blockPile = ["data-haven"];
    const p1 = s.players.find((p) => p.id === "p1")!;
    p1.hand = ["move-1", "move-2"];
    const dir = 2;
    const pb = playSearch(s, data, "p1", "move-1", "speedrunner-red", dir, rotFacing("data-haven", dir));
    expect(pb.blockId).toBe("data-haven");
    expect(p1.hand.includes("move-1")).toBe(false);
    expect(s.blockPile.length).toBe(0);
  });
});

describe("playReboot", () => {
  test("needs exactly four cards", () => {
    const s = game(1);
    s.eliminated = ["speedrunner-red"];
    s.players.find((p) => p.id === "p1")!.hand = ["move-1", "move-2", "move-3"];
    expect(() => playReboot(s, data, "p1", ["move-1", "move-2", "move-3"], "speedrunner-red")).toThrow();
  });

  test("consumes four cards and returns the pawn to the core", () => {
    const s = game(1);
    s.cybernet.removePawn("speedrunner-red");
    s.eliminated = ["speedrunner-red"];
    const p1 = s.players.find((p) => p.id === "p1")!;
    p1.hand = ["move-1", "move-2", "move-3", "add-on-accelerator", "weapon-gunhed"];
    const before = s.discard.length;
    const pob = playReboot(s, data, "p1", ["move-1", "move-2", "move-3", "add-on-accelerator"], "speedrunner-red");
    expect(pob.coord).toEqual(ORIGIN);
    expect(pob.ownerId).toBe("p1");
    expect(p1.hand).toEqual(["weapon-gunhed"]);
    expect(s.discard.length).toBe(before + 4);
    expect(s.eliminated.length).toBe(0);
  });

  test("rejects cards not held", () => {
    const s = game(1);
    s.eliminated = ["speedrunner-red"];
    s.players.find((p) => p.id === "p1")!.hand = ["move-1", "move-2"];
    expect(() => playReboot(s, data, "p1", ["move-1", "move-2", "move-3", "move-3"], "speedrunner-red")).toThrow();
  });
});
