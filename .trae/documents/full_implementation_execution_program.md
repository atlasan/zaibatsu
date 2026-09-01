# Full Implementation Execution Program

## Summary

This plan turns the current compatibility work into a **code-first execution
program** for the remaining Zaibatsu implementation scope. It is not a
documentation-only refresh. Its primary outcome is real delivered behavior:

- full Speedrunners core completion;
- source-complete structured content where implementation depends on it;
- Shadowraiders schema/data/runtime support;
- mode framework and solo-opponent logic;
- truthful local tooling coverage aligned with what the engines actually run.

The repository already has:

- a broad master compatibility plan in
  `.trae/documents/full_rulebook_compatibility_plan.md`;
- a live ordered work list in `tasks/BACKLOG.md`;
- a cross-layer coverage ledger in `DOCS/rulebook-compatibility-matrix.md`.

This plan is the **next-level execution program**: it converts that state into
ordered implementation waves, task ownership, concrete file groups, and required
agent/doc updates so we can proceed with all available missing structures,
rules, data, and implementations in a disciplined way.

## Current State Analysis

### 1. Runtime reality

The current mirrors already implement a substantial Speedrunners slice:

- setup and turn phases;
- placement;
- movement;
- Search/Delete/Reboot/Icebreaker;
- reducer-driven action-card use choice;
- attachment basics;
- snapshots and golden tests.

Concrete mirrored runtime entrypoints already exist in:

- `impl/ts/src/engine/index.ts`
- `impl/go/internal/engine/engine.go`

and the main engine modules already present are:

- TS:
  - `impl/ts/src/engine/abilities.ts`
  - `impl/ts/src/engine/attach.ts`
  - `impl/ts/src/engine/cards.ts`
  - `impl/ts/src/engine/combat.ts`
  - `impl/ts/src/engine/icebreaker.ts`
  - `impl/ts/src/engine/movement.ts`
  - `impl/ts/src/engine/placement.ts`
- Go:
  - `impl/go/internal/engine/abilities.go`
  - `impl/go/internal/engine/attach.go`
  - `impl/go/internal/engine/cards.go`
  - `impl/go/internal/engine/combat.go`
  - `impl/go/internal/engine/icebreaker.go`
  - `impl/go/internal/engine/movement.go`
  - `impl/go/internal/engine/placement.go`

This means the repo is already in a good position to absorb more real mechanics
now; we do not need another documentation-only setup phase.

### 2. Live unresolved implementation gaps

The highest-value remaining code/data gaps are already visible in
`tasks/BACKLOG.md`, `DOCS/parity.md`, `DOCS/domain-model.md`, and
`DOCS/rulebook-compatibility-matrix.md`:

- exact ICE faces from source-backed content;
- bonus fragment/icon/counter economy;
- full typed effect registry and runtime dispatch;
- attachment completion:
  - armor defense replacement / ICE nullification;
  - granted movement execution;
  - granted ability-use execution;
- concentrated multi-target delete and area attacks;
- source-complete Speedrunners records;
- Shadowraiders runtime:
  - threats;
  - stealth movement;
  - missions and tags;
  - medals / mercenary economy;
  - Chaos / Outbreak / Total War;
- truthful tooling expansion beyond the current Speedrunners-only `/play/`.

### 3. Structured data and schema reality

Shared executable data already exists for Speedrunners:

- `spec/data/speedrunners/blocks.json`
- `spec/data/speedrunners/pawns.json`
- `spec/data/speedrunners/action-cards.json`
- `spec/data/speedrunners/mode.json`

Shadowraiders is structurally prepared but still largely shell-only:

- `spec/data/shadowraiders/control-cards.json`
- `spec/data/shadowraiders/missions.json`
- `spec/data/shadowraiders/modes.json`
- `spec/data/shadowraiders/threats.json`

The key schemas already exist and are therefore ready to be extended rather than
invented from scratch:

- `spec/schema/block.schema.json`
- `spec/schema/pawn.schema.json`
- `spec/schema/action-card.schema.json`
- `spec/schema/control-card.schema.json`
- `spec/schema/mission-card.schema.json`
- `spec/schema/threat.schema.json`
- `spec/schema/mode.schema.json`

### 4. Tooling and coverage reality

The local tooling host is already operational and has a shared coverage map:

- `tools/block-editor/coverage.ts`
- `tools/block-editor/play.ts`
- `tools/block-editor/public/play/app.js`

Right now this truthfully exposes only the implemented Speedrunners subset.
That is good discipline. It means future tooling expansion should follow engine
reality, not fake completeness.

### 5. Agent and workflow reality

`AGENTS.md` is a governed contributor/agent contract and explicitly requires:

- mirrored Go/TS implementation;
- rules-as-data discipline;
- canonical doc updates in `DOCS/`;
- `tasks/BACKLOG.md` as the live ordered work list;
- matching tool-doc updates whenever editor/tester behavior changes.

Because the user explicitly asked to “check update agent,” this plan treats
`AGENTS.md` review/update as a required deliverable whenever an implementation
wave changes contributor workflow, execution expectations, or the meaning of a
tool surface.

## Proposed Changes

## Wave 0 — Execution control and task ledger alignment

### Goal

Make the execution program operable before large implementation waves begin.

### Files

- `tasks/BACKLOG.md`
- `DOCS/rulebook-compatibility-matrix.md`
- `DOCS/parity.md`
- `AGENTS.md`

### What / Why / How

- Reconcile backlog order with the new compatibility matrix so the top items are
  implementation-heavy and reflect real blocking dependencies.
- Turn broad items into execution-ready grouped tasks:
  1. remaining Speedrunners runtime mechanics,
  2. full Speedrunners source-content closure,
  3. Shadowraiders data/schema expansion,
  4. Shadowraiders runtime,
  5. modes/AI,
  6. tooling/coverage expansion.
- Review `AGENTS.md` against the new compatibility matrix and current workflow.
  Update it only where the implementation program changes contributor behavior
  or required verification/ownership expectations.

### Deliverable

A synchronized task ledger that can drive long-running implementation without
drift between backlog, parity, matrix, and agent guidance.

## Wave 1 — Finish the remaining Speedrunners runtime mechanics

### Goal

Close the most available code-heavy base-game gaps **before** large Shadowraiders
expansion work.

### Files

- TS:
  - `impl/ts/src/domain/types.ts`
  - `impl/ts/src/engine/combat.ts`
  - `impl/ts/src/engine/icebreaker.ts`
  - `impl/ts/src/engine/attach.ts`
  - `impl/ts/src/engine/abilities.ts`
  - `impl/ts/src/engine/index.ts`
- Go:
  - `impl/go/internal/domain/domain.go`
  - `impl/go/internal/engine/combat.go`
  - `impl/go/internal/engine/icebreaker.go`
  - `impl/go/internal/engine/attach.go`
  - `impl/go/internal/engine/abilities.go`
  - `impl/go/internal/engine/engine.go`
- Tests:
  - `impl/ts/test/combat*.test.ts`
  - `impl/ts/test/attach.test.ts`
  - `impl/ts/test/icebreaker.test.ts`
  - `impl/ts/test/engine.test.ts`
  - mirrored Go engine tests

### What / Why / How

- Replace provisional ICE-face assumptions with exact source-backed faces where
  the content is already available.
- Implement concentrated multi-target delete and area-attack dispatch.
- Finish attachment completion:
  - armor replaces defense dice;
  - armor nullifies ICE where the rules require it;
  - granted movement becomes executable movement;
  - granted ability-use semantics become executable rather than stored only as
    modeled fields.
- Keep all work mirrored in Go and TS, using existing engine module boundaries
  rather than inventing a third structure.

### Deliverable

A materially fuller Speedrunners runtime that removes the most obvious
“modeled but not executed” base-game mechanics.

## Wave 2 — Close source-complete Speedrunners content and exact-rule data

### Goal

Finish the structured content needed to stop relying on provisional or partial
base-game records.

### Files

- `spec/data/speedrunners/blocks.json`
- `spec/data/speedrunners/pawns.json`
- `spec/data/speedrunners/action-cards.json`
- new if absent:
  - `spec/data/speedrunners/control-cards.json`
- `spec/provenance/speedrunners.json`
- `DOCS/rules/speedrunners/*.md`
- `DOCS/domain-model.md`
- `DOCS/parity.md`
- `tasks/BACKLOG.md`

### What / Why / How

- Transcribe the remaining 24 blocks, 16 pawns, 54 action cards, and 18 control
  cards into canonical structured data.
- Capture exact fields the runtime depends on:
  ICE faces, effect ids or typed effects, attachment requirements, class/state
  details, and source-backed special cases.
- Update provenance together with data so runtime implementation remains
  traceable to the rulebooks/component sheets.
- Update rule modules where a prior source interpretation was provisional.

### Deliverable

A source-complete Speedrunners content layer that unblocks robust effect
execution and closes the current “accepted subset” limitation.

## Wave 3 — Add typed effect registry and full Speedrunners effect execution

### Goal

Make blocks, pawns, and cards execute from shared typed data instead of relying
on scattered special handling.

### Files

- TS:
  - `impl/ts/src/engine/abilities.ts`
  - `impl/ts/src/engine/cards.ts`
  - `impl/ts/src/engine/index.ts`
  - add new TS effect module(s) under `impl/ts/src/engine/`
- Go:
  - `impl/go/internal/engine/abilities.go`
  - `impl/go/internal/engine/cards.go`
  - `impl/go/internal/engine/engine.go`
  - add new Go effect module(s) under `impl/go/internal/engine/`
- Shared data:
  - `spec/data/speedrunners/*.json`
- Docs:
  - `DOCS/domain-model.md`
  - `DOCS/parity.md`
  - `DOCS/rules/speedrunners/*.md`

### What / Why / How

- Introduce a typed effect registry keyed by effect id or typed effect payload.
- Implement the remaining block/pawn/card effect dispatch in both mirrors.
- Keep the registry data-driven and shared-spec-first; do not bury rule content
  in one-off engine code branches.

### Deliverable

Speedrunners becomes meaningfully closer to full executable compatibility, not
just content-complete records.

## Wave 4 — Expand Shadowraiders schemas and source-complete expansion data

### Goal

Build the missing structured substrate for Shadowraiders implementation.

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
- new canonical files as needed:
  - `spec/data/shadowraiders/blocks.json`
  - `spec/data/shadowraiders/pawns.json`
  - `spec/data/shadowraiders/action-cards.json`
- `spec/provenance/shadowraiders.json`

### What / Why / How

- Extend schemas only where the rulebooks/components justify real executable
  fields: attack dice, event spaces, drone spaces, pawn Black ICE, stealth,
  mercenary cost, medals, mission tags, Chaos sections, outbreak metadata.
- Fill the current shell files with source-backed records.
- Keep rules-as-data discipline intact: setup, rewards, mode definitions, and
  content values belong in shared data.

### Deliverable

A real Shadowraiders structured data layer ready for mirrored runtime work.

## Wave 5 — Implement Shadowraiders shared mechanics in both mirrors

### Goal

Deliver the expansion’s shared runtime, not just its data shells.

### Files

- TS:
  - `impl/ts/src/domain/types.ts`
  - `impl/ts/src/engine/index.ts`
  - add new TS modules for:
    - threats
    - stealth movement
    - missions
    - rewards / medals
- Go:
  - `impl/go/internal/domain/domain.go`
  - `impl/go/internal/engine/engine.go`
  - add new Go modules for:
    - threats
    - stealth movement
    - missions
    - rewards / medals
- Tests:
  - new mirrored TS and Go tests for threats, stealth, mission flow, and reward
    resolution
- Docs:
  - `DOCS/rules/shadowraiders/*.md`
  - `DOCS/domain-model.md`
  - `DOCS/parity.md`
  - `tasks/BACKLOG.md`

### What / Why / How

- Implement threat activation, attack assignment, elimination/deactivation, and
  collection.
- Implement stealth movement as a first-class movement mode, not as UI-only
  annotation.
- Implement mission attachment, tag progression, cargo/mark/counter semantics,
  completion, and rewards.
- Implement medals and mercenary control economy.
- Keep control/win-state integration mirrored and test-backed.

### Deliverable

Shadowraiders becomes an executable expansion slice rather than a doc/schema
placeholder.

## Wave 6 — Implement mode framework and solo-opponent behavior

### Goal

Make the mode definitions in the rulebooks and shared data real runtime
behavior.

### Files

- `spec/data/speedrunners/mode.json`
- `spec/data/shadowraiders/modes.json`
- `spec/schema/mode.schema.json`
- TS:
  - `impl/ts/src/engine/index.ts`
  - add TS mode/AI support modules as needed
- Go:
  - `impl/go/internal/engine/engine.go`
  - add Go mode/AI support modules as needed
- Docs:
  - `DOCS/rules/shadowraiders/missions-modes-and-symbology.md`
  - `DOCS/domain-model.md`
  - `DOCS/parity.md`
  - `AGENTS.md`

### What / Why / How

- Refactor setup and win/lose condition handling so modes become shared-data
  driven.
- Implement:
  - Shadowraiders mode;
  - Chaos turn logic and Chaos vulnerabilities;
  - Outbreak propagation;
  - Total War setup;
  - alternate rule-set support where accepted as executable.
- Review `AGENTS.md` at the end of this wave because mode/multi-surface work may
  materially change workflow and contributor expectations.

### Deliverable

The repo can execute more than a base-game slice; it can run the expansion’s
mode framework and solo-opponent rules.

## Wave 7 — Expand tooling only behind engine reality

### Goal

Bring the local tools and `/play/` up to date with the newly executable
surface without overstating support.

### Files

- `tools/block-editor/play.ts`
- `tools/block-editor/public/play/app.js`
- `tools/block-editor/coverage.ts`
- `tools/block-editor/README.md`
- `DOCS/web-sandbox-plan.md`
- `tasks/BACKLOG.md`
- `AGENTS.md`

### What / Why / How

- Extend coverage surfaces only after underlying engine/data slices are real.
- Decide whether `/play/` remains primarily Speedrunners until Shadowraiders
  runtime is proven, or expands into a multi-mode workbench once mode framework
  is stable.
- Keep the shared coverage map aligned with actual executable behavior.
- Review and update `AGENTS.md` if the tooling surface, required docs, or test
  expectations for contributors have changed.

### Deliverable

Local tooling becomes a truthful operator/debug surface for the larger
implementation rather than a stale base-game-only view.

## Wave 8 — Final parity, acceptance, and contributor workflow hardening

### Goal

Close the program cleanly: mirrored parity, acceptance coverage, and stable
contributor/agent expectations.

### Files

- `DOCS/parity.md`
- `DOCS/domain-model.md`
- `tasks/BACKLOG.md`
- `DOCS/rulebook-compatibility-matrix.md`
- `AGENTS.md`
- test harnesses and batch scripts where needed

### What / Why / How

- Reconcile all temporary gaps recorded during the implementation waves.
- Ensure every delivered mechanic is reflected consistently in:
  - parity;
  - domain model;
  - rules modules;
  - compatibility matrix;
  - backlog status.
- Final `AGENTS.md` check so repo instructions match the delivered workflow.

### Deliverable

A stable, mirrored, source-backed repository state that future contributors and
agents can extend without guessing.

## Ordered Task Program

1. Align backlog, compatibility matrix, parity, and `AGENTS.md`.
2. Finish the remaining Speedrunners runtime mechanics.
3. Complete Speedrunners source content.
4. Add effect registry and full Speedrunners effect execution.
5. Expand Shadowraiders schemas and source-backed records.
6. Implement Shadowraiders shared mechanics.
7. Implement mode framework and solo-opponent logic.
8. Expand tooling coverage behind proven engine support.
9. Perform final parity and workflow hardening.

## Assumptions & Decisions

- This is a **full execution program**, not a narrow next-step plan.
- The user explicitly wants **massive real code implementation**, not a
  documentation-centered effort.
- Documentation work remains required, but only as part of real implementation
  ownership and traceability.
- `AGENTS.md` review/update is a **required deliverable**, not an optional
  afterthought.
- Speedrunners still provides the largest pool of immediately available code
  work; Shadowraiders becomes the next major implementation wave once shared
  structures are ready.
- The mirrors remain the non-negotiable delivery unit: every runtime mechanic
  must land in both Go and TS with matched tests.
- Shared data and schemas remain the authority for rules/content structure.

## Verification Steps

For each implementation wave, the executor should require the smallest relevant
set from the following and expand it as touched areas grow:

### Core verification

- `go test ./...`
- `bun test`
- `test-engines.bat`

### Documentation / spec / artifacts

- `bun tools/validate-docs.ts`
- `bun tools/verify-artifacts.ts`
- `bun tools/validate-spec.ts`
- `check-docs.bat`

### Tooling / browser coverage

- `cd tools/block-editor; bun test`
- `cd tools/block-editor; bun run test:play`

### Acceptance expectations

- Every engine behavior change lands in both mirrors with tests.
- Every shared-data/schema change updates domain/parity/rules owners.
- Every tooling behavior change updates operator docs and, when workflow
  expectations changed, `AGENTS.md`.
- Temporary gaps must be recorded in both `tasks/BACKLOG.md` and
  `DOCS/parity.md`.
