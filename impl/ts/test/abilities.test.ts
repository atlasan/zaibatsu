import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import { blockById, type GameData, type GameState } from "../src/domain/types.ts";
import { neighbor, opposite, type Coord } from "../src/domain/hex.ts";
import {
  canPlace,
  newGame,
  reboot,
  search,
  validSearchPlacements,
} from "../src/engine/index.ts";

const data: GameData = loadDefault("speedrunners");
const ORIGIN: Coord = { q: 0, r: 0 };

function rotFacing(blockId: string, dir: number): number {
  const b = blockById(data, blockId)!;
  for (let rot = 0; rot < 6; rot++) {
    const local = (((opposite(dir) - rot) % 6) + 6) % 6;
    if (b.edges![local]) return rot;
  }
  throw new Error(`block ${blockId} cannot face direction ${dir}`);
}

function searchGame(...pile: string[]): GameState {
  const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
  s.cybernet.pawns = [];
  s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
  s.blockPile = [...pile];
  return s;
}

describe("search", () => {
  test("places the top block of the pile", () => {
    const s = searchGame("data-haven");
    const dir = 2;
    const pb = search(s, data, "speedrunner-red", dir, rotFacing("data-haven", dir));
    expect(pb.blockId).toBe("data-haven");
    expect(pb.coord).toEqual(neighbor(ORIGIN, dir));
    expect(s.blockPile.length).toBe(0);
    expect(s.cybernet.at(neighbor(ORIGIN, dir))).toBeDefined();
  });

  test("an invalid placement does not consume the block", () => {
    const s = searchGame("data-haven");
    const b = blockById(data, "data-haven")!;
    let badRot = -1;
    for (let rot = 0; rot < 6; rot++) {
      const local = (((opposite(0) - rot) % 6) + 6) % 6;
      if (!b.edges![local]) {
        badRot = rot;
        break;
      }
    }
    expect(badRot).toBeGreaterThanOrEqual(0);
    expect(() => search(s, data, "speedrunner-red", 0, badRot)).toThrow();
    expect(s.blockPile.length).toBe(1);
  });

  test("empty pile throws", () => {
    const s = searchGame();
    expect(() => search(s, data, "speedrunner-red", 0, 0)).toThrow();
  });

  test("requires the Search ability", () => {
    const s = searchGame("data-haven");
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    expect(() => search(s, data, "drone-turret", 0, 0)).toThrow();
  });

  test("validSearchPlacements returns only valid options", () => {
    const s = searchGame("data-haven");
    const opts = validSearchPlacements(s, data, "speedrunner-red");
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(canPlace(s.cybernet, data, ORIGIN, o.dir, "data-haven", o.rotation)).toBeUndefined();
    }
  });
});

describe("reboot", () => {
  test("returns an eliminated pawn to the Central Core", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
    s.cybernet.removePawn("speedrunner-red");
    s.eliminated = ["speedrunner-red"];
    const pob = reboot(s, data, "speedrunner-red", "p1");
    expect(pob.coord).toEqual(ORIGIN);
    expect(pob.ownerId).toBe("p1");
    expect(s.cybernet.pawnById("speedrunner-red")).toBeDefined();
    expect(s.eliminated.length).toBe(0);
  });

  test("rejects a non-eliminated pawn", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
    expect(() => reboot(s, data, "speedrunner-red", "p1")).toThrow();
  });

  test("requires the Reboot ability", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 1 });
    s.eliminated = ["drone-turret"];
    expect(() => reboot(s, data, "drone-turret", "p1")).toThrow();
  });
});

describe("ability removal via attachment", () => {
  test("an attachment that removes Search blocks it", () => {
    const d = loadDefault("speedrunners");
    const s = newGame({ data: d, playerNames: ["A", "B"], seed: 1 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.blockPile = ["data-haven"];
    d.cards[0].attach = { as: "pawn", slot: "add-on", removes: ["search"] };
    s.cybernet.pawnById("speedrunner-red")!.attachments = [{ cardId: d.cards[0].id, slot: "add-on", bonusPaid: 0 }];
    expect(() => search(s, d, "speedrunner-red", 2, rotFacing("data-haven", 2))).toThrow();
  });
});
