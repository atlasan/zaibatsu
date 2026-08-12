import { createHash } from "node:crypto";

export type Expansion = "speedrunners" | "shadowraiders";
export type ResourceType = "block" | "action-card";
export type EdgeList = [boolean, boolean, boolean, boolean, boolean, boolean];
export type BoundarySpaces = [string[], string[], string[], string[], string[], string[]];

export interface AssetRecord {
  assetId: string;
  artifactId: string;
  page: number;
  kind: string;
  outputs?: { png?: string; webp?: string };
}

export type EditorSpaceType = "normal" | "double" | "special" | "pawn" | "effect";
export type SpaceShape = "hex" | "pill" | "large";
export const STANDARD_BLOCK_LAYOUT_ID = "standard-seven-small-hex-grid" as const;
export const STANDARD_SEVEN_SMALL_HEX_CELLS = [
  { q: 0, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
  { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 },
] as const;

/** Axial coordinate in the visual pointy-hex grid drawn over a source block. */
export interface GridCell {
  q: number;
  r: number;
}

/** Printed coverage only; runtime movement/capacity continue to come from `type`. */
export interface SpaceFootprint {
  shape: SpaceShape;
  cells: GridCell[];
}

export interface EditorSpace {
  id: string;
  type: EditorSpaceType;
  pawnId?: string;
  effectId?: string;
  location?: { x: number; y: number };
  footprint: SpaceFootprint;
}

export interface BlockRecord {
  id: string;
  name: string;
  expansion: Expansion;
  layoutId: typeof STANDARD_BLOCK_LAYOUT_ID;
  iceValue?: "none" | "low" | "medium" | "high" | "black";
  bonusFragments: number;
  bonusCorners: EdgeList;
  edges: EdgeList;
  boundarySpaces: BoundarySpaces;
  spaces: EditorSpace[];
  assetRefs: string[];
  provisional: boolean;
}

export interface BlockDocument {
  id: string;
  resourceType: "block";
  title: string;
  status: "draft" | "review" | "verified";
  source: { assetId: string };
  block: BlockRecord;
  provenance: { primaryArtifactId: string; page: number; locator: string; notes?: string };
  annotations: string[];
}

export interface ActionCardRecord {
  id: string;
  name: string;
  expansion: Expansion;
  copies: number;
  movement?: number;
  activates?: Array<"search" | "delete" | "reboot" | "icebreaker">;
  assetRefs: string[];
  provisional: boolean;
}

export interface ActionCardDocument {
  id: string;
  resourceType: "action-card";
  title: string;
  status: "draft" | "review" | "verified";
  source: { assetId: string };
  actionCard: ActionCardRecord;
  transcription: { printedText: string; reviewerConfirmed: boolean; duplicateGroupConfirmed: boolean; vision?: { confidence: number; reviewRequired: boolean; reasons: string[] } };
  provenance: { primaryArtifactId: string; page: number; locator: string; notes?: string };
  annotations: string[];
}

export type EditorDocument = BlockDocument | ActionCardDocument;
export interface EditorSession {
  sessionVersion: 1 | 2;
  projectId: string;
  assetManifestPath: "spec/assets/manifest.json";
  documents: EditorDocument[];
  history: Array<{ at: string; operation: "create" | "update" | "validate" | "export"; documentId: string; summary?: string }>;
}

export function draftForAsset(asset: AssetRecord): BlockDocument {
  const expansion: Expansion = asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners";
  return {
    id: `${asset.assetId}-draft`,
    resourceType: "block",
    title: `${expansion === "speedrunners" ? "Speedrunners" : "Shadowraiders"} ${asset.assetId.split("-").slice(-2).join(" ")}`,
    status: "draft",
    source: { assetId: asset.assetId },
    block: {
      id: `${expansion}-draft-${asset.assetId.split("-").slice(-2).join("-")}`,
      name: "Untranscribed block",
      expansion,
      layoutId: STANDARD_BLOCK_LAYOUT_ID,
      iceValue: "none",
      bonusFragments: 0,
      bonusCorners: [false, false, false, false, false, false],
      edges: [false, false, false, false, false, false],
      boundarySpaces: [[], [], [], [], [], []],
      spaces: [],
      assetRefs: [asset.assetId],
      provisional: true,
    },
    provenance: { primaryArtifactId: asset.artifactId, page: asset.page, locator: `cut block ${asset.assetId.split("-").at(-1)}` },
    annotations: [],
  };
}

export function actionCardDraftForAsset(asset: AssetRecord, vision?: { confidence: number; reviewRequired: boolean; reasons: string[]; printedTextCandidate?: string }): ActionCardDocument {
  const expansion: Expansion = asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners";
  return { id: `${asset.assetId}-draft`, resourceType: "action-card", title: `${expansion === "speedrunners" ? "Speedrunners" : "Shadowraiders"} ${asset.assetId.split("-").slice(-2).join(" ")}`, status: "draft", source: { assetId: asset.assetId }, actionCard: { id: `${expansion}-card-${asset.assetId.split("-").slice(-2).join("-")}`, name: "Untranscribed action card", expansion, copies: 1, assetRefs: [asset.assetId], provisional: true }, transcription: { printedText: vision?.printedTextCandidate ?? "", reviewerConfirmed: false, duplicateGroupConfirmed: false, vision }, provenance: { primaryArtifactId: asset.artifactId, page: asset.page, locator: `cut action card ${asset.assetId.split("-").at(-1)}` }, annotations: [] };
}

export function documentForAsset(asset: AssetRecord, vision?: { confidence: number; reviewRequired: boolean; reasons: string[]; printedTextCandidate?: string }): EditorDocument {
  return asset.kind === "action-card" ? actionCardDraftForAsset(asset, vision) : draftForAsset(asset);
}
function standardCell(cell: GridCell): boolean {
  return STANDARD_SEVEN_SMALL_HEX_CELLS.some((candidate) => candidate.q === cell.q && candidate.r === cell.r);
}

function axialDistance(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
}

function cellsConnected(cells: GridCell[]): boolean {
  if (!cells.length) return false;
  const keys = new Set(cells.map((cell) => `${cell.q},${cell.r}`));
  const seen = new Set([`${cells[0]!.q},${cells[0]!.r}`]);
  const queue = [cells[0]!];
  while (queue.length) {
    const current = queue.shift()!;
    for (const candidate of cells) {
      const key = `${candidate.q},${candidate.r}`;
      if (!seen.has(key) && axialDistance(current, candidate) === 1) {
        seen.add(key);
        queue.push(candidate);
      }
    }
  }
  return seen.size === keys.size;
}

function validateFootprint(space: EditorSpace, errors: string[]): void {
  const footprint = space.footprint;
  if (!footprint) {
    errors.push(`Space ${space.id} needs a hex-grid footprint.`);
    return;
  }
  const keys = new Set<string>();
  for (const cell of footprint.cells) {
    const key = `${cell.q},${cell.r}`;
    if (!Number.isInteger(cell.q) || !Number.isInteger(cell.r) || Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(-cell.q - cell.r)) > 2) {
      errors.push(`Space ${space.id} has a cell outside the editable hex grid.`);
    }
    if (keys.has(key)) errors.push(`Space ${space.id} repeats grid cell ${key}.`);
    keys.add(key);
  }
  if (space.type === "double" && (footprint.shape !== "pill" || footprint.cells.length !== 2 || axialDistance(footprint.cells[0]!, footprint.cells[1]!) !== 1)) {
    errors.push(`Double space ${space.id} must be a pill covering two adjacent hexes.`);
  }
  if (space.type === "special" && (footprint.shape !== "large" || !footprint.cells.length || !cellsConnected(footprint.cells))) {
    errors.push(`Special space ${space.id} must be a connected large footprint of one or more hexes.`);
  }
  if (["normal", "effect", "pawn"].includes(space.type) && (footprint.shape !== "hex" || footprint.cells.length !== 1)) {
    errors.push(`${space.type} space ${space.id} must cover exactly one hex.`);
  }
}

export function validateDocument(document: EditorDocument, assets: AssetRecord[]): string[] {
  const errors: string[] = [];
  if (document.resourceType === "action-card") {
    const card = document.actionCard;
    const ids = new Set(assets.filter((asset) => asset.kind === "action-card").map((asset) => asset.assetId));
    const validId = /^[a-z0-9-]+$/;
    if (!validId.test(document.id) || !validId.test(card.id)) errors.push("Draft and card ids must use lowercase letters, digits, and hyphens.");
    if (!card.name.trim()) errors.push("Card name is required.");
    if (!ids.has(document.source.assetId) || !card.assetRefs.includes(document.source.assetId)) errors.push("Action-card assetRefs must include the selected action-card asset.");
    if (!Number.isInteger(card.copies) || card.copies < 1 || card.copies !== card.assetRefs.length) errors.push("Card copies must equal the number of source asset references.");
    if (card.movement !== undefined && (!Number.isInteger(card.movement) || card.movement < 1)) errors.push("Card movement must be a positive whole number.");
    if (!document.provenance.primaryArtifactId || document.provenance.page < 1 || !document.provenance.locator.trim()) errors.push("Primary artifact, page, and locator are required for provenance.");
    if (document.transcription.vision?.reviewRequired && !document.transcription.reviewerConfirmed) errors.push("Vision suggestions require reviewer confirmation before export.");
    if ((document.status === "review" || document.status === "verified") && (!document.transcription.printedText.trim() || !document.transcription.reviewerConfirmed || !document.transcription.duplicateGroupConfirmed)) errors.push("Reviewed cards require confirmed printed text and duplicate grouping.");
    if (document.status === "verified" && card.provisional) errors.push("A verified draft cannot remain provisional.");
    return errors;
  }
  const ids = new Set(assets.map((asset) => asset.assetId));
  const validId = /^[a-z0-9-]+$/;
  if (!validId.test(document.id)) errors.push("Draft id must use lowercase letters, digits, and hyphens.");
  if (!validId.test(document.block.id)) errors.push("Block id must use lowercase letters, digits, and hyphens.");
  if (!document.block.name.trim()) errors.push("Block name is required.");
  if (!ids.has(document.source.assetId)) errors.push("Selected source asset is not in the asset manifest.");
  if (!document.block.assetRefs.includes(document.source.assetId)) errors.push("Block assetRefs must include the selected source asset.");
  if (document.block.edges.length !== 6 || document.block.boundarySpaces.length !== 6) errors.push("Blocks need exactly six edges and six boundary-space lists.");
  if (document.block.bonusCorners.length !== 6) errors.push("Blocks need exactly six bonus-corner flags.");
  if (document.block.bonusCorners.filter(Boolean).length !== document.block.bonusFragments) errors.push("Bonus fragment count must equal the marked bonus corners.");
  if (document.block.layoutId !== STANDARD_BLOCK_LAYOUT_ID) errors.push("Blocks must use the standard seven-small-hex layout.");
  const occupiedCells = new Map<string, string>();
  const spaceIds = new Set<string>();
  for (const space of document.block.spaces) {
    if (!validId.test(space.id) || spaceIds.has(space.id)) errors.push(`Space id '${space.id}' is invalid or duplicated.`);
    if (space.location && (space.location.x < 0 || space.location.x > 100 || space.location.y < 0 || space.location.y > 100)) errors.push(`Space ${space.id} location must be within 0..100.`);
    validateFootprint(space, errors);
    spaceIds.add(space.id);
  }
  document.block.boundarySpaces.forEach((edge, index) => edge.forEach((spaceId) => {
    if (!spaceIds.has(spaceId)) errors.push(`Edge ${index + 1} references unknown space '${spaceId}'.`);
  }));
  if (!document.provenance.primaryArtifactId || document.provenance.page < 1 || !document.provenance.locator.trim()) {
    errors.push("Primary artifact, page, and locator are required for provenance.");
  }
  if (document.status === "verified" && document.block.provisional) errors.push("A verified draft cannot remain provisional.");
  return errors;
}

export function sessionFromDocuments(documents: BlockDocument[], prior?: EditorSession): EditorSession {
  return {
    sessionVersion: 1,
    projectId: "zaibatsu-block-editor",
    assetManifestPath: "spec/assets/manifest.json",
    documents,
    history: [...(prior?.history ?? []), { at: new Date().toISOString(), operation: "update", documentId: documents.at(-1)?.id ?? "none", summary: "Saved from editor" }],
  };
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPatch(document: BlockDocument, baseDataSha256: string) {
  return {
    format: "zaibatsu-editor-patch/v1",
    resourceType: "block",
    targetPath: `spec/data/${document.block.expansion}/blocks.json`,
    baseDataSha256,
    operations: [{ op: "add", path: "/blocks/-", value: document.block, sourceAssetId: document.source.assetId, provenance: document.provenance }],
  };
}


export function buildActionCardPatch(document: ActionCardDocument, baseDataSha256: string | null) {
  return {
    format: "zaibatsu-editor-patch/v2",
    resourceType: "action-card",
    targetPath: `spec/data/${document.actionCard.expansion}/action-cards.json`,
    baseDataSha256,
    targetAbsent: baseDataSha256 === null,
    operations: [{ op: "add", path: "/cards/-", value: document.actionCard, sourceAssetId: document.source.assetId, provenance: document.provenance }],
  };
}

export function migrateSession(raw: EditorSession): EditorSession {
  if (raw.sessionVersion === 1) return { ...raw, sessionVersion: 2, projectId: "zaibatsu-data-editor", documents: raw.documents } as EditorSession;
  return raw;
}
