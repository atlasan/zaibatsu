# Full Rulebook Compatibility Plan

## Summary

Deliver end-to-end full-stack compatibility for the two authoritative English
rulebooks, using the tracked transcripts and page-image artifacts as the source
audit layer, then closing the remaining gaps across shared spec data, both
mirror engines, derived rules docs, parity/backlog tracking, and the local
tooling surface.

The delivery order should be **parallel by topic across both rulebooks**, not
base-game first and expansion later. Each workstream below closes a shared
rules topic across Speedrunners and Shadowraiders where applicable, while still
respecting the repo’s mirror-engine and source-governance rules.

## Current State Analysis

### Source and transcript layer

- The authoritative English transcripts exist for both rulebooks:
  - `DOCS/rules/transcripts/speedrunners-rulebook.en.md`
  - `DOCS/rules/transcripts/shadowraiders-rulebook.en.md`
- The transcript pipeline already regenerates page PNGs and embeds real per-page
  image links:
  - `tools/ruletext/extract.py`
  - `tools/ruletext/review_notes.json`
  - `DOCS/rules/transcripts/review-findings.md`
- Several reviewed pages are already known to have extraction-order issues
  rather than missing source evidence, especially:
  - `sp-en-rulebook` p.29
  - `sh-en-rulebook` pp.9, 10, 11, 12, 16

### Rules and documentation layer

- Stable digest entrypoints already exist:
  - `DOCS/rules/speedrunners.md`
  - `DOCS/rules/shadowraiders.md`
- Speedrunners rule modules are mixed `implemented` / `partial` / `planned`:
  - `DOCS/rules/speedrunners/setup-and-victory.md`
  - `DOCS/rules/speedrunners/turns-and-actions.md`
  - `DOCS/rules/speedrunners/board-and-movement.md`
  - `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`
- Shadowraiders rule modules are still mostly `planned`:
  - `DOCS/rules/shadowraiders/setup-and-components.md`
  - `DOCS/rules/shadowraiders/pawns-threats-and-combat.md`
  - `DOCS/rules/shadowraiders/missions-modes-and-symbology.md`
- `DOCS/domain-model.md`, `DOCS/parity.md`, and `tasks/BACKLOG.md` already
  describe the current executable slice and the main missing areas.

### Shared spec/data layer

- Executable Speedrunners content exists under:
  - `spec/data/speedrunners/blocks.json`
  - `spec/data/speedrunners/pawns.json`
  - `spec/data/speedrunners/action-cards.json`
  - `spec/data/speedrunners/mode.json`
- Shadowraiders already has structural shells, but not full source-complete
  content:
  - `spec/data/shadowraiders/control-cards.json`
  - `spec/data/shadowraiders/missions.json`
  - `spec/data/shadowraiders/modes.json`
  - `spec/data/shadowraiders/threats.json`
  - `spec/data/shadowraiders/README.md`
- Schema support exists for the missing expansion data families:
  - `spec/schema/control-card.schema.json`
  - `spec/schema/mission-card.schema.json`
  - `spec/schema/threat.schema.json`
  - `spec/schema/mode.schema.json`
- Provenance anchors already exist and should remain the source-verification
  layer:
  - `spec/provenance/speedrunners.json`
  - `spec/provenance/shadowraiders.json`

### Engine/runtime layer

- Both mirrors already share a stable reducer/phase entrypoint:
  - `impl/ts/src/engine/index.ts`
  - `impl/go/internal/engine/engine.go`
- Current executable coverage is a strong Speedrunners slice:
  setup, turn flow, movement, combat, icebreaker, search, reboot, and attachment
  basics.
- Known remaining Speedrunners runtime gaps from parity/domain/backlog:
  - exact ICE faces from source-transcribed content
  - bonus fragments → bonus icons → bonus counters
  - full effect registry for block/pawn/card effects
  - armor defense replacement / ICE nullification
  - attachment-granted movement execution
  - attachment ability-use execution
  - concentrated multi-target delete / area attacks
- Shadowraiders runtime is not yet implemented despite schema/docs shells:
  threats, stealth movement, missions, medals, mercenary control cost, Chaos,
  Outbreak, Total War, and alternate rule sets.

### Tooling/workbench layer

- `/play/` is intentionally a local Speedrunners-only engineering surface today:
  - `DOCS/web-sandbox-plan.md`
  - `tools/block-editor/play.ts`
  - `tools/block-editor/public/play/app.js`
- The workbench already exposes a coverage map and deterministic traces, but it
  explicitly does **not** claim Shadowraiders or full source-complete gameplay.

## Proposed Changes

## 1. Build a rulebook-to-runtime coverage matrix

### Why

The current repo has coverage status scattered across transcripts, rule modules,
parity notes, backlog items, and the `/play/` coverage surface. Full
compatibility needs one canonical matrix that maps each rulebook topic to:

- transcript/source evidence
- structured rules module owner
- spec/data owner
- Go runtime status
- TS runtime status
- tooling/workbench exposure

### Files

- `DOCS/rules/speedrunners.md`
- `DOCS/rules/shadowraiders.md`
- `DOCS/parity.md`
- `tasks/BACKLOG.md`
- new coverage doc under `DOCS/` such as
  `DOCS/rulebook-compatibility-matrix.md`

### How

- Enumerate all major rulebook topics from both transcripts.
- Normalize them into shared workstreams: setup, board growth, movement, combat,
  control/ICE, attachments, rewards/currency, threats, stealth, missions,
  modes/AI, symbology.
- Record for each topic whether the repo currently has:
  source transcript confidence, structured rule docs, schema/data support,
  Go support, TS support, tests, and workbench/operator exposure.
- Use this matrix as the planning and execution source of truth instead of
  relying on a loose backlog paragraph.

## 2. Finish transcript consolidation where extraction order still hides rules

### Why

Some pages are already readable enough to support implementation, but several
reviewed pages still flatten diagrams or reorder steps in ways that will cause
bad data or bad mechanics if used directly.

### Files

- `tools/ruletext/extract.py`
- `tools/ruletext/review_notes.json`
- `DOCS/rules/transcripts/review-findings.md`
- `DOCS/rules/transcripts/speedrunners-rulebook.en.md`
- `DOCS/rules/transcripts/shadowraiders-rulebook.en.md`

### How

- Convert existing reviewed findings into per-page consolidation tasks.
- Add transcript-side handling for pages that need composed text + image-aware
  notes, not just raw OCR order.
- Revise the known noisy pages first, then complete a full pass over both
  English rulebooks so every page is either:
  - clean enough to implement from directly, or
  - explicitly marked as image-authoritative with saved findings.
- Keep per-page image links as the concrete anchor; avoid generic transcript
  notes that do not identify the real source artifact.

## 3. Close the Speedrunners source-content gaps

### Why

Full compatibility cannot rely on provisional or partial base-game content.
Several runtime gaps are blocked not by engine architecture but by incomplete
source transcription.

### Files

- `spec/data/speedrunners/blocks.json`
- `spec/data/speedrunners/pawns.json`
- `spec/data/speedrunners/action-cards.json`
- add missing source-complete files if absent:
  - `spec/data/speedrunners/control-cards.json`
- `spec/provenance/speedrunners.json`
- `DOCS/rules/speedrunners/*.md`

### How

- Replace remaining provisional Speedrunners records with full source-transcribed
  block, pawn, action-card, and control-card content.
- Capture exact authored ICE faces rather than relying on category-derived
  placeholders where the rulebook/component evidence is more specific.
- Normalize every block/pawn/card rule-facing field so later runtime work uses
  spec data, not hardcoded heuristics.
- Update rule modules and provenance together whenever a source interpretation is
  finalized.

## 4. Extend shared schemas and Shadowraiders structured data to full rulebook scope

### Why

Shadowraiders already has shell files and base schemas, but not the full
 structured content needed for parity-grade execution.

### Files

- `spec/schema/block.schema.json`
- `spec/schema/pawn.schema.json`
- `spec/schema/action-card.schema.json`
- `spec/schema/control-card.schema.json`
- `spec/schema/mission-card.schema.json`
- `spec/schema/threat.schema.json`
- `spec/schema/mode.schema.json`
- `spec/data/shadowraiders/control-cards.json`
- `spec/data/shadowraiders/missions.json`
- `spec/data/shadowraiders/threats.json`
- `spec/data/shadowraiders/modes.json`
- add missing content files as needed:
  - `spec/data/shadowraiders/blocks.json`
  - `spec/data/shadowraiders/pawns.json`
  - `spec/data/shadowraiders/action-cards.json`
- `spec/provenance/shadowraiders.json`

### How

- Add only source-backed schema fields that correspond to actual rulebook or
  component-sheet concepts.
- Model the expansion’s executable concepts explicitly:
  event spaces, drone threat spaces, attack dice, stealth movement variants,
  pawn Black ICE, defense modifiers, mercenary cost, mission tags, rewards,
  Chaos megacard sections, outbreak markers, and alternate mode setup data.
- Keep rules-as-data discipline: setup recipes, mode win/lose conditions, and
  content-specific values belong in `spec/data/`, not in engine constants.

## 5. Finish remaining Speedrunners engine compatibility

### Why

The base engine slice is strong, but it is not yet “full rulebook compatible.”
The remaining missing mechanics are concentrated and can be closed without
changing the mirror architecture.

### Files

- TypeScript:
  - `impl/ts/src/domain/types.ts`
  - `impl/ts/src/engine/index.ts`
  - `impl/ts/src/engine/combat.ts`
  - `impl/ts/src/engine/icebreaker.ts`
  - `impl/ts/src/engine/attach.ts`
  - `impl/ts/src/engine/abilities.ts`
  - `impl/ts/src/data/index.ts`
- Go:
  - `impl/go/internal/domain/domain.go`
  - `impl/go/internal/engine/engine.go`
  - `impl/go/internal/engine/combat.go`
  - `impl/go/internal/engine/icebreaker.go`
  - `impl/go/internal/engine/attach.go`
  - `impl/go/internal/engine/abilities.go`
  - `impl/go/internal/data/data.go`
- mirrored tests in:
  - `impl/ts/test/*.test.ts`
  - `impl/go/internal/engine/*_test.go`
  - `impl/go/internal/data/*_test.go`

### How

- Replace category-derived ICE assumptions with exact source-backed ICE faces.
- Implement bonus fragment formation, bonus icon completion, collection, and
  bonus-counter spending/retention rules.
- Finish attachment semantics:
  armor defense replacement, ICE nullification, movement grants, ability-use
  execution, and discard-on-state-loss behavior.
- Implement concentrated multi-target delete and area-attack semantics where the
  rulebook requires them.
- Move effect resolution to a typed registry so block/pawn/card effects can be
  executed from shared data instead of handwritten special cases.

## 6. Implement Shadowraiders runtime topics in both mirrors

### Why

The largest compatibility gap is the expansion runtime itself. The repo already
knows these concepts in docs and schema, but they are not executable.

### Files

- TypeScript:
  - `impl/ts/src/domain/types.ts`
  - `impl/ts/src/engine/index.ts`
  - new or expanded engine modules for threats, missions, stealth, and modes
- Go:
  - `impl/go/internal/domain/domain.go`
  - `impl/go/internal/engine/engine.go`
  - new or expanded engine modules for threats, missions, stealth, and modes
- shared data:
  - `spec/data/shadowraiders/*.json`
- rules/docs:
  - `DOCS/rules/shadowraiders/*.md`
  - `DOCS/domain-model.md`
  - `DOCS/parity.md`
  - `tasks/BACKLOG.md`

### How

- Add threat lifecycle: event-space seeding, activation, deactivation,
  collection, and combat assignment.
- Add stealth movement activation and step accounting alongside normal movement.
- Add mission attachment, tag progression, cargo/mark/counter logic, completion,
  and rewards.
- Add medals and mercenary-control economy.
- Make Shadowraiders-specific control/win rules executable, including mission
  markers.
- Keep every behavior mirrored in Go and TS with the parity contract updated as
  symbols and phases expand.

## 7. Implement mode framework and solo-opponent behavior

### Why

The rulebooks include full mode behavior, not just shared core mechanics. Full
compatibility must therefore include Chaos, Outbreak, Total War, and the listed
alternate rule sets.

### Files

- `spec/data/speedrunners/mode.json`
- `spec/data/shadowraiders/modes.json`
- `spec/schema/mode.schema.json`
- TypeScript and Go mode/setup logic under:
  - `impl/ts/src/engine/index.ts`
  - `impl/go/internal/engine/engine.go`
- docs:
  - `DOCS/rules/shadowraiders/missions-modes-and-symbology.md`
  - `DOCS/domain-model.md`
  - `DOCS/parity.md`

### How

- Refactor setup and win/lose handling so mode-specific recipes are data-driven.
- Implement Chaos turn logic, Black ICE token disable/vulnerability behavior,
  outbreak marker advancement, and Total War setup differences.
- Decide which alternate rule sets are runtime-supported vs documented-only, and
  record that status explicitly in the compatibility matrix and parity docs.

## 8. Expand the local tooling surface to stay honest about compatibility

### Why

An end-to-end delivery target includes tooling/operator visibility, but the
 current `/play/` surface is scoped to Speedrunners-only testing today.

### Files

- `DOCS/web-sandbox-plan.md`
- `tools/block-editor/play.ts`
- `tools/block-editor/public/play/app.js`
- `tools/block-editor/README.md`
- `tools/block-editor/coverage.ts`

### How

- Keep the existing “coverage map” approach, but update it to reflect the new
  compatibility matrix rather than ad hoc status summaries.
- Decide whether `/play/` stays Speedrunners-only through most of execution or
  grows into a shared multi-mode workbench once Shadowraiders mechanics are
  executable.
- Ensure the UI does not imply full support before the corresponding engine/data
  topics are actually green.

## 9. Lock mirrored verification and acceptance criteria early

### Why

This scope is too large to validate informally. Each closed topic must prove:
source accuracy, schema validity, mirror parity, and reproducible behavior.

### Files

- `check-docs.bat`
- `test-engines.bat`
- `tools/validate-spec.ts`
- `impl/ts/test/*.test.ts`
- `impl/go/internal/**/*.go`
- `tools/block-editor` tests where local tooling changes

### How

- For every topic, require:
  - transcript/provenance update if source interpretation changed
  - schema validation success
  - mirrored Go and TS tests
  - parity/doc/backlog update
- Grow golden fixtures and scenario tests as mechanics expand, especially for:
  threat combat, stealth movement, mission progression, Chaos turns, Outbreak
  advancement, and mixed-mode Total War setup.

## Assumptions & Decisions

- **User-selected target:** end-to-end full stack compatibility, not just
  engine-only or transcript-only.
- **User-selected phasing:** parallel by topic across both rulebooks.
- **Authoritative source:** the English 2017 rulebooks are primary; Spanish
  material remains cross-check evidence.
- **Compatibility meaning for this plan:** source-backed data, mirrored Go/TS
  behavior, up-to-date rules/docs/parity, and honest local tooling coverage.
- **Rules-as-data remains mandatory:** mode setup, content values, mission
  rewards, and expansion records should land in `spec/data/` unless a mechanic
  is inherently algorithmic.
- **Not every rule needs to become browser tooling immediately:** the workbench
  should expose coverage truthfully, but it must not outrun engine/spec support.

## Recommended Execution Order

1. Create the compatibility matrix and finish transcript consolidation for the
   already-reviewed noisy pages.
2. Close Speedrunners source-content gaps and exact-rule data.
3. Finish the remaining Speedrunners engine mechanics.
4. Extend Shadowraiders schemas and source-complete data.
5. Implement Shadowraiders shared mechanics: threats, stealth, missions,
   rewards.
6. Implement mode framework and solo-opponent behavior.
7. Update `/play/` and coverage tooling to match the new executable surface.
8. Finish a final parity/docs/backlog sweep and acceptance run.

## Verification Steps

- Source/transcript layer:
  - `python tools/ruletext/extract.py build`
  - `check-docs.bat`
- Shared data/schema layer:
  - `bun tools/validate-spec.ts`
  - `bun tools/verify-artifacts.ts`
  - `bun tools/validate-docs.ts`
- Mirror runtime layer:
  - `test-engines.bat`
  - `go test ./...`
  - `bun test`
- Tooling/workbench layer when changed:
  - `cd tools/block-editor; bun test`
  - `cd tools/block-editor; bun run test:play`

## Deliverable Definition

The plan is complete when an executor can implement against it without having to
decide:

- what “full compatibility” means,
- which source layers are authoritative,
- which files own the data vs runtime vs docs responsibilities,
- how the work should be phased,
- or how the repo should verify completion.
