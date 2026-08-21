import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { buildActionCardPatch, buildPatch, migrateSession, sha256, validateActionDeck, validateDocument, type ActionCardDocument, type AssetRecord, type BlockLayout, type EditorDocument, type EditorSession, type HexVisionTile } from "./model";
import { createPlayScenario, createPlaySession, exportPlayTrace, getMovementOptions, getPlaySession, importPlayTrace, listPlayScenarios, resetPlaySession, submitPlayCommand, undoPlayCommand, type PlayCommand, type PlaySetup, type PlayTrace } from "./play";

const editorRoot = import.meta.dir;
const repoRoot = resolve(editorRoot, "../..");
const publicRoot = join(editorRoot, "public");
const sessionsRoot = join(editorRoot, ".sessions");
const exportsRoot = join(editorRoot, "exports");
mkdirSync(sessionsRoot, { recursive: true });
mkdirSync(exportsRoot, { recursive: true });

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const safeName = (value: unknown) => typeof value === "string" && /^[a-z0-9-]+$/.test(value) ? value : null;
const manifest = () => readJson<{ assets: AssetRecord[] }>(join(repoRoot, "spec/assets/manifest.json"));
const assetRecords = () => manifest().assets.filter((asset) => asset.kind === "block" || asset.kind === "action-card");
const blockAssets = () => assetRecords().filter((asset) => asset.kind === "block");
const actionCardAssets = () => assetRecords().filter((asset) => asset.kind === "action-card");
const layoutFile = join(repoRoot, "spec/data/block-layouts.json");
const overrideFile = join(repoRoot, "spec/data/block-layout-overrides.json");
const blockLayouts = () => readJson<{ layouts: BlockLayout[] }>(layoutFile);
type GeometryOverride = { assetId: string; layoutId: string; note: string; transform: { offsetX: number; offsetY: number; scale: number } };
const blockLayoutOverrides = () => readJson<{ overrides: GeometryOverride[] }>(overrideFile);
function transformPoint(point: { x: number; y: number }, transform: GeometryOverride["transform"]) { return { ...point, x: 50 + (point.x - 50) * transform.scale + transform.offsetX, y: 50 + (point.y - 50) * transform.scale + transform.offsetY }; }
const sourceZoneAnchors: Record<string, [number, number]> = { h1: [0, 0], h2: [-0.337, -0.583], h3: [0.337, -0.583], h4: [0.674, 0], h5: [0.337, 0.583], h6: [-0.337, 0.583], h7: [-0.674, 0] };
function pngSize(asset: AssetRecord): { width: number; height: number } | null {
  const path = asset.outputs?.png ? resolve(repoRoot, asset.outputs.png) : null;
  if (!path || !existsSync(path)) return null;
  const data = readFileSync(path);
  return data.length >= 24 && data.subarray(1, 4).toString("ascii") === "PNG" ? { width: data.readUInt32BE(16), height: data.readUInt32BE(20) } : null;
}
function sourceAlignedLayout(layout: BlockLayout, asset: AssetRecord, vision: HexVisionTile | null): BlockLayout {
  const size = pngSize(asset);
  if (!vision || !size || vision.vertices?.length !== 6 || !Array.isArray(vision.center) || !Number.isFinite(vision.inradius)) return layout;
  const [centerX, centerY] = vision.center;
  const normalize = ([x, y]: [number, number]) => ({ x: x / size.width * 100, y: y / size.height * 100 });
  const vertices = vision.vertices.map((point, index) => ({ id: `v${index + 1}`, ...normalize(point) }));
  const pointTowardCenter = (point: [number, number], factor: number): [number, number] => [centerX + (point[0] - centerX) * factor, centerY + (point[1] - centerY) * factor];
  const edges = vision.vertices.map((vertex, index) => {
    const next = vision.vertices[(index + 1) % vision.vertices.length]!;
    const midpoint: [number, number] = [(vertex[0] + next[0]) / 2, (vertex[1] + next[1]) / 2];
    return { id: `e${index + 1}`, ...normalize(pointTowardCenter(midpoint, 0.88)), zoneId: layout.edges[index]!.zoneId };
  });
  const zones = layout.zones.map((zone) => {
    const [x, y] = sourceZoneAnchors[zone.id]!;
    return { ...zone, x: (centerX + x * vision.inradius) / size.width * 100, y: (centerY + y * vision.inradius) / size.height * 100 };
  });
  return { ...layout, outerHex: { vertices }, corners: vertices, edges, zoneShape: { width: 2 * .337 * vision.inradius / size.width * 100, height: 2 * .389 * vision.inradius / size.height * 100 }, zones };
}
function layoutForAsset(assetId: string) {
  const layout = blockLayouts().layouts.find((item) => item.id === "standard-seven-zone-2-3-2-pointy");
  if (!layout) throw new Error("Canonical seven-zone block layout is missing.");
  const asset = assetRecords().find((item) => item.assetId === assetId);
  if (!asset) throw new Error("Unknown block asset.");
  const imageSize = pngSize(asset);
  const vision = visionFor(asset) as HexVisionTile | null;
  const override = blockLayoutOverrides().overrides.find((item) => item.assetId === assetId);
  const aligned = sourceAlignedLayout(layout, asset, vision);
  if (!override) return { layout: aligned, override: null, vision, imageSize };
  const transform = override.transform;
  return { layout: { ...aligned, outerHex: { vertices: aligned.outerHex.vertices.map((point) => transformPoint(point, transform)) }, corners: aligned.corners.map((point) => transformPoint(point, transform)), edges: aligned.edges.map((point) => transformPoint(point, transform)), zoneShape: { width: aligned.zoneShape.width * transform.scale, height: aligned.zoneShape.height * transform.scale }, zones: aligned.zones.map((zone) => ({ ...zone, ...transformPoint(zone, transform) })) }, override, vision, imageSize };
}
function sessionPath(name: string) { return join(sessionsRoot, `${name}.editor.json`); }
function sessionNames() { return readdirSync(sessionsRoot).filter((name) => name.endsWith(".editor.json")).map((name) => basename(name, ".editor.json")); }
function contentType(path: string) { return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp" } as Record<string, string>)[extname(path)] ?? "application/octet-stream"; }
async function body<T>(request: Request): Promise<T> { return await request.json() as T; }
function visionFor(asset: AssetRecord) { const candidates = [join(repoRoot, "tmp", "artifacts", "build", asset.artifactId, "hexvision", `${asset.artifactId}.vision.json`), join(repoRoot, "tools", "hexvision", "out", `${asset.artifactId}.vision.json`)]; const file = candidates.find(existsSync); if (!file) return null; const document = readJson<{ tiles?: HexVisionTile[] }>(file); return document.tiles?.find((tile) => tile.asset === asset.assetId) ?? null; }
function visionsForAssets() { return Object.fromEntries(blockAssets().flatMap((asset) => { const vision = visionFor(asset); return vision ? [[asset.assetId, vision]] : []; })); }
const cardZones = { title: [0, 0, .58, .20], "slot-type-banner": [.56, 0, .44, .22], "action-strip": [0, .80, 1, .20], attachment: [.56, .20, .44, .60], "main-face": [0, .20, .56, .60], "rule-text": [0, .20, 1, .60] };
/** Bridge existing, generated v2 evidence while the next HexVision run writes
 * candidates natively.  This remains review-only and does not infer rules. */
function actionCardVisionFor(asset: AssetRecord) {
  const raw = visionFor(asset) as any; if (!raw) return null;
  const proposals = raw.proposals ?? {}; const confidence = Number(raw.confidence ?? 0);
  const candidates = proposals.candidates ?? [
    ...(proposals.titleCandidate || proposals.nameCandidate ? [{ field: "name", value: proposals.titleCandidate ?? proposals.nameCandidate, zone: "title", confidence, reason: "Legacy HexVision title evidence" }] : []),
    ...(proposals.classes?.length ? [{ field: "class", value: proposals.classes, zone: "main-face", confidence, reason: "Legacy HexVision class evidence" }] : []),
    ...(proposals.activates?.length ? [{ field: "activates", value: proposals.activates, zone: "action-strip", confidence, reason: "Legacy HexVision action evidence" }] : []),
    ...(proposals.movements?.length ? [{ field: "movements", value: proposals.movements, zone: "rule-text", confidence, reason: "Legacy HexVision movement evidence" }] : []),
    ...(Number.isInteger(proposals.costCandidate) ? [{ field: "cost", value: proposals.costCandidate, zone: "attachment", confidence, reason: "Legacy HexVision cost evidence" }] : []),
    ...(Object.keys(proposals.attach ?? {}).length ? [{ field: "attach", value: proposals.attach, zone: "slot-type-banner", confidence, reason: "Legacy HexVision attachment evidence" }] : []),
  ];
  return { ...raw, zones: raw.zones ?? cardZones, proposals: { ...proposals, candidates } };
}
function hamming(left: string, right: string) { return left.length === right.length ? [...left].reduce((count, bit, index) => count + Number(bit !== right[index]), 0) : Number.POSITIVE_INFINITY; }
/** Compact, source-only evidence for action-card bulk review.  Similarity is
 * deliberately conservative: a matching OCR title and a near-identical visual
 * hash suggest a group; they never merge authored records. */
function actionCardVisionCatalog() {
  const visions = Object.fromEntries(actionCardAssets().flatMap((asset) => { const vision = actionCardVisionFor(asset); return vision ? [[asset.assetId, vision]] : []; })) as Record<string, any>;
  const copyGroupCandidates: Record<string, string[]> = {};
  for (const asset of actionCardAssets()) {
    const vision = visions[asset.assetId]; const title = String(vision?.proposals?.titleCandidate ?? vision?.proposals?.nameCandidate ?? "").trim().toLowerCase();
    if (!vision?.perceptualHash || !title) continue;
    copyGroupCandidates[asset.assetId] = actionCardAssets().filter((other) => {
      const candidate = visions[other.assetId]; const otherTitle = String(candidate?.proposals?.titleCandidate ?? candidate?.proposals?.nameCandidate ?? "").trim().toLowerCase();
      return other.assetId !== asset.assetId && expansionForAsset(other) === expansionForAsset(asset) && title === otherTitle && typeof candidate?.perceptualHash === "string" && hamming(vision.perceptualHash, candidate.perceptualHash) <= 8;
    }).map((other) => other.assetId);
  }
  return { visions, copyGroupCandidates };
}
function expansionForAsset(asset: AssetRecord) { return asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners"; }

const server = Bun.serve({
  port: Number(process.env.BLOCK_EDITOR_PORT ?? 4173),
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/assets") return json({ assets: assetRecords() });
      // Play sessions are intentionally in-memory. These routes never write
      // canonical spec data or editor drafts.
      if (url.pathname === "/api/play/sessions" && request.method === "POST") {
        try { return json(createPlaySession(await body<PlaySetup>(request)), 201); } catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid play setup" }, 400); }
      }
      if (url.pathname === "/api/play/scenarios" && request.method === "GET") return json({ scenarios: listPlayScenarios() });
      if (url.pathname.startsWith("/api/play/scenarios/") && request.method === "POST") {
        const id = safeName(url.pathname.slice("/api/play/scenarios/".length));
        if (!id) return json({ error: "Invalid Test Lab scenario id" }, 400);
        try { const payload = await body<PlaySetup>(request); return json(createPlayScenario(id, payload), 201); } catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid Test Lab scenario" }, 400); }
      }
      if (url.pathname === "/api/play/traces/import" && request.method === "POST") {
        try { return json(importPlayTrace(await body<PlayTrace>(request)), 201); } catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid play trace" }, 400); }
      }
      if (url.pathname.startsWith("/api/play/sessions/")) {
        const suffix = url.pathname.slice("/api/play/sessions/".length).split("/");
        const id = safeName(suffix[0]);
        if (!id) return json({ error: "Invalid play session id" }, 400);
        try {
          if (suffix.length === 1 && request.method === "GET") return json(getPlaySession(id));
          if (suffix[1] === "command" && request.method === "POST") return json(submitPlayCommand(id, await body<PlayCommand>(request)));
          if (suffix[1] === "movement-options" && request.method === "POST") {
            const payload = await body<{ pawnId: string; path: unknown; cardId?: string }>(request);
            return json(getMovementOptions(id, payload.pawnId, payload.path, payload.cardId));
          }
          if (suffix[1] === "undo" && request.method === "POST") return json(undoPlayCommand(id));
          if (suffix[1] === "reset" && request.method === "POST") return json(resetPlaySession(id, await body<PlaySetup>(request)));
          if (suffix[1] === "trace" && request.method === "GET") return json(exportPlayTrace(id));
        } catch (error) { return json({ error: error instanceof Error ? error.message : "Play session error" }, 400); }
      }
      if (url.pathname === "/api/block-assets") return json({ assets: blockAssets() });
      if (url.pathname === "/api/action-card-assets") return json({ assets: actionCardAssets() });
      if (url.pathname === "/api/action-card-visions") return json(actionCardVisionCatalog());
      if (url.pathname === "/api/block-layouts") return json(blockLayouts());
      if (url.pathname.startsWith("/api/block-layout/")) return json(layoutForAsset(decodeURIComponent(url.pathname.slice("/api/block-layout/".length))));
      if (url.pathname === "/api/block-visions") return json({ visions: visionsForAssets() });
      if (url.pathname === "/api/block-layout-overrides" && request.method === "POST") { const payload = await body<{ override: GeometryOverride }>(request); const override = payload.override; if (!safeName(override?.assetId) || override.layoutId !== "standard-seven-zone-2-3-2-pointy" || !override.note?.trim() || !Number.isFinite(override.transform?.offsetX) || !Number.isFinite(override.transform?.offsetY) || !Number.isFinite(override.transform?.scale) || override.transform.scale <= 0.25 || override.transform.scale > 2) return json({ error: "Override needs a known asset, a review note, and a safe transform." }, 400); const file = blockLayoutOverrides(); const overrides = file.overrides.filter((item) => item.assetId !== override.assetId); overrides.push(override); await Bun.write(overrideFile, `${JSON.stringify({ ...file, overrides }, null, 2)}\n`); return json({ ok: true, override }); }
      if (url.pathname.startsWith("/api/vision/")) { const asset = assetRecords().find((item) => item.assetId === decodeURIComponent(url.pathname.slice(12))); return json({ vision: asset ? asset.kind === "action-card" ? actionCardVisionFor(asset) : visionFor(asset) : null }); }
      if (url.pathname === "/api/sessions" && request.method === "GET") return json({ sessions: sessionNames() });
      if (url.pathname.startsWith("/api/sessions/") && request.method === "GET") { const name = safeName(url.pathname.split("/").at(-1)); if (!name || !existsSync(sessionPath(name))) return json({ error: "Session not found." }, 404); return json(migrateSession(readJson<EditorSession>(sessionPath(name)), blockLayouts().layouts[0])); }
      if (url.pathname === "/api/sessions" && request.method === "POST") { const payload = await body<{ name: string; session: EditorSession }>(request); const name = safeName(payload.name); if (!name) return json({ error: "Session name must use lowercase letters, digits, and hyphens." }, 400); await Bun.write(sessionPath(name), `${JSON.stringify(migrateSession(payload.session, blockLayouts().layouts[0]), null, 2)}\n`); return json({ ok: true, path: `tools/block-editor/.sessions/${name}.editor.json` }); }
      if (url.pathname === "/api/validate" && request.method === "POST") { const payload = await body<{ document: EditorDocument }>(request); return json({ errors: validateDocument(payload.document, assetRecords(), blockLayouts().layouts[0]) }); }
      if (url.pathname === "/api/action-card-deck/validate" && request.method === "POST") {
        const payload = await body<{ documents: ActionCardDocument[] }>(request);
        const documents = Array.isArray(payload.documents) ? payload.documents.filter((document): document is ActionCardDocument => document?.resourceType === "action-card") : [];
        return json({ errors: validateActionDeck(documents, assetRecords()) });
      }
      if (url.pathname === "/api/action-card-deck/export" && request.method === "POST") {
        const payload = await body<{ name: string; documents: ActionCardDocument[] }>(request); const name = safeName(payload.name);
        if (!name) return json({ error: "Export name must use lowercase letters, digits, and hyphens." }, 400);
        const documents = Array.isArray(payload.documents) ? payload.documents.filter((document): document is ActionCardDocument => document?.resourceType === "action-card") : [];
        const errors = validateActionDeck(documents, assetRecords()); if (errors.length) return json({ errors }, 400);
        const outputs = [] as Array<{ expansion: string; patch: string; report: string }>;
        for (const expansion of ["speedrunners", "shadowraiders"] as const) {
          const cards = documents.filter((document) => document.actionCard.expansion === expansion); if (!cards.length) continue;
          const target = join(repoRoot, "spec", "data", expansion, "action-cards.json"); const base = existsSync(target) ? sha256(readFileSync(target)) : null;
          const patch = { format: "zaibatsu-editor-patch/v2", resourceType: "action-card", targetPath: `spec/data/${expansion}/action-cards.json`, baseDataSha256: base, targetAbsent: base === null, operations: cards.map((document) => ({ op: "add", path: "/cards/-", value: document.actionCard, sourceAssetId: document.source.assetId, provenance: document.provenance })) };
          const report = { format: "zaibatsu-action-deck-review/v1", generatedAt: new Date().toISOString(), expansion, validation: { errors: [] }, cards: cards.map((document) => ({ assetIds: document.actionCard.assetRefs, cardId: document.actionCard.id, acceptedVisionFields: document.transcription.vision?.acceptedFields ?? [], rejectedVisionFields: document.transcription.vision?.rejectedFields ?? [], unresolvedVisionFields: (document.transcription.vision?.proposals?.candidates as Array<{ field?: string }> | undefined)?.map((candidate) => candidate.field).filter((field) => field && !document.transcription.vision?.acceptedFields?.includes(field) && !document.transcription.vision?.rejectedFields?.includes(field)) ?? [], copyGroupConfirmed: document.transcription.duplicateGroupConfirmed })) };
          const suffix = `${name}-${expansion}`; await Bun.write(join(exportsRoot, `${suffix}.patch.json`), `${JSON.stringify(patch, null, 2)}\n`); await Bun.write(join(exportsRoot, `${suffix}.report.json`), `${JSON.stringify(report, null, 2)}\n`); outputs.push({ expansion, patch: `tools/block-editor/exports/${suffix}.patch.json`, report: `tools/block-editor/exports/${suffix}.report.json` });
        }
        return json({ ok: true, outputs });
      }
      if (url.pathname === "/api/export" && request.method === "POST") {
        const payload = await body<{ name: string; document: EditorDocument }>(request); const name = safeName(payload.name); if (!name) return json({ error: "Export name must use lowercase letters, digits, and hyphens." }, 400);
        const errors = validateDocument(payload.document, assetRecords(), blockLayouts().layouts[0]); if (errors.length) return json({ errors }, 400);
        const isBlock = payload.document.resourceType === "block"; const expansion = isBlock ? payload.document.block.expansion : payload.document.actionCard.expansion; const filename = isBlock ? "blocks.json" : "action-cards.json"; const target = join(repoRoot, "spec", "data", expansion, filename); const base = existsSync(target) ? sha256(readFileSync(target)) : null;
        const patch = isBlock ? buildPatch(payload.document, base ?? "") : buildActionCardPatch(payload.document, base); const report = { format: "zaibatsu-editor-report/v2", generatedAt: new Date().toISOString(), documentId: payload.document.id, assetId: payload.document.source.assetId, knowledge: payload.document.knowledge ?? null, vision: visionFor(assetRecords().find((item) => item.assetId === payload.document.source.assetId)!), validation: { errors }, patchSha256: sha256(JSON.stringify(patch)) };
        await Bun.write(join(exportsRoot, `${name}.patch.json`), `${JSON.stringify(patch, null, 2)}\n`); await Bun.write(join(exportsRoot, `${name}.report.json`), `${JSON.stringify(report, null, 2)}\n`); return json({ ok: true, patch: `tools/block-editor/exports/${name}.patch.json`, report: `tools/block-editor/exports/${name}.report.json` });
      }
      if (url.pathname.startsWith("/api/artifact/")) { const assetId = decodeURIComponent(url.pathname.slice("/api/artifact/".length)); const asset = assetRecords().find((record) => record.assetId === assetId); const output = asset?.outputs?.png ? resolve(repoRoot, asset.outputs.png) : null; if (!asset || !output || !output.startsWith(repoRoot) || !existsSync(output)) return json({ error: "Local extracted image is unavailable. Run the artifact refresh first." }, 404); return new Response(Bun.file(output), { headers: { "Content-Type": contentType(output), "Cache-Control": "no-store" } }); }
      const requested = url.pathname === "/" ? "index.html" : url.pathname === "/action-cards" || url.pathname === "/action-cards/" ? "action-cards/index.html" : url.pathname === "/play" || url.pathname === "/play/" ? "play/index.html" : url.pathname.slice(1); const file = resolve(publicRoot, requested); if (!file.startsWith(publicRoot) || !existsSync(file)) return new Response("Not found", { status: 404 }); return new Response(Bun.file(file), { headers: { "Content-Type": contentType(file) } });
    } catch (error) { return json({ error: error instanceof Error ? error.message : "Unexpected editor error" }, 500); }
  },
});
console.log(`Zaibatsu Data Editor: http://localhost:${server.port}`);
