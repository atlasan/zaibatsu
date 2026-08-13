import { createHash } from "node:crypto";

export type Expansion = "speedrunners" | "shadowraiders";
export type ResourceType = "block" | "action-card";
export type EdgeList = [boolean, boolean, boolean, boolean, boolean, boolean];
export type BoundarySpaces = [string[], string[], string[], string[], string[], string[]];
export type ZoneId = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "h7";
export const STANDARD_BLOCK_LAYOUT_ID = "standard-seven-zone-2-3-2-pointy" as const;
export const LEGACY_BLOCK_LAYOUT_ID = "standard-seven-small-hex-grid" as const;
export const STANDARD_ZONE_IDS: ZoneId[] = ["h1", "h2", "h3", "h4", "h5", "h6", "h7"];
const legacyCellToZone: Record<string, ZoneId> = { "0,0": "h1", "0,-1": "h2", "1,-1": "h3", "1,0": "h4", "0,1": "h5", "-1,1": "h6", "-1,0": "h7" };

export interface AssetRecord { assetId: string; artifactId: string; page: number; kind: string; outputs?: { png?: string; webp?: string }; }
export type EditorSpaceType = "normal" | "special" | "pawn" | "effect";
export type SpaceCapacity = number | "unlimited";
/** Source-facing rendering only; gameplay is always defined by zoneIds and capacity. */
export type SpaceDisplayShape = "auto" | "circle" | "capsule" | "compound";
export interface GridCell { q: number; r: number; }
/** Legacy session-only source layout; migrated to zoneIds when a session is read. */
export interface LegacyFootprint { shape?: "hex" | "pill" | "large"; cells?: GridCell[]; }

export interface EditorSpace {
  id: string;
  type: EditorSpaceType;
  /** One or more standard internal placement hexes owned by this gameplay space. */
  zoneIds: ZoneId[];
  /** Positive finite capacity, or unlimited. New finite spaces default to zoneIds.length. */
  capacity: SpaceCapacity;
  capacityNote?: string;
  /** Derived candidate links only; runtime step movement remains deferred. */
  neighbors: string[];
  displayShape?: SpaceDisplayShape;
  pawnId?: string;
  effectId?: string;
  modifier?: { kind: "defense" | "hand-size" | "attack"; amount?: number };
}

export interface BlockRecord {
  id: string; name: string; expansion: Expansion; layoutId: typeof STANDARD_BLOCK_LAYOUT_ID;
  iceValue?: "none" | "low" | "medium" | "high" | "black";
  bonusFragments: number; bonusCorners: EdgeList; edges: EdgeList; boundarySpaces: BoundarySpaces;
  spaces: EditorSpace[]; assetRefs: string[]; provisional: boolean;
}
export interface GeometryTransform { offsetX: number; offsetY: number; scale: number; }
export interface GeometryOverride { assetId: string; layoutId: typeof STANDARD_BLOCK_LAYOUT_ID; note: string; transform: GeometryTransform; }
export interface KnowledgeRelationHint { type: string; toEntryId: string; note?: string; }
export interface KnowledgeHints { tags?: string[]; relationHints?: KnowledgeRelationHint[]; }
export interface BlockDocument {
  id: string; resourceType: "block"; title: string; status: "draft" | "review" | "verified";
  source: { assetId: string }; block: BlockRecord;
  provenance: { primaryArtifactId: string; page: number; locator: string; notes?: string };
  annotations: string[]; knowledge?: KnowledgeHints; geometryOverride?: GeometryOverride;
  /** Set by migration whenever a pre-2-3-2 session needs source review. */
  geometryReviewRequired?: boolean;
}

export interface ActionCardRecord { id: string; name: string; expansion: Expansion; copies: number; summary?: string; movement?: number; activates?: Array<"search" | "delete" | "reboot" | "icebreaker">; attach?: { as?: "pawn" | "enemy" | "block"; slot?: string; class?: string[]; cost?: number }; assetRefs: string[]; provisional: boolean; }
export interface ActionCardDocument { id: string; resourceType: "action-card"; title: string; status: "draft" | "review" | "verified"; source: { assetId: string }; actionCard: ActionCardRecord; transcription: { printedText: string; reviewerConfirmed: boolean; duplicateGroupConfirmed: boolean; vision?: { confidence: number; reviewRequired: boolean; reasons: string[] } }; provenance: { primaryArtifactId: string; page: number; locator: string; notes?: string }; annotations: string[]; knowledge?: KnowledgeHints; }
export type EditorDocument = BlockDocument | ActionCardDocument;
export interface EditorSession { sessionVersion: 1 | 2 | 3 | 4; projectId: string; assetManifestPath: "spec/assets/manifest.json"; documents: EditorDocument[]; history: Array<{ at: string; operation: "create" | "update" | "validate" | "export"; documentId: string; summary?: string }>; }

export interface BlockLayoutZone { id: ZoneId; q: number; r: number; x: number; y: number; touches: ZoneId[]; }
export interface BlockLayout { id: typeof STANDARD_BLOCK_LAYOUT_ID; name: string; smallHexCount: 7; outerHex: { vertices: Array<{ id: string; x: number; y: number }> }; corners: Array<{ id: string; x: number; y: number }>; edges: Array<{ id: string; x: number; y: number }>; zoneShape: { width: number; height: number }; zones: BlockLayoutZone[]; }

export function defaultCapacity(type: EditorSpaceType, zoneIds: ZoneId[]): SpaceCapacity { return (type === "special" || type === "pawn") ? "unlimited" : Math.max(1, zoneIds.length); }
export function zonesTouch(layout: BlockLayout, left: ZoneId, right: ZoneId): boolean { return layout.zones.find((zone) => zone.id === left)?.touches.includes(right) ?? false; }
export function isConnectedZoneSet(zoneIds: ZoneId[], layout: BlockLayout): boolean {
  if (zoneIds.length < 2) return true;
  const wanted = new Set(zoneIds); const reached = new Set<ZoneId>([zoneIds[0]!]); const queue = [zoneIds[0]!];
  while (queue.length) { const current = queue.shift()!; for (const next of layout.zones.find((zone) => zone.id === current)?.touches ?? []) if (wanted.has(next) && !reached.has(next)) { reached.add(next); queue.push(next); } }
  return reached.size === wanted.size;
}
export function derivedDisplayShape(space: Pick<EditorSpace, "zoneIds" | "displayShape">, layout: BlockLayout): Exclude<SpaceDisplayShape, "auto"> {
  if (space.displayShape && space.displayShape !== "auto") return space.displayShape;
  if (!isConnectedZoneSet(space.zoneIds, layout)) return "compound";
  return space.zoneIds.length === 2 ? "capsule" : "circle";
}
export function inferNeighbors(spaces: EditorSpace[], layout: BlockLayout): EditorSpace[] {
  return spaces.map((space) => ({ ...space, neighbors: spaces.filter((other) => other.id !== space.id && space.zoneIds.some((left) => other.zoneIds.some((right) => zonesTouch(layout, left, right)))).map((other) => other.id).sort() }));
}
export function isCapacityOverride(space: EditorSpace): boolean { return space.capacity !== defaultCapacity(space.type, space.zoneIds); }

export function draftForAsset(asset: AssetRecord): BlockDocument {
  const expansion: Expansion = asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners";
  return { id: `${asset.assetId}-draft`, resourceType: "block", title: `${expansion === "speedrunners" ? "Speedrunners" : "Shadowraiders"} ${asset.assetId.split("-").slice(-2).join(" ")}`, status: "draft", source: { assetId: asset.assetId }, block: { id: `${expansion}-draft-${asset.assetId.split("-").slice(-2).join("-")}`, name: "Untranscribed block", expansion, layoutId: STANDARD_BLOCK_LAYOUT_ID, iceValue: "none", bonusFragments: 0, bonusCorners: [false, false, false, false, false, false], edges: [false, false, false, false, false, false], boundarySpaces: [[], [], [], [], [], []], spaces: [], assetRefs: [asset.assetId], provisional: true }, provenance: { primaryArtifactId: asset.artifactId, page: asset.page, locator: `cut block ${asset.assetId.split("-").at(-1)}` }, annotations: [] };
}
export function actionCardDraftForAsset(asset: AssetRecord, vision?: { confidence: number; reviewRequired: boolean; reasons: string[]; printedTextCandidate?: string }): ActionCardDocument {
  const expansion: Expansion = asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners";
  return { id: `${asset.assetId}-draft`, resourceType: "action-card", title: `${expansion === "speedrunners" ? "Speedrunners" : "Shadowraiders"} ${asset.assetId.split("-").slice(-2).join(" ")}`, status: "draft", source: { assetId: asset.assetId }, actionCard: { id: `${expansion}-card-${asset.assetId.split("-").slice(-2).join("-")}`, name: "Untranscribed action card", expansion, copies: 1, assetRefs: [asset.assetId], provisional: true }, transcription: { printedText: vision?.printedTextCandidate ?? "", reviewerConfirmed: false, duplicateGroupConfirmed: false, vision }, provenance: { primaryArtifactId: asset.artifactId, page: asset.page, locator: `cut action card ${asset.assetId.split("-").at(-1)}` }, annotations: [] };
}
export function documentForAsset(asset: AssetRecord, vision?: { confidence: number; reviewRequired: boolean; reasons: string[]; printedTextCandidate?: string }): EditorDocument { return asset.kind === "action-card" ? actionCardDraftForAsset(asset, vision) : draftForAsset(asset); }

function validId(value: string): boolean { return /^[a-z0-9-]+$/.test(value); }
function validKnowledgeTag(value: string): boolean { return /^[a-z][a-z0-9-]*:[a-z0-9-]+$/.test(value); }
function validEntryId(value: string): boolean { return /^[a-z0-9./-]+$/.test(value); }
export function validateDocument(document: EditorDocument, assets: AssetRecord[], layout?: BlockLayout): string[] {
  const errors: string[] = [];
  if (document.knowledge?.tags && (!Array.isArray(document.knowledge.tags) || new Set(document.knowledge.tags).size !== document.knowledge.tags.length || document.knowledge.tags.some((tag) => !validKnowledgeTag(tag)))) errors.push("Knowledge tags must use the canonical namespace:value format.");
  if (document.knowledge?.relationHints && (!Array.isArray(document.knowledge.relationHints) || document.knowledge.relationHints.some((hint) => !/^[a-z][a-z0-9-]*$/.test(hint.type) || !validEntryId(hint.toEntryId)))) errors.push("Knowledge relation hints must declare a relation type and a canonical entry id.");
  if (document.resourceType === "action-card") {
    const card = document.actionCard; const cardAssets = assets.filter((asset) => asset.kind === "action-card"); const ids = new Set(cardAssets.map((asset) => asset.assetId));
    if (!validId(document.id) || !validId(card.id)) errors.push("Draft and card ids must use lowercase letters, digits, and hyphens.");
    if (!card.name.trim()) errors.push("Card name is required."); if ((document.status === "review" || document.status === "verified") && !card.summary?.trim()) errors.push("Reviewed cards require a concise gameplay summary.");
    if (!ids.has(document.source.assetId) || !card.assetRefs.includes(document.source.assetId)) errors.push("Action-card assetRefs must include the selected action-card asset.");
    if (new Set(card.assetRefs).size !== card.assetRefs.length || card.assetRefs.some((assetId) => !ids.has(assetId))) errors.push("Action-card copy groups must contain unique action-card asset ids.");
    if (!Number.isInteger(card.copies) || card.copies < 1 || card.copies !== card.assetRefs.length) errors.push("Card copies must equal the number of source asset references.");
    if (!document.provenance.primaryArtifactId || document.provenance.page < 1 || !document.provenance.locator.trim()) errors.push("Primary artifact, page, and locator are required for provenance.");
    if (document.transcription.vision?.reviewRequired && !document.transcription.reviewerConfirmed) errors.push("Vision suggestions require reviewer confirmation before export.");
    if ((document.status === "review" || document.status === "verified") && (!document.transcription.printedText.trim() || !document.transcription.reviewerConfirmed || !document.transcription.duplicateGroupConfirmed)) errors.push("Reviewed cards require confirmed printed text and duplicate grouping.");
    if (document.status === "verified" && card.provisional) errors.push("A verified draft cannot remain provisional."); return errors;
  }
  const block = document.block; const blockAssets = new Set(assets.filter((asset) => asset.kind === "block").map((asset) => asset.assetId));
  if (!validId(document.id) || !validId(block.id)) errors.push("Draft and block ids must use lowercase letters, digits, and hyphens.");
  if (!block.name.trim()) errors.push("Block name is required."); if (!blockAssets.has(document.source.assetId) || !block.assetRefs.includes(document.source.assetId)) errors.push("Block assetRefs must include the selected block asset.");
  if (block.edges.length !== 6 || block.boundarySpaces.length !== 6 || block.bonusCorners.length !== 6) errors.push("Blocks need exactly six edges, boundary lists, and bonus-corner flags.");
  if (block.bonusCorners.filter(Boolean).length !== block.bonusFragments) errors.push("Bonus fragment count must equal marked bonus corners.");
  if (block.layoutId !== STANDARD_BLOCK_LAYOUT_ID) errors.push("Blocks must use the standard 2-3-2 seven-zone layout.");
  if (document.geometryReviewRequired && document.status !== "draft") errors.push("Migrated geometry must be reviewed before a block can leave draft status.");
  const zoneOwner = new Map<ZoneId, string>(); const ids = new Set<string>();
  for (const space of block.spaces) {
    if (!validId(space.id) || ids.has(space.id)) errors.push(`Space id '${space.id}' is invalid or duplicated.`); ids.add(space.id);
    if (!space.zoneIds.length || new Set(space.zoneIds).size !== space.zoneIds.length || space.zoneIds.some((id) => !STANDARD_ZONE_IDS.includes(id))) errors.push(`Space ${space.id} must select one or more unique canonical zones.`);
    for (const zoneId of space.zoneIds) { const owner = zoneOwner.get(zoneId); if (owner) errors.push(`Zones ${zoneId} cannot belong to both ${owner} and ${space.id}.`); else zoneOwner.set(zoneId, space.id); }
    if (space.capacity !== "unlimited" && (!Number.isInteger(space.capacity) || space.capacity < 1)) errors.push(`Space ${space.id} capacity must be a positive whole number or unlimited.`);
    if (isCapacityOverride(space) && !space.capacityNote?.trim()) errors.push(`Space ${space.id} needs a source-review note for its capacity override.`);
  }
  const inferred = layout ? inferNeighbors(block.spaces, layout) : block.spaces;
  for (const space of inferred) { const supplied = [...(block.spaces.find((candidate) => candidate.id === space.id)?.neighbors ?? [])].sort(); if (JSON.stringify(supplied) !== JSON.stringify(space.neighbors)) errors.push(`Space ${space.id} neighbours must match touching selected zones.`); }
  block.boundarySpaces.forEach((edge, index) => edge.forEach((spaceId) => { if (!ids.has(spaceId)) errors.push(`Edge ${index + 1} references unknown space '${spaceId}'.`); }));
  if (!document.provenance.primaryArtifactId || document.provenance.page < 1 || !document.provenance.locator.trim()) errors.push("Primary artifact, page, and locator are required for provenance.");
  if (document.status === "verified" && block.provisional) errors.push("A verified draft cannot remain provisional.");
  if (document.status === "verified" && zoneOwner.size !== STANDARD_ZONE_IDS.length) errors.push("A verified block must account for all seven placement hexes.");
  return errors;
}

export function normalizeBlockDocument(document: BlockDocument, layout: BlockLayout): BlockDocument {
  const requiresGeometryReview = document.block.layoutId !== STANDARD_BLOCK_LAYOUT_ID;
  const rawSpaces = document.block.spaces as Array<EditorSpace & { footprint?: LegacyFootprint; location?: unknown; type?: string }>;
  const spaces = rawSpaces.map((raw) => {
    const legacyZones = raw.footprint?.cells?.map((cell) => legacyCellToZone[`${cell.q},${cell.r}`]).filter(Boolean) as ZoneId[] | undefined;
    const zoneIds = (raw.zoneIds?.length ? raw.zoneIds : legacyZones ?? []).filter((id, index, values) => STANDARD_ZONE_IDS.includes(id) && values.indexOf(id) === index) as ZoneId[];
    const type: EditorSpaceType = raw.type === "double" ? "normal" : (["normal", "special", "pawn", "effect"].includes(raw.type ?? "") ? raw.type as EditorSpaceType : "normal");
    const capacity = raw.capacity ?? (raw.type === "double" ? 2 : defaultCapacity(type, zoneIds));
    const displayShape = ["auto", "circle", "capsule", "compound"].includes(raw.displayShape ?? "") ? raw.displayShape as SpaceDisplayShape : "auto";
    return { id: raw.id, type, zoneIds, capacity, displayShape, ...(raw.capacityNote ? { capacityNote: raw.capacityNote } : {}), neighbors: [], ...(raw.pawnId ? { pawnId: raw.pawnId } : {}), ...(raw.effectId ? { effectId: raw.effectId } : {}), ...(raw.modifier ? { modifier: raw.modifier } : {}) };
  });
  const annotations = requiresGeometryReview && !document.annotations.includes("Review 2-3-2 geometry before export.") ? [...document.annotations, "Review 2-3-2 geometry before export."] : document.annotations;
  return { ...document, status: requiresGeometryReview ? "draft" : document.status, geometryReviewRequired: document.geometryReviewRequired || requiresGeometryReview || undefined, annotations, block: { ...document.block, layoutId: STANDARD_BLOCK_LAYOUT_ID, spaces: inferNeighbors(spaces, layout) } };
}

export function sessionFromDocuments(documents: EditorDocument[], prior?: EditorSession): EditorSession { return { sessionVersion: 4, projectId: "zaibatsu-data-editor", assetManifestPath: "spec/assets/manifest.json", documents, history: [...(prior?.history ?? []), { at: new Date().toISOString(), operation: "update", documentId: documents.at(-1)?.id ?? "none", summary: "Saved from editor" }] }; }
export function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
export function buildPatch(document: BlockDocument, baseDataSha256: string) { return { format: "zaibatsu-editor-patch/v4", resourceType: "block", targetPath: `spec/data/${document.block.expansion}/blocks.json`, baseDataSha256, operations: [{ op: "add", path: "/blocks/-", value: document.block, sourceAssetId: document.source.assetId, provenance: document.provenance, ...(document.knowledge ? { knowledge: document.knowledge } : {}) }] }; }
export function buildActionCardPatch(document: ActionCardDocument, baseDataSha256: string | null) { return { format: "zaibatsu-editor-patch/v2", resourceType: "action-card", targetPath: `spec/data/${document.actionCard.expansion}/action-cards.json`, baseDataSha256, targetAbsent: baseDataSha256 === null, operations: [{ op: "add", path: "/cards/-", value: document.actionCard, sourceAssetId: document.source.assetId, provenance: document.provenance, ...(document.knowledge ? { knowledge: document.knowledge } : {}) }] }; }
export function migrateSession(raw: EditorSession, layout?: BlockLayout): EditorSession {
  const migrated = { ...raw, sessionVersion: 4 as const, projectId: "zaibatsu-data-editor" };
  if (!layout) return migrated;
  return { ...migrated, documents: migrated.documents.map((document) => document.resourceType === "block" ? normalizeBlockDocument(document, layout) : document) };
}