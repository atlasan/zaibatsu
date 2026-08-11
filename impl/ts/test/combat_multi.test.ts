import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import type { GameData, GameState } from "../src/domain/types.ts";
import { abilityUsedKey, deleteMulti, newGame } from "../src/engine/index.ts";

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
      expect(res.targets[0]!.die).toBe(res.roll[0]!);
      expect(res.targets[1]!.die).toBe(res.roll[1]!);
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

  test("rejects self, duplicate, and non-co-located targets", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
    multiScenario(s);
    expect(() => deleteMulti(s, data, "speedrunner-green", ["speedrunner-green"], 0)).toThrow();
    expect(() => deleteMulti(s, data, "speedrunner-green", ["speedrunner-yellow", "speedrunner-yellow"], 0)).toThrow();
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
