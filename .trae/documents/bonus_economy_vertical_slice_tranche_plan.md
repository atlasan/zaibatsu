# Bonus Economy Vertical Slice Tranche Plan

## Summary

Plan the next whole tranche as a **bonus-economy vertical slice** that begins
**after** the current attachment-completion tranche is finished, verified, and
committed.

This tranche keeps us inside the highest-value remaining Speedrunners base-game
gap that is already partly modeled in code and data:

1. complete board-created bonus icons and bonus-counter collection;
2. make bonus-counter gain/spend/refund behavior explicit and test-backed in
   both mirrors;
3. expose the bonus-economy slice truthfully in `/play/`;
4. update the live ledgers/docs so repo coverage matches runtime reality.

This tranche intentionally does **not** include:

- typed non-`area-attack` effect registry work;
- source-complete component transcription;
- Shadowraiders threats, missions, or mode framework.

## Current State Analysis

### What is already live

The repo already carries real bonus-economy substrate:

- players already have `bonusCounters` in both mirrors;
- attachment costs already debit bonus counters and store the paid amount on the
  attachment record;
- elimination / takeover cleanup already refunds paid counters to their owner;
- blocks already author `bonusCorners` / `bonusFragments`;
- the block editor and action-card editor already expose bonus fragments/corners,
  card costs, and `gain-bonus` as authored data;
- `/play/` already shows each player's current bonus count in session views.

Concrete existing file groups:

- TS:
  - `impl/ts/src/engine/attach.ts`
  - `impl/ts/src/engine/snapshot.ts`
  - `impl/ts/src/domain/types.ts`
- Go:
  - `impl/go/internal/engine/attach.go`
  - `impl/go/internal/engine/snapshot.go`
  - `impl/go/internal/domain/domain.go`
- Tools:
  - `tools/block-editor/model.ts`
  - `tools/block-editor/coverage.ts`
  - `tools/block-editor/play.ts`

### What is still missing

The live gap is not "bonus data exists" but "bonus economy is not actually
played on the board yet":

- `tasks/BACKLOG.md` still lists `Bonus fragments → bonus icons → bonus counters`
  as open engine work;
- `DOCS/rules/speedrunners/board-and-movement.md` still marks `SR-BOARD-003`
  as planned;
- `tools/block-editor/coverage.ts` still says the full counter economy is not
  runnable;
- `/play/` has no fixture/operator flow for creating or collecting a bonus icon;
- there is no engine-owned representation of a live uncollected bonus icon on
  the Cybernet yet.

### Why this tranche is the right next seam

This is the best next tranche because it is:

- still Speedrunners-core, so it is not blocked by Shadowraiders expansion work;
- code-heavy across both mirrors, not a docs-only detour;
- already partly modeled, so we can finish a real mechanic instead of starting a
  speculative subsystem;
- a clean vertical slice across engine, `/play/`, tests, and ledgers;
- a prerequisite for future `gain-bonus`, mercenary, mission-cost, and
  Total-War-compatible currency work.

## Proposed Changes

### 1. Model live bonus icons on the board

#### Files

- `impl/ts/src/domain/types.ts`
- `impl/go/internal/domain/domain.go`
- `impl/ts/src/engine/placement.ts`
- `impl/go/internal/engine/placement.go`
- `impl/ts/src/engine/snapshot.ts`
- `impl/go/internal/engine/snapshot.go`

#### What

Add an engine-owned representation for bonus icons that have been created on the
board but not yet collected.

#### Why

The rule is two-stage:

1. placing a block may create one or more bonus icons;
2. a player later collects a counter from a formed icon by controlling all three
   contributing blocks.

Without explicit board state for those icons, the second rule cannot be modeled
truthfully.

#### How

- Add a canonical board-level record for a created bonus icon, including enough
  identity to keep it deterministic in snapshots and replay.
- Detect newly formed icons when a block is placed by Search.
- Prevent double-creation of the same icon across later board mutations.
- Keep the representation geometry-light and rules-focused: it should describe
  the formed shared corner and whether its counter is still available.

### 2. Execute bonus-icon collection and bonus-counter gain

#### Files

- `impl/ts/src/engine/abilities.ts`
- `impl/ts/src/engine/index.ts`
- `impl/go/internal/engine/abilities.go`
- `impl/go/internal/engine/engine.go`
- `impl/ts/test/*bonus*.test.ts` or the closest existing engine suites
- mirrored Go engine tests

#### What

Implement the rule that the player controlling all three blocks around a formed
bonus icon collects its counter.

#### Why

This is the missing gameplay heart of the mechanic. The repo already stores the
currency and spends/refunds it for attachments, but the board never produces the
currency yet.

#### How

- Define a single reducer/engine path for collecting bonus icons instead of
  burying the check in UI code.
- Decide the collection timing explicitly from the rule docs and keep it
  documented in code-facing docs:
  - collection should occur from engine state, not browser inference;
  - collection must be idempotent once an icon has been claimed.
- Update the active player's `bonusCounters` when a legal collection occurs.
- Preserve the rule that once collected, the icon has no further effect.
- Emit structured transition events so `/play/` can show what happened without
  parsing strings.

### 3. Consolidate spend/refund behavior under the completed economy

#### Files

- `impl/ts/src/engine/attach.ts`
- `impl/go/internal/engine/attach.go`
- `impl/ts/test/attach.test.ts`
- `impl/go/internal/engine/attach_test.go`

#### What

Tighten the already-partial spend/refund behavior so attachment cost payment
fits cleanly inside the completed board-driven economy.

#### Why

Attach costs are already the only live consumer of bonus counters. Once counters
become earnable on the board, this surface becomes part of the full economy
rather than a stand-alone stub.

#### How

- Keep the existing "paid counters sit on the attachment and refund to the
  original owner" rule.
- Add mirror tests that connect board-earned counters to later attachment spend.
- Verify that elimination and takeover continue to refund correctly after the
  new gain flow is introduced.
- Do not expand into mercenary or mission payment yet; that belongs to later
  Shadowraiders tranches.

### 4. Expose the bonus-economy slice in `/play/`

#### Files

- `tools/block-editor/play.ts`
- `tools/block-editor/public/play/app.js`
- `tools/block-editor/play.test.ts`

#### What

Make the workbench able to create, display, and exercise bonus-icon creation and
collection using reducer-backed state.

#### Why

The sandbox currently shows player bonus totals but cannot help a user drive the
actual rule flow that creates them.

#### How

- Extend the Test Lab with a deterministic bonus-focused fixture.
- Surface formed/uncollected bonus icons in the session view.
- Add reducer-backed actions or auto-resolved transitions, depending on the
  chosen engine timing, so the browser can exercise collection without owning
  rules logic.
- Keep the UI descriptive: show which icon was formed or collected and by whom.
- Add workbench tests that prove:
  - placing the right block arrangement creates icon state;
  - the eligible controller gains a counter;
  - the icon cannot be collected twice;
  - earned counters can immediately pay a legal attachment cost.

### 5. Update coverage, ledgers, and canonical docs

#### Files

- `tasks/BACKLOG.md`
- `DOCS/parity.md`
- `DOCS/domain-model.md`
- `DOCS/component-model.md`
- `DOCS/rulebook-compatibility-matrix.md`
- `DOCS/rules/speedrunners/board-and-movement.md`
- `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`
- `tools/block-editor/coverage.ts`
- `tools/block-editor/README.md`
- `DOCS/web-sandbox-plan.md`

#### What

Bring the canonical documentation and execution ledgers forward after the bonus
slice lands.

#### Why

This tranche changes real runtime behavior, `/play/` coverage, and the meaning
of one of the core counters. The repo ledger must say that clearly.

#### How

- Move bonus economy from planned to implemented/partial where the tranche
  truly lands.
- Document the canonical runtime meaning of:
  - formed but uncollected bonus icons;
  - collection ownership;
  - attachment-cost payment/refund within the completed economy.
- Keep later gaps explicit:
  - typed `gain-bonus` direct card effects if not executed in this tranche;
  - Shadowraiders threat-token replacement and Total War interchangeability;
  - mercenary / mission cost payment.

## Assumptions & Decisions

- This is the **next tranche after attachment completion**, not a replacement
  for finishing that in-flight work.
- The tranche remains **vertical slice** scope: engines + tests + `/play/` +
  docs/ledgers.
- The authoritative source for the mechanic is:
  - `DOCS/rules/speedrunners/board-and-movement.md`
  - `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`
  - `DOCS/rules/transcripts/speedrunners-rulebook.en.md`
- The engine, not `/play/`, must own icon creation and collection legality.
- This tranche should finish the **Speedrunners** bonus loop only.
- Shadowraiders threat tokens, mercenary costs, mission costs, medals, and
  Total War currency interoperability remain explicitly out of scope.

## Verification Steps

### Focused engine verification

- `bun test d:\\ZAIBATSU\\impl\\ts\\test\\attach.test.ts`
- `bun test d:\\ZAIBATSU\\impl\\ts\\test\\engine.test.ts`
- bonus-focused TS suites added by the tranche
- `go test ./internal/engine -run "Attach|Bonus|Search|Engine"`
  from `d:\\ZAIBATSU\\impl\\go`

### Workbench verification

- `bun test d:\\ZAIBATSU\\tools\\block-editor\\play.test.ts`
- `cd d:\\ZAIBATSU\\tools\\block-editor; bun run test:play`
  if the visible `/play/` flow changes materially

### Whole-surface regression

- `& "d:\\ZAIBATSU\\test-engines.bat"`
- `& "d:\\ZAIBATSU\\check-docs.bat"`

## Acceptance Criteria

- Placing blocks can create deterministic bonus-icon state in both mirrors.
- The controller of all three contributing blocks can collect the icon exactly
  once and gain the counter in both mirrors.
- Board-earned counters can pay real attachment costs with existing refund rules
  still intact.
- `/play/` truthfully exposes and tests the bonus-economy slice.
- Docs, parity, backlog, and coverage no longer describe base-game bonus
  economy as wholly unimplemented once the tranche lands.
