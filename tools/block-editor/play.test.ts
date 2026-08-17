import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPlaySession, exportPlayTrace, getPlaySession, importPlayTrace, playDataChecksum, submitPlayCommand, undoPlayCommand } from "./play.ts";

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
