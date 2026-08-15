import { describe, expect, test } from "bun:test";
import { actionCardDraftForAsset, buildPatch, defaultCapacity, deriveBoundarySpaces, derivedDisplayShape, draftForAsset, inferNeighbors, isConnectedZoneSet, migrateSession, normalizeBlockDocument, validateDocument, type AssetRecord, type BlockLayout } from "./model";

const asset: AssetRecord = { assetId: "sp-en-blocks-a4-p01-c01", artifactId: "sp-en-blocks-a4", page: 1, kind: "block" };
const layout: BlockLayout = { id: "standard-seven-zone-2-3-2-pointy", name: "test", smallHexCount: 7, outerHex: { vertices: [{ id: "v1", x: 50, y: 0 }, { id: "v2", x: 93, y: 25 }, { id: "v3", x: 93, y: 75 }, { id: "v4", x: 50, y: 100 }, { id: "v5", x: 7, y: 75 }, { id: "v6", x: 7, y: 25 }] }, corners: [], edges: [{ id: "e1", x: 71.5, y: 12.5, zoneId: "h3" }, { id: "e2", x: 93, y: 50, zoneId: "h4" }, { id: "e3", x: 71.5, y: 87.5, zoneId: "h5" }, { id: "e4", x: 28.5, y: 87.5, zoneId: "h6" }, { id: "e5", x: 7, y: 50, zoneId: "h7" }, { id: "e6", x: 28.5, y: 12.5, zoneId: "h2" }], zoneShape: { width: 33.3333, height: 33.3333 }, zones: [
  { id: "h1", q: 0, r: 0, x: 50, y: 50, touches: ["h2", "h3", "h4", "h5", "h6", "h7"] },
  { id: "h2", q: 0, r: -1, x: 33.3333, y: 25, touches: ["h1", "h3", "h7"] },
  { id: "h3", q: 1, r: -1, x: 66.6667, y: 25, touches: ["h1", "h2", "h4"] },
  { id: "h4", q: 1, r: 0, x: 83.3333, y: 50, touches: ["h1", "h3", "h5"] },
  { id: "h5", q: 0, r: 1, x: 66.6667, y: 75, touches: ["h1", "h4", "h6"] },
  { id: "h6", q: -1, r: 1, x: 33.3333, y: 75, touches: ["h1", "h5", "h7"] },
  { id: "h7", q: -1, r: 0, x: 16.6667, y: 50, touches: ["h1", "h2", "h6"] }
] };

describe("source-aligned 2-3-2 block editor model", () => {
  test("uses two upper, three middle, and two lower point-up placement anchors", () => {
    expect(layout.zones.filter((item) => item.y === 25).map((item) => item.id)).toEqual(["h2", "h3"]);
    expect(layout.zones.filter((item) => item.y === 50).map((item) => item.id)).toEqual(["h1", "h4", "h7"]);
    expect(layout.zones.filter((item) => item.y === 75).map((item) => item.id)).toEqual(["h5", "h6"]);
  });
  test("creates a source-linked provisional draft", () => expect(validateDocument(draftForAsset(asset), [asset], layout)).toEqual([]));
  test("derives circles, capsules, and compound displays from mappings", () => {
    expect(derivedDisplayShape({ zoneIds: ["h1"], displayShape: "auto" }, layout)).toBe("circle");
    expect(derivedDisplayShape({ zoneIds: ["h2", "h3"], displayShape: "auto" }, layout)).toBe("capsule");
    expect(derivedDisplayShape({ zoneIds: ["h2", "h5"], displayShape: "auto" }, layout)).toBe("compound");
  });
  test("permits disconnected mappings while exposing their topology", () => expect(isConnectedZoneSet(["h2", "h5"], layout)).toBe(false));
  test("auto-capacity follows selected-zone count and special stays unlimited", () => { expect(defaultCapacity("normal", ["h1", "h2"])).toBe(2); expect(defaultCapacity("special", ["h1"])).toBe("unlimited"); });
  test("rejects duplicate ownership and capacity overrides without evidence", () => { const draft = draftForAsset(asset); draft.block.spaces = [{ id: "a", type: "normal", zoneIds: ["h1"], capacity: 2, displayShape: "auto", neighbors: [] }, { id: "b", type: "normal", zoneIds: ["h1"], capacity: 1, displayShape: "auto", neighbors: [] }]; const errors = validateDocument(draft, [asset], layout).join(" "); expect(errors).toContain("cannot belong"); expect(errors).toContain("source-review note"); });
  test("derives each open entrance's boundary space from its mapped ring hex", () => {
    const draft = draftForAsset(asset); draft.block.edges = [true, true, false, false, false, true];
    draft.block.spaces = inferNeighbors([{ id: "upper-right", type: "normal", zoneIds: ["h3"], capacity: 1, displayShape: "auto", neighbors: [] }, { id: "upper-left", type: "normal", zoneIds: ["h2"], capacity: 1, displayShape: "auto", neighbors: [] }], layout);
    expect(deriveBoundarySpaces(draft.block, layout)).toEqual([["upper-right"], [], [], [], [], ["upper-left"]]);
    draft.block.boundarySpaces = deriveBoundarySpaces(draft.block, layout);
    expect(validateDocument(draft, [asset], layout)).toEqual([]);
  });
  test("derives symmetric gameplay neighbours from touching zones", () => { const spaces = inferNeighbors([{ id: "a", type: "normal", zoneIds: ["h2"], capacity: 1, displayShape: "auto", neighbors: [] }, { id: "b", type: "normal", zoneIds: ["h3"], capacity: 1, displayShape: "auto", neighbors: [] }, { id: "c", type: "normal", zoneIds: ["h5"], capacity: 1, displayShape: "auto", neighbors: [] }], layout); expect(spaces[0]?.neighbors).toEqual(["b"]); expect(spaces[1]?.neighbors).toEqual(["a"]); expect(spaces[2]?.neighbors).toEqual([]); });
  test("migrates legacy double pills and marks old geometry for review", () => { const draft = draftForAsset(asset) as any; draft.block.layoutId = "standard-seven-small-hex-grid"; draft.status = "review"; draft.block.spaces = [{ id: "legacy", type: "double", footprint: { shape: "pill", cells: [{ q: 0, r: 0 }, { q: 0, r: -1 }] } }]; const migrated = normalizeBlockDocument(draft, layout); expect(migrated.block.spaces[0]).toMatchObject({ type: "normal", zoneIds: ["h1", "h2"], capacity: 2, displayShape: "auto" }); expect(migrated.geometryReviewRequired).toBe(true); expect(migrated.status).toBe("draft"); });
  test("migrates legacy sessions to v4", () => { const draft = draftForAsset(asset) as any; draft.block.layoutId = "standard-seven-small-hex-grid"; const session = migrateSession({ sessionVersion: 1, projectId: "zaibatsu-block-editor", assetManifestPath: "spec/assets/manifest.json", documents: [draft], history: [] } as any, layout); expect(session.sessionVersion).toBe(4); expect((session.documents[0] as any).geometryReviewRequired).toBe(true); });
  test("exports a v4 zone patch", () => expect(buildPatch(draftForAsset(asset), "abc").format).toBe("zaibatsu-editor-patch/v4"));
});
describe("action-card editor model", () => { const card: AssetRecord = { assetId: "sp-en-action-cards-p01-c01", artifactId: "sp-en-action-cards", page: 1, kind: "action-card" }; test("keeps vision candidates review-only", () => { const draft=actionCardDraftForAsset(card,{confidence:.2,reviewRequired:true,reasons:["OCR unavailable"]}); expect(validateDocument(draft,[card],layout).join(" ")).toContain("reviewer confirmation"); }); });