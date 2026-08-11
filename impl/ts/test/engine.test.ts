import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import {
  controlMarkersFor,
  newGame,
  applyAction,
  runTurn,
  winner,
  type Config,
} from "../src/engine/index.ts";

const data = loadDefault("speedrunners");

function game(names: string[], seed: number) {
  const cfg: Config = { data, playerNames: names, seed };
  return newGame(cfg);
}

describe("control markers", () => {
  test("allotment by player count with default fallback", () => {
    expect(controlMarkersFor(data.mode, 2)).toBe(10);
    expect(controlMarkersFor(data.mode, 3)).toBe(8);
    expect(controlMarkersFor(data.mode, 4)).toBe(6);
    expect(controlMarkersFor(data.mode, 7)).toBe(8); // default
  });
});

describe("setup", () => {
  test("assigns players, distinct pawns, asymmetric opening deal", () => {
    const s = game(["Alice", "Bob"], 42);
    expect(s.players.length).toBe(2);
    for (const p of s.players) {
      expect(p.controlMarkersTotal).toBe(10);
      expect(p.pawnId).not.toBe("");
    }
    expect(s.players[0]!.pawnId).not.toBe(s.players[1]!.pawnId);
    // Asymmetric deal: p1 gets fewer than p2.
    expect(s.players[0]!.hand.length).toBeLessThan(s.players[1]!.hand.length);
  });
});

describe("determinism", () => {
  test("same seed -> same setup", () => {
    const a = game(["A", "B", "C"], 7);
    const b = game(["A", "B", "C"], 7);
    expect(a.players.map((p) => p.pawnId)).toEqual(b.players.map((p) => p.pawnId));
    expect(a.deck[0]).toBe(b.deck[0]!);
  });
});

describe("turn loop", () => {
  test("recycle refills hand to max", () => {
    const s = game(["A", "B"], 1);
    runTurn(s, [{ type: "pass" }]);
    expect(s.players[0]!.hand.length).toBe(s.players[0]!.maxHandSize);
  });

  test("turns advance and wrap", () => {
    const s = game(["A", "B", "C"], 3);
    expect(s.currentPlayer).toBe(0);
    runTurn(s);
    expect(s.currentPlayer).toBe(1);
    runTurn(s);
    runTurn(s);
    expect(s.currentPlayer).toBe(0);
  });
});

describe("win condition", () => {
  test("first to place all markers wins", () => {
    const s = game(["A", "B"], 9);
    const total = s.players[0]!.controlMarkersTotal;
    let guard = 0;
    while (!winner(s)) {
      if (++guard > 1000) throw new Error("game did not terminate");
      runTurn(s, [{ type: "place-marker" }]);
    }
    expect(winner(s)).toBe("p1");
    expect(s.players[0]!.controlMarkersPlaced).toBe(total);
  });

  test("cannot place more markers than available", () => {
    const s = game(["A", "B"], 5);
    const p = s.players[s.currentPlayer]!;
    p.controlMarkersPlaced = p.controlMarkersTotal;
    expect(() => applyAction(s, { type: "place-marker" })).toThrow();
  });
});
