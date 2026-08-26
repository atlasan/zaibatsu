import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadDefault, loadGameData } from "./index.ts";

type ValidationManifest = {
  entries: Array<{
    expansion: string;
    files: Array<{ path: string }>;
  }>;
};

const tempRoots: string[] = [];

function repoRoot(): string {
  return join(import.meta.dir, "..", "..", "..", "..");
}

function createTempRepo(expansion: string): string {
  const target = join(tmpdir(), `zaibatsu-ts-data-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const root = repoRoot();
  const manifestPath = join(root, "spec", "validation", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ValidationManifest;
  const entry = manifest.entries.find((item) => item.expansion === expansion);
  if (!entry) throw new Error(`missing validation manifest entry for ${expansion}`);
  mkdirSync(join(target, "spec", "validation"), { recursive: true });
  cpSync(manifestPath, join(target, "spec", "validation", "manifest.json"));
  for (const file of entry.files) {
    const from = join(root, ...file.path.split("/"));
    const to = join(target, ...file.path.split("/"));
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
  tempRoots.push(target);
  return target;
}

afterEach(() => {
  while (tempRoots.length) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

test("loadDefault uses the validated spec bundle", () => {
  const data = loadDefault("speedrunners");
  expect(data.blocks.length).toBeGreaterThan(0);
  expect(data.mode.id).toBe("speedrunners");
});

test("loadGameData rejects stale validated spec content", () => {
  const tempRoot = createTempRepo("speedrunners");
  const blocksPath = join(tempRoot, "spec", "data", "speedrunners", "blocks.json");
  writeFileSync(blocksPath, `${readFileSync(blocksPath, "utf8")}\n`);
  expect(() => loadGameData(join(tempRoot, "spec", "data"), "speedrunners")).toThrow(/spec validation manifest is stale/);
});
