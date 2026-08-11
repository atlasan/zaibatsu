import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findSpecDir, loadDefault } from "../src/data/index.ts";
import { applyAction, newGame, runTurn, snapshot, winner } from "../src/engine/index.ts";

// Golden-game tests: run a scripted game/scenario and assert the canonical
// snapshot matches a SHARED golden fixture under <repo>/golden that the Go mirror
// asserts against too. A divergence in either mirror fails here — a whole-state
// cross-mirror equivalence check. See DOCS/parity.md.

const data = loadDefault("speedrunners");

function readGolden(name: string): string {
  const root = dirname(dirname(findSpecDir())); // <root>/spec/data -> <root>
  return readFileSync(join(root, "golden", name), "utf8").trim();
}

describe("golden games", () => {
  test("game1: seed 42 to completion", () => {
    const s = newGame({ data, playerNames: ["Arasaka", "Militech"], seed: 42 });
    let guard = 0;
    while (!winner(s)) {
      if (++guard > 10000) throw new Error("game did not terminate");
      runTurn(s, data, [{ type: "place-marker" }]);
    }
    expect(snapshot(s)).toBe(readGolden("game1.snap"));
  });

  test("scenario1: seed 7 delete", () => {
    const s = newGame({ data, playerNames: ["A", "B"], seed: 7 });
    s.cybernet.pawns = [];
    s.cybernet.placePawn({ pawnId: "speedrunner-green", ownerId: "p1", coord: { q: 0, r: 0 }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: "p2", coord: { q: 0, r: 0 }, spaceId: "core" });
    applyAction(s, data, { type: "delete", pawnId: "speedrunner-green", targetId: "speedrunner-yellow" });
    expect(snapshot(s)).toBe(readGolden("scenario1.snap"));
  });
});
