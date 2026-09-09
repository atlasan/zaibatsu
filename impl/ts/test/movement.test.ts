import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import { blockById, type GameData } from "../src/domain/types.ts";
import { neighbor, opposite, type Coord } from "../src/domain/hex.ts";
import { UNLIMITED, spaceCapacity, spaceCapacityFor } from "../src/domain/pawn_board.ts";
import { newRng } from "../src/domain/rng.ts";
import {
  applyAction,
  canActivateMovement,
  canActivateMovementOption,
  canEndOn,
  effectiveMovementOptions,
  movementUsedKey,
  moveHex,
  moveHexWithOption,
  moveStep,
  moveSteps,
  moveStepsWithOption,
  newGame,
  placeBlock,
  resolveSteps,
  stepTargets,
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
    expect(spaceCapacityFor({ id: "wide", type: "normal", capacity: 3 })).toBe(3);
    expect(spaceCapacityFor({ id: "open", type: "normal", capacity: "unlimited" })).toBe(UNLIMITED);
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

  test("granted movement options expose their own activation mode", () => {
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
    const pawn: Pawn = { id: "x", name: "x", expansion: "speedrunners", class: ["operative"], defense: [], movement: { type: "steps", activation: "none" } };
    const options = effectiveMovementOptions(
      {
        ...data,
        cards: [
          ...data.cards,
          { id: "grant-move", name: "Grant Move", attach: { as: "pawn", grantsMovement: [{ type: "fixed", amount: 2 }], abilityUses: [{ ability: "move", activation: "once-per-turn" }] } },
        ],
      },
      pawn,
      [{ cardId: "grant-move" }],
    );
    expect(options.length).toBe(2);
    expect(canActivateMovementOption({} as never, p, "x", options[1]!)).toBeUndefined();
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

describe("moveStep (intra-block + capacity)", () => {
  test("steps between neighbouring spaces; rejects non-adjacent and full", () => {
    const s = game(1);
    const dir = 2;
    placeBlock(s, ORIGIN, dir, data, "data-haven", rotFacing("data-haven", dir));
    const coord = neighbor(ORIGIN, dir);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a" });

    moveStep(s, data, "speedrunner-red", coord, "b");
    expect(s.cybernet.pawnById("speedrunner-red")!.spaceId).toBe("b");
    expect(() => moveStep(s, data, "speedrunner-red", coord, "zzz")).toThrow();

    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord, spaceId: "a" });
    expect(() => moveStep(s, data, "speedrunner-red", coord, "a")).toThrow();
  });
});

describe("stepTargets (cross-edge + direction)", () => {
  test("cross-edge hop respects rotation and a direction restriction", () => {
    const d = loadDefault("speedrunners");
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    const dh = blockById(d, "data-haven")!;
    dh.boundarySpaces = [["b"], [], [], [], [], []]; // local edge 0 -> space b
    const c0: Coord = { q: 0, r: 0 };
    const c1 = neighbor(c0, 0);
    s.cybernet.blocks = [
      { blockId: "data-haven", rotation: 0, coord: c0 },
      { blockId: "data-haven", rotation: 3, coord: c1 },
    ];
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: c0, spaceId: "b" });

    const has = (c: Coord, id: string) =>
      stepTargets(d, s.cybernet, c0, "b").some((t) => t.coord.q === c.q && t.coord.r === c.r && t.spaceId === id);
    expect(has(c1, "b")).toBe(true);

    dh.spaces!.find((sp) => sp.id === "b")!.direction = 2; // restrict exit to edge 2
    expect(has(c1, "b")).toBe(false);
  });
});

describe("moveSteps (budget + pass-through)", () => {
  test("passes a full intermediate space, ends where capacity permits, respects budget", () => {
    const s = game(1);
    const dir = 2;
    placeBlock(s, ORIGIN, dir, data, "data-haven", rotFacing("data-haven", dir));
    const coord = neighbor(ORIGIN, dir);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "b" });
    const pawn = data.pawns.find((p) => p.id === "speedrunner-red")!;
    pawn.movement = { type: "steps", steps: 2, activation: "card" };

    // A blocker fills space a (cap 1); the pawn passes through a and ends on b.
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord, spaceId: "a" });
    moveSteps(s, data, "speedrunner-red", [{ coord, spaceId: "a" }, { coord, spaceId: "b" }]);
    expect(s.cybernet.pawnById("speedrunner-red")!.spaceId).toBe("b");

    // A path longer than the budget is rejected.
    pawn.movement.steps = 1;
    expect(() => moveSteps(s, data, "speedrunner-red", [{ coord, spaceId: "a" }, { coord, spaceId: "b" }])).toThrow();
  });

  test("via the action reducer", () => {
    const s = game(1);
    const dir = 2;
    placeBlock(s, ORIGIN, dir, data, "data-haven", rotFacing("data-haven", dir));
    const coord = neighbor(ORIGIN, dir);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a" });
    data.pawns.find((p) => p.id === "speedrunner-red")!.movement = { type: "steps", steps: 1, activation: "card" };
    applyAction(s, data, { type: "move-steps", pawnId: "speedrunner-red", path: [{ coord, spaceId: "b" }] });
    expect(s.cybernet.pawnById("speedrunner-red")!.spaceId).toBe("b");
  });

  test("attachment-granted step movement executes through an explicit movement option", () => {
    const d = structuredClone(data);
    d.cards.push({
      id: "grant-steps",
      name: "Grant Steps",
      attach: { as: "pawn", grantsMovement: [{ type: "fixed", amount: 2 }], abilityUses: [{ ability: "move", activation: "card" }] },
    });
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    const dir = 2;
    placeBlock(s, ORIGIN, dir, d, "data-haven", rotFacing("data-haven", dir));
    const coord = neighbor(ORIGIN, dir);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a", attachments: [{ cardId: "grant-steps", slot: "gadget", bonusPaid: 0 }] });
    d.pawns.find((p) => p.id === "speedrunner-red")!.movement = { type: "steps", steps: 0, activation: "none" };

    moveStepsWithOption(s, d, "speedrunner-red", [{ coord, spaceId: "b" }], 1);
    expect(s.cybernet.pawnById("speedrunner-red")!.spaceId).toBe("b");
  });

  test("move action selects a granted movement option explicitly", () => {
    const d = structuredClone(data);
    d.cards.push({
      id: "grant-steps",
      name: "Grant Steps",
      attach: { as: "pawn", grantsMovement: [{ type: "fixed", amount: 2 }], abilityUses: [{ ability: "move", activation: "card" }] },
    });
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    const dir = 2;
    placeBlock(s, ORIGIN, dir, d, "data-haven", rotFacing("data-haven", dir));
    const coord = neighbor(ORIGIN, dir);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a", attachments: [{ cardId: "grant-steps", slot: "gadget", bonusPaid: 0 }] });
    d.pawns.find((p) => p.id === "speedrunner-red")!.movement = { type: "steps", steps: 0, activation: "none" };

    applyAction(s, d, { type: "move-steps", pawnId: "speedrunner-red", movementIndex: 1, path: [{ coord, spaceId: "b" }] });
    expect(s.cybernet.pawnById("speedrunner-red")!.spaceId).toBe("b");
  });
});

describe("attachment-granted hex movement", () => {
  test("uses the granted once-per-turn option and tracks its own marker", () => {
    const d = structuredClone(data);
    d.cards.push({
      id: "grant-hex",
      name: "Grant Hex",
      attach: { as: "pawn", grantsMovement: [{ type: "hex" }], abilityUses: [{ ability: "move", activation: "once-per-turn" }] },
    });
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    placeBlock(s, ORIGIN, 2, d, "data-haven", rotFacing("data-haven", 2));
    const pawnId = s.players[0]!.pawnId;
    const pob = s.cybernet.pawnById(pawnId)!;
    pob.attachments = [{ cardId: "grant-hex", slot: "gadget", bonusPaid: 0 }];
    d.pawns.find((p) => p.id === pawnId)!.movement = { type: "steps", steps: 0, activation: "none" };

    moveHexWithOption(s, d, pawnId, 2, 1);
    expect(s.players.find((p) => p.id === "p1")!.oncePerTurnUsed[movementUsedKey(pawnId, "0:0")]).toBe(true);
    expect(() => moveHexWithOption(s, d, pawnId, 2, 1)).toThrow();
  });
});

describe("attachment-granted limited uses", () => {
  test("perTurn uses allow several granted moves in the same turn", () => {
    const d = structuredClone(data);
    d.cards.push({
      id: "grant-per-turn",
      name: "Grant Per Turn",
      attach: { as: "pawn", grantsMovement: [{ type: "fixed", amount: 1 }], abilityUses: [{ ability: "move", perTurn: 2 }] },
    });
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    const dir = 2;
    placeBlock(s, ORIGIN, dir, d, "data-haven", rotFacing("data-haven", dir));
    const coord = neighbor(ORIGIN, dir);
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a", attachments: [{ cardId: "grant-per-turn", slot: "gadget", bonusPaid: 0 }] });
    d.pawns.find((p) => p.id === "speedrunner-red")!.movement = { type: "steps", steps: 0, activation: "none" };

    moveStepsWithOption(s, d, "speedrunner-red", [{ coord, spaceId: "b" }], 1);
    moveStepsWithOption(s, d, "speedrunner-red", [{ coord, spaceId: "a" }], 1);
    expect(() => moveStepsWithOption(s, d, "speedrunner-red", [{ coord, spaceId: "b" }], 1)).toThrow();
  });

  test("d6 uses are rolled once per turn and consumed across activations", () => {
    const setup = () => {
      const d = structuredClone(data);
      d.cards.push({
        id: "grant-d6-uses",
        name: "Grant D6 Uses",
        attach: { as: "pawn", grantsMovement: [{ type: "hex" }], abilityUses: [{ ability: "move", dice: "d6" }] },
      });
      const s = newGame({ data: d, playerNames: ["A", "B"], seed: 7 });
      placeBlock(s, ORIGIN, 2, d, "data-haven", rotFacing("data-haven", 2));
      const pawnId = s.players[0]!.pawnId;
      const pob = s.cybernet.pawnById(pawnId)!;
      pob.attachments = [{ cardId: "grant-d6-uses", slot: "gadget", bonusPaid: 0 }];
      d.pawns.find((p) => p.id === pawnId)!.movement = { type: "steps", steps: 0, activation: "none" };
      return { s, d, pawnId };
    };

    const run = () => {
      const { s, d, pawnId } = setup();
      let uses = 0;
      while (true) {
        const pob = s.cybernet.pawnById(pawnId)!;
        const dir = pob.coord.q === 0 && pob.coord.r === 0 ? 2 : 5;
        try {
          moveHexWithOption(s, d, pawnId, dir, 1);
          uses++;
        } catch {
          return uses;
        }
      }
    };

    const uses = run();
    expect(uses).toBeGreaterThanOrEqual(1);
    expect(uses).toBeLessThanOrEqual(6);
    expect(run()).toBe(uses);
  });
});

describe("boundarySpaces derivation", () => {
  test("derived on load from open edges + zoneIds", () => {
    const d = loadDefault("speedrunners");
    const b = blockById(d, "data-haven")!;
    // edges [T,F,T,T,F,T]; space b owns h2,h3 -> boundary on edge 0 (h3) and 5 (h2).
    expect(b.boundarySpaces).toEqual([["b"], [], [], [], [], ["b"]]);
  });
});
