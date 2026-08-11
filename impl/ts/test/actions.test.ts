import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import { blockById, type GameData, type GameState } from "../src/domain/types.ts";
import { neighbor, opposite, type Coord } from "../src/domain/hex.ts";
import { applyAction, newGame, placeBlock } from "../src/engine/index.ts";

const data: GameData = loadDefault("speedrunners");
const ORIGIN: Coord = { q: 0, r: 0 };

function rotFacing(blockId: string, dir: number): number {
  const b = blockById(data, blockId)!;
  for (let rot = 0; rot < 6; rot++) {
    const local = (((opposite(dir) - rot) % 6) + 6) % 6;
    if (b.edges![local]) return rot;
  }
  throw new Error("no facing rotation");
}

function game(seed = 1): GameState {
  return newGame({ data, playerNames: ["A", "B"], seed });
}

describe("applyAction dispatch", () => {
  test("search and delete via actions reach their resolvers", () => {
    const s = game();
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.blockPile = ["data-haven"];
    const dir = 2;
    applyAction(s, data, { type: "search", playerId: "p1", pawnId: "speedrunner-red", dir, rotation: rotFacing("data-haven", dir) });
    expect(s.cybernet.at(neighbor(ORIGIN, dir))).toBeDefined();

    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    expect(() =>
      applyAction(s, data, { type: "delete", pawnId: "speedrunner-red", targetId: "speedrunner-yellow" }),
    ).not.toThrow();
  });

  test("unknown action and missing coord throw", () => {
    const s = game();
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    // deno-lint-ignore no-explicit-any
    expect(() => applyAction(s, data, { type: "bogus" } as never)).toThrow();
    expect(() => applyAction(s, data, { type: "icebreak-block", pawnId: "speedrunner-red" })).toThrow();
  });

  test("move-hex via action moves the pawn", () => {
    const s = game();
    const dir = 2;
    placeBlock(s, ORIGIN, dir, data, "data-haven", rotFacing("data-haven", dir));
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    applyAction(s, data, { type: "move-hex", pawnId: "speedrunner-yellow", dir });
    expect(s.cybernet.pawnById("speedrunner-yellow")!.coord).toEqual(neighbor(ORIGIN, dir));
  });

  test("playerId defaults to the current player", () => {
    const s = game();
    const before = s.players[s.currentPlayer]!.controlMarkersPlaced;
    applyAction(s, data, { type: "place-marker" });
    expect(s.players[0]!.controlMarkersPlaced).toBe(before + 1);
  });
});
