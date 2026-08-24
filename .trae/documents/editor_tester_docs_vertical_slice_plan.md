# Editor, Tester, and Docs Vertical Slice Plan

## Summary

Continue on the current Speedrunners-first track by finishing the existing
editor and tester surfaces rather than starting new resource families.

This milestone will:

1. make the editor cleanly cover the current block and action-card data
   structures without forcing authors through ad hoc JSON for common work;
2. make `/play/` a complete reducer-backed tester for the currently implemented
   Speedrunners action/rule subset and core game basics;
3. make the documentation clearer for both humans and agents, with one obvious
   path to the editor workflow, the tester workflow, and the required update
   obligations when behavior changes.

## Current State Analysis

### Editor

- [tools/block-editor/model.ts](file:///d:/ZAIBATSU/tools/block-editor/model.ts)
  already models a richer authoring shape than the UI fully exposes:
  - blocks have typed ICE, effects, zone mapping, neighbors, modifiers, and
    provenance;
  - action cards already support typed `movements`, `effects`, and a large
    `attach` structure including grants/removes, movement grants, slot grants,
    ICE modifiers, draw/hand modifiers, triggers, and review-only vision data.
- [tools/block-editor/public/app.js](file:///d:/ZAIBATSU/tools/block-editor/public/app.js)
  already gives the block surface a relatively complete authored form.
- [tools/block-editor/public/action-cards/app.js](file:///d:/ZAIBATSU/tools/block-editor/public/action-cards/app.js)
  exposes only a shallow subset directly, then falls back to a large
  freeform JSON textarea for advanced card structure.
- [tools/block-editor/server.ts](file:///d:/ZAIBATSU/tools/block-editor/server.ts)
  already provides the local API surface for assets, sessions, validation,
  export, deck validation/export, and in-memory play sessions.

### Tester

- [tools/block-editor/play.ts](file:///d:/ZAIBATSU/tools/block-editor/play.ts)
  already runs real TypeScript-engine sessions in memory and exposes:
  - standard sessions;
  - Test Lab fixtures;
  - trace export/import;
  - guided movement path projection;
  - many implemented action families in `legalOptions()`.
- [tools/block-editor/public/play/app.js](file:///d:/ZAIBATSU/tools/block-editor/public/play/app.js)
  already renders a useful local tester, but the guided action surface is still
  a single selector-driven UI rather than a clearer “basics + action families”
  workflow.
- Current fixtures cover:
  - search + movement,
  - combat + control,
  - attachments,
  - reboot + turn flow.
- The current tester does not yet present a dedicated “game basics” slice for
  control-marker placement, phase progression, and victory as its own clear
  guided flow.

### Docs

- The canonical documentation structure is strong and governed:
  - [DOCS/INDEX.md](file:///d:/ZAIBATSU/DOCS/INDEX.md)
  - [DOCS/governance.md](file:///d:/ZAIBATSU/DOCS/governance.md)
  - [DOCS/block-editor-plan.md](file:///d:/ZAIBATSU/DOCS/block-editor-plan.md)
  - [DOCS/web-sandbox-plan.md](file:///d:/ZAIBATSU/DOCS/web-sandbox-plan.md)
- The repo already documents both tools, but the “what is implemented now / how
  to use it / what must be updated when it changes” story is spread across:
  - [README.md](file:///d:/ZAIBATSU/README.md)
  - [tools/block-editor/README.md](file:///d:/ZAIBATSU/tools/block-editor/README.md)
  - [DOCS/component-model.md](file:///d:/ZAIBATSU/DOCS/component-model.md)
  - [DOCS/editor-card-record.md](file:///d:/ZAIBATSU/DOCS/editor-card-record.md)
  - [tasks/BACKLOG.md](file:///d:/ZAIBATSU/tasks/BACKLOG.md)
- For agents, [AGENTS.md](file:///d:/ZAIBATSU/AGENTS.md) defines repo-wide
  obligations, but it does not yet give a crisp editor/tester-specific update
  checklist.

## Assumptions & Decisions

### Scope decisions

1. “Continue on track” means stay on the existing Speedrunners-first roadmap,
   not pivot into Shadowraiders-first implementation.
2. The editor milestone is limited to the existing block and action-card
   surfaces under
   [tools/block-editor/](file:///d:/ZAIBATSU/tools/block-editor/), not new
   pawn/control-card/threat/mission authoring surfaces.
3. The tester milestone targets the currently implemented Speedrunners subset,
   not a source-complete base game and not Shadowraiders gameplay.
4. Documentation work should update existing canonical docs and navigation
   points instead of creating a new parallel documentation tree.

### Out of scope for this milestone

- New standalone resource editors for pawns, control cards, threats, missions,
  or modes.
- Shadowraiders gameplay fixtures or expansion-rule execution.
- Unimplemented engine systems still called out as pending in
  [tasks/BACKLOG.md](file:///d:/ZAIBATSU/tasks/BACKLOG.md), especially:
  - bonus icon / bonus counter economy,
  - area attacks beyond the currently implemented subset,
  - full attachment effect resolution,
  - full effect registry across all content.

### Acceptance target

At the end of execution:

1. the editor can directly author the current block and action-card structures
   through clear controls for normal work;
2. `/play/` can exercise every currently implemented Speedrunners action/rule
   family and core game basics through either standard play or named fixtures;
3. the docs clearly explain current capabilities, boundaries, and required
   update obligations for both humans and agents.

## Proposed Changes

### 1) Finish the current editor surfaces

#### [tools/block-editor/public/action-cards/app.js](file:///d:/ZAIBATSU/tools/block-editor/public/action-cards/app.js)

What:
- replace the current “advanced card structure” JSON-heavy authoring flow with
  explicit structured sections for the already-supported `ActionCardRecord`
  fields;
- keep review evidence and vision decisions visible and review-oriented;
- retain export/validation behavior already backed by the server/model.

How:
- split the inspector into explicit sections:
  - identity,
  - physical copy group,
  - action part,
  - direct play effects,
  - attachment part,
  - source review,
  - provenance,
  - validation/deck readiness;
- add direct controls for:
  - `type`,
  - `class[]`,
  - `movements[]`,
  - `effects[]`,
  - `attach.as`,
  - `attach.slot`,
  - `attach.class[]`,
  - `attach.grants[]`,
  - `attach.removes[]`,
  - `attach.grantsMovement[]`,
  - `attach.grantsStealth`,
  - `attach.grantsSlot[]`,
  - `attach.abilityUses[]`,
  - `attach.iceModifier`,
  - `attach.drawModifier`,
  - `attach.handModifier`,
  - `attach.blockSpace`,
  - `attach.effectText`,
  - `attach.effectTrigger`,
  - `attach.cost`;
- remove the raw JSON textarea as the primary authoring path;
- if a raw structured preview remains, make it derived/read-only so the normal
  path is explicit controls instead of manual JSON editing.

Why:
- the current model supports a richer card shape than the current UI exposes;
- “nicely covering data structures and options” is primarily an action-card UI
  gap, not a schema gap.

#### [tools/block-editor/public/app.js](file:///d:/ZAIBATSU/tools/block-editor/public/app.js)

What:
- polish the block editor so its current structure/options remain clear and
  consistent with the richer action-card surface.

How:
- keep the current source-aligned block workflow intact;
- improve section labeling and help text around:
  - ICE faces vs derived category,
  - typed placement/control effects,
  - space options (`direction`, `modifier`, `capacityNote`, `pawnId`,
    `effectId`),
  - zone-mapping behavior and derived neighbors/boundary spaces;
- make sure block and action-card authoring use parallel tone and layout where
  practical.

Why:
- the block surface is already materially further along than the action-card
  surface, so this work should be polish/consistency, not a redesign.

#### [tools/block-editor/model.ts](file:///d:/ZAIBATSU/tools/block-editor/model.ts)

What:
- keep the data contract authoritative for both surfaces;
- only change this file if execution discovers missing helpers or validation
  gaps needed by the structured UI.

How:
- do not redesign the data model;
- add helper utilities only when they reduce repeated frontend parsing/formatting
  logic for structured card fields;
- keep validation authoritative here, not duplicated in the browser.

Why:
- this file is already the editor-side contract and should remain the single
  implementation anchor for authoring structure rules.

#### [tools/block-editor/model.test.ts](file:///d:/ZAIBATSU/tools/block-editor/model.test.ts)

What:
- extend tests so the richer action-card structure remains covered as the UI is
  upgraded.

How:
- add tests for:
  - multi-movement authoring,
  - direct card effects,
  - grants/removes,
  - slot grants,
  - stealth/movement grants,
  - ability-use combinations,
  - ICE modifiers,
  - draw/hand modifiers,
  - block-space attachments,
  - deck validation edge cases that the UI can now author directly.

Why:
- once the UI exposes these fields directly, the model test suite must lock the
  validation contract in place.

### 2) Make `/play/` complete for the implemented Speedrunners subset

#### [tools/block-editor/play.ts](file:///d:/ZAIBATSU/tools/block-editor/play.ts)

What:
- turn the existing sandbox into a complete tester for the implemented
  Speedrunners subset.

How:
- keep the reducer-backed in-memory design;
- make sure `legalOptions()` exposes every currently implemented action family
  that should be testable in the browser:
  - phase advance,
  - pass,
  - place marker,
  - once-per-turn search,
  - card search,
  - once-per-turn movement,
  - card movement,
  - once-per-turn delete,
  - card delete,
  - multi-target delete fixture action,
  - once-per-turn icebreak pawn,
  - once-per-turn icebreak block,
  - card icebreak pawn,
  - card icebreak block,
  - attach to own pawn,
  - attach to enemy,
  - attach to block,
  - reboot / card reboot where the current engine supports it;
- add one dedicated “game basics” fixture covering:
  - entering action phase,
  - placing a control marker,
  - passing through recycle/end,
  - observing victory/basic turn flow when applicable;
- keep existing Test Lab fixtures, but align them explicitly to action families
  rather than only mechanic-themed names if the labels need tightening.

Why:
- the user explicitly wants the game tester to “cover and implement actions,
  rules, game basics”;
- for this milestone, that means complete coverage of the implemented subset,
  not speculative UI for still-missing mechanics.

#### [tools/block-editor/public/play/app.js](file:///d:/ZAIBATSU/tools/block-editor/public/play/app.js)

What:
- make the tester easier to use as both a guided rules surface and a debugging
  tool.

How:
- reorganize the action UI so it is clearer by family:
  - basics / turn flow,
  - movement,
  - search / placement,
  - combat,
  - icebreaker / control,
  - attachments,
  - reboot,
  - trace/reset/undo;
- preserve the current guided movement builder, but make the difference between
  known fixed budgets and pending dice budgets clearer in the UI copy;
- surface fixture checkpoints and supported-action intent more explicitly so the
  tester reads as “implemented-subset coverage”, not “full game client”.

Why:
- the current selector works, but it is still more engineering-oriented than
  “game basics + rules coverage” oriented.

#### [tools/block-editor/play.test.ts](file:///d:/ZAIBATSU/tools/block-editor/play.test.ts)

What:
- expand unit/integration coverage of the sandbox orchestration.

How:
- add one focused test per supported action family and per fixture family;
- add coverage for the new “game basics” fixture;
- verify that each exposed action remains reducer-validated rather than locally
  simulated;
- preserve checksum/trace/undo/reset guarantees.

Why:
- this suite is the authoritative non-browser safety net for the tester
  orchestration layer.

#### [tools/block-editor/e2e/play.pw.ts](file:///d:/ZAIBATSU/tools/block-editor/e2e/play.pw.ts)

What:
- make the browser coverage match the supported tester story.

How:
- add Playwright scenarios that cover:
  - basics fixture,
  - at least one search + movement flow,
  - at least one combat / delete flow,
  - at least one icebreak flow,
  - at least one attach flow,
  - at least one reboot / turn-flow flow,
  - trace import/export failure messaging,
  - mobile or narrow-layout usability for the main setup/tester flow.

Why:
- the browser surface is part of the milestone, not just the backend session
  orchestration.

### 3) Keep the server/API aligned to both surfaces

#### [tools/block-editor/server.ts](file:///d:/ZAIBATSU/tools/block-editor/server.ts)

What:
- keep the editor and tester HTTP bridge aligned with the richer UI surfaces.

How:
- avoid broad architectural changes;
- update only the endpoints and response shapes needed to support:
  - richer card editor structured workflows,
  - any new fixture metadata,
  - any improved `/play/` grouping or action labeling,
  - any export/report details needed by the revised docs/tests;
- keep editor writes limited to sessions/exports and play sessions fully
  in-memory.

Why:
- this file is already the local tool boundary and should remain narrow.

### 4) Update docs for humans and agents

#### [README.md](file:///d:/ZAIBATSU/README.md)

What:
- tighten the high-level repo entrypoint for the editor and tester.

How:
- make the quick-start story explicitly distinguish:
  - editor,
  - action-card editor,
  - `/play/` tester,
  - doc/validation scripts;
- state that `/play/` is an implemented-subset local tester, not a complete game
  client.

#### [tools/block-editor/README.md](file:///d:/ZAIBATSU/tools/block-editor/README.md)

What:
- make this the human-facing operational guide for the editor and tester.

How:
- update the “What it does now” sections to match the final block/action-card UI
  and `/play/` tester coverage;
- document the exact authored card/block structures the UI now covers directly;
- keep explicit review-only boundaries around vision, exports, and sandbox scope.

#### [DOCS/INDEX.md](file:///d:/ZAIBATSU/DOCS/INDEX.md)

What:
- improve the “where do I start” path for content tools and local gameplay
  testing.

How:
- strengthen navigation for:
  - content-authoring work,
  - local rules testing,
  - the canonical docs that must move when editor/tester behavior changes.

#### [DOCS/block-editor-plan.md](file:///d:/ZAIBATSU/DOCS/block-editor-plan.md)

What:
- bring the workstream plan in line with the finished milestone state.

How:
- update the capability ladder and acceptance wording to reflect:
  - structured block authoring,
  - structured action-card authoring,
  - review-only vision flows,
  - remaining out-of-scope resource families.

#### [DOCS/web-sandbox-plan.md](file:///d:/ZAIBATSU/DOCS/web-sandbox-plan.md)

What:
- make the sandbox plan accurately describe the tester after this milestone.

How:
- update the outcome, Test Lab, and acceptance sections to reflect:
  - implemented-subset action coverage,
  - basics fixture coverage,
  - current boundaries vs still-missing mechanics.

#### [DOCS/component-model.md](file:///d:/ZAIBATSU/DOCS/component-model.md)

#### [DOCS/editor-card-record.md](file:///d:/ZAIBATSU/DOCS/editor-card-record.md)

What:
- keep the authoring docs aligned with the editor’s directly supported fields.

How:
- update only where the execution changes the practical authoring workflow or
  clarifies current supported fields;
- keep these docs as the canonical explanation of data structure coverage, not
  the README.

#### [AGENTS.md](file:///d:/ZAIBATSU/AGENTS.md)

What:
- make the repo instructions more agent-oriented for this workstream.

How:
- add concise guidance that when editor/tester behavior changes, contributors
  must update:
  - the relevant tool README,
  - the matching workstream doc,
  - any canonical domain/parity/rules docs affected by actual behavior changes,
  - `tasks/BACKLOG.md` when milestone status changes.

Why:
- this directly addresses “human and agents oriented” without creating a second
  parallel policy document.

#### [tasks/BACKLOG.md](file:///d:/ZAIBATSU/tasks/BACKLOG.md)

What:
- keep the live work list aligned with the completed milestone.

How:
- update the relevant editor/tester/docs bullets after implementation lands;
- only change status lines that are actually completed by the execution.

#### Behavior-driven docs when needed

If execution changes real behavior rather than only UI/tester presentation,
update the canonical owners too:

- [DOCS/parity.md](file:///d:/ZAIBATSU/DOCS/parity.md)
- [DOCS/domain-model.md](file:///d:/ZAIBATSU/DOCS/domain-model.md)
- affected rules modules under
  [DOCS/rules/](file:///d:/ZAIBATSU/DOCS/rules/)

Only touch these if the milestone introduces real engine/domain behavior
changes, not just better editor/tester access to already-implemented behavior.

## Implementation Order

1. upgrade the action-card editor UI to fully cover the current structured card
   contract;
2. polish block-editor wording/consistency only where needed to match the new
   card surface;
3. extend `/play/` fixtures and legal action exposure to complete the
   implemented Speedrunners subset, including a dedicated basics fixture;
4. update sandbox and editor tests;
5. update the human/agent docs and backlog status;
6. run the full validation/test stack.

## Verification Steps

Use the existing repo-standard commands and package scripts:

1. [tools/block-editor/package.json](file:///d:/ZAIBATSU/tools/block-editor/package.json)
   - `bun test`
   - `bun run test:play`
2. repo validation
   - `check-docs.bat`
3. engine parity regression
   - `test-engines.bat`

Verification should explicitly confirm:

- block editor validation/export still works;
- action-card editor can directly author the supported structured fields without
  relying on raw JSON for common paths;
- `/play/` can exercise every currently supported action family and basics
  fixture;
- docs match the shipped behavior and workstream boundaries.
