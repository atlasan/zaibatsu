import { createHash } from "node:crypto";

export type Expansion = "speedrunners" | "shadowraiders";
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

export interface EditorSession {
  sessionVersion: 1;
  projectId: string;
  assetManifestPath: "spec/assets/manifest.json";
  documents: BlockDocument[];
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

export function validateDocument(document: BlockDocument, assets: AssetRecord[]): string[] {
  const errors: string[] = [];
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