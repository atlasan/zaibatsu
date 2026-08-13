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
const knowledgeTaxonomy = readJson(join(root, "spec/knowledge/taxonomy.json"));
const knowledgeCatalog = readJson(join(root, "spec/knowledge/catalog.json"));
const knowledgeRelations = readJson(join(root, "spec/knowledge/relations.json"));
const inventory = readJson(join(root, "spec/inventory.json"));
const blockLayoutData = readJson(join(root, "spec/data/block-layouts.json"));
const standardBlockLayout = (blockLayoutData.layouts as Json[] | undefined)?.find((layout) => layout.id === "standard-seven-small-hex-grid");
const standardZoneIds = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "h7"]);
if (!standardBlockLayout || standardBlockLayout.smallHexCount !== 7 || !Array.isArray(standardBlockLayout.zones) || standardBlockLayout.zones.length !== 7 || !Array.isArray(standardBlockLayout.corners) || standardBlockLayout.corners.length !== 6 || !Array.isArray(standardBlockLayout.edges) || standardBlockLayout.edges.length !== 6) {
  fail("block-layouts.json must declare calibrated seven-zone block geometry");
} else {
  const zones = standardBlockLayout.zones as Json[];
  const ids = new Set(zones.map((zone) => String(zone.id)));
  if (ids.size !== 7 || [...standardZoneIds].some((id) => !ids.has(id)) || zones.some((zone) => !Number.isFinite(zone.x) || !Number.isFinite(zone.y) || !Array.isArray(zone.touches))) fail("standard seven-zone layout must contain exact named zones with coordinates and adjacency");
  const shape = standardBlockLayout.zoneShape as Json | undefined;
  const width = shape?.width as number | undefined; const height = shape?.height as number | undefined;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0) fail("standard seven-zone layout must declare positive zone dimensions");
  else {
    const minX = Math.min(...zones.map((zone) => (zone.x as number) - width! / 2)); const maxX = Math.max(...zones.map((zone) => (zone.x as number) + width! / 2));
    const minY = Math.min(...zones.map((zone) => (zone.y as number) - height! / 2)); const maxY = Math.max(...zones.map((zone) => (zone.y as number) + height! / 2));
    if (minX > 8 || maxX < 92 || minY > 2 || maxY < 98) fail("seven physical zones must collectively span the full source block hex, not a central sub-grid");
  }
}
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

// The editor example is non-canonical, but must use the source-backed seven-zone model.
const editorSession = readJson(join(root, "spec/editor/block-editor-session.example.json"));
const zoneIds = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "h7"]);
if (editorSession.sessionVersion !== 3 || editorSession.assetManifestPath !== "spec/assets/manifest.json") fail("block editor example must declare sessionVersion 3 and the canonical asset manifest");
for (const document of (editorSession.documents as Json[] | undefined) ?? []) {
  const source = document.source as Json | undefined; const block = document.block as Json | undefined; const provenance = document.provenance as Json | undefined;
  if (document.resourceType !== "block" || !validId(document.id) || !assetIds.has(String(source?.assetId))) fail(`block editor document ${String(document.id)} has an invalid source asset`);
  if (block?.layoutId !== "standard-seven-small-hex-grid") fail(`block editor document ${String(document.id)} must use the standard seven-zone layout`);
  if (!Array.isArray(block?.edges) || block.edges.length !== 6 || !Array.isArray(block?.boundarySpaces) || block.boundarySpaces.length !== 6 || !Array.isArray(block?.bonusCorners) || block.bonusCorners.length !== 6) fail(`block editor document ${String(document.id)} must define six edges, boundary lists, and corners`);
  const owners = new Set<string>(); const spaces = (block?.spaces as Json[] | undefined) ?? []; const spaceIds = new Set(spaces.map((space) => String(space.id)));
  for (const space of spaces) {
    const selected = space.zoneIds as Json[] | undefined; const capacity = space.capacity;
    if (!validId(space.id) || !Array.isArray(selected) || !selected.length || new Set(selected.map(String)).size !== selected.length || selected.some((id) => !zoneIds.has(String(id)))) fail(`block editor document ${String(document.id)} has invalid selected zones`);
    for (const id of selected ?? []) { if (owners.has(String(id))) fail(`block editor document ${String(document.id)} has duplicate zone ownership ${String(id)}`); owners.add(String(id)); }
    if (!(capacity === "unlimited" || (Number.isInteger(capacity) && (capacity as number) > 0))) fail(`block editor document ${String(document.id)} has invalid explicit capacity`);
    if (!Array.isArray(space.neighbors) || space.neighbors.some((id) => !spaceIds.has(String(id)))) fail(`block editor document ${String(document.id)} has invalid inferred neighbours`);
  }
  if (typeof source?.assetId === "string" && !strings(block?.assetRefs).includes(source.assetId)) fail(`block editor document ${String(document.id)} must retain its selected asset reference`);
  if (!artifactIds.has(String(provenance?.primaryArtifactId)) || !Number.isInteger(provenance?.page) || typeof provenance?.locator !== "string") fail(`block editor document ${String(document.id)} lacks primary provenance`);
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
        if (group === "blocks" && record.layoutId !== "standard-seven-small-hex-grid") fail(`${expansion}/${name} block ${String(record.id)} must use the standard seven-small-hex layout`);
        if (typeof record.id === "string") ids.add(record.id);
      }
    }
  }
}

// The knowledge layer is the canonical cross-reference index across sources, assets, data, and docs.
if (knowledgeTaxonomy.taxonomyVersion !== 1) fail("spec/knowledge/taxonomy.json must declare taxonomyVersion 1");
const allowedKnowledgeTags = new Set<string>();
for (const tag of (knowledgeTaxonomy.tags as Json[] | undefined) ?? []) {
  if (typeof tag.tag !== "string" || !/^[a-z][a-z0-9-]*:[a-z0-9-]+$/.test(tag.tag) || typeof tag.description !== "string" || !tag.description.trim()) {
    fail(`invalid knowledge tag ${String(tag.tag)}`);
    continue;
  }
  if (allowedKnowledgeTags.has(tag.tag)) fail(`duplicate knowledge tag ${tag.tag}`);
  allowedKnowledgeTags.add(tag.tag);
}
const allowedRelationTypes = new Set<string>();
for (const relationType of (knowledgeTaxonomy.relationTypes as Json[] | undefined) ?? []) {
  if (typeof relationType.type !== "string" || !/^[a-z][a-z0-9-]*$/.test(relationType.type) || typeof relationType.description !== "string" || !relationType.description.trim()) {
    fail(`invalid knowledge relation type ${String(relationType.type)}`);
    continue;
  }
  if (allowedRelationTypes.has(relationType.type)) fail(`duplicate knowledge relation type ${relationType.type}`);
  allowedRelationTypes.add(relationType.type);
}

if (knowledgeCatalog.catalogVersion !== 1) fail("spec/knowledge/catalog.json must declare catalogVersion 1");
const knowledgeEntries = new Map<string, Json>();
for (const entry of (knowledgeCatalog.entries as Json[] | undefined) ?? []) {
  if (typeof entry.entryId !== "string" || !/^[a-z0-9./-]+$/.test(entry.entryId)) { fail(`invalid knowledge entry id ${String(entry.entryId)}`); continue; }
  if (knowledgeEntries.has(entry.entryId)) { fail(`duplicate knowledge entry id ${entry.entryId}`); continue; }
  knowledgeEntries.set(entry.entryId, entry);
  if (typeof entry.kind !== "string" || !/^[a-z][a-z0-9-]*$/.test(entry.kind)) fail(`invalid knowledge entry kind for ${entry.entryId}`);
  if (typeof entry.localId !== "string" || !/^[a-z0-9./-]+$/.test(entry.localId)) fail(`invalid knowledge localId for ${entry.entryId}`);
  if (typeof entry.title !== "string" || !entry.title.trim()) fail(`knowledge entry ${entry.entryId} needs a title`);
  if (!["provisional", "cataloged", "verified", "implemented"].includes(String(entry.status))) fail(`knowledge entry ${entry.entryId} has invalid status ${String(entry.status)}`);
  if (entry.expansion !== undefined && !["speedrunners", "shadowraiders", "shared"].includes(String(entry.expansion))) fail(`knowledge entry ${entry.entryId} has invalid expansion ${String(entry.expansion)}`);
  const tags = entry.tags as Json[] | undefined;
  if (!Array.isArray(tags) || tags.length === 0) fail(`knowledge entry ${entry.entryId} must declare tags`);
  const tagSet = new Set<string>();
  for (const tag of tags ?? []) {
    if (typeof tag !== "string" || !allowedKnowledgeTags.has(tag)) fail(`knowledge entry ${entry.entryId} references unknown tag ${String(tag)}`);
    else if (tagSet.has(tag)) fail(`knowledge entry ${entry.entryId} duplicates tag ${tag}`);
    else tagSet.add(tag);
  }
  if (typeof entry.kind === "string" && !tagSet.has(`resource:${entry.kind}`)) fail(`knowledge entry ${entry.entryId} must include resource:${entry.kind}`);
  if (typeof entry.status === "string" && !tagSet.has(`status:${entry.status}`)) fail(`knowledge entry ${entry.entryId} must include status:${entry.status}`);
  if (typeof entry.expansion === "string" && !tagSet.has(`game:${entry.expansion}`)) fail(`knowledge entry ${entry.entryId} must include game:${entry.expansion}`);
  const refs = entry.refs as Json | undefined;
  if (!refs) { fail(`knowledge entry ${entry.entryId} is missing refs`); continue; }
  for (const path of strings(refs.filePaths)) {
    if (!existsSync(join(root, path))) fail(`knowledge entry ${entry.entryId} references missing file path ${path}`);
  }
  for (const path of strings(refs.docPaths)) {
    if (!existsSync(join(root, path))) fail(`knowledge entry ${entry.entryId} references missing doc path ${path}`);
  }
  for (const assetId of strings(refs.assetIds)) {
    if (!assetIds.has(assetId)) fail(`knowledge entry ${entry.entryId} references unknown asset ${assetId}`);
  }
  for (const sourceId of strings(refs.sourceIds)) {
    if (!artifactIds.has(sourceId)) fail(`knowledge entry ${entry.entryId} references unknown source ${sourceId}`);
  }
}

if (knowledgeRelations.catalogVersion !== 1) fail("spec/knowledge/relations.json must declare catalogVersion 1");
for (const relation of (knowledgeRelations.relations as Json[] | undefined) ?? []) {
  if (typeof relation.type !== "string" || !allowedRelationTypes.has(relation.type)) fail(`invalid knowledge relation type ${String(relation.type)}`);
  if (typeof relation.from !== "string" || !knowledgeEntries.has(relation.from)) fail(`knowledge relation references unknown from entry ${String(relation.from)}`);
  if (typeof relation.to !== "string" || !knowledgeEntries.has(relation.to)) fail(`knowledge relation references unknown to entry ${String(relation.to)}`);
  if (relation.locator !== undefined && (typeof relation.locator !== "string" || !relation.locator.trim())) fail(`knowledge relation ${String(relation.type)} must use a non-empty locator`);
  if (relation.note !== undefined && (typeof relation.note !== "string" || !relation.note.trim())) fail(`knowledge relation ${String(relation.type)} must use a non-empty note`);
}

for (const asset of (assetManifest.assets as Json[] | undefined) ?? []) {
  if (typeof asset.gameplayRef !== "string") continue;
  const target = knowledgeEntries.get(asset.gameplayRef);
  if (!target) { fail(`asset ${String(asset.assetId)} gameplayRef points to unknown knowledge entry ${asset.gameplayRef}`); continue; }
  if (target.status !== "verified") fail(`asset ${String(asset.assetId)} gameplayRef must point to a verified knowledge entry`);
}

if (failures.length) {
  for (const message of failures) console.error(`error: ${message}`);
  process.exit(1);
}
console.log(`spec validation passed: ${productIds.size} products, ${modeIds.size} modes, ${artifactIds.size} local source artifacts, ${knowledgeEntries.size} knowledge entries`);
