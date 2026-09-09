# Attachment Completion Vertical Slice Tranche Plan

## Summary

Plan the next whole tranche as a **vertical attachment-completion wave** for the
current Speedrunners runtime. This tranche intentionally does **not** include
bonus fragments/icons/counters. Instead it closes the remaining attachment-led
behavior and makes that behavior operable in the local `/play/` workbench.

The tranche target is:

1. finish remaining attachment movement semantics that are already modeled but
   not fully executed;
2. implement the next attachment defense/ICE behaviors in both mirrors;
3. expose the newly runnable attachment movement surface truthfully in `/play/`;
4. update the live ledgers/docs so the repo’s stated coverage matches the new
   runtime/tooling reality.

## Current State Analysis

### What is already live

From the current backlog, compatibility matrix, and engine files:

- attachment grants/removes ability resolution is live in:
  - `impl/ts/src/engine/combat.ts`
  - `impl/go/internal/engine/combat.go`
- granted slots, recycle draw/hand modifiers, ICE-face / ICE-dice /
  Black-ICE modifiers, and `space.modifier.kind = ice` are already wired in:
  - `impl/ts/src/engine/attach.ts`
  - `impl/ts/src/engine/icebreaker.ts`
  - `impl/go/internal/engine/attach.go`
  - `impl/go/internal/engine/icebreaker.go`
- attachment-granted movement options are already executable in both mirrors,
  including explicit option selection and move-scoped `card`,
  `once-per-turn`, `perTurn`, and `d6` budgets, in:
  - `impl/ts/src/engine/movement.ts`
  - `impl/go/internal/engine/movement.go`

### What is still open in this seam

The remaining attachment-related runtime gaps called out in the repo are:

- **granted stealth semantics**:
  - still pending in `tasks/BACKLOG.md`
  - still marked partial/planned in `DOCS/component-model.md`
  - still missing from the compatibility row in
    `DOCS/rulebook-compatibility-matrix.md`
- **armor-style defense replacement / ICE nullification**:
  - still explicitly pending in `tasks/BACKLOG.md`
  - still called out in `DOCS/component-model.md`
- `/play/` does **not** surface attachment-granted movement options yet:
  - `tools/block-editor/play.ts` only offers base pawn once-per-turn movement
    and printed card movement in `legalOptions(...)`
  - `getMovementOptions(...)` only understands base pawn movement or
    `cardId`-driven movement, not engine movement options
  - `tools/block-editor/public/play/app.js` only renders guided movement for
    `move-steps` and `play-move`
  - `tools/block-editor/coverage.ts` still lists
    `attachment-granted movement` under not-runnable slices

### Why this grouping is coherent

This tranche stays on one consistent seam:

- **attachment completion**, not general economy work;
- **vertical slice**, not engine-only;
- **Speedrunners runtime/tooling parity**, not Shadowraiders expansion.

It uses already-touched file groups rather than inventing new structure:

- engine movement: `movement.ts` / `movement.go`
- engine attachment + combat/icebreaker: `attach.ts`, `combat.ts`,
  `icebreaker.ts` and Go mirrors
- sandbox orchestration: `tools/block-editor/play.ts`
- sandbox UI: `tools/block-editor/public/play/app.js`
- sandbox tests: `tools/block-editor/play.test.ts`
- repo ledgers/docs: backlog, parity, component/domain model, compatibility
  matrix, sandbox docs

## Proposed Changes

### 1. Finish attachment movement semantics in both mirrors

#### Files

- `impl/ts/src/engine/movement.ts`
- `impl/go/internal/engine/movement.go`
- `impl/ts/test/movement.test.ts`
- `impl/go/internal/engine/movement_test.go`

#### What

- Define and execute the remaining **granted stealth semantics** for
  attachment-provided movement.
- Keep the execution model aligned with the existing `MovementOption`
  structure rather than introducing a second movement path.

#### Why

- `MovementOption.stealth` already exists in both mirrors.
- `attach.grantsMovement[].stealth` and `attach.grantsStealth` are already
  modeled data and already flow into `effectiveMovementOptions(...)`.
- The runtime currently computes stealth capability but does not yet turn it
  into any accepted engine behavior.

#### How

- Treat stealth as an explicit executable property of a selected movement
  option rather than display-only metadata.
- Add the smallest state/result surface needed so movement execution can report
  whether a move used stealth.
- Preserve the existing movement-option selection model:
  base movement remains option `0`, granted options follow attachment order,
  and all activation/budget logic continues to route through the current
  movement-option path.
- Add mirror tests that prove:
  - a grant with `stealth: true` produces a stealth-capable executable option;
  - `attach.grantsStealth` upgrades the granted movement option behavior;
  - the behavior is deterministic and parity-matched across TS/Go.

### 2. Implement armor / ICE attachment behavior in both mirrors

#### Files

- `impl/ts/src/engine/attach.ts`
- `impl/ts/src/engine/combat.ts`
- `impl/ts/src/engine/icebreaker.ts`
- `impl/go/internal/engine/attach.go`
- `impl/go/internal/engine/combat.go`
- `impl/go/internal/engine/icebreaker.go`
- `impl/ts/test/attach.test.ts`
- `impl/ts/test/combat.test.ts`
- `impl/ts/test/icebreaker.test.ts`
- `impl/go/internal/engine/attach_test.go`
- `impl/go/internal/engine/combat_test.go`
- `impl/go/internal/engine/icebreaker_test.go`

#### What

- Execute the remaining attachment defense slice:
  - armor replacing defense dice where the authored card data requires it;
  - ICE-nullification behavior where authored attachment semantics indicate it.

#### Why

- This is the other remaining attachment-completion gap explicitly called out in
  the live backlog/docs.
- The code is already organized so combat and Icebreaker consume effective
  runtime properties from attachment-aware helpers.
- Closing this now keeps the tranche within one mechanic family instead of
  mixing in bonus economy.

#### How

- Introduce helper-level resolution rather than scattering attachment checks:
  - effective defense for combat should be computed in one attachment-aware
    path before hit resolution;
  - effective ICE resolution should stay centralized in Icebreaker helpers.
- Use authored attachment data as the trigger; do not invent a free-standing
  armor subsystem disconnected from card data.
- Add focused mirror tests covering:
  - baseline pawn/block behavior with no armor attachment;
  - armor attachment changing effective defense;
  - ICE-nullifying attachment behavior affecting Icebreaker legality or
    outcome according to the authored semantics;
  - attachment cleanup still discarding/refunding correctly after elimination
    or takeover.

### 3. Bring `/play/` up to the current attachment movement surface

#### Files

- `tools/block-editor/play.ts`
- `tools/block-editor/public/play/app.js`
- `tools/block-editor/play.test.ts`

#### What

- Expose attachment-granted movement options through the guided workbench.
- Make the sandbox aware of engine movement options instead of only base pawn
  movement and printed card movement.

#### Why

- The engine now supports a richer movement-option model than the sandbox can
  drive.
- The current workbench therefore understates runnable coverage and prevents
  users from exercising a major slice that already exists.

#### How

- Update `tools/block-editor/play.ts` to:
  - enumerate legal movement actions from engine movement options rather than
    only from a pawn’s printed base movement;
  - include `movementIndex` in guided movement actions when a granted option is
    being used;
  - extend `getMovementOptions(...)` to preview selected engine movement
    options, not just `cardId` or base movement.
- Update `tools/block-editor/public/play/app.js` to:
  - let the user choose among legal movement options for a pawn;
  - preserve the existing guided path-builder workflow;
  - submit `movementIndex` with `move-steps` / `move-hex` actions when
    appropriate;
  - present stealth-capable movement clearly without overstating any
    Shadowraiders threat behavior that is still out of scope.
- Add workbench tests that prove:
  - a session exposes granted movement options in legal actions;
  - guided projection uses the chosen movement option;
  - the accepted action carries `movementIndex`;
  - attachment fixtures can exercise the new surface without mutating
    canonical `spec/` data.

### 4. Expand the attachment fixture and coverage truthfulness

#### Files

- `tools/block-editor/play.ts`
- `tools/block-editor/play.test.ts`
- `tools/block-editor/coverage.ts`
- `tools/block-editor/README.md`
- `DOCS/web-sandbox-plan.md`

#### What

- Update the existing attachment-focused Test Lab fixture so it can exercise the
  newly planned movement/armor attachment behavior.
- Refresh the shared coverage map and operator docs so `/play/` claims exactly
  the surface that the reducer can now run.

#### Why

- The current `attachments` fixture is geared toward attach actions but not
  attachment-completed runtime acceptance.
- The coverage catalog currently lists attachment-granted movement as not
  runnable, which is already stale relative to engine reality and will become
  more stale after this tranche.

#### How

- Extend the `attachments` fixture state in `tools/block-editor/play.ts` so it
  contains at least one controlled pawn and hand/setup combination that can
  exercise:
  - attach-to-own-pawn;
  - attach-to-enemy;
  - granted movement option selection;
  - armor or ICE attachment behavior where reducer-visible.
- Update `coverage.ts` so the `play-workbench` surface and shared gaps reflect:
  - attachment-granted movement is runnable;
  - whatever remains out of scope after the tranche stays listed as pending.
- Update operator-facing docs in `tools/block-editor/README.md` and
  `DOCS/web-sandbox-plan.md` so the workbench flow and acceptance wording match
  the actual runnable slice.

### 5. Update the execution ledgers and canonical docs

#### Files

- `tasks/BACKLOG.md`
- `DOCS/parity.md`
- `DOCS/component-model.md`
- `DOCS/domain-model.md`
- `DOCS/rulebook-compatibility-matrix.md`

#### What

- Bring the repo’s canonical ledgers forward once the tranche lands.

#### Why

- `AGENTS.md` requires the execution ledger (`tasks/BACKLOG.md`,
  `DOCS/parity.md`, and `DOCS/rulebook-compatibility-matrix.md`) to track real
  runtime/tooling changes.
- The component/domain docs are the canonical description of the data/engine
  contract and currently still describe these surfaces as partial or pending.

#### How

- Update backlog wording for the attachment item so:
  - granted stealth and armor/ICE semantics move from pending to delivered if
    fully implemented;
  - non-move `abilityUses`, typed non-`area-attack` effects, `attach.effectText`,
    and bonus economy remain explicitly pending.
- Update parity to record the new attachment-completion surface across both
  mirrors.
- Update component/domain docs to describe the final runtime meaning of:
  - `attach.grantsMovement[].stealth`
  - `attach.grantsStealth`
  - armor/ICE attachment behavior
- Update the compatibility matrix movement/attachment rows so `/play/` and the
  engine claim the same executable scope.

## Assumptions & Decisions

- This plan is for a **single bigger tranche**, not the whole remaining program.
- The chosen tranche is **Attachment completion**, per user direction.
- The tranche is **vertical slice** scope: engine + tests + `/play` + ledgers/docs.
- **Bonus economy is out of scope** for this tranche and belongs to the next
  wave.
- Shadowraiders threat wake / stealth consequences remain out of scope here;
  this tranche only makes the existing attachment/movement semantics executable
  and sandbox-operable in the current Speedrunners surface.
- The existing engine structure remains authoritative:
  - movement work stays in `movement.ts` / `movement.go`
  - attachment helpers stay in `attach.ts` / `attach.go`
  - combat/Icebreaker stay centralized in their current modules
  - `/play/` remains an orchestration/UI layer that calls the reducer
- No new parallel subsystem should be invented for movement or armor if the
  current attachment-aware helper paths can carry the behavior.

## Verification Steps

### Focused engine verification

- `bun test d:\\ZAIBATSU\\impl\\ts\\test\\movement.test.ts`
- `bun test d:\\ZAIBATSU\\impl\\ts\\test\\attach.test.ts`
- `bun test d:\\ZAIBATSU\\impl\\ts\\test\\combat.test.ts`
- `bun test d:\\ZAIBATSU\\impl\\ts\\test\\icebreaker.test.ts`
- `go test ./internal/engine -run "Movement|Attach|Combat|Ice|Delete"`
  from `d:\\ZAIBATSU\\impl\\go`

### Workbench verification

- `bun test d:\\ZAIBATSU\\tools\\block-editor\\play.test.ts`
- If the UI surface changes materially, run the existing browser coverage:
  - `cd d:\\ZAIBATSU\\tools\\block-editor`
  - `bun run test:play`

### Whole-surface regression

- `& "d:\\ZAIBATSU\\test-engines.bat"`
- `& "d:\\ZAIBATSU\\check-docs.bat"`

### Acceptance criteria

- Both mirrors execute the same attachment-completion behaviors with mirrored
  tests.
- `/play/` can guide and submit reducer-backed granted movement options instead
  of hiding them.
- Coverage/docs no longer claim attachment-granted movement is outside the
  runnable subset once it is wired.
- Bonus economy remains explicitly deferred to the next tranche rather than
  implicitly drifting into this one.
