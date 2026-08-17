import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

export function toRepoPath(root: string, path: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

function anchorBase(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/\s+/g, "-");
}

export function markdownAnchors(text: string): Set<string> {
  const counts = new Map<string, number>();
  const anchors = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = anchorBase(match[2]!);
    if (!base) continue;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

export function markdownH1(text: string): string | undefined {
  return text.split(/\r?\n/).find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim();
}

export function isExternalLink(raw: string): boolean {
  return raw.startsWith("#") || /^(https?:|mailto:|data:)/.test(raw);
}

export function validateMarkdownLinks(root: string, files: string[]): string[] {
  const failures: string[] = [];
  const pattern = /\[[^\]]+\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(pattern)) {
      const raw = match[1]!;
      if (isExternalLink(raw)) continue;
      const [targetPart, anchor] = raw.split("#", 2);
      const target = targetPart || "";
      const resolved = target ? resolve(dirname(file), target) : file;
      if (!resolved.startsWith(resolve(root))) {
        failures.push(`${toRepoPath(root, file)} links outside repository: ${raw}`);
        continue;
      }
      if (!existsSync(resolved)) {
        failures.push(`${toRepoPath(root, file)} links to missing ${raw}`);
        continue;
      }
      if (anchor && resolved.endsWith(".md")) {
        const anchors = markdownAnchors(readFileSync(resolved, "utf8"));
        if (!anchors.has(anchor)) failures.push(`${toRepoPath(root, file)} links to missing anchor ${raw}`);
      }
    }
  }
  return failures;
}

export function markdownFiles(root: string, roots: string[]): string[] {
  return roots.flatMap((item) => {
    const path = join(root, item);
    if (!existsSync(path)) return [];
    return lstatSync(path).isDirectory() ? walk(path) : [path];
  }).filter((path) => path.endsWith(".md"));
}
