import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import type { DefenseDie, GameData, GameState } from "../src/domain/types.ts";
import type { Coord } from "../src/domain/hex.ts";
import type { PawnOnBoard } from "../src/domain/pawn_board.ts";
import { neighbor } from "../src/domain/hex.ts";
import { newRng } from "../src/domain/rng.ts";
import {
  abilityUsedKey,
  attackRoll,
  defeats,
  deleteAbility,
  deleteArea,
  newGame,
} from "../src/engine/index.ts";

const data: GameData = loadDefault("speedrunners");
const ORIGIN: Coord = { q: 0, r: 0 };

function game(seed: number) {
  return newGame({ data, playerNames: ["A", "B"], seed });
}

function bombData(): GameData {
  const cloned = structuredClone(data);
  cloned.pawns = cloned.pawns.map((pawn) =>
    pawn.id === "speedrunner-green" ? { ...pawn, class: [...pawn.class, "bomb"] } : pawn
  );
  return cloned;
}

function placeTwoPawns(
  s: GameState,
  coord: Coord,
  attackerId: string,
  targetId: string,
  attackerOwner: string,
) {
  s.cybernet.pawns = [];
  const a: PawnOnBoard = { pawnId: attackerId, ownerId: attackerOwner, coord: { ...coord }, spaceId: "core" };
  const t: PawnOnBoard = { pawnId: targetId, ownerId: "p2", coord: { ...coord }, spaceId: "core" };
  s.cybernet.placePawn(a);
  s.cybernet.placePawn(t);
}

describe("attackRoll", () => {
  test("count and range; clamp to one die", () => {
    const rng = newRng(7);
    for (let skulls = 1; skulls <= 4; skulls++) {
      const roll = attackRoll(rng, skulls);
      expect(roll.length).toBe(skulls);
      for (const v of roll) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(6);
      }
    }
    expect(attackRoll(rng, 0).length).toBe(1);
  });
});

describe("defeats", () => {
  test("unshielded match hits; shielded blocks", () => {
    const def: DefenseDie[] = [
      { value: 2, shielded: true },
      { value: 4, shielded: false },
    ];
    expect(defeats([4], def)).toBe(true);
    expect(defeats([2], def)).toBe(false);
    expect(defeats([1, 3, 5], def)).toBe(false);
    expect(defeats([1, 4], def)).toBe(true);
  });
});

describe("deleteAbility", () => {
  test("eliminates a vulnerable target for some seed", () => {
    let found = false;
    for (let seed = 1; seed <= 50 && !found; seed++) {
      const s = game(seed);
      placeTwoPawns(s, ORIGIN, "speedrunner-green", "speedrunner-yellow", "p1");
      const res = deleteAbility(s, data, "speedrunner-green", "speedrunner-yellow", 0);
      if (res.eliminated) {
        found = true;
        expect(s.cybernet.pawnById("speedrunner-yellow")).toBeUndefined();
        expect(s.eliminated).toEqual(["speedrunner-yellow"]);
      }
    }
    expect(found).toBe(true);
  });

  test("rejects self and non-co-located targets", () => {
    const s = game(2);
    placeTwoPawns(s, ORIGIN, "speedrunner-green", "speedrunner-yellow", "p1");
    expect(() => deleteAbility(s, data, "speedrunner-green", "speedrunner-green", 0)).toThrow();
    s.cybernet.pawnById("speedrunner-yellow")!.coord = neighbor(ORIGIN, 0);
    expect(() => deleteAbility(s, data, "speedrunner-green", "speedrunner-yellow", 0)).toThrow();
  });

  test("requires the Delete ability", () => {
    const s = game(3);
    placeTwoPawns(s, ORIGIN, "drone-turret", "speedrunner-yellow", "p1");
    // drone-turret has Delete -> allowed.
    expect(() => deleteAbility(s, data, "drone-turret", "speedrunner-yellow", 0)).not.toThrow();
  });

  test("once-per-turn gating", () => {
    const s = game(4);
    placeTwoPawns(s, ORIGIN, "drone-turret", "speedrunner-blue", "p1");
    deleteAbility(s, data, "drone-turret", "speedrunner-blue", 0);
    const owner = s.players.find((p) => p.id === "p1")!;
    expect(owner.oncePerTurnUsed[abilityUsedKey("delete", "drone-turret")]).toBe(true);
    if (s.cybernet.pawnById("speedrunner-blue")) {
      expect(() => deleteAbility(s, data, "drone-turret", "speedrunner-blue", 0)).toThrow();
    }
  });

  test("deterministic roll", () => {
    const run = () => {
      const s = game(123);
      placeTwoPawns(s, ORIGIN, "speedrunner-green", "speedrunner-yellow", "p1");
      return deleteAbility(s, data, "speedrunner-green", "speedrunner-yellow", 0).roll;
    };
    expect(run()).toEqual(run());
  });
});

describe("deleteArea", () => {
  test("requires a Bomb-class attacker", () => {
    const s = game(1);
    placeTwoPawns(s, ORIGIN, "speedrunner-green", "speedrunner-yellow", "p1");
    expect(() => deleteArea(s, data, "speedrunner-green", 0)).toThrow();
  });

  test("applies the same roll to every pawn in the attacker's block, including the attacker", () => {
    const d = bombData();
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 7 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-green", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });

    const res = deleteArea(s, d, "speedrunner-green", 0);
    expect(res.coord).toEqual(ORIGIN);
    expect(res.targets.map((t) => t.targetPawnId)).toEqual([
      "speedrunner-green",
      "speedrunner-yellow",
      "speedrunner-blue",
    ]);
    for (const target of res.targets) {
      const defense = d.pawns.find((p) => p.id === target.targetPawnId)!.defense;
      const expected = defeats(res.roll, defense);
      expect(target.eliminated).toBe(expected);
      expect(!!s.cybernet.pawnById(target.targetPawnId)).toBe(!expected);
    }
  });

  test("sets the once-per-turn gate for a Bomb-class attacker", () => {
    const d = bombData();
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 7 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    d.pawns = d.pawns.map((pawn) =>
      pawn.id === "drone-turret" ? { ...pawn, class: [...pawn.class, "bomb"] } : pawn
    );

    deleteArea(s, d, "drone-turret", 0);
    expect(s.players.find((p) => p.id === "p1")!.oncePerTurnUsed[abilityUsedKey("delete", "drone-turret")]).toBe(true);
  });
});

describe("ability removal via attachment", () => {
  test("an attachment that removes Delete blocks the attack", () => {
    const d = loadDefault("speedrunners");
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 3 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    d.cards[0].attach = { as: "pawn", slot: "add-on", removes: ["delete"] };
    s.cybernet.pawnById("drone-turret")!.attachments = [{ cardId: d.cards[0].id, slot: "add-on", bonusPaid: 0 }];
    expect(() => deleteAbility(s, d, "drone-turret", "speedrunner-yellow", 0)).toThrow();
  });

  test("defense override replaces the target's defense during Delete", () => {
    const vulnerable = [1, 2, 3, 4, 5, 6].map((value) => ({ value, shielded: false }));
    const armored = [1, 2, 3, 4, 5, 6].map((value) => ({ value, shielded: true }));

    const baselineData = loadDefault("speedrunners");
    baselineData.cards.push({
      id: "armor-override",
      name: "Armor Override",
      attach: { as: "pawn", slot: "armor", defenseOverride: armored },
    });
    baselineData.pawns = baselineData.pawns.map((pawn) =>
      pawn.id === "speedrunner-yellow" ? { ...pawn, defense: vulnerable } : pawn
    );

    const baseline = newGame({ data: baselineData, playerNames: ["A", "B"], seed: 17 });
    baseline.cybernet.pawns = [];
    baseline.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    baseline.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    expect(deleteAbility(baseline, baselineData, "drone-turret", "speedrunner-yellow", 0).eliminated).toBe(true);

    const armoredState = newGame({ data: baselineData, playerNames: ["A", "B"], seed: 17 });
    armoredState.cybernet.pawns = [];
    armoredState.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    armoredState.cybernet.placePawn({
      pawnId: "speedrunner-yellow",
      ownerId: "p2",
      coord: { ...ORIGIN },
      spaceId: "core",
      attachments: [{ cardId: "armor-override", slot: "armor", bonusPaid: 0 }],
    });
    expect(deleteAbility(armoredState, baselineData, "drone-turret", "speedrunner-yellow", 0).eliminated).toBe(false);
  });
});
