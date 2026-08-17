#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { markdownFiles, markdownH1, toRepoPath, validateMarkdownLinks } from "./docs-lib.ts";

type RegistryDocument = {
  id: string;
  path: string;
  title: string;
  class: string;
  canonical: boolean;
  owner: string;
  authority: string;
  relatedArtifacts: string[];
};
type Registry = { registryVersion: number; exemptPrefixes: string[]; documents: RegistryDocument[] };
type Catalog = { assets: Array<{ id: string }> };
const validClasses = new Set(["index", "governance", "architecture", "model", "contract", "workflow", "plan", "workstream", "catalog", "source-guide", "ruleset", "rule-module"]);
const validOwners = new Set(["documentation", "engine", "rules", "sources", "delivery", "content-tool"]);
const validAuthorities = new Set(["policy", "derived"]);
const validMaturities = new Set(["source-verified", "implemented", "partial", "planned", "provisional"]);

function readJson<T>(path: string, failures: string[]): T | undefined {
  try { return JSON.parse(readFileSync(path, "utf8")) as T; }
  catch (error) { failures.push(`cannot parse ${path}: ${(error as Error).message}`); return undefined; }
}

function sectionAfter(text: string, offset: number): string {
  const next = text.indexOf("\n## ", offset + 1);
  return text.slice(offset, next === -1 ? undefined : next);
}

function validateRuleModule(path: string, text: string, sourceIds: Set<string>): string[] {
  const failures: string[] = [];
  const expectedPrefix = path.includes("/speedrunners/") ? "SR-" : "SH-";
  const entries = [...text.matchAll(/^## ((?:SR|SH)-[A-Z]+-\d{3})\s+—\s+.+$/gm)];
  if (!entries.length) return [`${path} rule module has no rule entries`];
  for (const entry of entries) {
    const id = entry[1]!;
    const body = sectionAfter(text, entry.index!);
    if (!id.startsWith(expectedPrefix)) failures.push(`${path} rule ${id} uses the wrong game prefix`);
    const source = /- \*\*Source:\*\* `([a-z0-9-]+)` — ([^\n]+)\n/.exec(body);
    if (!source) failures.push(`${path} rule ${id} needs a source id and locator`);
    else if (!sourceIds.has(source[1]!)) failures.push(`${path} rule ${id} references unknown source ${source[1]}`);
    if (!/- \*\*Applies to:\*\* [^\n]+\n/.test(body)) failures.push(`${path} rule ${id} needs applicability`);
    const maturity = /- \*\*Maturity:\*\* ([a-z-]+)\.?\n/.exec(body);
    if (!maturity || !validMaturities.has(maturity[1]!)) failures.push(`${path} rule ${id} has invalid maturity`);
    if (!/- \*\*Rule:\*\* [^\n]+/.test(body)) failures.push(`${path} rule ${id} needs a normative rule`);
  }
  return failures;
}

export function validateDocs(root: string): string[] {
  const failures: string[] = [];
  const registryPath = join(root, "DOCS/registry.json");
  const registry = readJson<Registry>(registryPath, failures);
  const catalog = readJson<Catalog>(join(root, "DOCS/artifacts/source-catalog.json"), failures);
  if (!registry || !catalog) return failures;
  if (registry.registryVersion !== 1 || !Array.isArray(registry.documents) || !Array.isArray(registry.exemptPrefixes)) {
    failures.push("DOCS/registry.json must declare registryVersion 1, documents, and exemptPrefixes");
    return failures;
  }
  const ids = new Set<string>();
  const paths = new Set<string>();
  const sourceIds = new Set(catalog.assets.map((asset) => asset.id));
  const ruleIds = new Set<string>();
  const modules: RegistryDocument[] = [];
  for (const document of registry.documents) {
    if (!/^[a-z0-9-]+$/.test(document.id) || ids.has(document.id)) failures.push(`invalid or duplicate documentation id ${document.id}`);
    ids.add(document.id);
    if (!document.path.startsWith("DOCS/") || !document.path.endsWith(".md") || paths.has(document.path)) failures.push(`invalid or duplicate documentation path ${document.path}`);
    paths.add(document.path);
    if (!document.title.trim() || !validClasses.has(document.class) || !validOwners.has(document.owner) || !validAuthorities.has(document.authority) || !Array.isArray(document.relatedArtifacts)) {
      failures.push(`invalid registry metadata for ${document.id}`);
    }
    for (const artifact of document.relatedArtifacts ?? []) {
      if (typeof artifact !== "string" || (!sourceIds.has(artifact) && !existsSync(join(root, artifact)))) {
        failures.push(`registered document ${document.id} references missing related artifact ${String(artifact)}`);
      }
    }
    const fullPath = join(root, document.path);
    if (!existsSync(fullPath)) { failures.push(`registered document is missing: ${document.path}`); continue; }
    const text = readFileSync(fullPath, "utf8");
    if (markdownH1(text) !== document.title) failures.push(`${document.path} H1 does not match registry title`);
    if (document.class === "rule-module") {
      modules.push(document);
      for (const error of validateRuleModule(document.path, text, sourceIds)) failures.push(error);
      for (const entry of text.matchAll(/^## ((?:SR|SH)-[A-Z]+-\d{3})\s+—/gm)) {
        const id = entry[1]!;
        if (ruleIds.has(id)) failures.push(`duplicate rule id ${id}`);
        ruleIds.add(id);
      }
    }
  }
  const governedFiles = markdownFiles(root, ["DOCS"])
    .map((file) => toRepoPath(root, file))
    .filter((path) => !registry.exemptPrefixes.some((prefix) => path.startsWith(prefix)));
  for (const path of governedFiles) if (!paths.has(path)) failures.push(`governed document is not registered: ${path}`);

  for (const game of ["speedrunners", "shadowraiders"]) {
    const landing = join(root, "DOCS/rules", `${game}.md`);
    if (!existsSync(landing)) { failures.push(`missing ${game} rules landing page`); continue; }
    const landingText = readFileSync(landing, "utf8");
    for (const module of modules.filter((item) => item.path.startsWith(`DOCS/rules/${game}/`))) {
      const relativePath = module.path.slice("DOCS/rules/".length);
      if (!landingText.includes(`](${relativePath})`)) failures.push(`DOCS/rules/${game}.md does not link ${relativePath}`);
    }
  }
  const allDocs = markdownFiles(root, ["README.md", "AGENTS.md", "DOCS", "MEMORIES", "spec", "tasks"]);
  failures.push(...validateMarkdownLinks(root, allDocs));
  return failures;
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const failures = validateDocs(root);
  for (const failure of failures) console.error(`error: ${failure}`);
  if (failures.length) process.exit(1);
  console.log("documentation validation passed");
}
