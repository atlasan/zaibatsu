import { expect, mock, test, describe, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const originalExpect = expect;
const goldenDir = resolve(import.meta.dir, "../golden");
const enabled = process.env.REFRESH_GOLDENS === "1";

function files(): string[] {
  return readdirSync(goldenDir).filter((name) => name.endsWith(".json") || name.endsWith(".snap")).map((name) => join(goldenDir, name));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function rewrite(expected: unknown, received: unknown): boolean {
  if (!enabled || expected === received) return false;
  const matches = files().filter((path) => {
    const text = readFileSync(path, "utf8");
    if (typeof expected === "string") return text.trim() === expected;
    try { return same(JSON.parse(text), expected); } catch { return false; }
  });
  if (matches.length === 1) {
    const path = matches[0]!;
    writeFileSync(path, typeof received === "string" ? `${received}\n` : JSON.stringify(received));
    console.log(`refreshed ${path}`);
    return true;
  }
  if (typeof expected !== "object" || expected === null || typeof received !== "object" || received === null) return false;
  const nested = files().flatMap((path) => {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { return []; }
    return Object.entries(parsed).filter(([key, value]) => ["native", "virus", "lima"].includes(key) && same(value, expected)).map(([key]) => ({ path, key, parsed }));
  });
  if (nested.length !== 1) return false;
  const hit = nested[0]!;
  hit.parsed[hit.key] = received;
  writeFileSync(hit.path, JSON.stringify(hit.parsed));
  console.log(`refreshed ${hit.path}#${hit.key}`);
  return true;
}

function expectProxy(received: unknown) {
  const result = originalExpect(received) as { toEqual: (expected: unknown) => void; toBe: (expected: unknown) => void };
  const toEqual = result.toEqual.bind(result);
  const toBe = result.toBe.bind(result);
  result.toEqual = (expected: unknown) => { if (!rewrite(expected, received)) toEqual(expected); };
  result.toBe = (expected: unknown) => { if (!rewrite(expected, received)) toBe(expected); };
  return result;
}
Object.assign(expectProxy, originalExpect);

mock.module("bun:test", () => ({
  afterAll, afterEach, beforeAll, beforeEach, describe, expect: expectProxy, mock, test,
}));
