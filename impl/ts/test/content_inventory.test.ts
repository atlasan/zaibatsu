import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findSpecDir, loadDefault } from "../src/data/index.ts";

test("knowledge inventory declares both official products and all documented modes", () => {
  const specRoot = join(findSpecDir(), "..");
  const inventory = JSON.parse(readFileSync(join(specRoot, "inventory.json"), "utf8")) as {
    products: unknown[];
    modes: { id: string }[];
  };
  expect(inventory.products).toHaveLength(2);
  expect(inventory.modes.map((mode) => mode.id)).toEqual([
    "speedrunners", "shadowraiders", "chaos", "outbreak", "total-war",
    "strategic-alliance", "cyber-revolution", "total-war-chaos",
  ]);
});

test("loader exposes the optional content collections with a primary-mode fallback", () => {
  const data = loadDefault("speedrunners");
  expect(data.controlCards).toHaveLength(9);expect(data.controlCards!.filter(c=>c.isStarter)).toHaveLength(4);expect(data.controlCards!.find(c=>c.id==="idoru-control")!.provisional).toBe(true);
  expect(data.threats).toEqual([]);
  expect(data.missions).toEqual([]);
  expect(data.modes?.[0]?.id).toBe("speedrunners-quick-match");
  expect(data.modes?.[0]?.provisional).toBe(true);
  expect(data.mode.controlMarkers["2"]).toBe(10);
});
