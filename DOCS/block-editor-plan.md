# Standalone game-data editor plan

## Outcome

Build a local-first editor for Zaibatsu source-derived game data. The implemented
surfaces are a **block editor** and an **action-card editor**: each opens a
selected source crop beside a structured draft, validates it, and exports an
explicit review patch. They run without either engine and never mutate canonical
game data without an explicit export action.

The same workspace later manages action/control cards, pawns, markers, threats,
missions, Chaos material, and modes.

## Product boundary

| In scope for the first release | Explicitly not in scope |
|---|---|
| Browse checksum-pinned block assets | Running game effects or turns |
| Create/edit structured block drafts | Replacing Go/TS data loaders |
| Edit spaces, edges, boundary spaces, ICE, effects and provenance | Automatic OCR treated as authoritative |
| Validate records and references before export | Writing original PDFs/artwork into Git |
| Export reviewable patches and a validation report | Directly publishing a verified record |

The editor is a **content-authoring tool**. It can produce a draft or a
source-linked proposed update; the existing spec validator and source-review
process decide whether a record becomes verified.

## Standalone architecture

```text
local source PDFs / ignored extracted images
                    |
        spec/assets/manifest.json (read-only input)
                    |
       editor session (*.editor.json, draft working state)
                    |
  +-----------------+------------------+
  | asset browser / canvas              | inspector / form |
  | crop + source locator + annotations | block fields     |
  +-----------------+------------------+
                    |
       validation report + explicit export patch
                    |
       spec/data/** + provenance (human-reviewed commit)
```

Use a small TypeScript/Bun web application under `tools/block-editor/`. The
authoring surfaces have no engine imports and read files only through a
deliberately narrow local bridge: asset manifest, session document, source
catalog, and chosen data bundle. The same host also serves the separate
`/play/` rules sandbox; only its in-memory server module imports the TypeScript
engine, and it never writes canonical data. Editor writes remain limited to the
user-selected session/export path. This keeps the tools desktop-local and
portable to a browser-hosted shell later. The host now also owns a shared
coverage catalog so the block editor, action-card editor, and `/play/` surface
the same current scope and pending gaps.

## First-screen layout

```text
+----------------------+--------------------------------+---------------------------+
| Assets               | Block canvas                   | Inspector                 |
| filter: Speedrunners | [ rendered block image ]       | identity / ICE / effects  |
| [thumb] p01-c01      | [ hex-boundary overlay ]       | spaces / edges / bonuses  |
| [thumb] p01-c02      | [ source crop + mask toggle ]  | provenance / validation   |
| [thumb] p01-c03      |                                |                           |
+----------------------+--------------------------------+---------------------------+
| Drafts | diagnostics | undo/redo | Save session | Export patch |              |
+---------------------------------------------------------------------------+
```

Core interactions: select a cut asset; create/reopen its draft; enter the
block identifier and data; click a hex edge or space overlay to edit its
relationship; attach a source locator/note; validate continuously; save the
session; export a JSON patch only after validation.

## Editor data lifecycle

1. **Import** validates `spec/assets/manifest.json` and source checksums.
2. **Draft** is stored in a separate `*.editor.json` session document.
3. **Validate** checks the draft against the block schema, asset references,
   duplicate IDs, six-edge completeness, boundary-space references, and
   provenance completeness.
4. **Export** creates a deterministic patch/report; it does not alter
   `spec/data` silently.
5. **Review and merge** transcribes the patch into canonical data, runs
   repository validators, and changes provisional/verified status only with
   source evidence.

## Capability ladder

| Phase | Deliverable | Exit condition |
|---|---|---|
| 0 - contracts | Session schema, example draft, UX/design record | Data lifecycle and acceptance tests agreed |
| 1 - block MVP | Standalone local UI, asset browser, form editor, session save | **Implemented:** a block draft can be created, reopened, validated and exported |
| 2 - block geometry | Hex canvas, six entrances, bonus corners, and source-positioned spaces | **Implemented for print layout:** a fitted source-aligned pointy-hex canvas renders without nested scrolling. HexVision geometry aligns tile vertices, entrances, and corners; the standardized 2-3-2 lattice supplies gameplay zones, 1-N mappings, display shapes, and inferred candidate adjacency. Runtime step movement remains a source-transcription and engine follow-up. |
| 3 - source workflow | Provenance locator forms, review report, draft/verified gating | Reviewer can trace every exported field to source evidence |
| 4 - generic resources | **Structured action-card authoring implemented**; add pawn/marker schemas and shared plug-ins | One shared editor shell manages all core resource types |
| 5 - import helpers | Optional OCR/image-assisted suggestions | **Implemented for blocks:** selected/all HexVision suggestions can prefill review-only drafts; bulk work skips existing drafts and never promotes data automatically. |

## Export contract

An export has three deterministic files:

- `*.patch.json` - requested `add` / `replace` operations against a named
  canonical data bundle;
- `*.report.json` - validator results, asset IDs, source checksums, and field
  provenance;
- `*.editor.json` - the retained editable draft/session.

Export operations must include `baseDataSha256` and reject a changed target
bundle. This prevents a stale editor session from overwriting a newer
transcription.

## Acceptance criteria for the block MVP

- Loads the 48 individually cut English block assets: 24 Speedrunners and 24
  Shadowraiders.
- Shows source artifact, page, crop, and polygon mask for the selected block.
- Creates an unsaved draft without touching `spec/data`.
- Rejects invalid IDs, missing expansion, more/fewer than six edges, invalid
  boundary-space IDs, missing asset IDs, and missing primary provenance.
- Persists/reopens a session without loss of values or undo history.
- Exports a stable patch/report and detects changed target data.
- Has keyboard-first save/validate/export controls and clear validation
  messages; image-only editing is never the sole source of game data.
- The action-card surface browses both English decks, creates source-linked card
  drafts, exposes the current structured card fields directly through authored
  controls, validates them independently of blocks, and exports review-only
  patches/reports.

## Delivery order

The block and action-card vertical slice is complete. Next, finish
source-review gates, add pawn/marker resource plug-ins, and keep exported
patches review-only. Keep the shared coverage catalog current whenever block,
card, or `/play/` scope changes. Do not add records to the Go/TypeScript
engines until exported data has passed the existing source/provenance review.

The typed card form now preserves `attach.attackModifier` as an integer Delete
skull modifier; both engines add it automatically with source space modifiers.

## Source-foundation integration

The action-card editor retains typed arrow exceptions and step modifiers. The shared coverage endpoint includes the generated rule/component checklist. Canonical promotion remains governed by source, mirrored test and provisional-status gates; editor capability alone is not runtime completeness. See the operator README for the current source-foundation scenario and fields.

Typed Turn effects authoring now covers beginning/action-end discard-self, discard-hand and discard-or-sacrifice obligations. The schema and both domains retain them. Full effect ordering is not implied by editor support.


The beginning-card extension preserves positive draw/discard amounts and optional relocation threat semantics through the typed form/model/schema. A browser test checks form refresh retention and a model test checks exports/rejection. These controls are authoring capabilities; unresolved Jetpack/Insider interpretations stay provisional under SR-TURN-007.


The typed prevention toggle round-trips through form refresh/export and model validation. It only declares a registered handler; the engine opens a controller-owned response when elimination is attempted. Authoring and the shared coverage panel retain Dummy's provisional interpretation gaps.


Printed Block card type and typed on-attach effect timing are preserved by form/model/schema. Gentleman Loser uses these as provisional source intent; actual block placement/space selection remains T-RULES-013 and cannot silently execute the old Icebreaker pilot.

The action-card form now separates Target classes (accepted existing classes) and Forbidden target classes (any match excludes). Own Card classes remain grants to the pawn; these are not target restrictions. Validation/export retains the exclusions. The Test Lab's **Malware target restrictions** fixture offers printed Worm, Under Clocker and Hijacker only against an explicitly synthetic non-Operative target; the two ordinary starters remain ineligible. Reset to try another card. Engine-derived target filtering, gained Malware display, rejected operative requests, replay and undo are covered by host/browser acceptance. Provider-dependent slots and cleanup cascades now execute under SR-CARD-011; remaining component exceptions stay T-RULES-012.

The **Granted slots and cleanup** Test Lab scenario uses explicitly synthetic cards. Choose the native Gadget slot or the provider's Gadget slot in the Action selector (labels show the attachment path); then attach the Weapon/Module chain. End both players' turns and start Ada's next action phase to run the provider's beginning self-discard and dependent refunds. The inspector's Slots row shows engine-owned available/occupied locations. Source attachment options now send `slotRef`; they do not infer placement on the client. Replay and undo preserve it. Source checksums include the v2 slot-rules stamp; older source traces report a data/rules-version mismatch, while historical quick-match traces keep their original checksum. This fixture does not promote unfinished Gunhed/weapon/module content.

The **Gunhed, weapons and Delete activations** Test Lab fixture starts with printed Gunhed, AK-12kM and Servocanon plus an explicitly synthetic Gadget-to-Module adapter. Attach all four, use the free public roll, resolve its three dice, then choose a matching card for another roll. The defender has synthetic fully shielded faces for repeatability. Engine options distinguish paid and free activations; the inspector shows printed skulls and activation badges. A multiple-free-badge conflict is labeled unresolved, with no guessed free option. Export/import, pending-roll replay, costs and undo are covered by host/browser tests. In the card editor, Printed Delete skulls and Printed Delete activation are independent fields: leave activation at Strength only for AK-12kM. Do not also add a legacy Grant Delete/ability-use encoding. Servocanon's multiple-free interaction remains T-RULES-014.

The **Virus attachment takeover** Test Lab fixture uses printed Virus against a pawn with a clearly synthetic Cleaner class. Attach it to the offered extra Add-on slot, then inspect the four discarded cards, pawn/control-card transfer and Bea's four refunded counters. This does not promote a Cleaner pawn record. The **Lima Flag movement restriction** fixture starts with Lima Flag on Ada's pawn on a synthetic board. Movement options exclude entering Central Core while allowing the other tile; direct invalid submissions reject and replay/undo preserve state. The editor now offers `gain-target-control` with the attachment-time trigger and a **Cannot move onto Central Core** checkbox. Such operations are separate from a card's movement or ability strip. Unsupported placement/relocation interpretations remain explicitly gated.

The **Trojan face-up hand** Test Lab fixture starts with Trojan in Ada's hand and two private cards in Bea's. Attach Trojan to Bea's offered pawn, then read the face-up hand in the hand dock. Under **Save, replay & Test Lab → What each player can see**, choose Ada, Bea or Spectator to inspect a read-only engine projection. Spectators get no action options; revealed cards do not grant action permission. Undo hides Bea's hand again; import a confirmed fixture trace to restore the reveal. The card editor adds **Controller plays with hand face up**, retained in validated/exported `controllerHand: face-up` data.

The hand dock uses the authorized responder's projected hand; displayed events use projected history. The dedicated `GET /api/play/sessions/:id/player-view?viewer=p1` endpoint returns only `{view, events}`. Omit the viewer for a spectator. No hidden pile identities, seed or recovery trace appear there. Search declaration options omit hidden-tile placement previews; source Search decisions now execute through the declaration/placement flow described below. This local host still serves trusted operator session/replay endpoints without authentication. The diagnostics snapshot is labeled as including hidden cards. It is not an authenticated multiplayer host.

The **Search draw and placement** Test Lab fixture uses canonical cards with an explicitly synthetic one-entrance tile. Choose **Play DJ: Search** and execute: DJ is discarded once, the top block is revealed and phase/action controls wait. Choose **Revealed block placement** to preview an engine-approved edge/rotation, then **Place revealed block**. Undo restores the pending tile first, then the declaration; exporting/importing at either window preserves it. A rejected response retains the same tile and cost. The engine owns all response ids; do not infer legal placements from the remaining face-down pile.

All source Search actions now declare before revealing. Historical quick-match fixtures retain combined placement. Source states/checksums use protocol v3; older source traces fail with a data/rules-version error, while frozen quick-match traces remain compatible. The dedicated player-view endpoint publishes the pending `revealedBlock` to every viewer and placement responses only to its authorized controller. Unsupported provisional block effects fail explicitly and remain source-review work; the synthetic fixture does not promote a printed block.

The **Roll before movement** Test Lab fixture gives Ada an explicitly synthetic two-die movement ability and a synthetic three-space board. Select **Roll 2d6: Move…** to commit/reveal the dice before any path controls appear. The decision shows the actual allowance. Add occupied space **b**: Finish movement stays disabled, but you may add **c** to pass through and end legally. An empty selection finishes without moving and still spends the activation. Other actions/phase controls wait. Export/import and Undo restore the committed roll separately from the finished move; rejected paths cannot reroll it. Spatial locations in this synthetic board separate the pawns visually and do not claim printed topology.

Source movement previews reject die-path requests before declaration and use the engine-owned exact budget afterward. Public player views expose the roll/budget; only its responder receives options. Fixed card movement is independently offered for free movers. Native/attached cannot-move cancellation blocks those routes, while explicit placement remains distinct. Current source state/checksum protocol is v7; previous source traces fail clearly, and frozen quick-match traces remain compatible. Physical native/equipped marker continuity now executes under T-RULES-019; discarded-card lifetime remains T-RULES-021.


The **Ability markers follow control** Test Lab scenario uses a synthetic Cleaner/free-movement target that has already spent its use. Attach Virus, inspect **Used abilities**, then advance both turns to Ada's beginning to clear the now-controlled marker. Options, inspector allocations and mark/clear/retained events come from the engine. Export/import and undo preserve marker state; prior source-v4 checksums reject. Marked discarded attachments retain unresolved evidence, shown as an inspector notice; affected reattachment is unavailable. This does not adopt a discard/reset ruling or promote the synthetic pawn. T-RULES-021 owns that remaining lifecycle and full deck/hand physical-copy identity; T-RULES-020 now completes the independent zero-step activation rule; continue source-ordered printed components.


The **Spend movement without taking a step** Test Lab fixture gives Ada synthetic free fixed movement on the isolated Central Core. Select that movement and execute with no steps to spend its marker; select **Play Uplink: Move 1** and execute with no steps to spend one of two physical Uplink cards. The status explains that current-space finish spends the activation. Fixed/card actions now use engine-owned options, including zero allowance and isolation. Preview, replay and undo preserve both costs and RNG; empty source movement does not awaken threats. The frozen quick-match controls retain their old one-step minimum. Source protocol v6 invalidates earlier source checksums. T-RULES-020 is complete; continue source-ordered independent components while T-RULES-021 remains unresolved.


The **Toyeku and neutral Idoru** Test Lab fixture uses the real first block. Play DJ: Search, place the revealed tile, then use Dummy's two steps to enter the Idoru pawn space and move onto **defense**. Idoru stays uncontrolled with its card in common; the runner's inspector now shows vulnerable face1 while the block keeps ICE3/4/6. All placement/option/profile data comes from the engine, with replay/undo and neutral journal wording. The fixture explicitly leaves Idoru's own pawn abilities provisional.

In the block editor, **Non-playable title / art zones** accounts for source regions with no gameplay space. Toyeku excludes h1; do not add a phantom center space. Select the **defense** modifier and author each **Defense face** as unchanged, black/shielded or white/unshielded, rather than entering a numeric amount or ICE modifier. The **place-neutral-pawn** effect requires its matching pawn-space id/target on placement. Save/load and patches retain both fields. Geometry helpers respect excluded zones; explicit seven-zone prefill and Clear all reset exclusions. Source protocol v7 rejects earlier source checksums; frozen quick-match traces stay compatible.

Internal-arrow delivery: author/inspect/persist Block.spaceArrows as directed adjacent gameplay-space links, independent of legacy edge Direction. Frontend and model validation reject dangling, non-adjacent, self and duplicate/reverse links. Save/load/patch tests preserve them; geometry replacement clears them for review. The corrected Hacktivism/Sprawl ring data remains provisional for global effect acceptance rather than being promoted by editor export.

Antro delivery: optional effect-space family authoring and exact physical response controls now retain engine decisions through save/load, replay, recovery and undo. Acting Icebreaker attributes have separate card fields and pawn inspector summaries. Source-v10 versions this behavior. T-RULES-027 keeps target scope/stop/threat interpretation provisional; official match completion and other mode controls remain pending. See SR-SPACE-001 and SR-CARD-018.

Electromagnetic Pulse delivery adds typed minimum-controlled-pawn authoring, owner-scoped pawn sacrifice buttons, public batch selections, separate unresolved-target explanations and selection events. Pending public choices survive player views, replay/recovery/undo and editor save/load/export. The synthetic worker distinguishes retained Reboot cleanup from reserve/common release. Source-v11 versions this slice; SR-BOARD-011/T-RULES-029/010 remain partial and official mode gates stay open.

Copyleft delivery adds a typed all-player reserve award, physical icon counters, public pool summaries and funded-orientation previews. The sandbox demonstrates allocation before awards, investment and collection at empty reserve with replay/recovery/undo; the editor retains the placement effect through save/load/export. EKO artwork is a normal double space, not a pawn prerequisite. Source-v12 versions the state/resource semantics; T-RULES-030/031 and full mode acceptance remain open.

### Optional controller Core authoring

SR-BOARD-013/T-RULES-032 adds `controller-core` under-control descriptors with an explicit unlimited special-space target. The editor retains the descriptor through save/load/export and validates target/type/capacity/timing separately from the physical Core identity checkbox. The sandbox reads executable Reboot destination actions from the mirrored engine contract; it does not infer a Core from prose or mutate setup identity. Model, host and browser evidence covers both surfaces.

T-RULES-033 fixes a browser-discovered card-authoring race: validation rereads the current form before rendering, ignores obsolete requests or a changed draft, and rejects export when the validated input has changed. A delayed-response browser test edits a Delete activation while export validation waits, verifies retention and no stale export, then validates again. This is authoring-state protection; it does not change a game rule.

### Controlled pawn placement and native phase decisions

T-RULES-034/035 adds `place-controlled-pawn` under-control authoring with exact matching pawn home and separate neutral-placement semantics. Shared source checks validate the physical pawn/control-card cross-reference; editor model checks timing/home and save/load/export retention. Pink control and Gynoid beginning-theft sandbox scenarios use engine actions, pending responses and events. Native effect meaning appears in the pawn inspector. Player payloads remain distinct from the trusted Test Lab; transfer identities follow event-time reveal. Host and browser evidence covers private choice recovery and controlled placement. Gynoid phase composition is still provisional.

Yakuza authoring adds typed adjacent scope and optional-choice fields beside the under-control skull amount. Export/save/load preserve them; model/source validation reject unsupported timing/scope/targets rather than parsing prose. Browser evidence covers persistence. SR-BOARD-015/T-RULES-037 and ADR-0022 own actual behavior.

Corporate Scandal authoring adds a positive exclusive `markerThreshold` to the typed under-control whole-hand effect. The **More than Cybernet markers** field survives save/load/export. Semantic/model/engine validation rejects wrong trigger and extra amounts/targets. Exact component semantics remain in SR-BOARD-016, domain/parity and ADR-0023.

Black Clinic adds mandatory Cybernet pawn scope for all-attachment under-control discard. Authoring keeps scope and absence of optionality through save/load/export and validates special/unlimited capacity plus signed hand-space modifiers. Operator docs and browser/model/source tests cover the surface. Actual semantics and occupancy rationale live in SR-BOARD-017/SR-TURN-008, domain/parity and ADR-0024.

Engineering War source authoring verifies existing controlled-placement target support for Drone MK-2 with a central h1 pawn home, four excluded title/effect zones and only two side entrances. Model/source/browser tests retain the exact matching target, geometry and save/load/export. No new schema fields or executable prose interpretation is introduced. Source decisions remain SR-BOARD-018/SR-PAWN-006 and their domain/parity owners.

Combat Prototypes authoring uses the existing controlled-placement target `drone-probe`, central h1 unlimited matching home, h2/h4/h5/h7 singles, excluded h3/h6 and four E2/E3/E5/E6 entrances. Source/model/browser persistence tests retain exact geometry and target through save/load/export. Artwork creates no arrows/modifiers. No new schema fields or prose-driven handler is introduced; canonical decisions remain SR-BOARD-019/SR-PAWN-007 and domain/parity.

Military Development/Turret authoring retains the existing controlled-placement target, three-space matching home/hand+1 geometry, excluded title/effect zones and two entrances. Model/source/browser save/load tests prove target/patch support; no prose parsing is added. Canonical timing/card-owner behavior is SR-PAWN-008/SR-TURN-009 and ADR-0025, not editor policy.

Arms Industry authoring adds typed place-block-bonus(amount1) and collect-block-bonus as a required placement/control pair, with no extra target/cost/optional policy. Model/source/browser persistence tests cover save/load/export and reject malformed pairing. Center storage remains non-playable; canonical model/acceptance policy is SR-BOARD-021/SR-BONUS-002 and ADR-0026, including the strict reserve-shortage gate.
