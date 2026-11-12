# Remaining work to complete Zaibatsu

Updated 2026-11-11 after the Cleaner B controlled-placement delivery. This is a completion-gap snapshot, not a new rules authority. The ordered live list remains [tasks/BACKLOG.md](../tasks/BACKLOG.md); source interpretations belong to the [rule modules](rules/README.md), and mirrored delivery evidence belongs to [parity](parity.md).

## Current boundary

**No complete official mode is accepted yet.** The executable local quick match and focused scenarios prove substantial engine behavior, but do not prove all printed content, official setup or every end condition. Keep the original target: Speedrunners → Shadowraiders → Total War → Strategic Alliance → Cyber-Revolution → Chaos → Outbreak → Total War–Chaos.

The current checks pass: 519 Bun tests, all Go packages, TypeScript checking, 68 browser tests and six Python artifact tests. Documentation/spec/artifact checks verify 55 local source originals and 22 unchanged frozen regression files. The coverage checklist has 326 rows, of which 74 are both source-verified and implemented. Rows include components and rules; 74 is not a number of complete components or modes.

The local verification recipe in `.github/localonly_workflows/verify.yml` runs without ignored primary PDFs, generated page renders or local OCR caches. GitHub Actions does not run it. Exact transcript page-render links are optional local evidence; ordinary missing documents and anchors still fail. A local source audit can require originals with `bun tools/verify-artifacts.ts --require-originals`. Frozen regression JSON is explicitly tracked and its original bytes remain protected.

The core now has explicit authorized choices, committed movement rolls, public combat assignment, physical pawn/control-card zones, many attachment and phase handlers, hidden-information views, pure available-action queries, physical use markers, controller-owned played cards, and held block Bonus counters. These contracts can support later UI, bots, networking and native clients. They still need the missing content, decisions and mode recipes below.

## Speedrunners: remaining source-to-runtime acceptance

Physical targets from [inventory](../spec/inventory.json): 24 blocks including Core, 16 pawns, 18 control cards and 54 action cards. The [coverage checklist](../spec/knowledge/coverage.json) separately tracks primary evidence, runtime, mirrored tests, sandbox support and gaps.

| Printed English sheet entries | Implemented | Partial | Planned |
|---|---:|---:|---:|
| Blocks: 24 | 11 | 6 | 7 |
| Control cards: 18 | 8 | 2 | 8 |
| Action-card cells/copies: 54 | 16 | 10 | 28 |

These are printed asset rows, not counts of unique executable definitions. The shared mixed corpus currently has 21 block definitions, 12 pawn definitions, 10 control-card definitions and 32 action-card definitions representing 48 declared copies. Provisional pilots and legacy aliases remain, so these totals cannot be subtracted directly from the physical inventory to establish completion. Reconcile actual copies, aliases and classes before accepting the official deck/bundle.

### Blocks still partial or planned

| Printed title | Primary English locator | Coverage |
|---|---|---|
| Hacktivism | sp-en-blocks-a4-p01-c02 | partial |
| Sprawl | sp-en-blocks-a4-p01-c03 | partial |
| Antro | sp-en-blocks-a4-p02-c01 | partial |
| Electromagnetic Pulse | sp-en-blocks-a4-p02-c02 | partial |
| Copyleft | sp-en-blocks-a4-p02-c03 | partial |
| Arms Industry | sp-en-blocks-a4-p06-c01 | partial |
| Cleaner (A) | sp-en-blocks-a4-p06-c03 | planned |
| Armament Research | sp-en-blocks-a4-p07-c01 | planned |
| Cleaner (C) | sp-en-blocks-a4-p07-c02 | planned |
| Cleaner (D) | sp-en-blocks-a4-p07-c03 | planned |
| Freeside | sp-en-blocks-a4-p08-c01 | planned |
| Google ex Machina | sp-en-blocks-a4-p08-c02 | planned |
| Financial Sector | sp-en-blocks-a4-p08-c03 | planned |

Cleaner (B) is implemented. Continue printed order with p6 tile3 Cleaner A, then Armament Research, Cleaner C/D, Freeside, Google ex Machina and Financial Sector. Independently settle the six partial blocks. Arms Industry's funded placement/collection is implemented in both engines and sandbox, but reserve exhaustion still gates its full acceptance.

### Pawn/control-card work

The four starters, Drone MK-2, Drone Probe, Drone Turret and Cleaner B have accepted native records. Idoru/Gynoid remain partial; additional pilot pawn definitions do not establish official physical coverage. The following control-card rows still need acceptance, including the pawn or block behavior they own:

| Printed title | Primary English locator | Coverage |
|---|---|---|
| Cleaner A | sp-en-control-cards-p01-c03 | planned |
| Financial Sector | sp-en-control-cards-p01-c07 | planned |
| Cleaner D | sp-en-control-cards-p01-c08 | planned |
| Cleaner C | sp-en-control-cards-p01-c09 | planned |
| Cracker | sp-en-control-cards-p02-c01 | planned |
| Idoru | sp-en-control-cards-p02-c02 | partial |
| Gynoid | sp-en-control-cards-p02-c03 | partial |
| Drone Hulk | sp-en-control-cards-p02-c05 | planned |
| Automata | sp-en-control-cards-p02-c06 | planned |
| Google ex Machina | sp-en-control-cards-p02-c09 | planned |

Financial Sector's hand-size rule and Google ex Machina's deck search/selection/shuffle remain explicit missing families. Cleaner variants, Cracker, Drone Hulk and Automata need their exact printed attributes, costs, copies, special effects and integration tests. Verify the correct pawn/control-card matching rather than reusing a generic pilot definition.

### Action deck and shared mechanics

Finish the remaining printed cells in sheet order within their mechanic families. Each needs printed movement/ability strips, slots, class eligibility, costs, restrictions, timing, copies and complete typed effects; no executable prose parsing. Keep [frozen provisional data](../spec/fixtures/provisional-v1/) separate from replacement source data.

The main unresolved rule gates are:

| Gap | Required resolution / implementation |
|---|---|
| T-RULES-004 | Simstim Record's temporary Bonus lifetime, withdrawal, invested counters and cleanup cascades. Movement cancellation alone is implemented. |
| T-RULES-005 /003 /035 | Source-backed simultaneous phase-effect ordering and composition, including Gynoid plus attachment effects. Single-effect execution does not settle ordering. |
| T-RULES-007 /026 | Underfilled mandatory discard and accepted all-player Sprawl commitment/timing policy. Sufficient-hand examples already run. |
| T-RULES-008 | Jetpack move-versus-placement reading against threats and the resulting combat timing. |
| T-RULES-010 /009 | Sacrifice/prevention interactions and simultaneous replacement order; full lifecycle exceptions beyond supported Dummy attack/Black ICE windows. |
| T-RULES-011 /022 | Printed starting-player rolls, tied-high treatment, seat order, exact full setup and physical marker accounting. Current names are supplied in starting-seat order. |
| T-RULES-014 | EN/ES conflict on stacking multiple free ability activators. Single free sources work; multiple-free Delete is deliberately rejected. |
| T-RULES-015 | Spammer self-discard and the lifetime of its continuing Add-on prohibition through takeover/elimination/re-entry. |
| T-RULES-021 /019 | Physical action-card copy identity through deck/hand/discard/reuse, and the lifetime of a marked attached card after discard/redraw. Existing retained metadata prevents unsupported reset/reuse. |
| T-RULES-023 /025 /006 | Idoru marker removal/refill/reacquisition and its interaction with Hacktivism. Current common-card marker retention is experimental. |
| T-RULES-027 | Antro target scope, stopping/zero-step/placement/relocation boundaries and threat priority. Supported optional discard paths already execute. |
| T-RULES-029 | Electromagnetic Pulse global sacrifice order, retained-pawn selection and Dummy composition. |
| T-RULES-030 /031 /047 | Finite reserve exhaustion or partial fulfillment for Bonus allocation/awards. Copyleft and Arms Industry run funded cases; strict official construction remains gated. |
| T-RULES-012 /013 | Remaining attachment exceptions, voluntary discard, non-move budgets and source class-bearing content; Gentleman Loser's Block attachment and Cracker placement. |

An ambiguous interpretation needs its evidence, proposed reading, rationale, affected behavior and dependency recorded in the owning rule module. Do not silently implement a convenient ruling or clear provisional flags to bypass a strict gate. Continue independent components while a ruling is open.

## Shadowraiders

All 24 block, 18 control-card and 54 action-card asset rows remain planned for source-to-runtime acceptance. Primary-source review/catalog entries are available, but are not promoted executable content. The current shared control-card and mission files are empty shells; a reviewed Guard combat profile and generic threat combat tests cover only a small slice.

Required work includes:

- Complete the 16 pawns, 24 threat tokens, drones, mercenaries, action cards and mission records with exact copies, attributes and source locators.
- Implement Central Core02, standard starter/setup composition and direction rolls.
- Finish threat/drone activation, retaliation, stealth prohibitions and out-of-turn/joint-attack composition, including Turret permissions.
- Implement mercenary acquisition, all defense/ICE modifiers and expansion-specific costs/rewards.
- Add mission progress, legal mission actions and targets, tags/marks, cargo, counters, medals and special pawn/reward acquisition.
- Provide source-defined player reveals, hidden mission information and sandbox controls for every required decision.
- Prove a standard ordinary-setup match to the printed victory condition with shared snapshots, ordered events, conservation and replay.

See the [Shadowraiders rule modules](rules/shadowraiders.md) and [source inventory](../spec/inventory.json). A schema shell or mode metadata is not an executing system.

## Every official mode still needs acceptance

| Mode, in delivery order | Remaining completion gate |
|---|---|
| Speedrunners | Complete sourced corpus/deck/control cards, accepted interpretations, official setup and ordinary match-to-victory evidence. |
| Shadowraiders | Complete expansion components, Core02/threat/mission/medal systems, standard setup and victory. |
| Total War | Validated combined component recipe, prescribed Core composition, player/setup diagrams and all sourced end conditions. |
| Strategic Alliance | Team membership, shared team resources/ownership rules, setup composition and team victory/loss behavior. |
| Cyber-Revolution | Exact combined-component/setup recipe, special mode behavior and every end condition. |
| Chaos | Source-prescribed solo opponent state/actions, direction/activation behavior, setup and all solo victory/loss paths. |
| Outbreak | Its own sourced solo-opponent behavior, required pieces/setup and complete victory/loss paths. |
| Total War–Chaos | Exact combined mode recipe, multiple-Core/team/solo composition where prescribed, and all relevant win/loss outcomes. |

The eight modes are registered in inventory/metadata. Existing mode-profile loaders are not the planned validated mode-bundle composition/setup/end-condition executor. Finish matching Go/TS mode-bundle loading, registered setup/end handlers and requirement validation. Do not ignore unsupported mechanics or substitute a generic control-marker race for a mode's printed end condition.

## Remaining engine and sandbox integration

- Add explicit mission progress, team/shared-resource state and solo-opponent state as their sourced systems arrive; include them in cloning, snapshots, views and replay.
- Extend typed Action and AvailableActions/availableActions for missions, reactions, teams and solo turns. Preserve the authorized responder on every pending decision and leave state/RNG unchanged during previews.
- Extend sandbox controls for those actions, source-defined reveals and each mode's setup/end loop. Verify hotseat privacy, recovery, replay and Undo for new decision windows.
- Keep expansion content additive through shared definitions, typed handlers and validated mode recipes. Retain compatible entry points where practical; version incompatible source semantics/checksums clearly.
- Complete physical card/piece/counter/marker conservation across all official recipes, depleted piles, occupied destinations, duplicate costs and elimination/cleanup interactions.

Network hosting, native clients, polished visuals and audio/device integration remain later. Physical/social instructions should be explicit informational effects; choosing music does not require an audio integration.

## Evidence needed to close the full goal

For every component/rule: primary evidence → rule module → schema/data → both engines → equivalent legal/rejection/timing/cost/cleanup tests → accessible sandbox decisions → coverage update. Keep backlog, parity, compatibility matrix, provenance and generated knowledge aligned.

For every mode: an ordinary sourced setup to victory, plus applicable loss/team outcomes, shared golden snapshots and ordered events through intermediate choices/combat, physical conservation, preview/RNG invariance and browser replay/recovery evidence. The local verification recipe already runs the repeatable engine/type/docs/spec/source/frozen/browser checks; add the missing official-mode traces and assertions to those checks. Passing existing fixtures does not close an unimplemented rule.

The goal can be called complete only when every official record/rule has verified evidence and tested execution, every registered mode reaches its own sourced end conditions, and every required decision is accessible through the engine and sandbox. Any unresolved provisional gate prevents a full-completion claim.

## Open rule-task index at this checkpoint

The exact live descriptions and current status remain in [BACKLOG](../tasks/BACKLOG.md):

- T-RULES-047: Arms Industry physical block Bonus counter.
- T-RULES-035: Gynoid native beginning theft.
- T-RULES-030: Copyleft global bonus award.
- T-RULES-031: physical bonus supply and icon counters.
- T-RULES-029: Electromagnetic Pulse global sacrifice.
- T-RULES-027: Antro optional stop effects.
- T-RULES-019: physical ability markers through ownership and attachment changes.
- T-RULES-021: discarded attached-card use-marker lifetime and full physical copy reuse.
- T-RULES-003: phase effects and pending decisions.
- T-RULES-009: source lifecycle and elimination prevention.
- T-RULES-010: prevention/sacrifice and simultaneous replacement order.
- T-RULES-011: complete official setup procedure.
- T-RULES-022: starting-roll ties.
- T-RULES-023: complete Idoru pawn/control-card behavior.
- T-RULES-025: settle Idoru marker repeat/lifecycle before Hacktivism.
- T-RULES-012: attachment class/slot lifecycle.
- T-RULES-015: Spammer self-discard and persistent Add-on prohibition.
- T-RULES-014: resolve once-per-turn ability stacking conflict.
- T-RULES-013: Gentleman Loser and block-attachment placement.
- T-RULES-007: mandatory discard with an underfilled hand.
- T-RULES-008: Jetpack relocation against threats.
- T-RULES-026: Sprawl all-player discard acceptance.
- T-RULES-006: replace revoked page-one block interpretations.
- T-RULES-005: resolve simultaneous phase-effect ordering.
- T-RULES-004: resolve Simstim counter lifetime.
