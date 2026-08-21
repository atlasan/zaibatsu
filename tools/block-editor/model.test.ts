import { describe, expect, test } from "bun:test";
import { actionCardDraftForAsset, applyVisionPrefill, buildPatch, clearBlockContent, defaultCapacity, deriveBoundarySpaces, derivedDisplayShape, derivedIceValue, draftForAsset, inferNeighbors, isConnectedZoneSet, migrateSession, normalizeBlockDocument, prefillSevenZones, validateActionDeck, validateDocument, type AssetRecord, type BlockLayout } from "./model";

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
  test("authors exact ICE faces while retaining a derived legacy category", () => {
    expect(derivedIceValue([4, 5, 6])).toBe("low");
    expect(derivedIceValue([1, 6], true)).toBe("black");
    const draft = draftForAsset(asset); draft.block.iceFaces = [1, 6]; draft.block.iceValue = "medium"; draft.block.blackIce = false;
    expect(validateDocument(draft, [asset], layout)).toEqual([]);
  });
  test("preserves current schema fields through normalization", () => {
    const draft = draftForAsset(asset); draft.block.iceFaces = [2, 5]; draft.block.iceValue = "medium"; draft.block.blackIce = true; draft.block.isCentralCore = true;
    draft.block.effects = { underControl: { kind: "modify-ice", amount: -1, target: "block" } };
    draft.block.spaces = [{ id: "a", type: "normal", zoneIds: ["h1"], capacity: 1, displayShape: "auto", neighbors: [], pawnId: "speedrunner-red", effectId: "sp-example", direction: 2, modifier: { kind: "ice", amount: 1 } }];
    expect(normalizeBlockDocument(draft, layout).block).toMatchObject({ iceFaces: [2, 5], blackIce: true, isCentralCore: true, effects: draft.block.effects, spaces: [{ pawnId: "speedrunner-red", effectId: "sp-example", direction: 2, modifier: { kind: "ice", amount: 1 } }] });
  });
  test("prefills one gameplay space per zone and clears only editable content", () => {
    const filled = prefillSevenZones(draftForAsset(asset), layout);
    expect(filled.block.spaces.map((space) => space.zoneIds[0])).toEqual(["h1", "h2", "h3", "h4", "h5", "h6", "h7"]);
    filled.block.iceFaces = [6]; filled.block.blackIce = true; filled.block.isCentralCore = true; filled.block.effects = { inCybernet: "sp-example" };
    const cleared = clearBlockContent(filled, layout);
    expect(cleared.source.assetId).toBe(asset.assetId); expect(cleared.block.isCentralCore).toBe(true); expect(cleared.block.spaces).toEqual([]); expect(cleared.block.iceFaces).toEqual([]); expect(cleared.block.effects).toBeUndefined();
  });
  test("applies non-overlapping HexVision suggestions and leaves conflicts unresolved", () => {
    const result = applyVisionPrefill(draftForAsset(asset), layout, { asset: asset.assetId, center: [650, 749], inradius: 643, vertices: [[650, 6], [1294, 378], [1294, 1121], [650, 1493], [6, 1121], [6, 378]], edges: [true, false, true, false, false, false], whiteCorners: [true, false, false, false, false, false], spaces: [{ kind: "circle", suggestedZoneIds: ["h1"] }, { kind: "circle", suggestedZoneIds: ["h1"] }, { kind: "capsule", suggestedZoneIds: ["h2", "h3"] }], iceDiceCandidates: [{ face: 2 }, { face: 6 }] });
    expect(result.block.spaces.map((space) => space.zoneIds)).toEqual([["h1"], ["h2", "h3"]]);
    expect(result.block.edges).toEqual([true, false, true, false, false, false]); expect(result.block.iceFaces).toEqual([2, 6]);
    expect(result.annotations).toContain("HexVision left 1 conflicting or incomplete zone proposal unresolved.");
  });
});
describe("action-card editor model", () => { const card: AssetRecord = { assetId: "sp-en-action-cards-p01-c01", artifactId: "sp-en-action-cards", page: 1, kind: "action-card" }; test("keeps vision candidates review-only", () => { const draft=actionCardDraftForAsset(card,{confidence:.2,reviewRequired:true,reasons:["OCR unavailable"]}); expect(validateDocument(draft,[card],layout).join(" ")).toContain("reviewer confirmation"); }); test("validates current structured card fields", () => { const draft=actionCardDraftForAsset(card); draft.actionCard.movements=[{type:"fixed",amount:3}]; draft.actionCard.effects=[{kind:"gain-bonus",amount:1,trigger:"on-play"}]; draft.actionCard.attach={as:"pawn",slot:"add-on",grants:["icebreaker"],removes:["move","search","delete","icebreaker","reboot"],grantsMovement:[{type:"d6"}],abilityUses:[{ability:"move",dice:"d6"}]}; expect(validateDocument(draft,[card],layout)).toEqual([]); draft.actionCard.effects=[{kind:"not-real"} as any]; expect(validateDocument(draft,[card],layout).join(" ")).toContain("supported structured values"); draft.actionCard.effects=[]; draft.actionCard.attach={unknown:true} as any; expect(validateDocument(draft,[card],layout).join(" ")).toContain("supported structured values"); }); test("detects duplicate records, source ownership, and unconfirmed groups", () => { const sibling: AssetRecord = { ...card, assetId: "sp-en-action-cards-p01-c02" }; const first = actionCardDraftForAsset(card); const second = actionCardDraftForAsset(sibling); second.actionCard.id = first.actionCard.id; first.actionCard.assetRefs.push(sibling.assetId); first.actionCard.copies = 2; expect(validateActionDeck([first, second], [card, sibling]).join(" ")).toContain("duplicated"); expect(validateActionDeck([first, second], [card, sibling]).join(" ")).toContain("belongs to both"); expect(validateActionDeck([first], [card, sibling]).join(" ")).toContain("requires confirmation"); }); });
