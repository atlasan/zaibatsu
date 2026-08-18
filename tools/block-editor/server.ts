import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { buildActionCardPatch, buildPatch, migrateSession, sha256, validateDocument, type AssetRecord, type BlockLayout, type EditorDocument, type EditorSession } from "./model";
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
function layoutForAsset(assetId: string) {
  const layout = blockLayouts().layouts.find((item) => item.id === "standard-seven-zone-2-3-2-pointy");
  if (!layout) throw new Error("Canonical seven-zone block layout is missing.");
  const override = blockLayoutOverrides().overrides.find((item) => item.assetId === assetId);
  if (!override) return { layout, override: null, vision: visionFor(assetRecords().find((asset) => asset.assetId === assetId)!) };
  const transform = override.transform;
  return { layout: { ...layout, outerHex: { vertices: layout.outerHex.vertices.map((point) => transformPoint(point, transform)) }, corners: layout.corners.map((point) => transformPoint(point, transform)), edges: layout.edges.map((point) => transformPoint(point, transform)), zoneShape: { width: layout.zoneShape.width * transform.scale, height: layout.zoneShape.height * transform.scale }, zones: layout.zones.map((zone) => ({ ...zone, ...transformPoint(zone, transform) })) }, override, vision: visionFor(assetRecords().find((asset) => asset.assetId === assetId)!) };
}
function sessionPath(name: string) { return join(sessionsRoot, `${name}.editor.json`); }
function sessionNames() { return readdirSync(sessionsRoot).filter((name) => name.endsWith(".editor.json")).map((name) => basename(name, ".editor.json")); }
function contentType(path: string) { return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp" } as Record<string, string>)[extname(path)] ?? "application/octet-stream"; }
async function body<T>(request: Request): Promise<T> { return await request.json() as T; }
function visionFor(asset: AssetRecord) { const candidates = [join(repoRoot, "tmp", "artifacts", "build", asset.artifactId, "hexvision", `${asset.artifactId}.vision.json`), join(repoRoot, "tools", "hexvision", "out", `${asset.artifactId}.vision.json`)]; const file = candidates.find(existsSync); if (!file) return null; const document = readJson<{ tiles?: Array<{ asset: string }> }>(file); return document.tiles?.find((tile) => tile.asset === asset.assetId) ?? null; }

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
      if (url.pathname === "/api/block-layouts") return json(blockLayouts());
      if (url.pathname.startsWith("/api/block-layout/")) return json(layoutForAsset(decodeURIComponent(url.pathname.slice("/api/block-layout/".length))));
      if (url.pathname === "/api/block-layout-overrides" && request.method === "POST") { const payload = await body<{ override: GeometryOverride }>(request); const override = payload.override; if (!safeName(override?.assetId) || override.layoutId !== "standard-seven-zone-2-3-2-pointy" || !override.note?.trim() || !Number.isFinite(override.transform?.offsetX) || !Number.isFinite(override.transform?.offsetY) || !Number.isFinite(override.transform?.scale) || override.transform.scale <= 0.25 || override.transform.scale > 2) return json({ error: "Override needs a known asset, a review note, and a safe transform." }, 400); const file = blockLayoutOverrides(); const overrides = file.overrides.filter((item) => item.assetId !== override.assetId); overrides.push(override); await Bun.write(overrideFile, `${JSON.stringify({ ...file, overrides }, null, 2)}\n`); return json({ ok: true, override }); }
      if (url.pathname.startsWith("/api/vision/")) { const asset = assetRecords().find((item) => item.assetId === decodeURIComponent(url.pathname.slice(12))); return json({ vision: asset ? visionFor(asset) : null }); }
      if (url.pathname === "/api/sessions" && request.method === "GET") return json({ sessions: sessionNames() });
      if (url.pathname.startsWith("/api/sessions/") && request.method === "GET") { const name = safeName(url.pathname.split("/").at(-1)); if (!name || !existsSync(sessionPath(name))) return json({ error: "Session not found." }, 404); return json(migrateSession(readJson<EditorSession>(sessionPath(name)), blockLayouts().layouts[0])); }
      if (url.pathname === "/api/sessions" && request.method === "POST") { const payload = await body<{ name: string; session: EditorSession }>(request); const name = safeName(payload.name); if (!name) return json({ error: "Session name must use lowercase letters, digits, and hyphens." }, 400); await Bun.write(sessionPath(name), `${JSON.stringify(migrateSession(payload.session, blockLayouts().layouts[0]), null, 2)}\n`); return json({ ok: true, path: `tools/block-editor/.sessions/${name}.editor.json` }); }
      if (url.pathname === "/api/validate" && request.method === "POST") { const payload = await body<{ document: EditorDocument }>(request); return json({ errors: validateDocument(payload.document, assetRecords(), blockLayouts().layouts[0]) }); }
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
