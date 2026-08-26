// Loads the language-neutral game content from spec/data into domain types.
// Mirrors impl/go/internal/data. See DOCS/architecture.md.

import { createHash } from "node:crypto";
import { existsSync, statSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  GameData,
  Block,
  Pawn,
  ActionCard,
  Mode,
  ControlCard,
  Threat,
  MissionCard,
} from "../domain/types.ts";
import { deriveBoundarySpaces } from "../domain/pawn_board.ts";

type ValidationManifest = {
  manifestVersion: number;
  entries: Array<{
    expansion: string;
    files: Array<{ path: string; sha256: string }>;
  }>;
};

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

function readOptionalJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? readJson<T>(path) : fallback;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function repoRootFromSpecDataDir(specDataDir: string): string {
  return dirname(dirname(resolve(specDataDir)));
}

function assertValidatedSpecData(specDataDir: string, expansion: string): void {
  const repoRoot = repoRootFromSpecDataDir(specDataDir);
  const manifestPath = join(repoRoot, "spec", "validation", "manifest.json");
  const hint = "run `bun tools/validate-spec.ts` from the repo root";
  if (!existsSync(manifestPath)) {
    throw new Error(`spec validation manifest is missing at ${manifestPath}; ${hint}`);
  }
  const manifest = readJson<ValidationManifest>(manifestPath);
  if (manifest.manifestVersion !== 1) {
    throw new Error(`unsupported spec validation manifest version ${String(manifest.manifestVersion)}; ${hint}`);
  }
  const entry = manifest.entries.find((item) => item.expansion === expansion);
  if (!entry) {
    throw new Error(`spec validation manifest has no entry for expansion ${expansion}; ${hint}`);
  }
  for (const file of entry.files) {
    const path = join(repoRoot, ...file.path.split("/"));
    if (!existsSync(path)) {
      throw new Error(`validated spec file is missing: ${file.path}; ${hint}`);
    }
    const actual = sha256File(path);
    if (actual !== file.sha256) {
      throw new Error(`spec validation manifest is stale for ${file.path}; expected ${file.sha256}, found ${actual}; ${hint}`);
    }
  }
}

/** Loads game data for the given expansion from the given spec/data directory. */
export function loadGameData(specDataDir: string, expansion: string): GameData {
  assertValidatedSpecData(specDataDir, expansion);
  const base = join(specDataDir, expansion);

  const blocks = readJson<{ blocks: Block[] }>(join(base, "blocks.json")).blocks;
  blocks.forEach(deriveBoundarySpaces); // fill the derived cross-edge boundary map
  const pawns = readJson<{ pawns: Pawn[] }>(join(base, "pawns.json")).pawns;
  const cards = readJson<{ cards: ActionCard[] }>(
    join(base, "action-cards.json"),
  ).cards;
  const mode = readJson<Mode>(join(base, "mode.json"));

  const controlCards = readOptionalJson<{ controlCards: ControlCard[] }>(join(base, "control-cards.json"), { controlCards: [] }).controlCards;
  const threats = readOptionalJson<{ threats: Threat[] }>(join(base, "threats.json"), { threats: [] }).threats;
  const missions = readOptionalJson<{ missions: MissionCard[] }>(join(base, "missions.json"), { missions: [] }).missions;
  const modes = readOptionalJson<{ modes: Mode[] }>(join(base, "modes.json"), { modes: [mode] }).modes;
  const data: GameData = { blocks, pawns, cards, mode, controlCards, threats, missions, modes };
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
