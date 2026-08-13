# Unified Structured Data Implementation Plan

## Summary

Prepare the repository for a genuinely source-backed, unified, data-first implementation flow where:

- the original PDFs in `DOCS/Original/` remain the authoritative evidence;
- the full rulebook and component text becomes usable in tracked, cited transcript artifacts;
- `DOCS/rules/*.md` stays the concise implementer digest layer;
- `spec/data/**` becomes canonical gameplay data instead of seed fixtures;
- `spec/provenance/*.json`, `spec/assets/manifest.json`, and `spec/knowledge/*` stay in lockstep with that canonical data;
- both mirrors (`impl/go/` and `impl/ts/`) resume implementation only after the required verified data is in place.

This plan intentionally uses the repository's existing phase logic:

1. finish the source-to-data pipeline and canonical **Speedrunners** content first;
2. unblock the remaining data-gated engine work on both mirrors;
3. keep **Shadowraiders** fully documented, source-linked, and structurally ready, then expand it on top of the same workflow.

This plan expands the existing [game_data_catalog_foundation_plan.md](file:///d:/ZAIBATSU/.trae/documents/game_data_catalog_foundation_plan.md) instead of replacing it. The earlier plan established the knowledge-catalog layer; this one turns the whole repo into a complete source -> transcript -> rules -> schema -> data -> provenance -> knowledge -> engine pipeline.

## Current State Analysis

### What already exists

- `DOCS/artifacts/source-catalog.json` catalogs 55 ignored local artifacts and the local source files are present under `DOCS/Original/`.
- `DOCS/artifacts/toolset.md`, `tools/artifacts/`, `tools/hexvision/`, and `tools/block-editor/` already provide:
  - checksum-verified source handling,
  - deterministic block/action-card crop generation,
  - review-only vision/OCR assistance,
  - source-linked draft editing for blocks and action cards.
- `DOCS/rules/speedrunners.md` and `DOCS/rules/shadowraiders.md` already capture rule digests and key interpretations.
- `spec/inventory.json`, `spec/provenance/*.json`, `spec/assets/manifest.json`, and `spec/knowledge/*` already define the verification and traceability model.
- Both mirrors already load shared content and have the core slice implemented and tested.

### What is still missing

- There is **no tracked full transcript corpus** for the rulebooks or printable component sheets. The repo has digests and source catalogs, but not clean, reusable transcript artifacts.
- `spec/data/speedrunners/blocks.json`, `pawns.json`, and `action-cards.json` are explicitly **seed/provisional**; `spec/provenance/speedrunners.json` has no record-level entries yet.
- `spec/data/speedrunners/control-cards.json` does not exist yet, even though `spec/schema/control-card.schema.json` and both loaders already support it.
- `spec/data/shadowraiders/` currently contains only `modes.json` plus a README placeholder; component content is intentionally absent.
- `tools/validate-spec.ts` validates repo-level integrity, but there is not yet a complete "canonical data promotion gate" that enforces:
  - transcript presence,
  - source locators,
  - asset linkage,
  - record-level provenance,
  - knowledge-catalog consistency,
  - and removal of `provisional` only when all evidence is present.
- `DOCS/engine-resume-plan.md` shows the remaining Phase-1 engine work is blocked on real, verified content fields such as `boundarySpaces`, `neighbors`, `bonusCorners`, effect ids, and real ICE data.

### Practical conclusion

The repo is not blocked by missing architecture. It is blocked by missing **canonical source-backed content** and the final promotion workflow that turns extracted source material into verified structured data. The implementation should therefore start with documentation/transcription and data promotion, not with new engine behavior.

## Proposed Changes

### 1. Add a tracked transcript layer for rulebooks and component sheets

#### Goal

Make the source PDFs fully usable in-repo without committing the PDFs themselves or pretending raw OCR is canonical.

#### Files to add

- `DOCS/rules/transcripts/README.md`
- `DOCS/rules/transcripts/speedrunners-rulebook.en.md`
- `DOCS/rules/transcripts/speedrunners-rulebook.es.md`
- `DOCS/rules/transcripts/shadowraiders-rulebook.en.md`
- `DOCS/rules/transcripts/shadowraiders-rulebook.es.md`
- `DOCS/rules/transcripts/speedrunners-components.en.md`
- `DOCS/rules/transcripts/speedrunners-components.es.md`
- `DOCS/rules/transcripts/shadowraiders-components.en.md`
- `DOCS/rules/transcripts/shadowraiders-components.es.md`
- `tools/ruletext/README.md`
- `tools/ruletext/extract.py`
- `tools/ruletext/requirements.txt`

#### Files to update

- `DOCS/rules/speedrunners.md`
- `DOCS/rules/shadowraiders.md`
- `DOCS/lifecycle.md`
- `DOCS/artifacts/README.md`
- `DOCS/artifacts/toolset.md`
- `DOCS/INDEX.md`

#### What / why / how

- Add a small development-only extraction/normalization tool under `tools/ruletext/` that:
  - reads only cataloged local source PDFs from `DOCS/Original/`,
  - extracts page text via a local PDF text path first, with optional OCR fallback for image-only pages,
  - emits ignored raw extraction outputs under `tmp/`,
  - and produces reviewer-curated Markdown transcript files under `DOCS/rules/transcripts/`.
- Keep a strict split between:
  - raw/local extraction output in `tmp/` for diagnostics,
  - curated tracked transcripts in `DOCS/rules/transcripts/`,
  - concise implementer digests in `DOCS/rules/*.md`.
- Use transcript structure that is stable and citable:
  - one heading per source page,
  - explicit artifact id and page locator on each section,
  - notes for illegible or layout-driven text,
  - normalized tables/lists where the PDF extraction is lossy.
- Treat the English transcript as primary and the Spanish transcript as cross-check/reference, matching the existing provenance policy.
- Add component-sheet transcripts for blocks, control cards, action cards, and pawn sheets as grouped "components" documents rather than one tracked file per physical card/tile. Per-record verification still belongs in `spec/provenance/`, not in the transcript corpus.

#### Decision

Use a **hybrid** transcript model:

- tracked, curated transcript Markdown is committed;
- raw extractor/OCR output remains ignored and reproducible.

This best satisfies "fully extracted and usable and linked and clear" without polluting canonical runtime data with noisy source text.

### 2. Finish the canonical Speedrunners data set and remove seed status record by record

#### Goal

Replace provisional seed fixtures with verified, source-backed records that the mirrors can safely consume.

#### Files to add

- `spec/data/speedrunners/control-cards.json`

#### Files to update

- `spec/data/speedrunners/blocks.json`
- `spec/data/speedrunners/pawns.json`
- `spec/data/speedrunners/action-cards.json`
- `spec/data/speedrunners/mode.json`
- `spec/provenance/speedrunners.json`
- `spec/assets/manifest.json`
- `spec/knowledge/catalog.json`
- `spec/knowledge/relations.json`
- `DOCS/domain-model.md`
- `DOCS/parity.md`
- `tasks/BACKLOG.md`

#### Schema files to update only if the source review reveals missing canonical fields

- `spec/schema/block.schema.json`
- `spec/schema/pawn.schema.json`
- `spec/schema/action-card.schema.json`
- `spec/schema/control-card.schema.json`

#### What / why / how

- Transcribe **all 24 Speedrunners blocks** from the English block sheets, using the Spanish sheets as cross-checks:
  - replace placeholder names and geometry with reviewed canonical data,
  - populate `edges`, `boundarySpaces`, `bonusCorners`, `bonusFragments`, `spaces`, `neighbors`, `effects`, and `assetRefs`,
  - keep `provisional: true` only on any record whose source review is not complete.
- Transcribe **all 16 Speedrunners pawns** from control-card/pawn-sheet evidence:
  - canonical identity, classes, defense dice, movement, abilities, slots, ICE, starter flags, and asset refs.
- Transcribe **all 54 Speedrunners action cards**:
  - one canonical record per unique card face,
  - correct `copies`,
  - concise gameplay `summary`,
  - movement / activation / attach metadata,
  - asset refs linked only after review.
- Add **all 18 Speedrunners control cards** in `spec/data/speedrunners/control-cards.json`:
  - define whether each card controls a pawn or block,
  - mark starter control cards explicitly.
- Update `spec/data/speedrunners/mode.json` to remove known provisional setup ambiguity where the English rulebook has already been re-read and clarified in `DOCS/rules/speedrunners.md`.
- Add record-level provenance entries in `spec/provenance/speedrunners.json` for every promoted record:
  - English primary locator required,
  - Spanish cross-check locator required,
  - no record loses `provisional` until both are present.
- Add `gameplayRef` in `spec/assets/manifest.json` only once the corresponding `spec/provenance/` record is verified.
- Regenerate the knowledge catalog so every promoted record has consistent status, source refs, asset refs, and doc links.

#### Execution method inside this phase

- Use the existing block editor and action-card editor as the default review surfaces for blocks and action cards.
- Transcribe pawns and control cards directly in JSON first; if that proves repetitive, add a lightweight follow-up editor workflow only after the canonical JSON shape is stable.
- Land records in small, reviewable batches:
  1. blocks,
  2. pawns + control cards,
  3. action cards,
  4. mode cleanup and remaining provenance/catalog alignment.

#### Decision

Speedrunners is the first full canonical promotion target. Shadowraiders remains documented and structurally ready during this wave, but the repo should not try to complete both games' component transcription at the same time.

### 3. Make promotion to canonical data fail loudly when evidence or links are incomplete

#### Goal

Turn the repo's current conventions into an enforceable validation gate.

#### Files to update

- `tools/validate-spec.ts`
- `tools/build-knowledge.ts`
- `spec/knowledge/README.md`
- `DOCS/knowledge/INDEX.md`
- `DOCS/knowledge/catalog.md`
- `DOCS/artifacts/traceability.md`

#### What / why / how

- Extend `tools/validate-spec.ts` so it rejects promoted records when:
  - a non-provisional record lacks a provenance record,
  - a verified provenance record lacks both English primary and Spanish cross-check locators,
  - an `assetRef` has no matching asset manifest entry,
  - a manifest `gameplayRef` points to a still-provisional record,
  - a knowledge-catalog entry status does not match the underlying data/provenance state,
  - a transcript/doc reference used by the catalog does not exist.
- Extend `tools/build-knowledge.ts` so transcript/doc links are first-class references in generated knowledge entries.
- Keep JSON Schema validation centralized in the repo validation/build step rather than embedding full JSON-Schema runtimes into both mirrors. This matches the current "shared spec + mirrored loaders" architecture without introducing unnecessary runtime coupling.
- Update the knowledge docs and traceability docs so contributors can see the exact promotion boundary.

#### Decision

The authoritative promotion gate will live in the repository toolchain:

- `bun tools/build-knowledge.ts`
- `bun tools/validate-spec.ts`
- `bun tools/verify-artifacts.ts --require-originals`
- `python -m tools.artifacts verify`

The loaders keep their mirror-friendly structural checks, but the repo validator is what decides whether data is canonical.

### 4. Resume the data-gated mirror-engine work after verified Speedrunners data lands

#### Goal

Use the newly verified data to complete the remaining Phase-1 behavior on both mirrors.

#### Files to update

- `impl/go/internal/domain/domain.go`
- `impl/go/internal/domain/pawn_board.go`
- `impl/go/internal/engine/movement.go`
- `impl/go/internal/engine/cards.go`
- `impl/go/internal/engine/attach.go`
- `impl/go/internal/engine/placement.go`
- `impl/go/internal/engine/icebreaker.go`
- `impl/go/internal/engine/movement_test.go`
- `impl/go/internal/engine/cards_test.go`
- `impl/go/internal/engine/attach_test.go`
- `impl/go/internal/engine/placement_test.go`
- `impl/go/internal/engine/icebreaker_test.go`
- `impl/go/internal/engine/golden_test.go`
- `impl/ts/src/domain/types.ts`
- `impl/ts/src/domain/pawn_board.ts`
- `impl/ts/src/engine/movement.ts`
- `impl/ts/src/engine/cards.ts`
- `impl/ts/src/engine/attach.ts`
- `impl/ts/src/engine/placement.ts`
- `impl/ts/src/engine/icebreaker.ts`
- `impl/ts/test/movement.test.ts`
- `impl/ts/test/cards.test.ts`
- `impl/ts/test/attach.test.ts`
- `impl/ts/test/golden.test.ts`
- `DOCS/parity.md`
- `DOCS/domain-model.md`
- `tasks/BACKLOG.md`
- `golden/*.snap`

#### What / why / how

Implement the data-gated items already defined in `DOCS/engine-resume-plan.md`, in this exact order:

1. **Space-to-space movement**
   - build the executable space graph from `boundarySpaces` and `neighbors`;
   - support `steps`, `d6`, and `2d6` traversal with pass-through vs end-on capacity rules;
   - then expose card-activated movement through the unified action interface.
2. **Attached effects in resolution**
   - use canonical action-card metadata to implement defense replacement, ICE nullification, granted classes/abilities/movement, and hand-size modifiers.
3. **Bonus fragments -> bonus icons -> bonus counters**
   - detect completed three-block corner icons using real `bonusCorners`;
   - award and collect counters from actual block-control state.
4. **Real ICE data**
   - replace the provisional ICE-face derivation with source-backed values if the transcription reveals exact per-record ICE faces; otherwise keep the current category-based model and document the remaining gap explicitly.

Keep every behavior change mirrored in Go and TypeScript with equivalent tests and a parity update in the same execution wave.

#### Decision

No new Shadowraiders engine behavior should start until the Speedrunners data-driven Phase-1 items are green on both mirrors.

### 5. Leave Shadowraiders ready for the next wave instead of partially implemented

#### Goal

End this implementation wave with Shadowraiders documented, transcript-backed, and schema-ready, but not half-implemented.

#### Files to update

- `DOCS/rules/shadowraiders.md`
- `DOCS/rules/transcripts/shadowraiders-*.md`
- `spec/data/shadowraiders/README.md`
- `spec/provenance/shadowraiders.json`
- `spec/schema/threat.schema.json`
- `spec/schema/mission-card.schema.json`
- `DOCS/roadmap.md`
- `tasks/BACKLOG.md`

#### Files to add

- `spec/data/shadowraiders/threats.json`
- `spec/data/shadowraiders/missions.json`
- `spec/data/shadowraiders/control-cards.json`

#### What / why / how

- Add empty-but-canonical file shells for the major Shadowraiders record types that the loaders already understand or that the next phase requires.
- Keep these files explicit and honest:
  - empty arrays where no verified records have been transcribed yet,
  - README/provenance/docs explaining that the structure is ready but content remains pending.
- Extend threat and mission schemas only to the point needed to encode fully sourced expansion data in the next wave; do not implement expansion behavior in this pass.

#### Decision

This wave ends with **unified structure** across both games, but only **Speedrunners** is expected to be fully canonical and executable.

## Assumptions & Decisions

- The implementation should optimize for a final, durable source-to-engine workflow, not a quick patch over provisional data.
- Because no additional user preference was available during planning, this plan assumes:
  - **Speedrunners first** for full canonical completion,
  - **tracked curated transcripts + ignored raw extracts** for PDF text usability,
  - **exact source-first promotion** before records lose `provisional`.
- The repo's current architecture stays intact:
  - source evidence in `DOCS/artifacts/` and `DOCS/Original/`,
  - human rule digests in `DOCS/rules/`,
  - canonical gameplay data in `spec/data/`,
  - verification facts in `spec/provenance/`,
  - physical asset identity in `spec/assets/manifest.json`,
  - cross-cutting browseability in `spec/knowledge/`,
  - behavior in both mirrors.
- Raw OCR or PDF extraction text is never treated as canonical gameplay data.
- JSON Schema enforcement belongs in the repo validation layer, not by adding heavyweight schema runtimes to the mirrored engine loaders.

## Verification Steps

### Source and transcript verification

1. Run `bun tools/verify-artifacts.ts --require-originals`.
2. Run the new transcript extraction workflow against the four rulebooks and the required component sheets.
3. Manually review the tracked transcript Markdown against the authoritative PDFs for page order, headings, and corrected lossy tables.

### Canonical data verification

1. Run `.\tools\refresh-artifacts.ps1` to ensure the current crop manifest is up to date.
2. Use the block editor and action-card editor to review/export canonical changes where applicable.
3. Run `python -m tools.artifacts verify`.
4. Run `bun tools/build-knowledge.ts`.
5. Run `bun tools/validate-spec.ts`.
6. Confirm that:
   - promoted Speedrunners records are no longer provisional,
   - every promoted record has record-level provenance,
   - every promoted `assetRef` resolves cleanly,
   - every `gameplayRef` targets a verified record,
   - knowledge-catalog status matches the underlying files.

### Mirror verification

1. Run `go test ./...` from `impl/go`.
2. Run `bun test` from `impl/ts`.
3. Run `bun run typecheck` from `impl/ts`.
4. Confirm `golden/*.snap` still matches on both mirrors after the data-driven behavior work.
5. Review `DOCS/parity.md` and `DOCS/domain-model.md` after each behavior wave so the documentation matches the actual mirrored implementation.

## Recommended Execution Order

1. Add transcript tooling and tracked transcript docs.
2. Tighten validation/build rules around canonical promotion.
3. Complete verified Speedrunners block transcription.
4. Complete verified Speedrunners pawn + control-card transcription.
5. Complete verified Speedrunners action-card transcription.
6. Regenerate provenance/knowledge/asset links and clear remaining Speedrunners provisional status.
7. Resume the data-gated Speedrunners engine work on both mirrors.
8. Add the Shadowraiders structural files/schemas/transcripts needed for the next expansion wave.
