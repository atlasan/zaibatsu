import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { validateDocs } from "./validate-docs.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root: string, path: string, text: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, text);
}

function rule(id = "SR-SETUP-001", source: string | null = "sp-en-rulebook"): string {
  const sourceLine = source ? `- **Source:** \`${source}\` — p. 1, “Fixture”.\n` : "";
  return `# Fixture rule module\n\n## ${id} — Fixture rule\n\n${sourceLine}- **Applies to:** Speedrunners.\n- **Maturity:** planned.\n- **Rule:** The fixture rule is normative.\n`;
}

function fixture(options: { extraModule?: string; badAnchor?: boolean; unregistered?: boolean; source?: string; missingSource?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "zaibatsu-docs-"));
  roots.push(root);
  const documents = [
    { id: "speed-landing", path: "DOCS/rules/speedrunners.md", title: "Speedrunners landing", class: "ruleset" },
    { id: "shadow-landing", path: "DOCS/rules/shadowraiders.md", title: "Shadowraiders landing", class: "ruleset" },
    { id: "speed-module", path: "DOCS/rules/speedrunners/setup.md", title: "Fixture rule module", class: "rule-module" },
  ];
  if (options.extraModule) documents.push({ id: "speed-module-two", path: "DOCS/rules/speedrunners/extra.md", title: "Fixture extra module", class: "rule-module" });
  write(root, "DOCS/registry.json", JSON.stringify({
    registryVersion: 1,
    exemptPrefixes: ["DOCS/adr/", "DOCS/rules/transcripts/"],
    documents: documents.map((document) => ({ ...document, canonical: true, owner: "rules", authority: "derived", relatedArtifacts: [] })),
  }));
  write(root, "DOCS/artifacts/source-catalog.json", JSON.stringify({ assets: [{ id: "sp-en-rulebook" }] }));
  write(root, "DOCS/rules/speedrunners.md", `# Speedrunners landing\n\n[Setup](speedrunners/setup.md)${options.extraModule ? "\n[Extra](speedrunners/extra.md)" : ""}${options.badAnchor ? "\n[Broken](speedrunners/setup.md#missing)" : ""}\n`);
  write(root, "DOCS/rules/shadowraiders.md", "# Shadowraiders landing\n");
  write(root, "DOCS/rules/speedrunners/setup.md", rule("SR-SETUP-001", options.missingSource ? null : options.source));
  if (options.extraModule) write(root, "DOCS/rules/speedrunners/extra.md", rule(options.extraModule));
  if (options.unregistered) write(root, "DOCS/unregistered.md", "# Unregistered\n");
  return root;
}

describe("validateDocs", () => {
  test("accepts a registered sourced ruleset", () => {
    expect(validateDocs(fixture())).toEqual([]);
  });

  test("rejects duplicate rule IDs", () => {
    expect(validateDocs(fixture({ extraModule: "SR-SETUP-001" }))).toContain("duplicate rule id SR-SETUP-001");
  });

  test("rejects a missing source locator target", () => {
    expect(validateDocs(fixture({ source: "missing-source" }))).toContain("DOCS/rules/speedrunners/setup.md rule SR-SETUP-001 references unknown source missing-source");
  });

  test("rejects a missing source locator", () => {
    expect(validateDocs(fixture({ missingSource: true }))).toContain("DOCS/rules/speedrunners/setup.md rule SR-SETUP-001 needs a source id and locator");
  });

  test("rejects broken local anchors", () => {
    expect(validateDocs(fixture({ badAnchor: true }))).toContain("DOCS/rules/speedrunners.md links to missing anchor speedrunners/setup.md#missing");
  });

  test("rejects an unregistered authored document", () => {
    expect(validateDocs(fixture({ unregistered: true }))).toContain("governed document is not registered: DOCS/unregistered.md");
  });
});
