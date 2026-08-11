#!/usr/bin/env bun

// Validates the tracked knowledge baseline without requiring ignored source PDFs.
// Full source checksum verification remains tools/verify-artifacts.ts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;
const root = resolve(import.meta.dir, "..");
const failures: string[] = [];

function fail(message: string): void { failures.push(message); }
function readJson(path: string): Json {
  try { return JSON.parse(readFileSync(path, "utf8")) as Json; }
  catch (error) { fail(`cannot parse ${path}: ${(error as Error).message}`); return {}; }
}
function strings(value: unknown): string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : [];
}
function validId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9-]+$/.test(value); }

const artifactCatalog = readJson(join(root, "DOCS/artifacts/source-catalog.json"));
const artifactIds = new Set(strings((artifactCatalog.assets as Json[] | undefined)?.map((asset) => asset.id)));
const assetManifest = readJson(join(root, "spec/assets/manifest.json"));
const assetIds = new Set(strings((assetManifest.assets as Json[] | undefined)?.map((asset) => asset.assetId)));
const inventory = readJson(join(root, "spec/inventory.json"));
const externalCatalog = readJson(join(root, "DOCS/artifacts/external-sources.json"));
const externalIds = new Set<string>();
for (const source of (externalCatalog.sources as Json[] | undefined) ?? []) {
  if (!validId(source.id) || externalIds.has(source.id)) {
    fail(`invalid or duplicate external source id ${String(source.id)}`);
    continue;
  }
  externalIds.add(source.id);
  if (typeof source.url !== "string" || !source.url.startsWith("https://")
    || !["primary", "supporting"].includes(String(source.authority))) {
    fail(`invalid external source metadata for ${String(source.id)}`);
  }
  if (source.id.startsWith("bgg-") && source.purpose !== "listing-metadata-only") {
    fail(`BoardGameGeek source ${source.id} must remain listing metadata only`);
  }

}
if (inventory.inventoryVersion !== 1) fail("spec/inventory.json must declare inventoryVersion 1");
const rights = inventory.rights as Json | undefined;
const rightsEvidence = rights?.evidence as Json | undefined;
if (!rights || !validId(rightsEvidence?.artifactId) || !artifactIds.has(rightsEvidence.artifactId)) {
  fail("inventory rights evidence must reference a cataloged artifact");
}

const productIds = new Set<string>();
for (const product of (inventory.products as Json[] | undefined) ?? []) {
  if (!validId(product.id) || productIds.has(product.id)) fail(`invalid or duplicate product id ${String(product.id)}`);
  if (typeof product.id === "string") productIds.add(product.id);
  for (const id of [...strings(product.primaryArtifacts), ...strings(product.crossCheckArtifacts)]) {
    if (!artifactIds.has(id)) fail(`product ${String(product.id)} references unknown artifact ${id}`);
  }
  const components = product.components as Json[] | undefined;
  if (!Array.isArray(components) || components.length === 0) fail(`product ${String(product.id)} has no components`);
  for (const component of components ?? []) {
    if (typeof component.kind !== "string" || !Number.isInteger(component.count) || (component.count as number) < 1) {
      fail(`invalid component in ${String(product.id)}`);
    }
    const evidence = component.evidence as Json | undefined;
    if (!validId(evidence?.artifactId) || !artifactIds.has(evidence.artifactId) || typeof evidence.locator !== "string") {
      fail(`component ${String(component.kind)} in ${String(product.id)} lacks cataloged evidence`);
    }
  }
}

const modeIds = new Set<string>();
for (const mode of (inventory.modes as Json[] | undefined) ?? []) {
  if (!validId(mode.id) || modeIds.has(mode.id)) fail(`invalid or duplicate mode id ${String(mode.id)}`);
  if (typeof mode.id === "string") modeIds.add(mode.id);
  const players = mode.players as Json | undefined;
  if (!Number.isInteger(players?.min) || !Number.isInteger(players?.max) || (players?.min as number) > (players?.max as number)) {
    fail(`invalid player range for mode ${String(mode.id)}`);
  }
  const evidence = mode.evidence as Json | undefined;
  if (!validId(evidence?.artifactId) || !artifactIds.has(evidence.artifactId) || typeof evidence.locator !== "string") {
    fail(`mode ${String(mode.id)} lacks cataloged evidence`);
  }
}

// The editor example is non-canonical, but it must remain usable against the
// source-backed asset contract and the block record shape it is intended to edit.
const editorSession = readJson(join(root, "spec/editor/block-editor-session.example.json"));
if (editorSession.sessionVersion !== 1 || editorSession.assetManifestPath !== "spec/assets/manifest.json") {
  fail("block editor example must declare sessionVersion 1 and the canonical asset manifest");
}
for (const document of (editorSession.documents as Json[] | undefined) ?? []) {
  const source = document.source as Json | undefined;
  const block = document.block as Json | undefined;
  const provenance = document.provenance as Json | undefined;
  if (document.resourceType !== "block" || !validId(document.id) || !assetIds.has(String(source?.assetId))) {
    fail(`block editor document ${String(document.id)} has an invalid source asset`);
  }
  if (!validId(block?.id) || typeof block?.name !== "string" || !["speedrunners", "shadowraiders"].includes(String(block?.expansion))) {
    fail(`block editor document ${String(document.id)} has an invalid block draft`);
  }
  if (!Array.isArray(block?.edges) || block.edges.length !== 6 || !Array.isArray(block?.boundarySpaces) || block.boundarySpaces.length !== 6) {
    fail(`block editor document ${String(document.id)} must define six edges and six boundary-space lists`);
  }
  if (!Array.isArray(block?.bonusCorners) || block.bonusCorners.length !== 6 || block.bonusCorners.filter((corner) => corner === true).length !== block.bonusFragments) {
    fail(`block editor document ${String(document.id)} must keep bonus fragments aligned with six bonus corners`);
  }
  for (const space of (block?.spaces as Json[] | undefined) ?? []) {
    const location = space.location as Json | undefined;
    if (location && (!Number.isFinite(location.x) || !Number.isFinite(location.y) || (location.x as number) < 0 || (location.x as number) > 100 || (location.y as number) < 0 || (location.y as number) > 100)) {
      fail(`block editor document ${String(document.id)} has an invalid visual space location`);
    }
  }
  if (typeof source?.assetId === "string" && !strings(block?.assetRefs).includes(source.assetId)) {
    fail(`block editor document ${String(document.id)} must retain its selected asset reference`);
  }
  if (!artifactIds.has(String(provenance?.primaryArtifactId)) || !Number.isInteger(provenance?.page) || typeof provenance?.locator !== "string") {
    fail(`block editor document ${String(document.id)} lacks primary provenance`);
  }
}

// Prevent the runtime seed from being misrepresented as source-verified content.
for (const expansion of ["speedrunners", "shadowraiders"]) {
  const dataDir = join(root, "spec/data", expansion);
  if (!existsSync(dataDir)) { fail(`missing data directory for ${expansion}`); continue; }
  for (const name of readdirSync(dataDir).filter((file) => file.endsWith(".json"))) {
    const content = readJson(join(dataDir, name));
    const groups = ["blocks", "pawns", "cards", "controlCards", "threats", "missions"];
    for (const group of groups) {
      const records = content[group];
      if (!Array.isArray(records)) continue;
      const ids = new Set<string>();
      for (const record of records as Json[]) {
        if (!validId(record.id) || ids.has(record.id)) fail(`${expansion}/${name} has invalid or duplicate record id ${String(record.id)}`);
        if (typeof record.id === "string") ids.add(record.id);
      }
    }
  }
}

if (failures.length) {
  for (const message of failures) console.error(`error: ${message}`);
  process.exit(1);
}
console.log(`spec validation passed: ${productIds.size} products, ${modeIds.size} modes, ${artifactIds.size} local source artifacts`);
