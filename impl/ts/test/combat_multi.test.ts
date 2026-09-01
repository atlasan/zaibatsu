import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import type { GameData, GameState } from "../src/domain/types.ts";
import { abilityUsedKey, defeats, deleteMulti, newGame } from "../src/engine/index.ts";

const data: GameData = loadDefault("speedrunners");
const ORIGIN = { q: 0, r: 0 };

function multiScenario(s: GameState) {
  s.cybernet.pawns = [];
  s.cybernet.placePawn({ pawnId: "speedrunner-green", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
  s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
  s.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
}

describe("deleteMulti", () => {
  test("rolls per skull and assigns one die per target in order", () => {
    let anyElim = false;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame({ data, playerNames: ["A", "B"], seed });
      multiScenario(s);
      const res = deleteMulti(s, data, "speedrunner-green", ["speedrunner-yellow", "speedrunner-blue"], 0);
      expect(res.roll.length).toBe(2);
      expect(res.targets.length).toBe(2);
      expect(res.targets[0]!.dice).toEqual([res.roll[0]!]);
      expect(res.targets[1]!.dice).toEqual([res.roll[1]!]);
      for (const tr of res.targets) {
        if (tr.eliminated) {
          anyElim = true;
          expect(s.cybernet.pawnById(tr.targetPawnId)).toBeUndefined();
        }
      }
    }
    expect(anyElim).toBe(true);
  });

  test("rejects more targets than skulls; +skull modifier allows it", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    expect(() => deleteMulti(s, data, "speedrunner-red", ["speedrunner-yellow", "speedrunner-blue"], 0)).toThrow();
    expect(() => deleteMulti(s, data, "speedrunner-red", ["speedrunner-yellow", "speedrunner-blue"], 1)).not.toThrow();
  });

  test("allows concentrating multiple dice on one target", () => {
    const yellowDefense = data.pawns.find((p) => p.id === "speedrunner-yellow")!.defense;
    let foundSeed = false;
    for (let seed = 1; seed <= 200; seed++) {
      const s = newGame({ data, playerNames: ["A", "B"], seed });
      multiScenario(s);
      const res = deleteMulti(s, data, "speedrunner-green", ["speedrunner-yellow", "speedrunner-yellow"], 0);
      expect(res.targets.length).toBe(1);
      expect(res.targets[0]!.targetPawnId).toBe("speedrunner-yellow");
      expect(res.targets[0]!.dice).toEqual([res.roll[0]!, res.roll[1]!]);
      if (!defeats([res.roll[0]!], yellowDefense) && defeats([res.roll[1]!], yellowDefense)) {
        expect(res.targets[0]!.eliminated).toBe(true);
        expect(s.cybernet.pawnById("speedrunner-yellow")).toBeUndefined();
        foundSeed = true;
        break;
      }
    }
    expect(foundSeed).toBe(true);
  });

  test("rejects self and non-co-located targets", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
    multiScenario(s);
    expect(() => deleteMulti(s, data, "speedrunner-green", ["speedrunner-green"], 0)).toThrow();
    s.cybernet.pawnById("speedrunner-yellow")!.coord = { q: 5, r: 0 };
    expect(() => deleteMulti(s, data, "speedrunner-green", ["speedrunner-yellow"], 0)).toThrow();
  });

  test("respects the once-per-turn gate", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    deleteMulti(s, data, "drone-turret", ["speedrunner-blue"], 0);
    expect(s.players.find((p) => p.id === "p1")!.oncePerTurnUsed[abilityUsedKey("delete", "drone-turret")]).toBe(true);
    if (s.cybernet.pawnById("speedrunner-blue")) {
      expect(() => deleteMulti(s, data, "drone-turret", ["speedrunner-blue"], 0)).toThrow();
    }
  });
});
