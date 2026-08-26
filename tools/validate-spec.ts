#!/usr/bin/env bun

// Validates the tracked knowledge baseline without requiring ignored source PDFs.
// Full source checksum verification remains tools/verify-artifacts.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

type Json = Record<string, unknown>;
const root = resolve(import.meta.dir, "..");
const failures: string[] = [];
const validationManifestPath = join(root, "spec/validation/manifest.json");

function fail(message: string): void { failures.push(message); }
function readJson(path: string): Json {
  try { return JSON.parse(readFileSync(path, "utf8")) as Json; }
  catch (error) { fail(`cannot parse ${path}: ${(error as Error).message}`); return {}; }
}
function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function strings(value: unknown): string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : [];
}
function validId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9-]+$/.test(value); }
function isObject(value: unknown): value is Json { return typeof value === "object" && value !== null && !Array.isArray(value); }
function rel(path: string): string { return relative(root, path).replaceAll("\\", "/"); }

type Schema = Json;
type ManifestEntry = { expansion: string; files: Array<{ path: string; sha256: string }> };

function schemaAt(rootSchema: Schema, ref: string): unknown {
  if (!ref.startsWith("#/")) throw new Error(`unsupported schema ref ${ref}`);
  let current: unknown = rootSchema;
  for (const part of ref.slice(2).split("/")) {
    if (!isObject(current) || !(part in current)) throw new Error(`cannot resolve schema ref ${ref}`);
    current = current[part];
  }
  return current;
}

function addSchemaError(errors: string[], path: string, message: string): void {
  errors.push(`${path} ${message}`.trim());
}

function schemaRoot(schema: unknown, fallback: Schema): Schema {
  return isObject(schema) && isObject(schema.$defs) ? schema : fallback;
}

function validateSchemaValue(
  value: unknown,
  schema: unknown,
  rootSchema: Schema,
  path: string,
  errors: string[],
): void {
  if (!isObject(schema)) return;
  if (typeof schema.$ref === "string") {
    validateSchemaValue(value, schemaAt(rootSchema, schema.$ref), rootSchema, path, errors);
    return;
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((option) => {
      const optionErrors: string[] = [];
      validateSchemaValue(value, option, schemaRoot(option, rootSchema), path, optionErrors);
      return optionErrors.length === 0;
    });
    if (matches.length !== 1) addSchemaError(errors, path, `must match exactly one schema variant (matched ${matches.length})`);
    return;
  }
  if (schema.const !== undefined && value !== schema.const) addSchemaError(errors, path, `must equal ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) addSchemaError(errors, path, `must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
  if (schema.type === "object") {
    if (!isObject(value)) {
      addSchemaError(errors, path, "must be an object");
      return;
    }
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const key of Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []) {
      if (!(key in value)) addSchemaError(errors, `${path}.${key}`, "is required");
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) addSchemaError(errors, `${path}.${key}`, "is not allowed");
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) validateSchemaValue(value[key], propertySchema, schemaRoot(propertySchema, rootSchema), `${path}.${key}`, errors);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      addSchemaError(errors, path, "must be an array");
      return;
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) addSchemaError(errors, path, `must have at least ${schema.minItems} item(s)`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) addSchemaError(errors, path, `must have at most ${schema.maxItems} item(s)`);
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) addSchemaError(errors, path, "must not contain duplicate items");
        seen.add(key);
      }
    }
    value.forEach((item, index) => validateSchemaValue(item, schema.items, schemaRoot(schema.items, rootSchema), `${path}[${index}]`, errors));
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") {
      addSchemaError(errors, path, "must be a string");
      return;
    }
    if (typeof schema.minLength === "number" && value.length < schema.minLength) addSchemaError(errors, path, `must be at least ${schema.minLength} character(s)`);
    if (typeof schema.pattern === "string" && !(new RegExp(schema.pattern).test(value))) addSchemaError(errors, path, `must match ${schema.pattern}`);
    return;
  }
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) {
      addSchemaError(errors, path, "must be an integer");
      return;
    }
    if (typeof schema.minimum === "number" && value < schema.minimum) addSchemaError(errors, path, `must be >= ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) addSchemaError(errors, path, `must be <= ${schema.maximum}`);
    return;
  }
  if (schema.type === "boolean" && typeof value !== "boolean") {
    addSchemaError(errors, path, "must be a boolean");
  }
}

function collectionSchema(key: string, itemSchema: Schema): Schema {
  return {
    type: "object",
    required: [key],
    additionalProperties: false,
    properties: {
      $comment: { type: "string" },
      [key]: { type: "array", items: itemSchema },
    },
  };
}

function allowComment(schema: Schema): Schema {
  return {
    ...schema,
    properties: {
      ...(isObject(schema.properties) ? schema.properties : {}),
      $comment: { type: "string" },
    },
  };
}

function validateFileAgainstSchema(path: string, schema: Schema, label: string): void {
  const data = readJson(path);
  const errors: string[] = [];
  validateSchemaValue(data, schema, schema, "$", errors);
  for (const message of errors) fail(`${label}: ${message}`);
}

function buildValidationManifestEntry(expansion: string, files: string[]): ManifestEntry {
  return {
    expansion,
    files: files
      .map((path) => ({ path: rel(path), sha256: sha256File(path) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function writeValidationManifest(entries: ManifestEntry[]): void {
  mkdirSync(join(root, "spec/validation"), { recursive: true });
  writeFileSync(validationManifestPath, `${JSON.stringify({
    manifestVersion: 1,
    generatedBy: "tools/validate-spec.ts",
    entries,
  }, null, 2)}\n`);
}

const artifactCatalog = readJson(join(root, "DOCS/artifacts/source-catalog.json"));
const artifactIds = new Set(strings((artifactCatalog.assets as Json[] | undefined)?.map((asset) => asset.id)));
const assetManifest = readJson(join(root, "spec/assets/manifest.json"));
const assetIds = new Set(strings((assetManifest.assets as Json[] | undefined)?.map((asset) => asset.assetId)));
const knowledgeTaxonomy = readJson(join(root, "spec/knowledge/taxonomy.json"));
const knowledgeCatalog = readJson(join(root, "spec/knowledge/catalog.json"));
const knowledgeRelations = readJson(join(root, "spec/knowledge/relations.json"));
const blockSchema = readJson(join(root, "spec/schema/block.schema.json"));
const pawnSchema = readJson(join(root, "spec/schema/pawn.schema.json"));
const actionCardSchema = readJson(join(root, "spec/schema/action-card.schema.json"));
const modeSchema = readJson(join(root, "spec/schema/mode.schema.json"));
const controlCardSchema = readJson(join(root, "spec/schema/control-card.schema.json"));
const threatSchema = readJson(join(root, "spec/schema/threat.schema.json"));
const missionCardSchema = readJson(join(root, "spec/schema/mission-card.schema.json"));
const inventory = readJson(join(root, "spec/inventory.json"));
const transcriptPaths = [
  "DOCS/rules/transcripts/README.md",
  "DOCS/rules/transcripts/speedrunners-rulebook.en.md",
  "DOCS/rules/transcripts/speedrunners-rulebook.es.md",
  "DOCS/rules/transcripts/shadowraiders-rulebook.en.md",
  "DOCS/rules/transcripts/shadowraiders-rulebook.es.md",
  "DOCS/rules/transcripts/speedrunners-components.en.md",
  "DOCS/rules/transcripts/speedrunners-components.es.md",
  "DOCS/rules/transcripts/shadowraiders-components.en.md",
  "DOCS/rules/transcripts/shadowraiders-components.es.md",
];
for (const path of transcriptPaths) {
  if (!existsSync(join(root, path))) fail(`missing tracked transcript ${path}`);
}
const blockLayoutData = readJson(join(root, "spec/data/block-layouts.json"));
const standardBlockLayout = (blockLayoutData.layouts as Json[] | undefined)?.find((layout) => layout.id === "standard-seven-zone-2-3-2-pointy");
const standardZoneIds = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "h7"]);
if (!standardBlockLayout || standardBlockLayout.smallHexCount !== 7 || !Array.isArray(standardBlockLayout.zones) || standardBlockLayout.zones.length !== 7 || !Array.isArray(standardBlockLayout.corners) || standardBlockLayout.corners.length !== 6 || !Array.isArray(standardBlockLayout.edges) || standardBlockLayout.edges.length !== 6) {
  fail("block-layouts.json must declare calibrated seven-zone block geometry");
} else {
  const zones = standardBlockLayout.zones as Json[];
  const ids = new Set(zones.map((zone) => String(zone.id)));
  if (ids.size !== 7 || [...standardZoneIds].some((id) => !ids.has(id)) || zones.some((zone) => !Number.isFinite(zone.x) || !Number.isFinite(zone.y) || !Array.isArray(zone.touches))) fail("standard seven-zone layout must contain exact named zones with coordinates and adjacency");
  const entranceZoneIds = (standardBlockLayout.edges as Json[]).map((edge) => String(edge.zoneId));
  if (JSON.stringify(entranceZoneIds) !== JSON.stringify(["h3", "h4", "h5", "h6", "h7", "h2"])) fail("each clockwise entrance must map to its matching standardized ring hex");
  const shape = standardBlockLayout.zoneShape as Json | undefined;
  const width = shape?.width as number | undefined; const height = shape?.height as number | undefined;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0) fail("standard seven-zone layout must declare positive zone dimensions");
  else {
    const minX = Math.min(...zones.map((zone) => (zone.x as number) - width! / 2)); const maxX = Math.max(...zones.map((zone) => (zone.x as number) + width! / 2));
    const minY = Math.min(...zones.map((zone) => (zone.y as number) - height! / 2)); const maxY = Math.max(...zones.map((zone) => (zone.y as number) + height! / 2));
    if (Math.abs(Number((zones.find((z) => z.id === "h2")?.x)) - 33.3333) > .01 || Math.abs(Number((zones.find((z) => z.id === "h3")?.x)) - 66.6667) > .01 || Math.abs(Number((zones.find((z) => z.id === "h7")?.x)) - 16.6667) > .01 || Math.abs(Number((zones.find((z) => z.id === "h4")?.x)) - 83.3333) > .01) fail("seven placement hexes must use the source-aligned 2-3-2 point-up anchors");
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
if (editorSession.sessionVersion !== 4 || editorSession.assetManifestPath !== "spec/assets/manifest.json") fail("block editor example must declare sessionVersion 4 and the canonical asset manifest");
for (const document of (editorSession.documents as Json[] | undefined) ?? []) {
  const source = document.source as Json | undefined; const block = document.block as Json | undefined; const provenance = document.provenance as Json | undefined;
  if (document.resourceType !== "block" || !validId(document.id) || !assetIds.has(String(source?.assetId))) fail(`block editor document ${String(document.id)} has an invalid source asset`);
  if (block?.layoutId !== "standard-seven-zone-2-3-2-pointy") fail(`block editor document ${String(document.id)} must use the standard seven-zone layout`);
  if (!Array.isArray(block?.edges) || block.edges.length !== 6 || !Array.isArray(block?.boundarySpaces) || block.boundarySpaces.length !== 6 || !Array.isArray(block?.bonusCorners) || block.bonusCorners.length !== 6) fail(`block editor document ${String(document.id)} must define six edges, boundary lists, and corners`);
  const owners = new Set<string>(); const spaces = (block?.spaces as Json[] | undefined) ?? []; const spaceIds = new Set(spaces.map((space) => String(space.id)));
  for (const space of spaces) {
    const selected = space.zoneIds as Json[] | undefined; const capacity = space.capacity;
    if (!validId(space.id) || !Array.isArray(selected) || !selected.length || new Set(selected.map(String)).size !== selected.length || selected.some((id) => !zoneIds.has(String(id)))) fail(`block editor document ${String(document.id)} has invalid selected zones`);
    for (const id of selected ?? []) { if (owners.has(String(id))) fail(`block editor document ${String(document.id)} has duplicate zone ownership ${String(id)}`); owners.add(String(id)); }
    if (!(capacity === "unlimited" || (Number.isInteger(capacity) && (capacity as number) > 0))) fail(`block editor document ${String(document.id)} has invalid explicit capacity`);
    if (space.displayShape !== undefined && !["auto", "circle", "capsule", "compound"].includes(String(space.displayShape))) fail(`block editor document ${String(document.id)} has invalid display shape`);
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
        if (group === "blocks" && record.layoutId !== "standard-seven-zone-2-3-2-pointy") fail(`${expansion}/${name} block ${String(record.id)} must use the standard 2-3-2 seven-hex layout`);
        if (typeof record.id === "string") ids.add(record.id);
      }
    }
  }
}

validateFileAgainstSchema(join(root, "spec/data/speedrunners/blocks.json"), collectionSchema("blocks", blockSchema), "speedrunners/blocks.json");
validateFileAgainstSchema(join(root, "spec/data/speedrunners/pawns.json"), collectionSchema("pawns", pawnSchema), "speedrunners/pawns.json");
validateFileAgainstSchema(join(root, "spec/data/speedrunners/action-cards.json"), collectionSchema("cards", actionCardSchema), "speedrunners/action-cards.json");
validateFileAgainstSchema(join(root, "spec/data/speedrunners/mode.json"), allowComment(modeSchema), "speedrunners/mode.json");
validateFileAgainstSchema(join(root, "spec/data/shadowraiders/control-cards.json"), collectionSchema("controlCards", controlCardSchema), "shadowraiders/control-cards.json");
validateFileAgainstSchema(join(root, "spec/data/shadowraiders/threats.json"), collectionSchema("threats", threatSchema), "shadowraiders/threats.json");
validateFileAgainstSchema(join(root, "spec/data/shadowraiders/missions.json"), collectionSchema("missions", missionCardSchema), "shadowraiders/missions.json");

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

const validationManifestEntries: ManifestEntry[] = [];
const speedrunnersLoaderFiles = [
  join(root, "spec/data/speedrunners/blocks.json"),
  join(root, "spec/data/speedrunners/pawns.json"),
  join(root, "spec/data/speedrunners/action-cards.json"),
  join(root, "spec/data/speedrunners/mode.json"),
  join(root, "spec/schema/block.schema.json"),
  join(root, "spec/schema/pawn.schema.json"),
  join(root, "spec/schema/action-card.schema.json"),
  join(root, "spec/schema/mode.schema.json"),
];
if (speedrunnersLoaderFiles.every((path) => existsSync(path))) {
  validationManifestEntries.push(buildValidationManifestEntry("speedrunners", speedrunnersLoaderFiles));
}

if (failures.length) {
  for (const message of failures) console.error(`error: ${message}`);
  process.exit(1);
}
writeValidationManifest(validationManifestEntries);
console.log(`spec validation passed: ${productIds.size} products, ${modeIds.size} modes, ${artifactIds.size} local source artifacts, ${knowledgeEntries.size} knowledge entries; wrote ${rel(validationManifestPath)}`);
