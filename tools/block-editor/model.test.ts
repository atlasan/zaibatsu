import blockDefinitions from "../../spec/data/speedrunners/blocks.json";
import { describe, expect, test } from "bun:test";
import { coverageSurface, editorCoverageCatalog } from "./coverage";
import { actionCardDraftForAsset, applyVisionPrefill, buildActionCardPatch, buildPatch, clearBlockContent, defaultCapacity, deriveBoundarySpaces, derivedDisplayShape, derivedIceValue, draftForAsset, inferNeighbors, isConnectedZoneSet, migrateSession, normalizeBlockDocument, prefillSevenZones, validateActionDeck, validateDocument, type AssetRecord, type BlockLayout } from "./model";

const asset: AssetRecord = { assetId: "sp-en-blocks-a4-p01-c01", artifactId: "sp-en-blocks-a4", page: 1, kind: "block" };

test("Pink authoring preserves controlled placement and requires the matching pawn home",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p03-c03",artifactId:"sp-en-blocks-a4",page:3,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="pink-district")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);expect(JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value.effects).toEqual({underControl:{kind:"place-controlled-pawn",target:"gynoid"}});d.block.effects={inCybernet:{kind:"place-controlled-pawn",target:"gynoid"}};expect(validateDocument(d,[source],layout).join(" ")).toContain("under-control timing");d.block.effects={underControl:{kind:"place-controlled-pawn",target:"missing"}};expect(validateDocument(d,[source],layout).join(" ")).toContain("matching pawn space");
});

test("Copyleft authoring exports a typed all-player reserve award without invented pawn targets",()=>{
 const d=prefillSevenZones(draftForAsset(asset,layout),layout);d.block.effects={inCybernet:{kind:"gain-bonus-all-players",amount:1}};expect(validateDocument(d,[asset],layout)).toEqual([]);expect(JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value.effects).toEqual(d.block.effects);for(const e of [{kind:"gain-bonus-all-players",amount:0},{kind:"gain-bonus-all-players",amount:1,target:"eko"}]){d.block.effects.inCybernet=e as any;expect(validateDocument(d,[asset],layout).length).toBeGreaterThan(0);}d.block.effects={underControl:{kind:"gain-bonus-all-players",amount:1}};expect(validateDocument(d,[asset],layout).join(" ")).toContain("placement timing");
});

test("EMP authoring retains typed sacrifice thresholds and rejects unsupported amounts/timing",()=>{
 const d=prefillSevenZones(draftForAsset(asset,layout),layout);d.block.effects={inCybernet:{kind:"sacrifice-per-player",amount:1,minimumControlledPawns:2}};const normalized=normalizeBlockDocument(d,layout);expect(validateDocument(normalized,[asset],layout)).toEqual([]);expect(JSON.parse(JSON.stringify(buildPatch(normalized,"source"))).operations[0].value.effects).toEqual(d.block.effects);
 for(const effect of [{kind:"sacrifice-per-player",amount:2,minimumControlledPawns:2},{kind:"sacrifice-per-player",amount:1,minimumControlledPawns:0},{kind:"place-pawn",minimumControlledPawns:2}]){d.block.effects.inCybernet=effect as any;expect(validateDocument(d,[asset],layout).length).toBeGreaterThan(0);}d.block.effects={underControl:{kind:"sacrifice-per-player",amount:1,minimumControlledPawns:2}};expect(validateDocument(d,[asset],layout).join(" ")).toContain("placement timing");
});

test("Phase-Loop authoring exports acting modifiers separately from target ICE",()=>{
 const source:AssetRecord={assetId:"sp-en-action-cards-p04-c01",artifactId:"sp-en-action-cards",page:4,kind:"action-card"},draft=actionCardDraftForAsset(source);
 draft.actionCard.attach={as:"pawn",slot:"gadget",cost:1,handModifier:-2,icebreakerModifier:{rollDice:1,ignoresBlackIce:true}};
 expect(validateDocument(draft,[source]).filter(m=>m.includes("supported structured"))).toEqual([]);const exported=JSON.parse(JSON.stringify(buildActionCardPatch(draft,"source"))).operations[0].value;expect(exported.attach).toEqual(draft.actionCard.attach);expect(exported.attach.iceModifier).toBeUndefined();
 for(const m of [{rollDice:-1},{faces:[7]},{faces:[1,1]},{ignoresBlackIce:"yes"}]) {draft.actionCard.attach.icebreakerModifier=m as any;expect(validateDocument(draft,[source]).join(" ")).toContain("attach");}
});

test("Antro authoring retains the typed optional effect through normalization and export",()=>{
 const d=prefillSevenZones(draftForAsset(asset,layout),layout),space=d.block.spaces[0]!;space.type="effect";space.effect={kind:"discard-attachment",cardType:"add-on",scope:"cybernet",optional:true};
 const normalized=normalizeBlockDocument(d,layout);expect(normalized.block.spaces[0]!.effect).toEqual(space.effect);expect(validateDocument(normalized,[asset],layout).filter(m=>m.includes("optional attachment"))).toEqual([]);const patch=JSON.parse(JSON.stringify(buildPatch(normalized,"source")));expect(patch.operations[0].value.spaces[0].effect).toEqual(space.effect);
 normalized.block.spaces[0]!.effect!.scope="self" as any;expect(validateDocument(normalized,[asset],layout).join(" ")).toContain("optional attachment");
});

test("structured card export retains arrow, step and phase-effect rules", () => {
  const source: AssetRecord={assetId:"sp-en-action-cards-p01-c01",artifactId:"sp-en-action-cards",page:1,kind:"action-card"};
  const draft=actionCardDraftForAsset(source);
  draft.actionCard.attach={as:"pawn",slot:"add-on",ignoresDirectionArrows:true,movementModifier:1,eliminationPrevention:{kind:"discard-self"},phaseEffects:[{trigger:"begin-turn",kind:"discard-self"}]};
  const exported=JSON.parse(JSON.stringify(buildActionCardPatch(draft,"test-source-hash")));
  expect(exported.operations[0].value.attach).toEqual(draft.actionCard.attach);
  const normalized=JSON.parse(JSON.stringify(draft));
  expect(validateDocument(normalized,[source]).filter(message=>message.includes("attach"))).toEqual([]);
  expect(normalized.actionCard.attach).toEqual(draft.actionCard.attach);
  normalized.actionCard.attach.phaseEffects[0].kind="unknown-effect";
  expect(validateDocument(normalized,[source]).join(" ")).toContain("attach");
});
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
describe("action-card editor model", () => { const card: AssetRecord = { assetId: "sp-en-action-cards-p01-c01", artifactId: "sp-en-action-cards", page: 1, kind: "action-card" }; test("keeps vision candidates review-only", () => { const draft=actionCardDraftForAsset(card,{confidence:.2,reviewRequired:true,reasons:["OCR unavailable"]}); expect(validateDocument(draft,[card],layout).join(" ")).toContain("reviewer confirmation"); }); test("validates current structured card fields", () => { const draft=actionCardDraftForAsset(card); draft.actionCard.movements=[{type:"fixed",amount:3,stealth:true},{type:"d6"}]; draft.actionCard.effects=[{kind:"gain-bonus",amount:1,trigger:"on-play"},{kind:"custom",text:"Gain control of this pawn.",trigger:"on-control"}]; draft.actionCard.attach={as:"pawn",slot:"add-on",class:["cyborg"],grants:["icebreaker"],removes:["move","search","delete","icebreaker","reboot"],grantsMovement:[{type:"d6"}],grantsStealth:true,grantsSlot:["gadget"],abilityUses:[{ability:"move",dice:"d6"}],iceModifier:{faces:[1,6],deltaDice:1,black:true},drawModifier:1,handModifier:-1,attackModifier:2,blockSpace:{shape:"circle"},effectText:"Gain control of this pawn.",effectTrigger:"on-attach",cost:2}; expect(validateDocument(draft,[card],layout)).toEqual([]); draft.actionCard.effects=[{kind:"not-real"} as any]; expect(validateDocument(draft,[card],layout).join(" ")).toContain("supported structured values"); draft.actionCard.effects=[]; draft.actionCard.attach={unknown:true} as any; expect(validateDocument(draft,[card],layout).join(" ")).toContain("supported structured values"); }); test("detects duplicate records, source ownership, and unconfirmed groups", () => { const sibling: AssetRecord = { ...card, assetId: "sp-en-action-cards-p01-c02" }; const first = actionCardDraftForAsset(card); const second = actionCardDraftForAsset(sibling); second.actionCard.id = first.actionCard.id; first.actionCard.assetRefs.push(sibling.assetId); first.actionCard.copies = 2; expect(validateActionDeck([first, second], [card, sibling]).join(" ")).toContain("duplicated"); expect(validateActionDeck([first, second], [card, sibling]).join(" ")).toContain("belongs to both"); expect(validateActionDeck([first], [card, sibling]).join(" ")).toContain("requires confirmation"); }); });
describe("coverage catalog", () => {
  test("describes all three local surfaces and shared gaps", () => {
    const catalog = editorCoverageCatalog();
    expect(catalog.surfaces.map((surface) => surface.id)).toEqual(["block-editor", "action-card-editor", "play-workbench"]);
    expect(catalog.sharedGaps.some((item) => item.label.includes("Bonus-counter economy"))).toBe(true);
  });
  test("marks the workbench as a partial runtime surface", () => {
    const surface = coverageSurface("play-workbench");
    expect(surface.status).toBe("partial");
    expect(surface.items.some((item) => item.detail.includes("granted slots"))).toBe(true);
    expect(surface.items.some((item) => item.status === "planned")).toBe(true);
  });
});


test("phase card export preserves draw/discard amounts and explicit relocation threat policy",()=>{
  const source:AssetRecord={assetId:"sp-en-action-cards-p03-c02",artifactId:"sp-en-action-cards",page:3,kind:"action-card"};
  const draft=actionCardDraftForAsset(source);
  const effects=[{trigger:"begin-turn" as const,kind:"sacrifice-and-draw" as const,amount:3},{trigger:"begin-turn" as const,kind:"discard-cards" as const,amount:2},{trigger:"begin-turn" as const,kind:"discard-and-relocate" as const,threatMode:"normal-movement" as const}];
  for(const effect of effects) {
    draft.actionCard.attach={as:"pawn",slot:"add-on",phaseEffects:[effect]};
    expect(validateDocument(draft,[source]).filter(message=>message.includes("attach"))).toEqual([]);
    expect(JSON.parse(JSON.stringify(buildActionCardPatch(draft,"source"))).operations[0].value.attach.phaseEffects).toEqual([effect]);
    const bad=structuredClone(draft);bad.actionCard.attach!.phaseEffects![0]!.amount=0;
    expect(validateDocument(bad,[source]).join(" ")).toContain("attach");
  }
});


test("prevention authoring rejects unknown handlers and malformed records",()=>{
  const source:AssetRecord={assetId:"sp-en-action-cards-p03-c01",artifactId:"sp-en-action-cards",page:3,kind:"action-card"};
  for(const value of [null,{kind:"unknown"},{kind:"discard-self",amount:1}]) {
    const draft=actionCardDraftForAsset(source);draft.actionCard.attach={as:"pawn",slot:"add-on",eliminationPrevention:value as any};
    expect(validateDocument(draft,[source]).join(" ")).toContain("attach");
  }
});


test("block card authoring retains attachment-time placement intent without marking runtime support",()=>{
  const source:AssetRecord={assetId:"sp-en-action-cards-p01-c09",artifactId:"sp-en-action-cards",page:1,kind:"action-card"};
  const draft=actionCardDraftForAsset(source);draft.actionCard.type="block";draft.actionCard.attach={as:"block"};draft.actionCard.effects=[{kind:"place-pawn",target:"cracker",trigger:"on-attach"}];
  expect(validateDocument(draft,[source]).filter(message=>message.includes("effects")||message.includes("type"))).toEqual([]);
  const card=JSON.parse(JSON.stringify(buildActionCardPatch(draft,"source"))).operations[0].value;expect(card.type).toBe("block");expect(card.effects[0].trigger).toBe("on-attach");expect(card.provisional).toBe(true);
});

test("target eligibility authoring preserves distinct required and excluded classes and rejects invalid lists",()=>{
  const source:AssetRecord={assetId:"sp-en-action-cards-p02-c03",artifactId:"sp-en-action-cards",page:2,kind:"action-card"};
  const draft=actionCardDraftForAsset(source);draft.actionCard.class=["malware"];draft.actionCard.attach={as:"enemy",slot:"add-on",class:["cleaner","bot"],forbiddenClasses:["operative"]};
  const card=JSON.parse(JSON.stringify(buildActionCardPatch(draft,"source"))).operations[0].value;
  expect(card.class).toEqual(["malware"]);expect(card.attach.class).toEqual(["cleaner","bot"]);expect(card.attach.forbiddenClasses).toEqual(["operative"]);
  expect(validateDocument(draft,[source]).filter(message=>message.includes("attach"))).toEqual([]);
  for(const invalid of [[],["operative","operative"],[""],[2],"operative"]) {
    draft.actionCard.attach!.forbiddenClasses=invalid as any;
    expect(validateDocument(draft,[source]).join(" ")).toContain("attach");
  }
  draft.actionCard.attach={as:"block",forbiddenClasses:["operative"]};expect(validateDocument(draft,[source]).join(" ")).toContain("attach");
});

test("printed Delete authoring preserves strength independently from activation and rejects mixed encodings",()=>{
  const source:AssetRecord={assetId:"sp-en-action-cards-p03-c07",artifactId:"sp-en-action-cards",page:3,kind:"action-card"};
  const draft=actionCardDraftForAsset(source);
  for(const activation of [undefined,"card","once-per-turn"] as const) {
    draft.actionCard.attach={as:"pawn",slot:"weapon",delete:{skulls:1,...(activation?{activation}:{})}};
    expect(validateDocument(draft,[source]).filter(message=>message.includes("attach"))).toEqual([]);
    const card=JSON.parse(JSON.stringify(buildActionCardPatch(draft,"source"))).operations[0].value;
    expect(card.attach.delete).toEqual({skulls:1,...(activation?{activation}:{})});
  }
  for(const attach of [{as:"pawn",delete:{skulls:0}},{as:"pawn",delete:{skulls:1,activation:"unknown"}},{as:"block",delete:{skulls:1}},{as:"pawn",delete:{skulls:1},grants:["delete"]},{as:"pawn",delete:{skulls:1},abilityUses:[{ability:"delete",activation:"card"}]}]) {
    draft.actionCard.attach=attach as any;expect(validateDocument(draft,[source]).join(" ")).toContain("attach");
  }
});

test("Malware authoring preserves typed attachment takeover and Core entry restrictions",()=>{
  const source:AssetRecord={assetId:"sp-en-action-cards-p02-c01",artifactId:"sp-en-action-cards",page:2,kind:"action-card"},draft=actionCardDraftForAsset(source);
  draft.actionCard.attach={as:"enemy",slot:"add-on",class:["cleaner"]};draft.actionCard.effects=[{kind:"gain-target-control",trigger:"on-attach"}];
  expect(validateDocument(draft,[source]).filter(message=>message.includes("supported structured"))).toEqual([]);
  let card=JSON.parse(JSON.stringify(buildActionCardPatch(draft,"source"))).operations[0].value;expect(card.effects).toEqual([{kind:"gain-target-control",trigger:"on-attach"}]);
  draft.actionCard.effects=[];draft.actionCard.attach={as:"enemy",slot:"add-on",forbiddenDestinations:["central-core"]};
  card=JSON.parse(JSON.stringify(buildActionCardPatch(draft,"source"))).operations[0].value;expect(card.attach.forbiddenDestinations).toEqual(["central-core"]);
  for(const value of [[],["unknown"],["central-core","central-core"]]) {draft.actionCard.attach.forbiddenDestinations=value as any;expect(validateDocument(draft,[source]).join(" ")).toContain("attach");}
  draft.actionCard.attach={as:"enemy",slot:"add-on",cost:1};draft.actionCard.effects=[{kind:"gain-target-control",trigger:"on-attach"}];expect(validateDocument(draft,[source]).join(" ")).toContain("attach");
});


test("Trojan authoring retains typed controller-hand visibility and rejects unsupported policies",()=>{
  const source:AssetRecord={assetId:"sp-en-action-cards-p02-c08",artifactId:"sp-en-action-cards",page:2,kind:"action-card"},draft=actionCardDraftForAsset(source);
  draft.actionCard.attach={as:"enemy",slot:"add-on",controllerHand:"face-up"};
  expect(validateDocument(draft,[source]).filter(message=>message.includes("supported structured"))).toEqual([]);
  const card=JSON.parse(JSON.stringify(buildActionCardPatch(draft,"source"))).operations[0].value;expect(card.attach.controllerHand).toBe("face-up");
  for(const attach of [{as:"enemy",controllerHand:"hidden"},{as:"block",controllerHand:"face-up"}]) {draft.actionCard.attach=attach as any;expect(validateDocument(draft,[source]).join(" ")).toContain("attach");}
});


test("block authoring retains non-playable title zones, exact defense faces and neutral placement",()=>{
 const d=draftForAsset(asset);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="idoru")!) as typeof d.block;d.status="verified";
 const normalized=normalizeBlockDocument(d,layout);expect(validateDocument(normalized,[asset],layout)).toEqual([]);const block=buildPatch(normalized,"source-checksum").operations[0]!.value;expect(block.nonPlayableZoneIds).toEqual(["h1"]);expect(block.spaces.find(s=>s.id==="defense")!.modifier).toEqual({kind:"defense",dice:[{value:1,shielded:false}]});expect(block.effects!.inCybernet).toEqual({kind:"place-neutral-pawn",target:"idoru",text:"Place the Idoru in this block."});
 normalized.block.nonPlayableZoneIds=["h2"];expect(validateDocument(normalized,[asset],layout).join(" ")).toContain("Non-playable zones");normalized.block.nonPlayableZoneIds=["h1"];normalized.block.spaces.find(s=>s.id==="defense")!.modifier={kind:"defense",amount:1};expect(validateDocument(normalized,[asset],layout).join(" ")).toContain("printed defense faces");expect(clearBlockContent(d,layout).block.nonPlayableZoneIds).toEqual([]);expect(prefillSevenZones(d,layout).block.nonPlayableZoneIds).toEqual([]);const vision=applyVisionPrefill(d,layout,{spaces:[{kind:"circle",suggestedZoneIds:["h1"]}]} as Parameters<typeof applyVisionPrefill>[2]);expect(vision.block.spaces).toEqual([]);expect(vision.block.nonPlayableZoneIds).toEqual(["h1"]);
});

test("one-way internal links survive normalization and patches and reject dangling or reversed pairs",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p01-c03",artifactId:"sp-en-blocks-a4",page:1,kind:"block"},d=draftForAsset(source);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="chiba-city")!) as typeof d.block;const normalized=normalizeBlockDocument(d,layout);expect(validateDocument(normalized,[source],layout)).toEqual([]);expect(buildPatch(normalized,"source").operations[0]!.value.spaceArrows).toEqual([{from:"rabbit",to:"shield"}]);
 for(const arrows of [[{from:"missing",to:"shield"}],[{from:"rabbit",to:"city"}],[{from:"rabbit",to:"shield"},{from:"shield",to:"rabbit"}]]) {normalized.block.spaceArrows=arrows;expect(validateDocument(normalized,[source],layout).join(" ")).toContain("One-way space links");}expect(clearBlockContent(d,layout).block.spaceArrows).toEqual([]);expect(prefillSevenZones(d,layout).block.spaceArrows).toEqual([]);const replaced=applyVisionPrefill(d,layout,{spaces:[],whiteCorners:[true,true,true,false,false,true]} as Parameters<typeof applyVisionPrefill>[2]);expect(replaced.block.spaceArrows).toEqual([]);expect(replaced.block.bonusFragments).toBe(4);
});

test("Broadcast authoring keeps optional Core permission separate from setup identity",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p03-c01",artifactId:"sp-en-blocks-a4",page:3,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="clandestine-broadcast")) as any;
 expect(validateDocument(d,[source],layout)).toEqual([]);expect(JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value.effects).toEqual({underControl:{kind:"controller-core",target:"broadcast"}});
 d.block.effects={inCybernet:{kind:"controller-core",target:"broadcast"}};expect(validateDocument(d,[source],layout).join(" ")).toContain("under-control");d.block.effects={underControl:{kind:"controller-core",target:"left"}};expect(validateDocument(d,[source],layout).join(" ")).toContain("special landing");
});
test("Yakuza authoring retains an optional adjacent one-skull target choice and validates its trigger",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p04-c01",artifactId:"sp-en-blocks-a4",page:4,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="yakuza")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);expect(JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value.effects).toEqual({underControl:{kind:"attack-pawn",amount:1,scope:"adjacent-blocks",optional:true}});
 d.block.effects={inCybernet:{kind:"attack-pawn",amount:1,scope:"adjacent-blocks",optional:true}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);
});
test("Corporate Scandal authoring retains an exclusive marker threshold and rejects unsupported triggers or extra amounts",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p04-c02",artifactId:"sp-en-blocks-a4",page:4,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="corporate-scandal")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);expect(JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value.effects).toEqual({underControl:{kind:"discard-hands-above-markers",markerThreshold:5}});
 d.block.effects={inCybernet:{kind:"discard-hands-above-markers",markerThreshold:5}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);d.block.effects={underControl:{kind:"discard-hands-above-markers",markerThreshold:5,amount:1}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);
});
test("Black Clinic authoring retains global mandatory detachment, unlimited large circle and hand-space policy",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p04-c03",artifactId:"sp-en-blocks-a4",page:4,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="black-clinic")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);const b=JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value;expect(b.effects).toEqual({underControl:{kind:"discard-pawn-attachments",scope:"cybernet"}});expect(b.spaces[3].capacity).toBe("unlimited");expect(b.spaces[2].modifier).toEqual({kind:"hand-size",amount:-1});d.block.effects={inCybernet:{kind:"discard-pawn-attachments",scope:"cybernet"}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);d.block.effects={underControl:{kind:"discard-pawn-attachments",scope:"cybernet",optional:true}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);
});
test("Engineering War authoring retains excluded title/effect zones, two side entrances and exact matching Drone MK-2 placement",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p05-c01",artifactId:"sp-en-blocks-a4",page:5,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="engineering-war")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);const b=JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value;expect(b.nonPlayableZoneIds).toEqual(["h2","h3","h5","h6"]);expect(b.edges).toEqual([false,true,false,false,true,false]);expect(b.effects).toEqual({underControl:{kind:"place-controlled-pawn",target:"drone-mk-2"}});expect(b.spaces[1].pawnId).toBe("drone-mk-2");d.block.effects={underControl:{kind:"place-controlled-pawn",target:"gynoid"}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);
});
test("Combat Prototypes authoring preserves two excluded zones, four entrances, central home and controlled Drone Probe target",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p05-c02",artifactId:"sp-en-blocks-a4",page:5,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="combat-prototypes")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);const b=JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value;expect(b.nonPlayableZoneIds).toEqual(["h3","h6"]);expect(b.edges).toEqual([false,true,true,false,true,true]);expect(b.effects).toEqual({underControl:{kind:"place-controlled-pawn",target:"drone-probe"}});expect(b.spaces[4].capacity).toBe("unlimited");d.block.effects={underControl:{kind:"place-controlled-pawn",target:"drone-mk-2"}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);
});

test("Military Development editor retains the matching Turret, hand-space and excluded art",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p05-c03",artifactId:"sp-en-blocks-a4",page:5,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="military-development")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);const b=JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value;expect(b.nonPlayableZoneIds).toEqual(["h2","h3","h5","h6"]);expect(b.spaces[0].modifier).toEqual({kind:"hand-size",amount:1});expect(b.effects.underControl).toEqual({kind:"place-controlled-pawn",target:"drone-turret"});d.block.effects={underControl:{kind:"place-controlled-pawn",target:"drone-probe"}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);
});

test("Arms Industry authoring retains the paired physical-counter effects and rejects extra or misplaced collection policies",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p06-c01",artifactId:"sp-en-blocks-a4",page:6,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="arms-industry")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);const b=JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value;expect(b.nonPlayableZoneIds).toEqual(["h1","h4","h5"]);expect(b.effects).toEqual({inCybernet:{kind:"place-block-bonus",amount:1},underControl:{kind:"collect-block-bonus"}});d.block.effects={inCybernet:{kind:"place-block-bonus",amount:2},underControl:{kind:"collect-block-bonus"}};expect(validateDocument(d,[source],layout).length).toBeGreaterThan(0);
});
test("Cleaner B save and export keep the controlled pawn, hand arrow and printed modifiers",()=>{
 const source:AssetRecord={assetId:"sp-en-blocks-a4-p06-c02",artifactId:"sp-en-blocks-a4",page:6,kind:"block"},d=draftForAsset(source,layout);d.block=structuredClone(blockDefinitions.blocks.find(b=>b.id==="cleaner-b")) as any;expect(validateDocument(d,[source],layout)).toEqual([]);const b=JSON.parse(JSON.stringify(buildPatch(d,"source"))).operations[0].value;expect(b.nonPlayableZoneIds).toEqual(["h1"]);expect(b.spaceArrows).toEqual([{from:"hand",to:"circuit"}]);expect(b.spaces.find((s:any)=>s.id==="hand").modifier).toEqual({kind:"hand-size",amount:-1});expect(b.spaces.find((s:any)=>s.id==="defense").modifier).toEqual({kind:"defense",dice:[{value:1,shielded:false},{value:2,shielded:false}]});expect(b.effects).toEqual({underControl:{kind:"place-controlled-pawn",target:"cleaner-b"}});d.block.spaceArrows=[{from:"circuit",to:"hand"},{from:"hand",to:"circuit"}];expect(validateDocument(d,[source],layout).join(" ")).toContain("one direction");
});
