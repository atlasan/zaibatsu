# Game Data Catalog Foundation Plan

## Summary

Build a canonical, machine-readable knowledge layer that makes Zaibatsu's rules, datasets, assets, relations, tags, and docs easy to browse and reuse consistently, while keeping the current engine-facing `spec/data/` files lean. The implementation will add a new `spec/knowledge/` catalog with explicit taxonomy and relations, wire it into validation and documentation, and prove the workflow with an initial **Speedrunners** verified slice covering the first English page of **blocks** and **action cards**.

Primary outcomes:

- one place to answer "what is this record, where did it come from, what asset shows it, what docs mention it, what is it related to, and what is its status?";
- a consistent tag vocabulary and explicit relation model that tools and docs can share;
- a repeatable promotion path from source asset -> editor draft -> verified record -> catalog entry;
- a bounded first verified slice instead of leaving the new workflow purely theoretical.

## Current State Analysis

- `spec/inventory.json` is the verified product/mode inventory and rights register.
- `spec/provenance/*.json` tracks file-level candidate sources and record-level verification, but only inventory/mode facts are currently verified; most component records are still provisional.
- `spec/assets/manifest.json` already gives stable physical asset ids and supports `gameplayRef`, but verified gameplay linkage is mostly absent.
- `spec/data/speedrunners/*.json` contains engine-ready seed content; `shadowraiders` currently has mode metadata only.
- `DOCS/knowledge/` is human-readable but narrow: it indexes inventory and status vocabulary, not cross-entity relationships.
- `tools/validate-spec.ts` validates inventory, editor examples, source catalogs, and baseline data integrity, but not a unified knowledge catalog.
- `tools/block-editor/` and the action-card authoring surface already provide source-linked draft workflows that can feed a verification pipeline.

Current gap:

- knowledge is split across `DOCS/`, `spec/data/`, `spec/provenance/`, `spec/assets/manifest.json`, and editor/session concepts;
- there is no single, canonical relation graph or tag taxonomy;
- humans can browse inventory, but cannot yet browse content/status/source/asset/doc relations from one coherent entry point;
- the repo has the pieces for verification, but not a single durable contract tying them together.

## Proposed Changes

### 1. Add a canonical knowledge layer under `spec/knowledge/`

Create a machine-readable, repo-tracked layer distinct from runtime data:

- `spec/knowledge/README.md`
  - defines scope, source-of-truth boundaries, and the rule that `spec/knowledge/` is the canonical reusable catalog while `DOCS/knowledge/` is the human-oriented guide.
- `spec/schema/knowledge-taxonomy.schema.json`
  - schema for allowed tag namespaces and relation types.
- `spec/schema/knowledge-catalog.schema.json`
  - schema for catalog entries and their references.
- `spec/schema/knowledge-relations.schema.json`
  - schema for explicit cross-entity edges.
- `spec/knowledge/taxonomy.json`
  - canonical tag vocabulary, including at minimum:
    - `status:*` (`provisional`, `cataloged`, `verified`, `implemented`);
    - `game:*` (`speedrunners`, `shadowraiders`, `shared`);
    - `resource:*` (`product`, `mode`, `block`, `action-card`, `pawn`, `control-card`, `asset`, `source`, `doc`, `workflow-step`);
    - `workflow:*` (`editor-draft`, `review-session`, `canonical-data`, `source-evidence`);
    - `mechanic:*` tags needed by the pilot slice, starting with card activations and block-control concepts already present in current data/docs.
- `spec/knowledge/catalog.json`
  - one entry per cataloged entity with stable `kind`, `id`, `title`, `status`, `tags`, and references to:
    - data record path;
    - provenance record path;
    - asset ids;
    - source artifact ids;
    - relevant docs.
- `spec/knowledge/relations.json`
  - explicit edges such as:
    - `belongs-to-product`
    - `belongs-to-expansion`
    - `documented-by`
    - `evidenced-by-source`
    - `depicted-by-asset`
    - `verified-by-provenance`
    - `drafted-from-asset`
    - `implemented-by-data-record`
    - `cross-checks-with`

Decision: keep this layer additive instead of stuffing broad metadata into engine runtime records. Runtime loaders should stay focused on gameplay data; the knowledge layer is the reusable join across content, evidence, assets, docs, and workflow state.

### 2. Add a deterministic builder and stronger validation

Introduce a small Bun toolchain for consistency:

- `tools/build-knowledge.ts`
  - reads from:
    - `spec/inventory.json`
    - `spec/provenance/*.json`
    - `spec/assets/manifest.json`
    - `spec/data/**/*.json`
    - selected docs (`DOCS/rules/*.md`, `DOCS/domain-model.md`, `DOCS/knowledge/*.md`, `DOCS/artifacts/*.md`)
  - produces normalized `spec/knowledge/catalog.json` and `spec/knowledge/relations.json`;
  - emits deterministic ordering so diffs stay reviewable.
- `tools/validate-spec.ts`
  - extend it to validate:
    - the new knowledge schemas and files;
    - tag membership against `taxonomy.json`;
    - relation endpoint existence;
    - `gameplayRef` only for assets whose target record is truly verified;
    - doc/source/data paths referenced by catalog entries.

Decision: `catalog.json` and `relations.json` should be generated, not hand-curated, wherever facts already exist elsewhere. Hand-authored overlays are acceptable only for facts that are genuinely documentation-only and cannot be derived.

### 3. Refresh the human-facing knowledge docs around the new catalog

Update:

- `DOCS/knowledge/INDEX.md`
  - reframe it as the guide to the catalog system, not just inventory.
- `DOCS/knowledge/catalog.md`
  - summarize how to read the machine-readable catalog and status model.
- `DOCS/lifecycle.md`
  - insert the knowledge layer explicitly into the artifact chain, between canonical content/evidence and downstream docs/tooling.
- `DOCS/domain-model.md`
  - add a brief boundary section clarifying that engine entities live in `spec/data/`, while cross-cutting status/source/asset/doc relations live in `spec/knowledge/`.
- `DOCS/artifacts/README.md`
  - document how `gameplayRef` promotion now ties into verified catalog entries.
- `README.md`
  - add one short repository-shape note pointing contributors to `spec/knowledge/` and `DOCS/knowledge/`.

Optional if the edits read too dense in the existing pages:

- add `DOCS/knowledge/workflow.md` for the end-to-end promotion path from source asset to canonical record.

### 4. Land an initial verified slice for Speedrunners blocks and action cards

Use the new workflow to verify a bounded pilot slice rather than all content at once.

Scope:

- blocks: `sp-en-blocks-a4-p01-c01`, `sp-en-blocks-a4-p01-c02`, `sp-en-blocks-a4-p01-c03`
- action cards: `sp-en-action-cards-p01-c01` through `sp-en-action-cards-p01-c09`
- primary evidence: English 2017 assets from `DOCS/artifacts/source-catalog.json`
- cross-check evidence: matching Spanish 2017 artifacts where available

Files to update:

- `spec/data/speedrunners/blocks.json`
  - replace the corresponding provisional pilot records with directly transcribed canonical records;
  - keep runtime-facing fields engine-oriented;
  - add `assetRefs` where missing and preserve only source-reviewed facts.
- `spec/data/speedrunners/action-cards.json`
  - replace the pilot slice of representative seed records with transcribed card records;
  - keep concise reviewed `summary` text instead of dumping full printed layout text into runtime data;
  - use explicit `copies` and `assetRefs`.
- `spec/provenance/speedrunners.json`
  - add record-level `records` entries for each verified pilot block and card;
  - include English primary locator plus Spanish cross-check locator in the same change;
  - leave all non-pilot records provisional.
- `spec/assets/manifest.json`
  - add `gameplayRef` only for the verified pilot assets.

Decision: the first verified slice targets **Speedrunners only**, because it already has runtime files and existing provisional records to promote. Shadowraiders remains cataloged but non-transcribed in this pass.

### 5. Align the editor workflow with the new catalog contract

Update the editor-side data contract so the workflow is explicit and reusable:

- `spec/editor/data-editor-session.schema.json`
  - add optional hooks for knowledge tags and relation hints that remain session-only until review.
- `tools/block-editor/model.ts`
  - ensure exported patches/reports carry enough metadata to populate verified catalog refs without duplicating canonical state;
  - keep review-only transcription evidence out of runtime data.
- `tools/block-editor/README.md`
  - document the new review/promotion path for both blocks and action cards.

Decision: editor sessions remain ignored local working state; only reviewed changes to `spec/data/`, `spec/provenance/`, `spec/assets/manifest.json`, and generated `spec/knowledge/` outputs become canonical.

### 6. Keep the process visible in project docs and backlog

Update:

- `tasks/BACKLOG.md`
  - add a dedicated task for the knowledge catalog foundation;
  - add a child task for the Speedrunners pilot verification slice.
- `MEMORIES/INDEX.md` and a new memory entry only if a durable project rule emerges during implementation (for example, the final decision on generated-vs-hand-authored catalog ownership).

## Assumptions & Decisions

- The user wants a **catalog-first foundation**, not a full project-wide transcription sweep.
- The result must serve **humans first** while still being directly usable by tools and editors.
- Tags and relations should be **canonical data**, not free-form prose scattered through docs.
- The best repository home for that canonical layer is `spec/knowledge/`, because it is language-neutral and sits beside schema/data/provenance.
- `DOCS/knowledge/` should explain and summarize the catalog; it should not become a second competing source of truth.
- The first verification slice should be **small but real**. Using page 1 of Speedrunners blocks and action cards gives a natural, source-shaped pilot: 3 blocks and 9 cards.
- No Go/TS runtime behavior changes are planned unless the verified pilot records expose a schema gap already required by current loaders. If a new gameplay field becomes necessary, the change must follow the mirror-engine rule and update both impls plus `DOCS/parity.md`.

## Verification Steps

1. Run `bun tools/build-knowledge.ts` and confirm deterministic outputs with no orphan references.
2. Run `bun tools/validate-spec.ts` and extend it until it validates the new knowledge layer, pilot provenance, and `gameplayRef` usage.
3. Run `bun test` in `tools/block-editor/` to confirm the editor-side session/export contract still holds.
4. Spot-check the generated catalog:
   - every verified pilot block/card has matching provenance, asset refs, and doc/source links;
   - every pilot asset with `gameplayRef` points to a verified record;
   - provisional non-pilot records remain clearly marked.
5. Review `DOCS/knowledge/` and `README.md` manually to ensure the contributor path is understandable from the repo root.

## Execution Order

1. Add schemas and `spec/knowledge/README.md`.
2. Implement `tools/build-knowledge.ts`.
3. Extend `tools/validate-spec.ts`.
4. Update human-facing knowledge/lifecycle docs.
5. Transcribe and verify the Speedrunners pilot blocks and action cards.
6. Regenerate catalog outputs, validate, and update backlog/docs that describe the new workflow.
