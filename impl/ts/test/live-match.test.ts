import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findSpecDir, loadRegression } from "../src/data/index.ts";
import { advancePhase, applyActionWithEvents, cloneGameState, newGame, snapshot, type Action } from "../src/engine/index.ts";

const data = loadRegression("speedrunners", "speedrunners-quick-match");
const root = join(findSpecDir(), "../..");

test("quick match replays a complete real block-control victory in both mirrors", () => {
  const trace = JSON.parse(readFileSync(join(root, "golden/quick-match.trace.json"), "utf8"));
  const state = newGame({ data, ...trace.setup });
  for (const command of trace.commands) {
    const result = command.kind === "phase" ? advancePhase(state, data) : applyActionWithEvents(state, data, command.action);
    expect(result.accepted).toBe(true);
  }
  expect(state.winnerId).toBe("p2");
  expect(state.cybernet.blocks.filter((block) => block.ownerId === "p2")).toHaveLength(4);
  expect(snapshot(state)).toBe(readFileSync(join(root, "golden/quick-match.snap"), "utf8").trim());
  const before = snapshot(state);
  expect(applyActionWithEvents(state, data, { type: "pass" }).accepted).toBe(false);
  expect(advancePhase(state, data).accepted).toBe(false);
  expect(snapshot(state)).toBe(before);
});

test("live actions reject free markers, foreign actors, free card abilities and injected modifiers", () => {
  const state = newGame({ data, playerNames: ["A", "B"], seed: 101 });
  advancePhase(state, data);
  const before = snapshot(state);
  for (const action of [
    { type: "place-marker" },
    { type: "search", pawnId: state.players[0]!.pawnId, dir: 0, rotation: 0 },
    { type: "move-hex", pawnId: state.players[1]!.pawnId, dir: 0 },
    { type: "pass", extraSkulls: 5 },
  ] as Action[]) expect(applyActionWithEvents(state, data, action).accepted).toBe(false);
  expect(snapshot(state)).toBe(before);
});

test("a rejected dice path restores the exact RNG stream and all game state", () => {
  const gd = structuredClone(data);
  const core = gd.blocks.find((block) => block.isCentralCore)!;
  core.spaces = [{ id: "a", type: "special", capacity: "unlimited", neighbors: ["b"] }, { id: "b", type: "special", capacity: "unlimited", neighbors: ["a"] }];
  const state = newGame({ data: gd, playerNames: ["A", "B"], seed: 101 });
  advancePhase(state, gd);
  const before = snapshot(state);
  const control = cloneGameState(state);
  const path = Array.from({ length: 7 }, (_, i) => ({ coord: { q: 0, r: 0 }, spaceId: i % 2 ? "a" : "b" }));
  const result = applyActionWithEvents(state, gd, { type: "move-steps", pawnId: "speedrunner-blue", path });
  expect(result.error).toContain("budget");
  expect(snapshot(state)).toBe(before);
  expect(state.rng.intn(1000)).toBe(control.rng.intn(1000));
});

test("card-driven split Delete spends one card and emits its two dice", () => {
  const state = newGame({ data, playerNames: ["A", "B"], seed: 7 });
  state.cybernet.pawns = [
    { pawnId: "speedrunner-green", ownerId: "p1", coord: { q: 0, r: 0 }, spaceId: "core" },
    { pawnId: "speedrunner-yellow", ownerId: "p2", coord: { q: 0, r: 0 }, spaceId: "core" },
  ];
  state.players[0]!.hand = ["move-1", "move-1"];
  advancePhase(state, data);
  const result = applyActionWithEvents(state, data, { type: "play-delete-multi", pawnId: "speedrunner-green", cardId: "move-1", targetIds: ["speedrunner-yellow", "speedrunner-yellow"] });
  expect(result.accepted).toBe(true);
  expect(result.events.find((event) => event.type === "roll")?.roll).toHaveLength(2);
  expect(state.players[0]!.hand).toEqual(["move-1"]);
  expect(state.playedCards).toEqual(["move-1"]);
});

test("card-activated granted movement must pay a card and leaves base movement unused", () => {
  const gd = structuredClone(data);
  gd.blocks.find((block) => block.isCentralCore)!.spaces = [{ id: "a", type: "special", neighbors: ["b"] }, { id: "b", type: "special", neighbors: ["a"] }];
  gd.cards.push({ id: "grant", name: "Grant", attach: { as: "pawn", slot: "gadget", grantsMovement: [{ type: "fixed", amount: 1 }], abilityUses: [{ ability: "move", activation: "card" }] } });
  const state = newGame({ data: gd, playerNames: ["A", "B"], seed: 101 });
  state.cybernet.pawnById("speedrunner-blue")!.attachments = [{ cardId: "grant", slot: "gadget" }];
  state.players[0]!.hand = ["move-1"];
  advancePhase(state, gd);
  const action: Action = { type: "move-steps", pawnId: "speedrunner-blue", movementIndex: 1, path: [{ coord: { q: 0, r: 0 }, spaceId: "b" }] };
  expect(applyActionWithEvents(state, gd, action).accepted).toBe(false);
  expect(applyActionWithEvents(state, gd, { ...action, cardId: "move-1" }).accepted).toBe(true);
  expect(state.players[0]!.hand).toEqual([]);
  expect(state.playedCards).toEqual(["move-1"]);
  expect(state.players[0]!.oncePerTurnUsed["move:speedrunner-blue:base"]).toBeUndefined();
});
