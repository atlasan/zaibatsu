// Loads the language-neutral game content from spec/data into domain types.
// Mirrors impl/go/internal/data. See DOCS/architecture.md.

import { existsSync, statSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  GameData,
  Block,
  Pawn,
  ActionCard,
  Mode,
} from "../domain/types.ts";

/**
 * Walks up from a starting directory to locate the repo's spec/data directory,
 * so tests and the demo work regardless of where they run. Mirrors
 * FindSpecDir in data.go (which walks from cwd); here we start from this
 * module's directory for cwd-independence, then fall back to cwd.
 */
export function findSpecDir(start?: string): string {
  const starts = [start, import.meta.dir, process.cwd()].filter(
    (s): s is string => typeof s === "string",
  );
  for (const s of starts) {
    let dir = s;
    for (;;) {
      const candidate = join(dir, "spec", "data");
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        return candidate;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("could not locate spec/data above module or working directory");
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    throw new Error(`read/parse ${path}: ${(err as Error).message}`);
  }
}

/** Loads game data for the given expansion from the given spec/data directory. */
export function loadGameData(specDataDir: string, expansion: string): GameData {
  const base = join(specDataDir, expansion);

  const blocks = readJson<{ blocks: Block[] }>(join(base, "blocks.json")).blocks;
  const pawns = readJson<{ pawns: Pawn[] }>(join(base, "pawns.json")).pawns;
  const cards = readJson<{ cards: ActionCard[] }>(
    join(base, "action-cards.json"),
  ).cards;
  const mode = readJson<Mode>(join(base, "mode.json"));

  const data: GameData = { blocks, pawns, cards, mode };
  validate(data);
  return data;
}

/** Locates spec/data and loads the given expansion. */
export function loadDefault(expansion: string): GameData {
  return loadGameData(findSpecDir(), expansion);
}

/** Light structural checks the loader guarantees to the engine. */
function validate(data: GameData): void {
  if (data.blocks.length === 0) throw new Error("no blocks loaded");
  const cores = data.blocks.filter((b) => b.isCentralCore).length;
  if (cores !== 1) {
    throw new Error(`expected exactly one Central Core block, found ${cores}`);
  }
  if (data.pawns.filter((p) => p.isStarter).length === 0) {
    throw new Error("no starter pawns found");
  }
  if (data.cards.length === 0) throw new Error("no action cards loaded");
  if (!data.mode.id) throw new Error("mode has no id");
}
