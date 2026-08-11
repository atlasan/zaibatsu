import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { buildPatch, sessionFromDocuments, sha256, validateDocument, type AssetRecord, type BlockDocument, type EditorSession } from "./model";

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
const assetRecords = () => manifest().assets.filter((asset) => asset.kind === "block");

function sessionPath(name: string) { return join(sessionsRoot, `${name}.editor.json`); }
function sessionNames() { return readdirSync(sessionsRoot).filter((name) => name.endsWith(".editor.json")).map((name) => basename(name, ".editor.json")); }
function contentType(path: string) {
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".webp": "image/webp" } as Record<string, string>)[extname(path)] ?? "application/octet-stream";
}

async function body<T>(request: Request): Promise<T> { return await request.json() as T; }

const server = Bun.serve({
  port: Number(process.env.BLOCK_EDITOR_PORT ?? 4173),
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/assets") return json({ assets: assetRecords() });
      if (url.pathname === "/api/sessions" && request.method === "GET") return json({ sessions: sessionNames() });
      if (url.pathname.startsWith("/api/sessions/") && request.method === "GET") {
        const name = safeName(url.pathname.split("/").at(-1));
        if (!name || !existsSync(sessionPath(name))) return json({ error: "Session not found." }, 404);
        return json(readJson<EditorSession>(sessionPath(name)));
      }
      if (url.pathname === "/api/sessions" && request.method === "POST") {
        const payload = await body<{ name: string; session: EditorSession }>(request);
        const name = safeName(payload.name);
        if (!name) return json({ error: "Session name must use lowercase letters, digits, and hyphens." }, 400);
        await Bun.write(sessionPath(name), `${JSON.stringify(payload.session, null, 2)}\n`);
        return json({ ok: true, path: `tools/block-editor/.sessions/${name}.editor.json` });
      }
      if (url.pathname === "/api/validate" && request.method === "POST") {
        const payload = await body<{ document: BlockDocument }>(request);
        return json({ errors: validateDocument(payload.document, assetRecords()) });
      }
      if (url.pathname === "/api/export" && request.method === "POST") {
        const payload = await body<{ name: string; document: BlockDocument }>(request);
        const name = safeName(payload.name);
        if (!name) return json({ error: "Export name must use lowercase letters, digits, and hyphens." }, 400);
        const errors = validateDocument(payload.document, assetRecords());
        if (errors.length) return json({ errors }, 400);
        const target = join(repoRoot, "spec/data", payload.document.block.expansion, "blocks.json");
        const patch = buildPatch(payload.document, sha256(readFileSync(target)));
        const report = { format: "zaibatsu-editor-report/v1", generatedAt: new Date().toISOString(), documentId: payload.document.id, assetId: payload.document.source.assetId, validation: { errors }, patchSha256: sha256(JSON.stringify(patch)) };
        await Bun.write(join(exportsRoot, `${name}.patch.json`), `${JSON.stringify(patch, null, 2)}\n`);
        await Bun.write(join(exportsRoot, `${name}.report.json`), `${JSON.stringify(report, null, 2)}\n`);
        return json({ ok: true, patch: `tools/block-editor/exports/${name}.patch.json`, report: `tools/block-editor/exports/${name}.report.json` });
      }
      if (url.pathname.startsWith("/api/artifact/")) {
        const assetId = decodeURIComponent(url.pathname.slice("/api/artifact/".length));
        const asset = assetRecords().find((record) => record.assetId === assetId);
        const output = asset?.outputs?.png ? resolve(repoRoot, asset.outputs.png) : null;
        if (!asset || !output || !output.startsWith(repoRoot) || !existsSync(output)) return json({ error: "Local extracted image is unavailable. Run the artifact refresh first." }, 404);
        return new Response(Bun.file(output), { headers: { "Content-Type": contentType(output), "Cache-Control": "no-store" } });
      }
      const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = resolve(publicRoot, requested);
      if (!file.startsWith(publicRoot) || !existsSync(file)) return new Response("Not found", { status: 404 });
      return new Response(Bun.file(file), { headers: { "Content-Type": contentType(file) } });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unexpected editor error" }, 500);
    }
  },
});

console.log(`Zaibatsu Block Editor: http://localhost:${server.port}`);