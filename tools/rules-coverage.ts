import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

type Evidence = { path: string; contains: string };
type Claim = {
  id: string;
  runtime: "implemented" | "partial" | "planned";
  sources?: Array<{ artifactId: string; locator: string }>;
  records?: string[];
  mechanics: string[];
  tests: { go: Evidence[]; ts: Evidence[] };
  sandbox: "supported" | "partial" | "planned" | "informational";
  gaps: string[];
};
export type RuleCoverage = {
  id: string; title: string; game: string; kind: string;
  source: string; locator: string; sourceStatus: "verified" | "visual-reviewed" | "documented";
  runtime: Claim["runtime"]; mechanics: string[]; records: string[];
  tests: Claim["tests"]; sandbox: Claim["sandbox"]; gaps: string[];
};
const root = resolve(import.meta.dir, "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

/** Source review and tested runtime coverage remain independent evidence axes. */
export function buildRulesCoverage(): { coverageVersion: 1; entries: RuleCoverage[] } {
  const claims: Claim[] = read("spec/knowledge/implementation.json").entries;
  const claimed = new Map(claims.map(claim => [claim.id, claim]));
  if (claimed.size !== claims.length) throw new Error("duplicate implementation claim");
  const sources = new Set(read("DOCS/artifacts/source-catalog.json").assets.map((a: any) => a.id));
  const entries: RuleCoverage[] = [];
  const append = (item: Omit<RuleCoverage, "runtime" | "mechanics" | "records" | "tests" | "sandbox" | "gaps">) => {
    const claim = claimed.get(item.id);
    if (claim) {
      for (const source of claim.sources ?? []) {
        if (!sources.has(source.artifactId) || !source.locator.trim()) throw new Error(`${item.id}: invalid source evidence`);
      }
      const bilingual = (claim.sources ?? []).some(s => s.artifactId.includes("-en-")) && (claim.sources ?? []).some(s => s.artifactId.includes("-es-"));
      if (bilingual) item.sourceStatus = "verified";
      if (claim.runtime === "implemented" && (!bilingual || claim.gaps.length || !claim.tests.go.length || !claim.tests.ts.length)) throw new Error(`${item.id}: implemented requires bilingual sources, both test suites and no gaps`);
      for (const evidence of [...claim.tests.go, ...claim.tests.ts]) {
        if (!existsSync(join(root, evidence.path)) || !readFileSync(join(root, evidence.path), "utf8").includes(evidence.contains)) throw new Error(`${item.id}: missing test evidence ${evidence.path}: ${evidence.contains}`);
      }
    }
    entries.push({ ...item, runtime: claim?.runtime ?? "planned", mechanics: claim?.mechanics ?? [], records: claim?.records ?? [], tests: claim?.tests ?? { go: [], ts: [] }, sandbox: claim?.sandbox ?? "planned", gaps: claim?.gaps ?? ["Source-to-runtime acceptance not yet completed."] });
  };
  for (const record of read("spec/review/asset-review.json").records) {
    append({ id: `asset/${record.assetId}`, title: record.name, game: record.game, kind: record.kind, source: record.source.artifactId, locator: record.source.locator, sourceStatus: "visual-reviewed" });
  }
  for (const doc of read("DOCS/registry.json").documents.filter((d: any) => d.class === "rule-module")) {
    const content = readFileSync(join(root, doc.path), "utf8");
    for (const match of content.matchAll(/^## ((?:SR|SH)-[A-Z]+-\d+) — ([^\r\n]+)([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
      const source = match[3]!.match(/\*\*Source:\*\* `([^`]+)` — ([^\r\n]+)/);
      append({ id: `rule/${match[1]}`, title: match[2]!, game: match[1]!.startsWith("SR-") ? "speedrunners" : "shadowraiders", kind: "rule", source: source?.[1] ?? "", locator: source?.[2] ?? "", sourceStatus: "documented" });
    }
  }
  for (const mode of read("spec/inventory.json").modes) {
    append({ id: `mode/${mode.id}`, title: mode.name, game: mode.id === "speedrunners" ? "speedrunners" : "shadowraiders", kind: "mode", source: mode.evidence.artifactId, locator: mode.evidence.locator, sourceStatus: "documented" });
  }
  const known = new Set(entries.map(entry => entry.id));
  for (const claim of claims) if (!known.has(claim.id)) throw new Error(`unknown implementation claim ${claim.id}`);
  return { coverageVersion: 1, entries };
}

if (import.meta.main) {
  const path = join(root, "spec/knowledge/coverage.json");
  const content = `${JSON.stringify(buildRulesCoverage(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) throw new Error("Rules coverage is stale; run bun tools/rules-coverage.ts");
  } else writeFileSync(path, content);
  const coverage = JSON.parse(content);
  console.log(`rules coverage: ${coverage.entries.length} items; ${coverage.entries.filter((e: RuleCoverage) => e.runtime === "implemented").length} source-verified and implemented`);
}
