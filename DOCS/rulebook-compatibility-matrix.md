# Rulebook compatibility matrix

This matrix maps the two authoritative English rulebooks to the current source,
documentation, spec/data, engine, and tooling coverage in the repository. It
is the working compatibility ledger for full-stack delivery.

## Scope

- Source authority:
  - `DOCS/rules/transcripts/speedrunners-rulebook.en.md`
  - `DOCS/rules/transcripts/shadowraiders-rulebook.en.md`
- Structured rules:
  - `DOCS/rules/speedrunners.md`
  - `DOCS/rules/shadowraiders.md`
- Executable shared data:
  - `spec/data/speedrunners/`
  - `spec/data/shadowraiders/`
- Mirror engines:
  - `impl/go/`
  - `impl/ts/`
- Local operator tooling:
  - `tools/block-editor/`

## Status meanings

- `implemented`: source-backed and executable in both mirrors.
- `partial`: some source-backed coverage exists, but the full rulebook behavior
  or full content corpus is not yet closed.
- `planned`: modeled or documented target only; not yet delivered as compatible
  behavior.

## Topic matrix

| Topic | Speedrunners source | Shadowraiders source | Rules docs | Shared data/spec | Go | TS | `/play/` / tools | Current status |
|---|---|---|---|---|---|---|---|---|
| Setup and victory | full transcript | full transcript | `DOCS/rules/speedrunners/setup-and-victory.md`, `DOCS/rules/shadowraiders/setup-and-components.md` | `spec/data/speedrunners/mode.json`, `spec/data/shadowraiders/modes.json` | yes (base) | yes (base) | yes (base) | `partial` |
| Board growth and placement | full transcript | full transcript | `DOCS/rules/speedrunners/board-and-movement.md`, `DOCS/rules/shadowraiders/setup-and-components.md` | Speedrunners blocks live; Shadowraiders block data still pending | yes (base) | yes (base) | yes (base) | `partial` |
| Movement and phase flow | full transcript | full transcript | `DOCS/rules/speedrunners/turns-and-actions.md`, `DOCS/rules/shadowraiders/pawns-threats-and-combat.md` | Speedrunners base movement, explicit attachment-granted movement activation, granted-move `perTurn` / `d6` budgets, and granted stealth reporting are live; mode-specific movement remains pending | yes (base) | yes (base) | yes (partial) | `partial` |
| Combat and elimination | full transcript | full transcript | `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`, `DOCS/rules/shadowraiders/pawns-threats-and-combat.md` | Speedrunners targeted combat, concentrated multi-target dice, Bomb-class area attacks, and typed block `area-attack` dispatch are live; public rolls, joint attacks and fixed threat retaliation execute; Chaos combat remains pending | yes (base) | yes (base) | yes (base) | `partial` |
| Icebreaker and control | full transcript | full transcript | same as above | ICE faces, black-ICE penalties, attachment/space ICE modifiers, and the typed `place-pawn` capability now resolves in regression scenarios; the revoked page-one block pilot rules still require replacement; exact source-backed ICE data and Shadowraiders control variants remain pending | yes (base) | yes (base) | yes (partial) | `partial` |
| Attachments and card costs | full transcript | inherited + expansion additions | `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`, `DOCS/rules/shadowraiders/missions-modes-and-symbology.md` | attach schema/data live; Speedrunners bonus-counter costs/pay-refund flow now execute; Shadowraiders mission costs remain incomplete | yes (partial) | yes (partial) | yes (partial) | `partial` |
| Currency and rewards | bonus counters | threat tokens, medals, mission rewards | `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`, `DOCS/rules/shadowraiders/missions-modes-and-symbology.md` | Speedrunners bonus-icon creation/collection and spendable bonus counters are live; expansion reward data remains mostly shell-only | yes (base) | yes (base) | yes (partial) | `partial` |
| Threats and event spaces | n/a | full transcript | `DOCS/rules/shadowraiders/pawns-threats-and-combat.md` | Guard profile reviewed; finite event deployment, activation, post-roll assignments, retaliation, recovery and collection execute; remaining corpus pending | yes (partial) | yes (partial) | Guard Test Lab | `partial` |
| Stealth movement | n/a | full transcript | `DOCS/rules/shadowraiders/pawns-threats-and-combat.md` | schema hooks needed across pawn/card data | no | no | no | `planned` |
| Missions and tags | n/a | full transcript | `DOCS/rules/shadowraiders/missions-modes-and-symbology.md` | `spec/schema/mission-card.schema.json` exists; `spec/data/shadowraiders/missions.json` is still empty shell | no | no | no | `planned` |
| Solo and mixed modes | n/a | full transcript | `DOCS/rules/shadowraiders/missions-modes-and-symbology.md` | `spec/data/shadowraiders/modes.json` exists, but engine support is absent | no | no | no | `planned` |
| Symbology and source interpretation | full transcript | full transcript | all rule modules | schema/data/provenance split exists | partial | partial | coverage-only | `partial` |

## Known source-review hotspots

The [asset review register](artifacts/asset-review.md) now saves individual
visual observations for all English component assets and distinct supporting
print variants: 228 asset records and 557 sheet parts. All originals and
archive members are inventoried and checksum linked. This expands review
evidence, not executable coverage. Spanish record verification, exact block
topology, flagged interpretations and canonical promotion remain open under
T-SOURCE-REVIEW-002; the topic matrix retains its existing partial/planned states.

These pages should not be treated as plain raw-OCR authority; use the linked
page images and reviewed transcript overrides:

- `sp-en-rulebook` p.29
- `sh-en-rulebook` pp.9, 10, 11, 12, 16

Those findings are maintained in:

- `tools/ruletext/review_notes.json`
- `DOCS/rules/transcripts/review-findings.md`

## Delivery implications

The local experimental quick match now has an ordinary-setup to four-block
victory trace asserted by both mirrors. Active-player pawn ownership, paid
card activation, atomic state/RNG rollback, combat roll events, and winner
freeze are enforced by live APIs. The play interface adds card/runner
selection, board paths, placement previews, split attacks, copy-aware Reboot,
handoff, and replay resume. The four-marker profile is provisional
([ADR-0005](adr/0005-local-quick-match.md)); broader phase-triggered effects,
broader effects, exact component data, and Shadowraiders remain open.

To reach full compatibility, the repository must close all of the following:

1. Finish source-complete Speedrunners content and exact-rule data.
2. Replace remaining Speedrunners provisional mechanics with source-backed
   behavior.
3. Fill the Shadowraiders content shells with source-complete records.
4. Complete threat content, cannot-stealth modifiers, missions, medals, and mode framework in both
   mirrors.
5. Keep docs, parity, backlog, and tooling coverage aligned with the real
   executable surface at every step.

Tabletop wave: basic recycle choices and the played/discard distinction are
implemented against Speedrunners p.8/p.31; the earlier general discard-per-pawn
reading was incorrect. Guard is reviewed from Shadowraiders p.21. Mode metadata
remains broader than runtime mode readiness; T-PLAY-002 is still in progress.

T-PLAY-003 repairs local host lifetime and client reconnection. Source coverage
and engine compatibility do not change; transport recovery replays existing
accepted commands through the same reducer.

## Source-foundation acceptance

Canonical Central Core and four starting Speedrunners now have bilingual component evidence and mirrored attribute/setup tests. Page-one Octagon, accelerator and E-Synapse corrections execute; the Simstim movement prohibition executes but its bonus lifetime remains provisional (SR-CARD-006 / T-RULES-004). Control-card ownership currently covers the verified starter slice. These additions do not close the broader partial topics or any expansion mode.

The generated `spec/knowledge/coverage.json` checklist accounts separately for every reviewed asset, governed rule entry and registered mode. `spec/knowledge/implementation.json` supplies explicit tested claims. A source-linked observation alone does not claim an executable rule. Physical print-sheet entries are source-accounting records, not extra gameplay-entity counts.

The previous mixed corpus, schemas and golden evidence are frozen under `spec/fixtures/provisional-v1/`. Historical regression tests and quick matches use that corpus explicitly; the source-foundation Test Lab uses canonical data on a labeled synthetic board.

The initial phase-choice slice now executes single Toxin, Rootkit and Selective Disclosure obligations in both mirrors, with pending-state/event goldens and browser controls. The cards remain provisional: PHASE-EFFECT-ORDER rejects multiple simultaneous obligations pending source interpretation. This does not close broader beginning/end effects or reaction timing.

Direct page-one EN/ES block review revoked the earlier Toyeku/Idoru, Hacktivism and Sprawl/Chiba City pilot interpretations. Their incorrect under-control effects and verified gameplayRefs were removed; actual printed placement effects and topology remain T-RULES-006. These records are provisional. Constructors now reject unimplemented mode setup and end-condition ids; the sandbox rejects official matches while their content remains provisional.

Official constructors refuse provisional records unless the selected mode is explicitly provisional or the caller opts into `Config.AllowProvisional` / `Config.allowProvisional` for a source-review fixture. Unsupported setup and win/loss ids are rejected even with that opt-in. Regression loaders mark their returned mode as experimental in memory; frozen source bytes are unchanged. Historical threat sidecars also support explicit regression loading, and frozen files bypass Git newline conversion to preserve their recorded hashes.


The beginning-card extension adds Electric Sheep sacrifice/draw, Jetpack destination selection and Insider Trading two-copy hand decisions to both mirrors and the sandbox. Shared pending-state/event evidence and interaction tests cover refunds, depleted piles, capacity and combat interruption before bookkeeping. SR-TURN-007 records two additional isolated source gaps: forced-discard shortfall and Jetpack threat activation. These cards and the overall phase family remain partial/provisional; no mode-completion status changes.


The phase extension also verifies ordered operation events through sacrifice/recycling and beginning-phase public combat. Accepting fixed retaliation is exposed by the action query. Unknown phase mechanic definitions fail at construction; the effect list never falls back to prose parsing.


The source-lifecycle/Dummy wave adds reserve versus retained Reboot cleanup, explicit control/common/excluded card zones, and removal of unused starters after bilingual p.5 review. Dummy replacement decisions are available to the threatened controller outside the active turn, with atomic rejections, shared pending/event goldens, physical-piece conservation and sandbox replay. Attack/Black ICE and beginning-retaliation paths execute. Sacrifice replacement, simultaneous protected casualties, class/slot cascades and complete source control-card content remain partial. The official setup row remains partial: the starting-player die procedure has not yet been executed by the engine. These changes do not complete a mode.


Own printed attachment classes now execute and disappear on loss, with shared query evidence and inspector support (SR-CARD-008). A further pilot correction revokes the former Cracker-card/on-Icebreaker interpretation: Gentleman Loser is a Block attachment, remains provisional, and rejects unsupported attachment-time placement. Its ordinary action strip still works without leaking the attachment effect. T-RULES-013 owns block-extension geometry/choices; historical frozen fixtures remain regression evidence only.

SR-CARD-010 adds three bilingual-verified, executable continuous Malware cards: Worm, Under Clocker and Hijacker. Their Operative exclusion is evaluated against effective classes before payment in both mirrors. The shared attachment-restrictions evidence checks intermediate attached state, continuous penalties, separate strip use and takeover cleanup, with sandbox target filtering and replay. Positive target classes now have their intended restriction semantics outside the explicitly frozen corpus. This does not close attachment slot/cascade, other page-two effects, source-corpus or official-match gates.

SR-CARD-011 now executes physical slot identity and provider-dependent cleanup in both mirrors. Native and granted slots of the same type remain separate; multiple matching locations require a real engine-owned choice. Phase self-discard and prevention remove/refund dependent chains without moving them into unrelated free slots. Synthetic sandbox, shared intermediate/cleanup snapshots/events and conservation tests prove this generic rule. Source protocol/checksums advance to v2; frozen evidence is unchanged. Gunhed's complete attributes and cumulative Delete/activation behavior remain open under T-RULES-012; this is not component-family completion.

SR-ABILITY-003 and SR-CARD-012 now execute separate printed skull and activation contributions. Gunhed/AK-12kM are source-verified and tested in both mirrors, including costs, real granted slots, paid/free route independence, cancellation, cleanup and public-roll evidence. SR-CARD-013 Servocanon has a single-free implementation but stays provisional: SR-ABILITY-004/T-RULES-014 records English cumulative versus Spanish noncumulative free-badge wording. The ambiguous route rejects atomically; settled matching-card attacks remain usable. SH-THREAT-003 also corrects source joint combat so only the initiating pawn pays/spends an activation and strength-only participants contribute their skulls. Full game/mode acceptance is unchanged.

SR-CARD-014/015 now execute Virus takeover and Lima Flag Core-entry restrictions across both mirrors, tests and sandbox. Virus validates effective Cleaner class, opposing ownership and empty slot before consuming its card; it discards itself with the previous attachments before control transfer. Lima applies to each movement entry, with distinct occupancy/placement rules and clone-based post-discard relocation previews. Source Enemy attachments reject neutral pawns. Shared snapshots, ordered events, query JSON and conservation/rejection checks prove this slice. Spammer remains unresolved under SR-CARD-016/T-RULES-015; Trojan now executes through the dedicated mirrored player-view contract (SR-CARD-017/T-RULES-016), with hidden-pile counts, responder authorization, conservative historical-draw projection and continuous cleanup. Shared view/event evidence and sandbox perspective/replay tests cover it. Source Search now has committed draw/reveal and authorized placement decisions (SR-BOARD-005/T-RULES-017); authenticated transport remains pending; the local sandbox retains explicit trusted operator diagnostics.

SR-BOARD-005 supersedes the historical SR-BOARD-002 combined-Search summary. Both mirrors now commit activation, draw/reveal the top block and expose a controller-owned placement window. Shared snapshots/events, physical block/card conservation, rejection/RNG isolation, free-use reset and bonus/threat timing prove the generic sequence. Sandbox declarations, revealed previews, replay/recovery trace state and undo are covered. Source protocol/checksum v3 rejects earlier combined-source traces; frozen regression remains unchanged. This does not certify unverified block topology or missing placement effects.

SR-MOVE-003/004 now execute roll-before-path movement and source cannot-move cancellation. Both mirrors expose a public committed roll, exact-budget pure previews and controller-only path/stop decisions, with costs/marker commit, rejection/RNG isolation, occupied pass-through, restrictions and threat/stealth timing. Source fixed card movement options coexist with free movement. Shared snapshots/events and sandbox replay/undo are verified; source protocol v4 rejects earlier semantics. Printed mover/block corpus remains incomplete. SR-MOVE-005 now preserves native control-card and equipped attachment identity under transfer/reindexing, with independent duplicate uses, lifecycle tests, public allocations/events and sandbox capture/reset/replay. Source protocol v5 versions the new shape. T-RULES-021 retains the unresolved discarded-card lifetime/copy-reuse gap: evidence is preserved, affected reattachment rejects and strict official limited-use bundles are gated. SR-MOVE-005/T-RULES-019 stays partial, so no affected official mode is declared complete.


SR-MOVE-006/T-RULES-020 completes the narrow zero-step fixed/card activation rule: costs and limited uses are spent even at zero allowance or without adjacent targets, while cancellation/authority remain enforced and staying put does not awaken threats. Mirrored shared snapshots/events, conservation/rejection/RNG checks, sandbox controls and replay/undo cover it. Source protocol v6 rejects prior source semantics; frozen rejection remains compatible. SR-MOVE-001/002 retain broader movement/content acceptance gaps and SR-MOVE-005 retains T-RULES-021.


SR-BOARD-006/007 now replace Toyeku's revoked pilot with the real four-space ring, non-playable title center, six entrances, three bonus fragments, exact ICE [3,4,6] and neutral Idoru placement on its named space. Its right-hand flat white1 is defense, not ICE. SR-DEFENSE-001 now applies named shielding changes in every pawn combat path through a mirrored profile query; unsupported numeric defense experiments reject. Shared snapshots/events/profiles, physical zones, rejection/RNG checks and sandbox/editor replay/save/load cover this delivery. Source protocol v7 rejects earlier source semantics; frozen evidence remains intact. Idoru's own pawn/card behavior remains provisional under T-RULES-023, and Hacktivism/Sprawl plus full mode content/setup remain incomplete.

### Idoru acquisition and card-marker allocations

Speedrunners now has bilingual-corrected Idoru attributes (classless, defense1 shielded, ICE1/6, card movement, no native abilities, Add-on/Armor) and typed counted card markers in both mirrors. Actual pawn acquisition places a marker, takeover returns the former owner's marker, and a last marker wins immediately. Shared states/events, pure queries, rollback/RNG, public projection and sandbox victory/replay cover these paths under source-v8. Idoru remains `partial`: common-card retention is an explicitly provisional literal interpretation, same-owner marked-card reacquisition rejects, and marker-removal/refill timing remains T-RULES-025. Hacktivism must await that dependency. Full setup, component corpus and mode replay gates remain open.

### Page-one internal arrows and global discards

EN/ES A4 p.1 tiles2/3 now replace the revoked seven-circle pilots with exact five-space rings/title exclusions, double capacities, all six boundaries, ICE2/5/6 or2/4/6, defense2/3 or3 and correct bonus corners. Internal one-way links execute in both mirrors with Octagon exceptions and engine-owned path previews. SR-MOVE-007 has shared/runtime/browser evidence.

Sprawl's placement effect now supports authorized per-player private commitments and deferred public physical discards, including retained controlled pawns. Source views mask selections; snapshots/replay/undo retain them. Shortfalls and unspecified global commitment timing remain T-RULES-026, so the block stays partial. Hacktivism records its actual marker-removal effect and rejects it explicitly pending T-RULES-025. Source-v9 versions these changes; the wider corpus/setup/mode gates remain open.

### Antro and the first printed Gadget

SR-BOARD-010/SR-SPACE-001 implement Antro's verified four-space geometry and optional physical Add-on/Gadget discard window in both mirrors and the sandbox. Source targeting/stop/threat ambiguity remains T-RULES-027, so the full block is partial and strict official loading rejects it. SR-CARD-018 completes the verified Phase-Loop record: acting Icebreaker die+1, Black ICE immunity, controller hand−2, cost1, Cyberdeck/Gadget, one copy and two-step/Icebreaker strip. Mirrored behavior/rejection/cleanup tests and the shared Antro golden cover the delivery. Source protocol v10 isolates changed traces; full54-card deck composition, remaining content and all mode acceptance gates stay open.

### Electromagnetic Pulse

SR-BOARD-011 corrects the p2 tile2 observation: six single ring spaces/title exclusion, ICE4/5/6, bonusV1/V2/V3/V4/V6, h3→h2 arrow and flat unshielded defense2. Shared threshold2/amount1 data triggers owner-authorized pawn choices. Both mirrors and the sandbox cover public commitments, deferred seat-order cleanup, retained Reboot versus reserve/common release, attachment/refund conservation, rejection/RNG, recovery/replay and strict official gates. Full component acceptance remains partial under T-RULES-029/010 for simultaneous timing, retained selection and prevention. Source-v11 isolates changed traces; official modes remain incomplete.

### Copyleft and physical bonus counters

SR-BOARD-012 verifies Copyleft's real four-space graph, defense4, h3→h4 arrow, own ICE2/3/6 and bonusV1/V2/V5. EKO is artwork on a normal double space, with no new pawn prerequisite. Its typed all-player reserve award follows p15 icon allocation. SR-BONUS-001 implements24-counter source accounting across reserve, free, invested and on-icon locations, including guarded awards, collection transfers, refunds, public pure queries and funded placement previews. Mirrored byte snapshots/events, rejection/RNG/conservation tests and sandbox/editor traces cover this slice. Source-v12 isolates changed state/checksums; frozen regression remains explicit. Both rules stay partial for reserve exhaustion/partial-fulfillment under T-RULES-030/031; full setup/content/mode gates remain open.

### Clandestine Broadcast

SR-BOARD-013 implements the bilingual p3 tile1 component and continuing controller Core permission, distinct from physical Core identity. Both mirrors support explicit Reboot destinations across matching-card, four-card and synthetic free activation, preserving costs, ownership, rejection/RNG and ordinary graph/defense/capacity. Shared byte snapshots/options/events, Search/capture/victory interactions, sandbox destination controls/replay/undo and editor save/load/export cover the delivery. No setup/content/deck or whole-mode gap is closed by this focused component. Existing source-v12 commands remain compatible; changed content checksum rejects older source inputs. Frozen regression remains unchanged.

### Pink District and Gynoid

SR-BOARD-014 implements Pink District's bilingual geometry, ICE2/6, bonusV1/V5, arrow, matching unlimited pawn home and repeated under-control placement. Existing-pawn takeover relocates the one physical piece, discards/refunds old-owner attachments and transfers its card; same-owner relocation preserves them. Immediate final-marker victory stops further block effects. SR-PAWN-005 corrects Gynoid's card move, no native Search, Lovedoll, slots, defense and exact ICE2/3/4/5. Her single optional native beginning theft executes with pure target/decline queries, physical duplicate-weighted RNG, private transfer events, event-time public Trojan reveal and deferred marker cleanup.

Mirrored byte evidence, rejection/conservation/timing/control/victory interactions and sandbox/editor replay/undo/save/load cover this delivery. Gynoid full composition stays partial under T-RULES-005 simultaneous ordering; strict native official construction gates it independently of provisional flags. Source-v13 versions the queue/events and invalidates older source checksums. Full pawn/card/deck/setup and official mode acceptance remain incomplete.

## Yakuza p4 tile1 delivery

| Rule / component | Source evidence | Execution and UI evidence | Remaining gate |
|---|---|---|---|
| SR-BOARD-015 / Yakuza | EN/ES blocks p4 tile1 and rulebooks pp12–14/18/21–23/38; one physical tile, explicit graph/arrows/white defense/ICE/corners | Ten mirrored tests, golden/yakuza.json, target-before-one-skull roll, literal adjacent friendly/neutral pawns, decline, effective defense, single-defender prevention, cleanup/refunds, repeat takeover, immediate victory; sandbox/editor replay/recovery/undo/save/load | Component implemented; no full official-mode acceptance. Wider Dummy/simultaneous/native phase gaps retain their existing owners. |

Current source protocol/checksum: source-v14 / source-v14/adjacent-block-attack. Frozen regression remains unchanged. Continue printed order at p4 tile2 after its dedicated primary-source verification.

## Corporate Scandal p4 tile2 delivery

| Rule / component | Source evidence | Execution and UI evidence | Remaining gate |
|---|---|---|---|
| SR-BOARD-016 / Corporate Scandal | EN/ES blocks p4 tile2 and rulebooks pp8–10/12–14/18/28/38; Idoru counted-marker card | Eleven mirrored tests; golden/corporate-scandal.json; exclusive physical marker threshold, paid-card timing, all remaining hands, duplicates, empty hands, takeover, defense/ring geometry and immediate victory; sandbox/editor replay/undo/save/load | Component implemented; Idoru's separate removal/reacquisition gaps and all full-mode acceptance remain open. |

Current source protocol/checksum: source-v15 / source-v15/marker-hand-discard. Frozen regression is unchanged. Printed order continues p4 tile3 Black Clinic after source verification.

## Black Clinic p4 tile3 and hand-space delivery

| Rule / component | Source evidence | Execution and UI evidence | Remaining gate |
|---|---|---|---|
| SR-BOARD-017 / Black Clinic | EN/ES blocks p4 tile3, rules pp12–14/18/31–33/35/38; exact graph/capacity/arrow/defense/ICE/corners | Twelve mirrored tests and golden/black-clinic.json; mandatory global pawn choice, all-card cleanup/refunds, benefits/reveal, empty targets, takeover and immediate victory; sandbox/editor persistence/replay | Component implemented; discarded spent-card redraw remains T-RULES-021, with evidence retained and reattachment gated. |
| SR-TURN-008 / current hand-space profile | EN/ES rules pp8/13/31/38 and Black Clinic minus1 | Mirrored pure public profiles, attachment/space aggregation, current-controller/leaving behavior, four-card refill, frozen compatibility; visible sandbox limit | Occupancy reading/rationale recorded in the module; complete official content and modes remain open. |

Current source protocol/checksum: source-v16 / source-v16/global-pawn-detachment. Continue printed order at p5 tile1 after dedicated primary-source verification; saved titles/observations remain supporting evidence only.

## Engineering War p5 tile1 and Drone MK-2 delivery

| Rule / component | Source evidence | Execution and UI evidence | Remaining gate |
|---|---|---|---|
| SR-BOARD-018 / Engineering War | EN/ES blocks p5 tile1, rules pp12–18/21/23/33/38; three-space/two-entrance topology and documented teal-glyph artwork reading | Existing shared controlled placement, exact geometry/ICE/white defense/corners, repeat takeover/relocation and victory stop; mirrored tests and sandbox/editor persistence | Component implemented; complete official corpus/setup/modes remain open. |
| SR-PAWN-006 / Drone MK-2 and card | EN/ES control p2c4, EN pawn p2 folded unit2; rules pp18/20–26/30/33/35/38 | Twelve mirrored tests and golden/engineering-war.json; native five-step/card fallback, one-skull paid public combat, Module costs, ownership/marker timing, elimination/common reserve and cleanup; sandbox replay/undo | Native record implemented; Servocanon's separate T-RULES-014/021 interactions stay provisional. |

Current source protocol/checksum: source-v17 / source-v17/engineering-mk2. Continue p5 tile2 after primary verification. No complete official mode is accepted.

## Combat Prototypes p5 tile2 and Drone Probe delivery

| Rule / component | Source evidence | Execution and UI evidence | Remaining gate |
|---|---|---|---|
| SR-BOARD-019 / Combat Prototypes | EN/ES blocks p5 tile2, rules pp12–18/21/23/33/38; five spaces, four entrances, exact ICE/bonus and excluded artwork | Existing controlled placement and ownership cleanup, physical guards and victory stop; mirrored tests, source Search/capture and editor save/load | Component implemented; complete official corpus/setup/modes remain open. |
| SR-PAWN-007 / Drone Probe and card | EN/ES control p2c7, EN pawn p2 folded unit3, rules pp15/18/20–27/30/33/35/38 | Thirteen mirrored tests and golden/drone-probe.json; free reveal-before-placement Search, separate native movement/markers, pure hidden-safe previews, Module/free Delete constraints and cleanup; sandbox replay/undo | Native record implemented; separate Sprawl/EMP/Servocanon and used-card interpretation gaps stay provisional. |

Current source protocol/checksum: source-v18 / source-v18/probe-free-search. Next printed block is p5 tile3, Military Development; verify its Drone Turret dependency and permitted turn exceptions before promotion. No complete official mode is accepted.

## Military Development p5 tile3 and Drone Turret delivery

| Rule/component | Primary evidence | Mirrored execution and UI | Remaining gate |
|---|---|---|---|
| SR-BOARD-020 / Military Development | EN/ES blocks p5 tile3; rules spaces/control/hand-symbol pages | Three spaces, hand+1, only E2/E5 entrances, ICE4/6 at V5, five fragments; physical matching deployment/cleanup/victory; Search/capture/editor persistence | Implemented component; full corpus/setup/modes remain open. |
| SR-PAWN-008 / Drone Turret | EN/ES control p2c8; EN pawn p2 separate unit8; rules pp18/20/24/26/28/30/33/35/38 | Typed any-turn ability permission, paid one-skull Delete, no movement, Module/free use, exact faces/ownership, authorized public assignment/private handoff/replay | Native record implemented; Shadowraiders joint-threat composition and T-RULES-014/021 remain separate. |
| SR-TURN-009 / played-card controller | EN/ES p8; p20 Turret, p24 indivisible movement | Parallel public physical owner allocation, source phase-independent payment, own-only recycling and duplicate conservation;13 equivalent tests per mirror and golden/drone-turret.json | Implemented owned played zone; attached marked-card lifetime/copy reuse remains T-RULES-021. |

Current source protocol/checksum is source-v19 / source-v19/any-turn-abilities. Continue printed block p6 tile1 after verifying its actual source title/mechanics and pawn/card prerequisites. No ordinary full official mode is accepted.

## Arms Industry p6 tile1: funded implementation, explicit acceptance gap

| Rule/component | Primary evidence | Implemented and tested | Acceptance gap |
|---|---|---|---|
| SR-BOARD-021 / Arms Industry | EN/ES block p6 tile1; spaces/counter/Black ICE/hand rulebook pages | Four-space chain, storage/title exclusions, exact entrances/ICE/fragments/hand−1, paired counter effects and sandbox/editor support | T-RULES-031/047 reserve exhaustion; record remains provisional and strict official construction rejects. |
| SR-BONUS-002 / counter on a block | EN/ES p6 tile1 placement/control text; physical reserve/counter rules pp6/16–18/35 | Shared public allocation/receipt, combined placement funding, existing-piece transfer at empty reserve, conservation, snapshots/views,11 mirror tests and golden/arms-industry.json | No invented partial award or replacement-counter rule; full source acceptance remains gated. |

Current protocol/checksum: source-v20 / source-v20/block-bonus-counters. Continue independent printed block p6 tile2 Cleaner B, verifying its pawn/control card and geometry first; resolve the separate reserve-policy gate before claiming Arms Industry complete.
