#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type Json = Record<string, unknown>;
type Status = "provisional" | "cataloged" | "verified" | "implemented";

interface TaxonomyTag { tag: string; description: string; }
interface RelationType { type: string; description: string; }
interface TaxonomyFile { taxonomyVersion: 1; tags: TaxonomyTag[]; relationTypes: RelationType[]; }
interface CatalogEntry {
  entryId: string;
  kind: string;
  localId: string;
  title: string;
  status: Status;
  expansion?: "speedrunners" | "shadowraiders" | "shared";
  tags: string[];
  summary?: string;
  refs: {
    filePaths: string[];
    docPaths: string[];
    assetIds: string[];
    sourceIds: string[];
  };
}
interface Relation { type: string; from: string; to: string; locator?: string; note?: string; }

const root = resolve(import.meta.dir, "..");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const uniq = <T>(values: T[]): T[] => [...new Set(values)];
const sortStrings = (values: string[]): string[] => [...values].sort((left, right) => left.localeCompare(right));
const canonicalPath = (value: string): string => value.replaceAll("\\", "/");
const entryId = (kind: string, localId: string): string => `${kind}/${localId.toLowerCase()}`;

const taxonomy = readJson<TaxonomyFile>(join(root, "spec/knowledge/taxonomy.json"));
const allowedTags = new Set(taxonomy.tags.map((item) => item.tag));
const allowedRelations = new Set(taxonomy.relationTypes.map((item) => item.type));

const docPaths = [
  "README.md",
  "DOCS/knowledge/INDEX.md",
  "DOCS/knowledge/catalog.md",
  "DOCS/domain-model.md",
  "DOCS/lifecycle.md",
  "DOCS/artifacts/README.md",
  "DOCS/artifacts/toolset.md",
  "DOCS/rules/speedrunners.md",
  "DOCS/rules/shadowraiders.md",
  "DOCS/block-editor-plan.md",
];

const inventory = readJson<Json>(join(root, "spec/inventory.json"));
const sourceCatalog = readJson<Json>(join(root, "DOCS/artifacts/source-catalog.json"));
const assetManifest = readJson<Json>(join(root, "spec/assets/manifest.json"));
const provenanceSpeedrunners = readJson<Json>(join(root, "spec/provenance/speedrunners.json"));
const provenanceShadowraiders = readJson<Json>(join(root, "spec/provenance/shadowraiders.json"));
const provenances = {
  speedrunners: provenanceSpeedrunners,
  shadowraiders: provenanceShadowraiders,
};

const entries = new Map<string, CatalogEntry>();
const relations = new Map<string, Relation>();

function assertTag(tag: string): string {
  if (!allowedTags.has(tag)) throw new Error(`unknown knowledge tag: ${tag}`);
  return tag;
}

function addEntry(entry: CatalogEntry): void {
  const normalized: CatalogEntry = {
    ...entry,
    tags: sortStrings(uniq(entry.tags.map(assertTag))),
    refs: {
      filePaths: sortStrings(uniq(entry.refs.filePaths.map(canonicalPath))),
      docPaths: sortStrings(uniq(entry.refs.docPaths.map(canonicalPath))),
      assetIds: sortStrings(uniq(entry.refs.assetIds)),
      sourceIds: sortStrings(uniq(entry.refs.sourceIds)),
    },
  };
  entries.set(normalized.entryId, normalized);
}

function addRelation(relation: Relation): void {
  if (!allowedRelations.has(relation.type)) throw new Error(`unknown relation type: ${relation.type}`);
  const key = [relation.type, relation.from, relation.to, relation.locator ?? "", relation.note ?? ""].join("|");
  relations.set(key, relation);
}

function addDocEntry(path: string, title: string): void {
  const docId = entryId("doc", path.toLowerCase());
  addEntry({
    entryId: docId,
    kind: "doc",
    localId: path.toLowerCase(),
    title,
    status: "cataloged",
    expansion: "shared",
    tags: ["status:cataloged", "game:shared", "resource:doc", "workflow:canonical-data"],
    refs: { filePaths: [path], docPaths: [path], assetIds: [], sourceIds: [] },
  });
}

function sourceDocs(role: string): string[] {
  const docs = ["DOCS/artifacts/README.md", "DOCS/knowledge/INDEX.md", "DOCS/knowledge/catalog.md"];
  if (role === "action-cards" || role === "blocks-a4" || role === "blocks-letter" || role === "pawns" || role === "markers") {
    docs.push("DOCS/artifacts/toolset.md");
  }
  if (role === "action-cards" || role === "blocks-a4" || role === "blocks-letter") {
    docs.push("DOCS/block-editor-plan.md");
  }
  return docs;
}

function contentDocs(kind: string, expansion: "speedrunners" | "shadowraiders" | "shared"): string[] {
  const docs = ["README.md", "DOCS/knowledge/INDEX.md", "DOCS/knowledge/catalog.md", "DOCS/domain-model.md"];
  if (expansion === "speedrunners") docs.push("DOCS/rules/speedrunners.md");
  if (expansion === "shadowraiders") docs.push("DOCS/rules/shadowraiders.md");
  if (kind === "block" || kind === "action-card") docs.push("DOCS/block-editor-plan.md");
  return docs;
}

function statusTags(status: Status): string[] {
  return [assertTag(`status:${status}`)];
}

function gameTag(expansion: "speedrunners" | "shadowraiders" | "shared"): string {
  return assertTag(`game:${expansion}`);
}

function resourceTag(kind: string): string {
  return assertTag(`resource:${kind}`);
}

for (const [path, title] of [
  ["README.md", "Repository overview"],
  ["DOCS/knowledge/INDEX.md", "Knowledge base index"],
  ["DOCS/knowledge/catalog.md", "Component and mode catalog"],
  ["DOCS/domain-model.md", "Domain model"],
  ["DOCS/lifecycle.md", "Artifact lifecycle"],
  ["DOCS/artifacts/README.md", "Source and rights policy"],
  ["DOCS/artifacts/toolset.md", "Artifact toolset"],
  ["DOCS/rules/speedrunners.md", "Speedrunners rules digest"],
  ["DOCS/rules/shadowraiders.md", "Shadowraiders rules digest"],
  ["DOCS/block-editor-plan.md", "Block and card editor plan"],
] as const) {
  addDocEntry(path, title);
}

for (const [id, title, expansion] of [
  ["speedrunners", "Speedrunners", "speedrunners"],
  ["shadowraiders", "Shadowraiders", "shadowraiders"],
  ["shared", "Shared repository concepts", "shared"],
] as const) {
  addEntry({
    entryId: entryId("game", id),
    kind: "game",
    localId: id,
    title,
    status: "cataloged",
    expansion,
    tags: ["status:cataloged", gameTag(expansion), resourceTag("game"), "workflow:canonical-data"],
    refs: {
      filePaths: ["README.md", "spec/inventory.json"],
      docPaths: ["README.md", "DOCS/knowledge/INDEX.md", "DOCS/knowledge/catalog.md"],
      assetIds: [],
      sourceIds: [],
    },
  });
}

for (const [id, title, docs, workflowTag] of [
  ["editor-draft", "Editor draft", ["DOCS/block-editor-plan.md"], "workflow:editor-draft"],
  ["provenance-review", "Provenance review", ["DOCS/lifecycle.md", "DOCS/artifacts/README.md"], "workflow:review-session"],
  ["canonical-data", "Canonical tracked data", ["DOCS/lifecycle.md", "README.md"], "workflow:canonical-data"],
  ["source-evidence", "Source evidence", ["DOCS/artifacts/README.md", "DOCS/artifacts/toolset.md"], "workflow:source-evidence"],
] as const) {
  addEntry({
    entryId: entryId("workflow-step", id),
    kind: "workflow-step",
    localId: id,
    title,
    status: "cataloged",
    expansion: "shared",
    tags: ["status:cataloged", "game:shared", resourceTag("workflow-step"), workflowTag],
    refs: { filePaths: docs, docPaths: docs, assetIds: [], sourceIds: [] },
  });
}

for (const asset of (sourceCatalog.assets as Json[] | undefined) ?? []) {
  const artifactId = String(asset.id);
  const expansion = (asset.game === "speedrunners" || asset.game === "shadowraiders") ? asset.game as "speedrunners" | "shadowraiders" : "shared";
  const docRefs = sourceDocs(String(asset.role));
  addEntry({
    entryId: entryId("source", artifactId),
    kind: "source",
    localId: artifactId,
    title: artifactId,
    status: "cataloged",
    expansion,
    tags: ["status:cataloged", gameTag(expansion), resourceTag("source"), "workflow:source-evidence"],
    summary: `${String(asset.role)} (${String(asset.language)})`,
    refs: {
      filePaths: ["DOCS/artifacts/source-catalog.json"],
      docPaths: docRefs,
      assetIds: [],
      sourceIds: [artifactId],
    },
  });
  addRelation({ type: "belongs-to-expansion", from: entryId("source", artifactId), to: entryId("game", expansion) });
  addRelation({ type: "documented-by", from: entryId("source", artifactId), to: entryId("doc", "docs/artifacts/readme.md") });
  addRelation({ type: "documented-by", from: entryId("source", artifactId), to: entryId("workflow-step", "source-evidence") });
}

for (const product of (inventory.products as Json[] | undefined) ?? []) {
  const productId = String(product.id);
  const expansion = String(product.game) as "speedrunners" | "shadowraiders";
  const title = `${String(product.game)} ${String(product.edition)} ${String(product.canonicalLanguage)}`;
  addEntry({
    entryId: entryId("product", productId),
    kind: "product",
    localId: productId,
    title,
    status: "verified",
    expansion,
    tags: ["status:verified", gameTag(expansion), resourceTag("product"), "workflow:canonical-data"],
    refs: {
      filePaths: ["spec/inventory.json"],
      docPaths: ["README.md", "DOCS/knowledge/catalog.md", "DOCS/artifacts/README.md"],
      assetIds: [],
      sourceIds: uniq([...(product.primaryArtifacts as string[] | undefined) ?? [], ...(product.crossCheckArtifacts as string[] | undefined) ?? []]),
    },
  });
  addRelation({ type: "belongs-to-expansion", from: entryId("product", productId), to: entryId("game", expansion) });
  for (const artifactId of uniq([...(product.primaryArtifacts as string[] | undefined) ?? [], ...(product.crossCheckArtifacts as string[] | undefined) ?? []])) {
    addRelation({ type: "evidenced-by-source", from: entryId("product", productId), to: entryId("source", artifactId) });
  }
}

for (const mode of (inventory.modes as Json[] | undefined) ?? []) {
  const modeId = String(mode.id);
  const expansion = ["shadowraiders", "chaos", "total-war", "strategic-alliance", "cyber-revolution", "total-war-chaos"].includes(modeId) ? "shadowraiders" : "speedrunners";
  const evidence = mode.evidence as Json | undefined;
  addEntry({
    entryId: entryId("mode", modeId),
    kind: "mode",
    localId: modeId,
    title: String(mode.name),
    status: "verified",
    expansion,
    tags: ["status:verified", gameTag(expansion), resourceTag("mode"), "workflow:canonical-data"],
    refs: {
      filePaths: ["spec/inventory.json"],
      docPaths: contentDocs("mode", expansion),
      assetIds: [],
      sourceIds: evidence?.artifactId ? [String(evidence.artifactId)] : [],
    },
  });
  addRelation({ type: "belongs-to-expansion", from: entryId("mode", modeId), to: entryId("game", expansion) });
  if (evidence?.artifactId) addRelation({ type: "evidenced-by-source", from: entryId("mode", modeId), to: entryId("source", String(evidence.artifactId)), locator: String(evidence.locator) });
}

function fileStatus(expansion: "speedrunners" | "shadowraiders"): Status {
  const status = String(provenances[expansion].status ?? "cataloged");
  if (status === "verified") return "verified";
  if (status === "provisional") return "provisional";
  return "cataloged";
}

function provenanceFileEntry(expansion: "speedrunners" | "shadowraiders", dataPath: string): Json | undefined {
  return (provenances[expansion].files as Json | undefined)?.[dataPath] as Json | undefined;
}

function provenanceRecordEntry(expansion: "speedrunners" | "shadowraiders", kind: string, localId: string): Json | undefined {
  return (provenances[expansion].records as Json | undefined)?.[`${kind}/${localId}`] as Json | undefined;
}

function mechanicTags(kind: string, record: Json): string[] {
  const tags: string[] = [];
  if (kind === "action-card") {
    for (const ability of (record.activates as string[] | undefined) ?? []) {
      if (["search", "delete", "reboot", "icebreaker"].includes(ability)) tags.push(`mechanic:${ability}`);
    }
  }
  if (kind === "block" && String(record.iceValue ?? "none") !== "none") tags.push("mechanic:block-control");
  return tags.map(assertTag);
}

function addRecordEntry(kind: string, localId: string, title: string, expansion: "speedrunners" | "shadowraiders", dataPath: string, record: Json): void {
  const provRecord = provenanceRecordEntry(expansion, kind, localId);
  const provFile = provenanceFileEntry(expansion, dataPath);
  const status: Status = provRecord ? "verified" : (record.provisional === true ? "provisional" : fileStatus(expansion));
  const assetIds = sortStrings(uniq(((record.assetRefs as string[] | undefined) ?? []).map(String)));
  const sourceIds = sortStrings(uniq([
    ...((provRecord?.sources as Json[] | undefined) ?? []).map((source) => String((source as Json).artifactId)),
    ...((provFile?.sources as string[] | undefined) ?? []).map(String),
    ...((provFile?.candidateSources as string[] | undefined) ?? []).map(String),
  ]));
  addEntry({
    entryId: entryId(kind, localId),
    kind,
    localId,
    title,
    status,
    expansion,
    tags: [...statusTags(status), gameTag(expansion), resourceTag(kind), "workflow:canonical-data", ...mechanicTags(kind, record)],
    summary: typeof record.summary === "string" ? record.summary : undefined,
    refs: {
      filePaths: [canonicalPath(`spec/${dataPath}`), canonicalPath(`spec/provenance/${expansion}.json`)],
      docPaths: contentDocs(kind, expansion),
      assetIds,
      sourceIds,
    },
  });
  addRelation({ type: "belongs-to-expansion", from: entryId(kind, localId), to: entryId("game", expansion) });
  for (const assetId of assetIds) {
    addRelation({ type: "depicted-by-asset", from: entryId(kind, localId), to: entryId("asset", assetId) });
    if (kind === "block" || kind === "action-card") addRelation({ type: "drafted-from-asset", from: entryId(kind, localId), to: entryId("asset", assetId) });
  }
  for (const sourceId of sourceIds) {
    const locator = ((provRecord?.sources as Json[] | undefined) ?? []).find((source) => String((source as Json).artifactId) === sourceId)?.locator;
    addRelation({
      type: "evidenced-by-source",
      from: entryId(kind, localId),
      to: entryId("source", sourceId),
      ...(typeof locator === "string" ? { locator } : {}),
    });
  }
  for (const path of contentDocs(kind, expansion)) {
    addRelation({ type: "documented-by", from: entryId(kind, localId), to: entryId("doc", path.toLowerCase()) });
  }
  if (provRecord) {
    addRelation({ type: "verified-by-provenance", from: entryId(kind, localId), to: entryId("workflow-step", "provenance-review"), note: canonicalPath(`spec/provenance/${expansion}.json`) });
    const sources = (provRecord.sources as Json[] | undefined) ?? [];
    if (sources.length >= 2) {
      for (let index = 1; index < sources.length; index += 1) {
        addRelation({
          type: "cross-checks-with",
          from: entryId("source", String((sources[0] as Json).artifactId)),
          to: entryId("source", String((sources[index] as Json).artifactId)),
          locator: `${String((sources[0] as Json).locator)} <-> ${String((sources[index] as Json).locator)}`,
        });
      }
    }
  }
}

function addDataFile(path: string, expansion: "speedrunners" | "shadowraiders"): void {
  const data = readJson<Json>(join(root, "spec", path));
  if (Array.isArray(data.blocks)) {
    for (const block of data.blocks as Json[]) addRecordEntry("block", String(block.id), String(block.name), expansion, path, block);
  }
  if (Array.isArray(data.cards)) {
    for (const card of data.cards as Json[]) addRecordEntry("action-card", String(card.id), String(card.name), expansion, path, card);
  }
  if (Array.isArray(data.pawns)) {
    for (const pawn of data.pawns as Json[]) addRecordEntry("pawn", String(pawn.id), String(pawn.name), expansion, path, pawn);
  }
  if (Array.isArray(data.controlCards)) {
    for (const controlCard of data.controlCards as Json[]) addRecordEntry("control-card", String(controlCard.id), String(controlCard.name), expansion, path, controlCard);
  }
  if (Array.isArray(data.threats)) {
    for (const threat of data.threats as Json[]) addRecordEntry("threat", String(threat.id), String(threat.name), expansion, path, threat);
  }
  if (Array.isArray(data.missions)) {
    for (const mission of data.missions as Json[]) addRecordEntry("mission", String(mission.id), String(mission.name), expansion, path, mission);
  }
  if (typeof data.id === "string" && typeof data.name === "string") {
    addRecordEntry("mode", String(data.id), String(data.name), expansion, path, data);
  }
}

addDataFile("data/speedrunners/blocks.json", "speedrunners");
addDataFile("data/speedrunners/action-cards.json", "speedrunners");
addDataFile("data/speedrunners/pawns.json", "speedrunners");
addDataFile("data/speedrunners/mode.json", "speedrunners");
addDataFile("data/shadowraiders/modes.json", "shadowraiders");

const verifiedRecords = new Map<string, Status>();
for (const entry of entries.values()) verifiedRecords.set(entry.entryId, entry.status);

for (const asset of (assetManifest.assets as Json[] | undefined) ?? []) {
  const assetId = String(asset.assetId);
  const artifactId = String(asset.artifactId);
  const gameplayRef = typeof asset.gameplayRef === "string" ? String(asset.gameplayRef) : null;
  const expansion = assetId.startsWith("sp-") ? "speedrunners" : assetId.startsWith("sh-") ? "shadowraiders" : "shared";
  const status: Status = gameplayRef && verifiedRecords.get(gameplayRef) === "verified" ? "verified" : "cataloged";
  addEntry({
    entryId: entryId("asset", assetId),
    kind: "asset",
    localId: assetId,
    title: assetId,
    status,
    expansion,
    tags: [...statusTags(status), gameTag(expansion), resourceTag("asset"), "workflow:canonical-data"],
    summary: `${String(asset.kind)} page ${String(asset.page)}`,
    refs: {
      filePaths: ["spec/assets/manifest.json"],
      docPaths: ["DOCS/artifacts/README.md", "DOCS/artifacts/toolset.md", "DOCS/block-editor-plan.md"],
      assetIds: [assetId],
      sourceIds: [artifactId],
    },
  });
  addRelation({ type: "belongs-to-expansion", from: entryId("asset", assetId), to: entryId("game", expansion) });
  addRelation({ type: "evidenced-by-source", from: entryId("asset", assetId), to: entryId("source", artifactId), locator: `page ${String(asset.page)}` });
  addRelation({ type: "documented-by", from: entryId("asset", assetId), to: entryId("doc", "docs/artifacts/readme.md") });
  addRelation({ type: "documented-by", from: entryId("asset", assetId), to: entryId("doc", "docs/artifacts/toolset.md") });
  if (gameplayRef) addRelation({ type: "implemented-by-data-record", from: entryId("asset", assetId), to: gameplayRef });
}

const catalog = {
  catalogVersion: 1,
  entries: [...entries.values()].sort((left, right) => left.entryId.localeCompare(right.entryId)),
};
const graph = {
  catalogVersion: 1,
  relations: [...relations.values()].sort((left, right) =>
    left.type.localeCompare(right.type)
    || left.from.localeCompare(right.from)
    || left.to.localeCompare(right.to)
    || (left.locator ?? "").localeCompare(right.locator ?? "")
    || (left.note ?? "").localeCompare(right.note ?? "")),
};

writeJson(join(root, "spec/knowledge/catalog.json"), catalog);
writeJson(join(root, "spec/knowledge/relations.json"), graph);

console.log(`knowledge build complete: ${catalog.entries.length} entries, ${graph.relations.length} relations`);
