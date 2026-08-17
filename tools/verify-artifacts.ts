#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { markdownFiles, validateMarkdownLinks } from "./docs-lib.ts";

interface SourceAsset {
  id: string;
  path: string;
  bytes: number;
  sha256: string;
  game: string;
  edition: string;
  language: string;
  role: string;
  authority: "primary" | "supporting";
}

interface Catalog {
  catalogVersion: number;
  localRoot: string;
  summary: Record<string, number>;
  assets: SourceAsset[];
}

const root = resolve(import.meta.dir, "..");
const requireOriginals = process.argv.includes("--require-originals");
const failures: string[] = [];
const warnings: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function warn(message: string): void {
  warnings.push(message);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

function toRepoPath(path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

function checkMarkdownLinks(): void {
  const files = markdownFiles(root, ["README.md", "AGENTS.md", "DOCS", "MEMORIES", "spec", "tasks"])
    .filter((path) => !toRepoPath(path).startsWith("DOCS/Original/"));
  for (const error of validateMarkdownLinks(root, files)) fail(error);
}

function checkCatalog(): void {
  const catalogPath = join(root, "DOCS/artifacts/source-catalog.json");
  let catalog: Catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;
  } catch (error) {
    fail(`cannot parse source catalog: ${(error as Error).message}`);
    return;
  }

  if (catalog.catalogVersion !== 1 || catalog.localRoot !== "DOCS/Original") {
    fail("source catalog has an unsupported version or local root");
  }
  if (!Array.isArray(catalog.assets) || catalog.assets.length === 0) {
    fail("source catalog has no assets");
    return;
  }

  const ids = new Set<string>();
  const paths = new Set<string>();
  const extensions: Record<string, number> = {};
  let present = 0;
  for (const asset of catalog.assets) {
    if (!/^[a-z0-9-]+$/.test(asset.id) || ids.has(asset.id)) {
      fail(`invalid or duplicate source id ${asset.id}`);
    }
    ids.add(asset.id);
    if (!asset.path.startsWith("DOCS/Original/") || paths.has(asset.path)) {
      fail(`invalid or duplicate source path ${asset.path}`);
    }
    paths.add(asset.path);
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 1
      || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || !["primary", "supporting"].includes(asset.authority)) {
      fail(`invalid metadata for ${asset.id}`);
    }
    const extension = extname(asset.path).slice(1).toLowerCase();
    extensions[extension] = (extensions[extension] ?? 0) + 1;

    const localPath = join(root, asset.path);
    if (!existsSync(localPath)) {
      const message = `missing ignored source ${asset.id}: ${asset.path}`;
      if (requireOriginals) fail(message);
      else warn(message);
      continue;
    }
    present++;
    if (statSync(localPath).size !== asset.bytes) {
      fail(`byte count mismatch for ${asset.id}`);
    }
    const actual = createHash("sha256").update(readFileSync(localPath)).digest("hex");
    if (actual !== asset.sha256) fail(`SHA-256 mismatch for ${asset.id}`);
  }

  for (const [extension, expected] of Object.entries(catalog.summary)) {
    if (extension === "total") continue;
    if (extensions[extension] !== expected) {
      fail(`catalog summary ${extension}=${expected}, found ${extensions[extension] ?? 0}`);
    }
  }
  if (catalog.summary.total !== catalog.assets.length) {
    fail(`catalog summary total=${catalog.summary.total}, found ${catalog.assets.length}`);
  }
  console.log(`source catalog: ${catalog.assets.length} assets; ${present} locally verified`);
}

function checkAdrs(): void {
  const adrDir = join(root, "DOCS/adr");
  const records = walk(adrDir).filter((path) => /^\\d{4}-.+\\.md$/.test(path.split(/[\\/]/).at(-1)!));
  const index = readFileSync(join(adrDir, "README.md"), "utf8");
  for (const record of records) {
    const name = record.split(/[\\/]/).at(-1)!;
    const id = name.slice(0, 4);
    const text = readFileSync(record, "utf8");
    if (!text.startsWith(`# ADR-${id}:`) || !/^- Status: (proposed|accepted|superseded by ADR-\\d{4})$/m.test(text)) {
      fail(`invalid ADR format: DOCS/adr/${name}`);
    }
    if (!index.includes(`(${name})`)) fail(`ADR register omits ${name}`);
  }
}

checkMarkdownLinks();
checkCatalog();
checkAdrs();

for (const message of warnings) console.warn(`warning: ${message}`);
for (const message of failures) console.error(`error: ${message}`);
if (failures.length > 0) process.exit(1);
console.log("artifact verification passed");
