# Local Speedrunners rules sandbox

## Outcome

The Windows `start-play.bat` launcher runs the local host independently of a
chat terminal session and checks `/api/play/health` before launching a duplicate.
Every session projection includes a cloned `recoveryTrace` of confirmed
commands. Host identities prevent session-id reuse after restarts. A structured
`session-expired` response permits one restore-and-retry; uncertain network
failures preserve the last confirmed state and expose **Reconnect** without
automatically replaying an action. Ordinary local saves use the returned trace
directly, avoiding a second request between command acceptance and saving.

`tools/block-editor` serves `/play/`, a local Speedrunners hotseat quick match
and a separate Test Lab. The browser never reads the filesystem or changes canonical
content. It receives a render-safe projection from the Bun host; the host loads
the shared data and executes the TypeScript mirror in isolated in-memory
sessions.

Quick matches use the explicit provisional four-marker profile adopted in
[ADR-0005](adr/0005-local-quick-match.md), making victory possible with the
current seven-block corpus. Official Speedrunners keeps its 10/8/6 allotment.
Network play, accounts, Shadowraiders, and public hosting remain outside this
workstream. Browser-local replay saves resume after reload or host restart;
explicit export/import remains available.

## Test Lab

The setup screen offers both standard seeded sessions and clearly labeled Test
Lab fixtures. Fixtures arrange deterministic legal reducer state only so a user
can immediately exercise current implemented action families: game basics,
search/movement, combat/control, attachments, bonus economy, typed effect
execution, and reboot/turn flow. They never write `spec/` and do not claim
that provisional Speedrunners content is source-complete. The host also serves
a shared coverage map so `/play/` can say explicitly which slices are runnable
now and which authored/modelled slices are still pending.

## Contract

- A session is `{ playerNames, seed, accepted commands }`; it can be reset,
  replayed, undone, exported, and imported deterministically.
- A standard trace remains `zaibatsu-speedrunners-trace/v1`: setup, accepted
  phase/action command log, and a checksum over local Speedrunners data inputs.
  A Test Lab trace is `zaibatsu-speedrunners-trace/v2` and additionally carries its scenario id so import
  reconstructs the same fixture before replay. An import with a different
  checksum, unknown fixture, or stale command is rejected before replay.
- Engine transitions return structured events (`phase-advanced`, accepted
  action, roll, draw, bonus creation/collection, pawn placement, elimination,
  control change, winner, or validation failure). UI text is presentation only;
  it never parses engine messages.
- The CSS tactical board is the guaranteed rendering path. A local,
  checksum-pinned artifact may be layered behind it when available through the
  existing artifact endpoint; missing artwork is silent and harmless.

## Local play flow

1. Enter 2–4 names and a seed, then click **Start quick match**. It opens
   directly in the action phase. The objective is four controlled blocks.
2. The guided-action selector groups reducer-legal choices by family: basics /
   turn flow, movement, search / placement, combat, icebreaker / control,
   attachments, bonus economy, typed effect execution, and reboot.
3. The selector prefers a legal Search when the active hand can pay for it.
   Choose its shown direction/rotation, then execute it to add the top block
   from the pile to the Cybernet.
4. The **Game basics** fixture earns the final marker through a card
   Icebreaker on a guaranteed-ICE fixture block. Standalone marker placement
   is rejected by the live API in every session.
5. **End turn** records a pass, runs implemented recycle bookkeeping, resolves
   end, and enters the next player's action phase. A handoff curtain hides that
   player's cards until **I'm ready**. Full printed recycle discard choices and
   pawn upkeep remain pending. Individual phases are available in diagnostics.
6. A hex-moving pawn (currently the Yellow Speedrunner in the base data) gets
   only directions that contain a placed neighboring block. Once-per-turn
   `steps`/`d6`/`2d6` pawns receive a guided path builder backed by the
   server's non-mutating adjacency projection. Fixed paths show their exact
   budget; dice paths show their maximum while the actual seeded roll remains
   engine-authoritative on submission. A movement-valued card gets the same
   path builder with its printed fixed budget and is discarded only after the
   engine accepts the path.
7. Coverage panels on the setup screen and in a live session keep the sandbox's
   current runtime scope explicit: implemented action families, bonus economy,
   typed effect execution, and attachment resolution are shown separately from
   the still-pending broader effect registry, non-move ability-use work, and
   source-complete content coverage.

## Acceptance gate

The full sandbox acceptance claim is allowed only when Speedrunners has
complete supported-action coverage, accepted source/data readiness, and green
Go/TS golden fixtures. Until then this route is an engineering/debug surface
for the current implemented subset; it must not imply source-complete gameplay.

Before closing the workstream, run `bun tools/validate-docs.ts`,
`bun tools/verify-artifacts.ts`, `bun tools/validate-spec.ts`, the Bun suites,
the Go suites, and `cd tools/block-editor; bun run test:play`. Install the local
browser once with `bun run install:playwright`. Keep the transition/event API
and its tests mirrored; see
[the parity contract](parity.md) and [the lifecycle](lifecycle.md).

## Interface ownership

The Go and TypeScript engines own phase transitions, structured transition
events, action validation, and canonical snapshots. `tools/block-editor/play.ts`
owns only local session orchestration and trace replay. `/play/` owns browser
rendering and guided input. `DOCS/parity.md` records the cross-language mapping;
`tasks/BACKLOG.md` owns the remaining ordered readiness work.

## Real-match verification

`golden/quick-match.trace.json` replays seed 101 from ordinary setup through
Search, paid Icebreaker, movement, recycle, and an earned four-block victory.
Both mirrors assert the same `golden/quick-match.snap`. Browser tests exercise
card selection, board paths, handoff, save/resume, copy-aware Reboot input, and
the real-control fixture win. Full source-complete acceptance remains open.

Select a card or runner to filter available actions. Highlighted board spaces
build movement paths; full spaces can be crossed but cannot be endpoints.
Search displays a placement preview. Public Delete reveals dice before assignment,
including repeated targets for concentration. Legacy Split Delete remains in Test Lab. Reboot selects four physical
hand entries, preserving duplicate copies. Match events accumulate across
turns and show combat rolls. Victory freezes live actions and phase advances.
Coverage and snapshots sit behind diagnostics; Test Lab sits behind the setup
disclosure. Browser-local saves carry the mode and exact content checksum.

## Tabletop delivery and expansion boundary

The live client now offers perspective and top-down cameras, source-art standees,
a hand dock, action-family controls, a played-card zone, and explicit recycling.
The board uses the same clockwise printed edges as movement and Search.
The Guard encounter in Test Lab exercises Shadowraiders awakening, a response,
public Delete assignment and fixed retaliation. Canonical Guard combat data
comes through the same validated sidecar loader in both languages.

T-PLAY-002 includes all seven Shadowraiders modes and the combined variants.
This wave does not close that item: mission state/rewards, complete source
component transcription, solo AI, face-down boards and team marker pools still
need implementation and mode-specific full-match acceptance.

## Source-foundation integration gate

Expose the canonical starter/card slice through a separate Test Lab scenario using `AvailableActions` templates and actor-aware movement previews. Keep the board explicitly synthetic and source status independent of geometry fixtures. Preserve historical quick-match traces with the frozen corpus and bind canonical traces to a separate checksum including control-card data. Test card restrictions, step budgets, replay, query isolation, and the searchable checklist in the browser. Simstim's counter lifetime remains unresolved rather than silently simulated.

The Beginning-turn choices fixture verifies Toxin's required physical-card choice, disabled phase bypass, pending replay and undo. A canonical pending choice is always rendered before ordinary action controls. Multiple-effect ordering remains an explicit rejected provisional combination.


The Electric Sheep, Jetpack and Insider Trading Test Lab scenarios use the canonical phase cards with explicitly synthetic hands/decks. Destination controls consume engine query targets; required discard controls select physical hand indices. Replay/undo retains pending windows, and browser tests exercise all three flows. Canonical Jetpack excludes unresolved threat destinations; underfilled Insider hands remain a source gap rather than a bypass. Broader phase/reaction and mode integration stays open.


Choice, discard and relocation events now have explicit readable log entries. Phase events preserve a discard even if recycling immediately draws that card back. Browser checks verify the new log entries alongside the destination/card controls; physical-copy checkboxes keep each label beside its checkbox.


The Dummy fixture exercises a defender-owned response during the attacking player's turn using engine-supplied response actions. It replays/undoes pending prevention, keeps ordinary controls blocked and displays a readable prevention event. Its attack/defense setup is explicitly synthetic; the attached Dummy is canonical/provisional. Source piece/card zones are visible under Match history, including the corrected removed-from-match starters. This does not certify a complete official setup or deck.


The inspector's Classes row comes from the engine helper, with browser coverage for Biochip/E-Synapse. Block-card and on-attach authoring preserve source intent without bypassing the unsupported-resolution gate. Historical Typed effects fixture wording now makes its revoked printed triggers explicit.

The action-card form now separates Target classes (accepted existing classes) and Forbidden target classes (any match excludes). Own Card classes remain grants to the pawn; these are not target restrictions. Validation/export retains the exclusions. The Test Lab's **Malware target restrictions** fixture offers printed Worm, Under Clocker and Hijacker only against an explicitly synthetic non-Operative target; the two ordinary starters remain ineligible. Reset to try another card. Engine-derived target filtering, gained Malware display, rejected operative requests, replay and undo are covered by host/browser acceptance. Provider-dependent slots and cleanup cascades now execute under SR-CARD-011; remaining component exceptions stay T-RULES-012.

The **Granted slots and cleanup** Test Lab scenario uses explicitly synthetic cards. Choose the native Gadget slot or the provider's Gadget slot in the Action selector (labels show the attachment path); then attach the Weapon/Module chain. End both players' turns and start Ada's next action phase to run the provider's beginning self-discard and dependent refunds. The inspector's Slots row shows engine-owned available/occupied locations. Source attachment options now send `slotRef`; they do not infer placement on the client. Replay and undo preserve it. Source checksums include the v2 slot-rules stamp; older source traces report a data/rules-version mismatch, while historical quick-match traces keep their original checksum. This fixture does not promote unfinished Gunhed/weapon/module content.

The **Gunhed, weapons and Delete activations** Test Lab fixture starts with printed Gunhed, AK-12kM and Servocanon plus an explicitly synthetic Gadget-to-Module adapter. Attach all four, use the free public roll, resolve its three dice, then choose a matching card for another roll. The defender has synthetic fully shielded faces for repeatability. Engine options distinguish paid and free activations; the inspector shows printed skulls and activation badges. A multiple-free-badge conflict is labeled unresolved, with no guessed free option. Export/import, pending-roll replay, costs and undo are covered by host/browser tests. In the card editor, Printed Delete skulls and Printed Delete activation are independent fields: leave activation at Strength only for AK-12kM. Do not also add a legacy Grant Delete/ability-use encoding. Servocanon's multiple-free interaction remains T-RULES-014.

During command submission, passing and recycling, action selectors and inputs are disabled along with buttons. This prevents a selection made against an old action list from being silently replaced by the pending response. The printed weapon browser sequence exercises consecutive attachments and both activation routes.

The **Virus attachment takeover** Test Lab fixture uses printed Virus against a pawn with a clearly synthetic Cleaner class. Attach it to the offered extra Add-on slot, then inspect the four discarded cards, pawn/control-card transfer and Bea's four refunded counters. This does not promote a Cleaner pawn record. The **Lima Flag movement restriction** fixture starts with Lima Flag on Ada's pawn on a synthetic board. Movement options exclude entering Central Core while allowing the other tile; direct invalid submissions reject and replay/undo preserve state. The editor now offers `gain-target-control` with the attachment-time trigger and a **Cannot move onto Central Core** checkbox. Such operations are separate from a card's movement or ability strip. Unsupported placement/relocation interpretations remain explicitly gated.


The **Ability markers follow control** Test Lab scenario uses a synthetic Cleaner/free-movement target that has already spent its use. Attach Virus, inspect **Used abilities**, then advance both turns to Ada's beginning to clear the now-controlled marker. Options, inspector allocations and mark/clear/retained events come from the engine. Export/import and undo preserve marker state; prior source-v4 checksums reject. Marked discarded attachments retain unresolved evidence, shown as an inspector notice; affected reattachment is unavailable. This does not adopt a discard/reset ruling or promote the synthetic pawn. T-RULES-021 owns that remaining lifecycle and full deck/hand physical-copy identity; T-RULES-020 now completes the independent zero-step activation rule; continue source-ordered printed components.


The **Spend movement without taking a step** Test Lab fixture gives Ada synthetic free fixed movement on the isolated Central Core. Select that movement and execute with no steps to spend its marker; select **Play Uplink: Move 1** and execute with no steps to spend one of two physical Uplink cards. The status explains that current-space finish spends the activation. Fixed/card actions now use engine-owned options, including zero allowance and isolation. Preview, replay and undo preserve both costs and RNG; empty source movement does not awaken threats. The frozen quick-match controls retain their old one-step minimum. Source protocol v6 invalidates earlier source checksums. T-RULES-020 is complete; continue source-ordered independent components while T-RULES-021 remains unresolved.


The **Toyeku and neutral Idoru** Test Lab fixture uses the real first block. Play DJ: Search, place the revealed tile, then use Dummy's two steps to enter the Idoru pawn space and move onto **defense**. Idoru stays uncontrolled with its card in common; the runner's inspector now shows vulnerable face1 while the block keeps ICE3/4/6. All placement/option/profile data comes from the engine, with replay/undo and neutral journal wording. The fixture explicitly leaves Idoru's own pawn abilities provisional.

In the block editor, **Non-playable title / art zones** accounts for source regions with no gameplay space. Toyeku excludes h1; do not add a phantom center space. Select the **defense** modifier and author each **Defense face** as unchanged, black/shielded or white/unshielded, rather than entering a numeric amount or ICE modifier. The **place-neutral-pawn** effect requires its matching pawn-space id/target on placement. Save/load and patches retain both fields. Geometry helpers respect excluded zones; explicit seven-zone prefill and Clear all reset exclusions. Source protocol v7 rejects earlier source checksums; frozen quick-match traces stay compatible.


Selected tile inspection keeps its source artwork visible under the hit target; current block metadata includes non-playable zones. Pawn inspector entries retain a **Provisional · full rules pending** label when their data is incomplete, including Idoru. A verified spawning block does not remove that label from its pawn.

### Idoru marker integration checkpoint

The Idoru control-card marker Test Lab fixture uses canonical source data and an explicit one-marker staged victory setup. Existing engine-owned Icebreaker controls trigger acquisition; inspector and common/control-card zone panels display public physical allocations, corrected pawn ICE and special instruction. Structured marker-return/placement events, victory, trace recovery and undo are exercised in browser/host tests. Source-v8 invalidates earlier source semantics. Unresolved repeat placement and same-owner common-card reacquisition remain provisional SR-PAWN-004/T-RULES-025; no official match is accepted by this fixture.

Sprawl delivery: engine-owned pending block decisions hold authorized private physical-card commitments, with public required/submitted status and deferred discard events. The local hotseat panel asks the first outstanding player; the engine/public player query can serve either owner's own decision without exposing the other's selection. Pending placement, partial/final commitments, recovery/replay and undo are covered by host/browser acceptance. A separate source-arrow fixture shows the reverse link withheld until Octagon is attached. Global timing/shortfalls and Hacktivism marker removal remain explicit provisional dependencies; source protocol is v9.

Antro delivery: optional effect-space family authoring and exact physical response controls now retain engine decisions through save/load, replay, recovery and undo. Acting Icebreaker attributes have separate card fields and pawn inspector summaries. Source-v10 versions this behavior. T-RULES-027 keeps target scope/stop/threat interpretation provisional; official match completion and other mode controls remain pending. See SR-SPACE-001 and SR-CARD-018.

Electromagnetic Pulse delivery adds typed minimum-controlled-pawn authoring, owner-scoped pawn sacrifice buttons, public batch selections, separate unresolved-target explanations and selection events. Pending public choices survive player views, replay/recovery/undo and editor save/load/export. The synthetic worker distinguishes retained Reboot cleanup from reserve/common release. Source-v11 versions this slice; SR-BOARD-011/T-RULES-029/010 remain partial and official mode gates stay open.

Copyleft delivery adds a typed all-player reserve award, physical icon counters, public pool summaries and funded-orientation previews. The sandbox demonstrates allocation before awards, investment and collection at empty reserve with replay/recovery/undo; the editor retains the placement effect through save/load/export. EKO artwork is a normal double space, not a pawn prerequisite. Source-v12 versions the state/resource semantics; T-RULES-030/031 and full mode acceptance remain open.

### Clandestine Broadcast Reboot destinations

The **Clandestine Broadcast Reboot destinations** Test Lab stages a controlled printed tile and a retained starter. Choose **Play Uplink: Reboot at Clandestine Broadcast** or the original **Central Core** destination, then execute. Matching-card and four-card actions name their destination directly from engine options. Reboot consumes the selected physical payment and returns the retained pawn to the large special space. Export/import, recovery, Undo and Reset preserve or restore destination and costs. The fixture stages control/elimination and does not represent a full official match.

Author **controller-core** under **Effect under control**, target the id of an **unlimited special** space, and leave amount/threshold empty. Keep **Central Core** identity false for Broadcast; it must remain a normal controllable block in the pile. Save/load/export retain the descriptor; validation rejects missing/non-special targets and placement timing. Changed source content changes trace checksums; historical frozen traces retain their original corpus.

### Pink District and Gynoid

In **Pink District and controlled Gynoid placement**, play DJ to Search, place Pink District, use Fast Uplink to enter its Gynoid space and play Worm to Icebreak the block. Tile placement leaves Gynoid in reserve; capture places and controls her on the matching unlimited space. Inspector data shows her exact ICE, defense, card movement and beginning effect. A repeat capture uses the same pawn, with takeover cleanup/refunds; source victory stops further effects immediately.

In **Gynoid beginning-of-turn theft**, block/pawn control is staged. Start the action phase to open the beginning decision. Choose **Decline theft** or an engine-supplied pawn/controller target; one physical hand card is selected only after acceptance. A friendly target is permitted; empty hands are unavailable. Player-view responses and histories hide card identity from unrelated viewers unless it was already publicly revealed at transfer. The Test Lab is a trusted operator view. Export/import, recovery and Undo retain the pending decision and deterministic result. Simultaneous beginning order remains provisional T-RULES-005.

Author Pink District's **place-controlled-pawn** under **Effect under control**, target `gynoid`, and provide exactly one matching pawn space. Do not use the neutral placement trigger or the first open space. Save/load/export retain the descriptor; validation checks timing and matching home. Source-v13/native-phase-theft changes trace checksums; frozen historical sessions keep their original corpus and behavior.

Yakuza SR-BOARD-015 adds engine-owned adjacent target/decline buttons and the subsequent defender's permitted prevention panel. Search, placement, movement and capture reach the choice through ordinary commands; replay/recovery/undo/reset retain both windows. Readable attack-target receipts precede roll history. This does not accept ordinary full-game setup/victory. Source traces use v14/adjacent-block-attack.

Corporate Scandal SR-BOARD-016 adds a focused Search-to-capture scenario with physical tile/Idoru marker holdings staged. Existing engine actions and public discard receipts expose mandatory whole-hand resolution without an invented choice. Played payment remains outside hand; replay/recovery/undo/reset preserve results. Source protocol v15/marker-hand-discard and prior-v14 rejection are verified; ordinary full-mode acceptance stays open.

Black Clinic's engine-owned mandatory global pawn buttons expose all physical attachment cleanup/refunds and current hand-space recycling. Public profiles show base/cards/spaces/maximum without changing state/RNG or revealing private identities. Search/capture, choice, refill-to-four, replay/recovery/undo/reset and editor save/load/export are verified as focused mechanic evidence. T-RULES-021 spent-card redraw remains visible; source protocol/checksum is v16/global-pawn-detachment. Full official modes remain unaccepted.

Engineering War / Drone MK-2 adds a source-backed Search-to-deployment/native-movement/public-Delete scenario. It uses existing engine options and source metadata, including two-entrance rotation, exact matching home, native five-step use and paid assignment. Replay/recovery/undo/reset preserve costs, physical records and the public roll. Inspector data shows exact native attributes/Module slot. The focused fixture and Servocanon single-free interaction do not accept full modes or T-RULES-014/021. Current source checksum is v17/engineering-mk2.

Combat Prototypes / Drone Probe adds source Search-to-capture followed by free Search and independent free movement. Existing engine options expose four entrance rotations, hidden-safe eligibility and post-reveal placement with no second payment. Browser/host acceptance exercises pending trace export/import, recovery, Undo, reset and separate physical use markers. The fixture is partial official content; Sprawl/EMP/Servocanon/used-card gaps and all full modes remain separately gated. Current source checksum is v18/probe-free-search.

Military Development / Turret integrates typed out-of-turn ability permission with a private controller handoff, engine-owned available options, authorized public roll/assignment and unchanged active player/phase. Public pawn ownership determines handoff availability, not private card eligibility. Owner labels and controller-specific recycling preserve face-up cards. Trace import disables stale controls while its restored view loads. Source Search/capture, pending public roll, replay/recovery/Undo/reset and physical owner metadata are tested. Checksum is v19/any-turn-abilities; full setup/content/modes and separate threat/used-card gaps remain open.

Arms Industry exposes a held physical block counter as a board badge and public inspector receipt. Engine-derived supply labels include all board counters. Its focused staged formation proves icon-before-block allocation/collection at empty reserve, actual Search/capture and replay/recovery/Undo/reset. The provisional reserve-shortage gate stays visible; no full mode acceptance follows. Source checksum is v20/block-bonus-counters.

The browser author-approval test supplies synthetic vision candidates, and the tile-layering test supplies a synthetic SVG. These UI checks therefore run without ignored local OCR/artwork caches in a fresh checkout. Source geometry/rule verification remains in the primary-evidence workflow; these fixtures do not certify artwork identity.
