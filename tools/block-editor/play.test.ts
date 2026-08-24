import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPlayScenario, createPlaySession, exportPlayTrace, getMovementOptions, getPlaySession, importPlayTrace, listPlayScenarios, playDataChecksum, resetPlaySession, submitPlayCommand, undoPlayCommand } from "./play.ts";

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

test("Test Lab scenarios are deterministic, named, and retain their fixture in v2 traces", () => {
  expect(listPlayScenarios().map((scenario) => scenario.id)).toEqual(["game-basics", "search-and-move", "combat-and-control", "attachments", "reboot-and-turn"]);
  const created = createPlayScenario("attachments", { playerNames: ["Ada", "Bea"], seed: 9 });
  expect(created.scenario?.title).toBe("Attachments");
  expect(created.activePlayer?.name).toBe("Ada");
  expect(created.players[0]!.hand.map((card) => card.name)).toContain("Accelerator");
  const trace = exportPlayTrace(created.id);
  expect(trace.format).toBe("zaibatsu-speedrunners-trace/v2");
  if (trace.format !== "zaibatsu-speedrunners-trace/v2") throw new Error("expected fixture trace");
  expect(trace.scenarioId).toBe("attachments");
  expect(importPlayTrace(trace).state).toEqual(created.state);
  expect(() => createPlayScenario("unknown-scenario")).toThrow("Unknown Test Lab scenario");
  expect(() => importPlayTrace({ ...trace, scenarioId: "unknown-scenario" })).toThrow("Unknown Test Lab scenario");
});

test("Test Lab fixture actions remain reducer-validated and reset to their fixture", () => {
  const created = createPlayScenario("attachments");
  const attach = created.legalOptions.actions.find((action) => action.type === "attach-pawn") as { cardId: string; targetIds: string[] };
  expect(attach).toBeDefined();
  const applied = submitPlayCommand(created.id, { kind: "action", action: { type: "attach-pawn", cardId: attach.cardId, targetId: attach.targetIds[0]! } });
  expect(applied.result.accepted).toBe(true);
  expect(applied.scenario?.checkpoints.some((checkpoint) => checkpoint.complete)).toBe(true);
  const reset = resetPlaySession(created.id);
  expect(reset.state.pawns.find((pawn) => pawn.pawnId === "speedrunner-red")?.attachments).toEqual([]);
});

test("Test Lab fixtures expose immediate reducer actions for the supported action families", () => {
  const actions = (scenarioId: string) => createPlayScenario(scenarioId).legalOptions.actions.map((action) => action.type);
  expect(actions("game-basics")).toContain("place-marker");
  expect(actions("search-and-move")).toContain("play-search");
  expect(actions("combat-and-control")).toEqual(expect.arrayContaining(["play-delete", "delete-multi", "play-icebreak-pawn", "play-icebreak-block"]));
  expect(actions("attachments")).toEqual(expect.arrayContaining(["attach-pawn", "attach-enemy"]));
  expect(actions("reboot-and-turn")).toContain("play-reboot");
});

test("game basics fixture can place the last marker and declare a winner", () => {
  const created = createPlayScenario("game-basics");
  const marker = created.legalOptions.actions.find((action) => action.type === "place-marker");
  expect(marker).toBeDefined();
  const applied = submitPlayCommand(created.id, { kind: "action", action: { type: "place-marker" } });
  expect(applied.result.accepted).toBe(true);
  expect(applied.state.winnerId).toBe(applied.activePlayer?.id);
  expect(applied.scenario?.checkpoints.every((checkpoint) => checkpoint.complete)).toBe(true);
});

test("Test Lab Split Delete is an explicit reducer-validated fixture action", () => {
  const created = createPlayScenario("combat-and-control");
  const split = created.legalOptions.actions.find((action) => action.type === "delete-multi") as { pawnId: string; targetIds: string[] };
  expect(split).toBeDefined();
  const applied = submitPlayCommand(created.id, { kind: "action", action: { type: "delete-multi", pawnId: split.pawnId, targetIds: split.targetIds.filter((id) => id !== "speedrunner-red") } });
  expect(applied.result.accepted).toBe(true);
  expect(applied.scenario?.checkpoints[1]?.complete).toBe(true);
});
