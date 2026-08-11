import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import { blockById, type GameData } from "../src/domain/types.ts";
import { neighbor, opposite, type Coord } from "../src/domain/hex.ts";
import { UNLIMITED, spaceCapacity } from "../src/domain/pawn_board.ts";
import { newRng } from "../src/domain/rng.ts";
import {
  canActivateMovement,
  canEndOn,
  movementUsedKey,
  moveHex,
  newGame,
  placeBlock,
  resolveSteps,
} from "../src/engine/index.ts";
import type { Player, Pawn } from "../src/domain/types.ts";

const data: GameData = loadDefault("speedrunners");
const ORIGIN: Coord = { q: 0, r: 0 };

function game(seed = 1) {
  return newGame({ data, playerNames: ["A", "B"], seed });
}

function rotFacing(blockId: string, dir: number): number {
  const b = blockById(data, blockId)!;
  for (let rot = 0; rot < 6; rot++) {
    const edges = b.edges!;
    const local = (((opposite(dir) - rot) % 6) + 6) % 6;
    if (edges[local]) return rot;
  }
  throw new Error(`block ${blockId} cannot face direction ${dir}`);
}

describe("setup", () => {
  test("places both players' pawns on the core", () => {
    const s = game();
    expect(s.cybernet.pawns.length).toBe(2);
    for (const p of s.players) {
      const pob = s.cybernet.pawnById(p.pawnId)!;
      expect(pob.coord).toEqual(ORIGIN);
      expect(pob.ownerId).toBe(p.id);
    }
  });
});

describe("space capacity", () => {
  test("by type", () => {
    expect(spaceCapacity("normal")).toBe(1);
    expect(spaceCapacity("effect")).toBe(1);
    expect(spaceCapacity("double")).toBe(2);
    expect(spaceCapacity("special")).toBe(UNLIMITED);
    expect(spaceCapacity("pawn")).toBe(UNLIMITED);
  });
});

describe("resolveSteps", () => {
  test("fixed, modifier, clamp, hex", () => {
    const rng = newRng(1);
    expect(resolveSteps({ type: "steps", steps: 3, activation: "card" }, rng, 0)).toBe(3);
    expect(resolveSteps({ type: "steps", steps: 3, activation: "card" }, rng, 1)).toBe(4);
    expect(resolveSteps({ type: "steps", steps: 1, activation: "card" }, rng, -5)).toBe(0);
    expect(resolveSteps({ type: "hex", activation: "once-per-turn" }, rng, 0)).toBe(1);
  });

  test("dice stay in range", () => {
    const rng = newRng(2);
    for (let i = 0; i < 200; i++) {
      const d1 = resolveSteps({ type: "d6", activation: "once-per-turn" }, rng, 0);
      expect(d1).toBeGreaterThanOrEqual(1);
      expect(d1).toBeLessThanOrEqual(6);
      const d2 = resolveSteps({ type: "2d6", activation: "once-per-turn" }, rng, 0);
      expect(d2).toBeGreaterThanOrEqual(2);
      expect(d2).toBeLessThanOrEqual(12);
    }
  });

  test("deterministic sequence", () => {
    const seq = () => {
      const rng = newRng(99);
      return Array.from({ length: 5 }, () =>
        resolveSteps({ type: "d6", activation: "once-per-turn" }, rng, 0),
      );
    };
    expect(seq()).toEqual(seq());
  });
});

describe("canActivateMovement", () => {
  test("none / card / once-per-turn", () => {
    const p: Player = {
      id: "p1",
      name: "A",
      color: "red",
      pawnId: "x",
      controlMarkersTotal: 10,
      controlMarkersPlaced: 0,
      bonusCounters: 0,
      hand: [],
      maxHandSize: 5,
      oncePerTurnUsed: {},
    };
    const none: Pawn = { id: "x", name: "x", expansion: "speedrunners", class: ["operative"], defense: [], movement: { type: "steps", activation: "none" } };
    const card: Pawn = { ...none, movement: { type: "steps", activation: "card" } };
    const opt: Pawn = { id: "y", name: "y", expansion: "speedrunners", class: ["operative"], defense: [], movement: { type: "hex", activation: "once-per-turn" } };
    expect(canActivateMovement(p, none)).toBeDefined();
    expect(canActivateMovement(p, card)).toBeUndefined();
    expect(canActivateMovement(p, opt)).toBeUndefined();
    p.oncePerTurnUsed[movementUsedKey("y")] = true;
    expect(canActivateMovement(p, opt)).toBeDefined();
  });
});

// Builds a game, places a block adjacent to the core, and puts a controlled
// hex-movement pawn on the core.
function hexScenario(dir = 2) {
  const s = game(1);
  placeBlock(s, ORIGIN, dir, data, "data-haven", rotFacing("data-haven", dir));
  const owner = s.players[0]!;
  // Repoint one of the owner's board pawns to the hex pawn (speedrunner-yellow).
  const pob = s.cybernet.pawns.find((p) => p.ownerId === owner.id)!;
  pob.pawnId = "speedrunner-yellow";
  pob.coord = { ...ORIGIN };
  pob.spaceId = "core";
  return { s, owner, dir, pawnId: "speedrunner-yellow" };
}

describe("moveHex", () => {
  test("moves onto an adjacent placed block", () => {
    const { s, dir, pawnId } = hexScenario();
    const pob = moveHex(s, data, pawnId, dir);
    expect(pob.coord).toEqual(neighbor(ORIGIN, dir));
    expect(pob.spaceId).not.toBe("");
  });

  test("rejects moving onto an empty cell", () => {
    const { s, dir, pawnId } = hexScenario();
    expect(() => moveHex(s, data, pawnId, (dir + 3) % 6)).toThrow();
  });

  test("requires hex movement", () => {
    const { s, dir } = hexScenario();
    const pob = s.cybernet.pawnById("speedrunner-yellow")!;
    pob.pawnId = "speedrunner-red"; // 'steps' movement
    expect(() => moveHex(s, data, "speedrunner-red", dir)).toThrow();
  });

  test("records and enforces the once-per-turn marker", () => {
    const { s, owner, dir, pawnId } = hexScenario();
    moveHex(s, data, pawnId, dir);
    expect(owner.oncePerTurnUsed[movementUsedKey(pawnId)]).toBe(true);
    expect(() => moveHex(s, data, pawnId, dir)).toThrow();
  });
});

describe("canEndOn", () => {
  test("capacity is enforced; occupant may stay", () => {
    const s = game(4);
    const dir = 0;
    placeBlock(s, ORIGIN, dir, data, "data-haven", rotFacing("data-haven", dir));
    const target = neighbor(ORIGIN, dir);
    s.cybernet.placePawn({ pawnId: "ghost", ownerId: "p2", coord: target, spaceId: "a" });
    expect(canEndOn(data, s.cybernet, target, "a", "someone-else")).toBeDefined();
    expect(canEndOn(data, s.cybernet, target, "a", "ghost")).toBeUndefined();
    s.cybernet.placePawn({ pawnId: "g2", ownerId: "p2", coord: target, spaceId: "b" });
    expect(canEndOn(data, s.cybernet, target, "b", "newcomer")).toBeUndefined();
  });
});
