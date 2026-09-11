# Speedrunners Effect Execution Vertical Slice Tranche Plan

## Summary

Plan the next whole tranche as a **Speedrunners effect-execution vertical
slice** that begins **after** the current attachment-completion + bonus-economy
work is finished, verified, and committed.

This tranche targets the strongest remaining code-first gap that is already
prepared in shared schemas, editor surfaces, and both mirror engines:

1. convert the currently authored Speedrunners effect-bearing records from
   summary/string placeholders into explicit typed shared data;
2. expand the Go and TypeScript effect runtime from `area-attack`-only dispatch
   to a small source-backed effect subset that can already be grounded from the
   current transcribed content;
3. expose those effects truthfully in `/play/` with deterministic fixtures and
   structured events;
4. update ledgers/docs so the repo stops claiming that typed effects are merely
   authored but not executable.

This tranche intentionally does **not** include:

- full 54-card / 24-block / 18-control-card Speedrunners transcription;
- the entire future effect registry for every theoretical effect kind;
- Shadowraiders threats, missions, medals, or mode framework;
- browser-owned rules logic.

## Current State Analysis

### What is already live

The repo already has most of the substrate needed for real effect execution:

- shared block and card schemas already allow typed effects;
- the block editor and action-card editor already author effect kinds such as
  `gain-control-card`, `place-pawn`, `area-attack`, `modify-ice`,
  `draw-cards`, `gain-bonus`, `sacrifice-pawn`, and `custom`;
- both mirror engines already expose an effect module and already dispatch
  typed block `area-attack` on placement and control gain;
- `/play/` already surfaces structured engine events and guided action fixtures;
- current source-backed Speedrunners data already contains real effect-bearing
  records, but they still sit behind string ids or summary prose.

Concrete existing file groups:

- TS:
  - `impl/ts/src/engine/effects.ts`
  - `impl/ts/src/engine/index.ts`
  - `impl/ts/src/domain/types.ts`
- Go:
  - `impl/go/internal/engine/effects.go`
  - `impl/go/internal/engine/engine.go`
  - `impl/go/internal/domain/domain.go`
- Shared data:
  - `spec/data/speedrunners/blocks.json`
  - `spec/data/speedrunners/action-cards.json`
- Tools:
  - `tools/block-editor/model.ts`
  - `tools/block-editor/play.ts`
  - `tools/block-editor/coverage.ts`

### What is still missing

The live gap is not "effects are modeled" but "effects are not yet executed as
shared runtime behavior":

- `tools/block-editor/coverage.ts` still states that typed block/card effects
  are authored today but runtime dispatch is pending;
- source-backed blocks such as `idoru`, `hacktivism`, and `chiba-city` still
  use legacy string effect ids on control;
- source-backed cards such as `cracker` and `simstim-record` currently carry
  only summary text rather than executable typed effect payloads;
- both engines only execute typed block `area-attack`;
- `/play/` has no fixture dedicated to verifying a source-backed effect flow.

### Why this is the right next tranche

This is the best follow-on tranche because it is:

- still Speedrunners-core, so it is not blocked by large Shadowraiders data
  shells;
- code-heavy across shared data, both engines, tests, and `/play/`;
- grounded in live repo reality rather than speculative future content;
- a prerequisite for making the transcribed content actually matter at runtime;
- a cleaner next step than jumping straight into full Shadowraiders mechanics
  while the base game still strands authored effect content behind placeholders.

## Proposed Changes

### 1. Normalize the current source-backed effect subset into typed shared data

#### Files

- `spec/data/speedrunners/blocks.json`
- `spec/data/speedrunners/action-cards.json`
- `spec/provenance/speedrunners.json`
- `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`
- `DOCS/rules/speedrunners/board-and-movement.md`

#### What

Replace the current summary-only or string-id effect-bearing records in the
already transcribed Speedrunners subset with explicit typed effect payloads and
source-backed trigger/timing notes.

#### Why

The engines cannot execute what the data does not state explicitly. Today the
repo already knows that some blocks/cards have special effects, but it still
stores too many of them as opaque ids or prose summaries.

#### How

- Audit the currently transcribed Speedrunners records that already imply real
  effect behavior.
- Choose the tranche subset from those source-backed records only.
- Convert the selected records to explicit typed effects and explicit timing:
  on-play, on-attach, on-control, in-Cybernet, or continuous, as the source
  requires.
- Keep legacy/open-ended records outside the tranche explicitly deferred in the
  ledgers rather than half-modeled in code.

### 2. Expand both mirrors from one special case to a real typed effect layer

#### Files

- `impl/ts/src/engine/effects.ts`
- `impl/ts/src/engine/cards.ts`
- `impl/ts/src/engine/attach.ts`
- `impl/ts/src/engine/abilities.ts`
- `impl/ts/src/engine/index.ts`
- `impl/go/internal/engine/effects.go`
- `impl/go/internal/engine/cards.go`
- `impl/go/internal/engine/attach.go`
- `impl/go/internal/engine/abilities.go`
- `impl/go/internal/engine/engine.go`

#### What

Introduce a mirrored typed effect execution layer that handles the exact
source-backed subset selected in Step 1, rather than continuing to special-case
only `area-attack`.

#### Why

The repo already has the shape of an effect system. What it lacks is a shared
runtime path that can execute authored effects from common data in both
languages.

#### How

- Keep the implementation data-driven and routed through the existing effect
  modules.
- Add explicit engine entry points for:
  - block-triggered effects;
  - played card effects;
  - attachment-triggered or attachment-while-controlled effects.
- Start with a closed subset that is already source-backed in the transcribed
  Speedrunners content instead of trying to support every future effect kind at
  once.
- Emit structured events for effect resolution so `/play/` can render outcomes
  without inspecting strings.

### 3. Close the selected effect timing semantics

#### Files

- `impl/ts/src/domain/types.ts`
- `impl/go/internal/domain/domain.go`
- `impl/ts/src/engine/effects.ts`
- `impl/go/internal/engine/effects.go`
- mirrored engine tests

#### What

Make the selected effect subset executable at the correct timing boundary:
placement, control gain, on-play, on-attach, or continuous ownership, depending
on the source-backed record.

#### Why

The biggest correctness risk in effect work is not just the operation itself
but *when* it fires and *who* it belongs to. Timing must be explicit and mirror
tested.

#### How

- Define the smallest timing contract needed by the selected subset.
- Reuse current action/reducer entry points instead of inventing UI-owned
  timing.
- Keep continuous/ownership-sensitive effects explicit in state transitions so
  they are deterministic in snapshots and replay.
- Record any still-ambiguous source interpretation in the relevant rule module,
  not only in code.

### 4. Add a truthful `/play/` effect slice

#### Files

- `tools/block-editor/play.ts`
- `tools/block-editor/public/play/app.js`
- `tools/block-editor/play.test.ts`
- `DOCS/web-sandbox-plan.md`
- `tools/block-editor/README.md`

#### What

Expose one or more deterministic Test Lab fixtures that exercise the new
effect-execution slice using reducer-backed engine state.

#### Why

The workbench is already the repo's local truth surface for runnable behavior.
Once typed effects execute in both mirrors, `/play/` should make that visible
and debuggable.

#### How

- Add fixture-local source-like data where needed without mutating canonical
  `spec/` beyond the tranche's chosen records.
- Surface effect-trigger events and resulting board/player changes.
- Ensure the fixture demonstrates the whole loop:
  authored typed effect -> reducer acceptance -> state change -> event log ->
  deterministic replay.
- Keep the browser descriptive only; the engine remains the authority.

### 5. Update ledgers, parity, and canonical docs

#### Files

- `tasks/BACKLOG.md`
- `DOCS/parity.md`
- `DOCS/domain-model.md`
- `DOCS/component-model.md`
- `DOCS/rulebook-compatibility-matrix.md`
- `tools/block-editor/coverage.ts`

#### What

Bring the repo's ledgers forward once the selected effect subset is real.

#### Why

This tranche changes actual runtime coverage, shared-data meaning, and `/play/`
truthfulness. The docs should stop treating typed effects as editor-only
structure once the engines can execute them.

#### How

- Move typed effect execution from `planned` to the truthful new maturity.
- Record which effect kinds are fully executed and which remain deferred.
- Keep partial delivery honest: the tranche closes a real subset, not the whole
  future effect universe.

## Assumptions & Decisions

- This tranche starts **after** the current in-flight attachment + bonus work is
  closed, documented, verified, and committed.
- The recommended scope is a **source-backed effect subset**, not a generic
  "support everything" registry pass.
- The engine, not `/play/`, remains responsible for effect legality and timing.
- Shared data stays authoritative: effect meaning lives in `spec/data/` and the
  rules docs, not in tool-only branching.
- Any effect still requiring broader content transcription stays explicitly out
  of scope for this tranche.

## Recommended Initial Subset

The tranche should begin by auditing the currently transcribed Speedrunners
records and then lock onto the exact effect-bearing subset already present in
shared data. Based on current repo state, the likely opening targets are:

- the existing source-backed blocks with `underControl` effects;
- the currently source-backed cards whose text implies direct or ownership-based
  effects rather than plain attachment stats.

This keeps the first effect slice grounded in real authored records already in
the repository instead of synthetic future placeholders.

## Verification Steps

### Focused engine verification

- targeted TS effect suites added by the tranche
- targeted Go effect suites added by the tranche
- `bun test d:\\ZAIBATSU\\impl\\ts\\test\\engine.test.ts`
- `go test ./internal/engine -run "Effect|Engine|Attach|Ice|Bonus"`
  from `d:\\ZAIBATSU\\impl\\go`

### Workbench verification

- `bun test d:\\ZAIBATSU\\tools\\block-editor\\play.test.ts`
- `cd d:\\ZAIBATSU\\tools\\block-editor; bun run test:play`
  if the visible fixture flow changes materially

### Whole-surface regression

- `& "d:\\ZAIBATSU\\test-engines.bat"`
- `& "d:\\ZAIBATSU\\check-docs.bat"`

## Acceptance Criteria

- The selected source-backed Speedrunners effect subset is represented as typed
  shared data rather than summaries or opaque ids.
- Both mirrors execute that subset through the same conceptual effect layer with
  matched tests.
- `/play/` exposes at least one deterministic fixture that proves the effect
  slice end to end.
- Parity, compatibility, backlog, and coverage docs reflect the new runtime
  truth without overstating unimplemented effect kinds.
