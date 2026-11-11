import { expect, test } from "bun:test";
import { buildRulesCoverage } from "./rules-coverage.ts";

test("rule coverage accounts for every reviewed asset and all eight modes without promoting observations", () => {
  const entries = buildRulesCoverage().entries;
  expect(entries.filter(e => e.id.startsWith("asset/"))).toHaveLength(228);
  expect(entries.filter(e => e.kind === "mode")).toHaveLength(8);
  expect(entries.some(e => e.id === "rule/SR-TURN-005")).toBe(true);
  const mission = entries.find(e => e.id === "asset/sh-en-action-cards-p03-c01")!;
  expect(mission.sourceStatus).toBe("visual-reviewed");
  expect(mission.runtime).toBe("planned");
  for (const entry of entries.filter(e => e.runtime === "implemented")) {
    expect(entry.sourceStatus).toBe("verified");
    expect(entry.tests.go.length).toBeGreaterThan(0);
    expect(entry.tests.ts.length).toBeGreaterThan(0);
    expect(entry.gaps).toEqual([]);
  }
});
