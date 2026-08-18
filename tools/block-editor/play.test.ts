import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPlaySession, exportPlayTrace, getMovementOptions, getPlaySession, importPlayTrace, playDataChecksum, submitPlayCommand, undoPlayCommand } from "./play.ts";

test("play sessions advance, replay undo, and export deterministically", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 91 });
  const started = submitPlayCommand(created.id, { kind: "phase" });
  expect(started.result.accepted).toBe(true);
  const action = submitPlayCommand(created.id, { kind: "action", action: { type: "place-marker" } });
  expect(action.result.accepted).toBe(true);
  const afterAction = action.state;
  undoPlayCommand(created.id);
  expect(getPlaySession(created.id).state).not.toEqual(afterAction);
  submitPlayCommand(created.id, { kind: "action", action: { type: "place-marker" } });
  expect(getPlaySession(created.id).state).toEqual(afterAction);
  const trace = exportPlayTrace(created.id);
  expect(trace.dataChecksum).toBe(playDataChecksum);
  expect(importPlayTrace(trace).state).toEqual(afterAction);
});

test("play sessions return structured validation errors and reject checksum mismatches", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 92 });
  const rejected = submitPlayCommand(created.id, { kind: "action", action: { type: "pass" } });
  expect(rejected.result.accepted).toBe(false);
  expect(rejected.result.events[0]!.type).toBe("validation-failed");
  const trace = exportPlayTrace(created.id);
  expect(() => importPlayTrace({ ...trace, dataChecksum: "wrong" })).toThrow("checksum");
});

test("play projection exposes guided options and does not write Speedrunners data", () => {
  const source = join(resolve(import.meta.dir, "../.."), "spec/data/speedrunners/blocks.json");
  const before = readFileSync(source, "utf8");
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 93 });
  expect(created.legalOptions.actions.some((action) => action.type === "pass")).toBe(true);
  const phase = submitPlayCommand(created.id, { kind: "phase" });
  expect(phase.legalOptions.actions.some((action) => action.type === "place-marker")).toBe(true);
  expect(readFileSync(source, "utf8")).toBe(before);
});

test("a guided search adds a block, then the next hex mover can move onto it", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 101 });
  submitPlayCommand(created.id, { kind: "phase" });
  const search = getPlaySession(created.id).legalOptions.actions.find((action) => action.type === "play-search") as { cardId: string; pawnId: string; placements: Array<{ dir: number; rotation: number }> };
  expect(search).toBeDefined();
  const placement = search.placements[0]!;
  const placed = submitPlayCommand(created.id, { kind: "action", action: { type: "play-search", cardId: search.cardId, pawnId: search.pawnId, ...placement } });
  expect(placed.result.accepted).toBe(true);
  expect(placed.state.blocks).toHaveLength(2);
  submitPlayCommand(created.id, { kind: "action", action: { type: "pass" } });
  submitPlayCommand(created.id, { kind: "phase" });
  submitPlayCommand(created.id, { kind: "phase" });
  const next = submitPlayCommand(created.id, { kind: "phase" });
  expect(next.state.players[0]!.hand).toHaveLength(next.state.players[0]!.maxHandSize ?? 5);
  submitPlayCommand(created.id, { kind: "phase" });
  const move = getPlaySession(created.id).legalOptions.actions.find((action) => action.type === "move-hex") as { pawnId: string; directions: number[] };
  expect(move).toBeDefined();
  const moved = submitPlayCommand(created.id, { kind: "action", action: { type: "move-hex", pawnId: move.pawnId, dir: move.directions[0]! } });
  expect(moved.result.accepted).toBe(true);
  expect(moved.state.pawns.find((pawn) => pawn.pawnId === move.pawnId)?.q).toBe(1);
});

test("guided step movement projects a path without rolling, then executes through the core boundary", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 5 });
  submitPlayCommand(created.id, { kind: "phase" });
  const search = getPlaySession(created.id).legalOptions.actions.find((action) => action.type === "play-search") as { cardId: string; pawnId: string; placements: Array<{ dir: number; rotation: number }> };
  const placed = submitPlayCommand(created.id, { kind: "action", action: { type: "play-search", cardId: search.cardId, pawnId: search.pawnId, ...search.placements[0]! } });
  const move = placed.legalOptions.actions.find((action) => action.type === "move-steps") as { pawnId: string; targets: Array<{ coord: { q: number; r: number }; spaceId: string }>; maxSelectableSteps: number; movement: { type: string } };
  expect(move).toBeDefined();
  expect(move.maxSelectableSteps).toBe(3);
  const path = [move.targets[0]!];
  const preview = getMovementOptions(created.id, move.pawnId, path);
  expect(preview.path).toEqual(path);
  expect(preview.exactBudgetKnown).toBe(true);
  expect(() => getMovementOptions(created.id, move.pawnId, [{ coord: { q: 99, r: 99 }, spaceId: "none" }])).toThrow("not adjacent");
  const moved = submitPlayCommand(created.id, { kind: "action", action: { type: "move-steps", pawnId: move.pawnId, path } });
  expect(moved.result.accepted).toBe(true);
  expect(moved.state.pawns.find((pawn) => pawn.pawnId === move.pawnId)).toMatchObject({ q: 1, r: 0, spaceId: path[0]!.spaceId });
});

test("guided card movement exposes its printed budget and discards only after acceptance", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 5 });
  submitPlayCommand(created.id, { kind: "phase" });
  const search = getPlaySession(created.id).legalOptions.actions.find((action) => action.type === "play-search") as { cardId: string; pawnId: string; placements: Array<{ dir: number; rotation: number }> };
  const placed = submitPlayCommand(created.id, { kind: "action", action: { type: "play-search", cardId: search.cardId, pawnId: search.pawnId, ...search.placements[0]! } });
  const move = placed.legalOptions.actions.find((action) => action.type === "play-move") as { cardId: string; pawnId: string; targets: Array<{ coord: { q: number; r: number }; spaceId: string }>; maxSelectableSteps: number };
  expect(move).toBeDefined();
  const preview = getMovementOptions(created.id, move.pawnId, [move.targets[0]!], move.cardId);
  expect(preview.maxSelectableSteps).toBe(move.maxSelectableSteps);
  const moved = submitPlayCommand(created.id, { kind: "action", action: { type: "play-move", cardId: move.cardId, pawnId: move.pawnId, path: [move.targets[0]!] } });
  expect(moved.result.accepted).toBe(true);
  expect(moved.state.discard).toContain(move.cardId);
});
