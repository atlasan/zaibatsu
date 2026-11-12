# Zaibatsu Game Data Editor

A standalone, local-first editor for source-linked Zaibatsu content. The
current shipped surfaces are the **block editor** and the **action-card
editor**; their shell and session contract remain intentionally reusable for
cards, pawns, markers, threats, missions, and modes later.

It also serves a local Speedrunners hotseat quick match and Test Lab at `/play/`. Match
state is held in memory, uses the TypeScript engine on the local server, and
never writes canonical `spec/` data.
All three local surfaces now share an explicit coverage map from the host, so
the block editor, action-card editor, and `/play/` describe the same authored
and runnable scope instead of relying on implied support.

## Run it

For play on Windows, run `start-play.bat` from the repository root. It starts a
hidden background host that survives the launching terminal, or keeps the
existing healthy host. Open `http://localhost:4173/play/`. Startup logs are
`tmp/play-server.stdout.log` and `tmp/play-server.stderr.log`.

The play page retains a recovery trace with every confirmed response. An
expired host session is restored from that trace before retrying its rejected
request. A network failure is never automatically replayed: **Reconnect**
restores the last confirmed moves, then lets you choose the action again.

First ensure the local block images exist:

```powershell
.\tools\refresh-artifacts.ps1
```

Then start the editor:

```powershell
cd tools\block-editor
bun run dev
```

Open `http://localhost:4173`.

From the repository root on Windows, `run-editor.bat` is the same command.
Use `run-sandbox.bat` to start this host for the Speedrunners sandbox and open
`http://localhost:4173/play/`. Both launchers restart the local listener on
port `4173`; use `stop-local-server.bat` to stop it without starting another.

The sandbox setup screen includes standard seeded play plus a **Test Lab** of
clearly labeled deterministic fixtures. Fixtures are local reducer tests, not
source-complete games; their v2 traces recreate the same fixture on import.
Current fixture coverage includes game basics, search/movement, combat/control,
attachments, bonus economy, typed effect execution, and reboot/turn flow.

For browser regression coverage, install Chromium once and run:

```powershell
cd tools/block-editor
bun run install:playwright
bun run test:play
```

## What it does now

- Browses all 48 individually cut English blocks: 24 Speedrunners and 24
  Shadowraiders.
- Shows the extracted source image alongside the selected asset/source IDs.
- Creates and edits a source-linked block draft with the current block contract:
  exact ICE faces and Black ICE, central-core status, typed block effects,
  directional and modifier-bearing spaces, source-aligned entrances, bonus
  corners, calibrated seven-zone gameplay-space selection, and provenance.
- Fits each source block and its overlay into the available work area without
  nested scrollbars. HexVision geometry drives its six source vertices, corners,
  and entrance controls when available; the canonical layout is the fallback.
  Each block uses seven standardized point-up placement hexes in a source-aligned 2-3-2 arrangement (`h2 h3 / h7 h1 h4 / h6 h5`). A gameplay space selects one or more zones; finite capacity defaults to selected-zone count, while special/pawn spaces default to unlimited. Source circles, capsules, pills, and large locations are display metadata, not new gameplay types. A `circle` defaults to one zone; a `capsule` spans two contiguous zones like a pill; `large / special` is unlimited and grows across one or more connected hexes.
- Validates draft structure and cross-references before saving or export.
- Saves editable sessions under ignored `.sessions/` and exports ignored
  `exports/*.patch.json` + `*.report.json` files.
- Includes the target data file's SHA-256 in every patch, so a stale draft
  cannot be applied over changed canonical data unnoticed.
- Carries optional session-only knowledge hints (tags / relation hints) through
  export metadata so review can promote them into `spec/knowledge/` without
  leaking them into runtime records by accident.
- Shows the current block-editor coverage alongside the current `/play/`
  runtime coverage so authored fields and runnable rule support stay visibly
  aligned.
- Offers a deterministic **Prefill 7 zones** starting point, **Clear all** for
  editable block content, and review-required HexVision application for the
  selected source or all sources. Bulk HexVision creates drafts only where one
  does not already exist and reports skipped/unavailable assets.

The editor never writes `spec/data` itself. Review and apply exported patches
through the normal source/provenance workflow. Canonical status, source links,
asset links, and doc relations are finalized when reviewed changes land in
`spec/data/`, `spec/provenance/`, `spec/assets/manifest.json`, and the
generated `spec/knowledge/` outputs.

## Tests

```powershell
bun test
```

See [the editor plan](../../DOCS/block-editor-plan.md) for the next phases,
including richer space topology and resource-type plug-ins.

## Action-card workflow

The editor now also browses source-linked `action-card` assets for both English
editions. It loads HexVision as **zone-attributed review evidence**: title,
slot/type banner, action strip, attachment, main-face badges, and rule text
produce confidence-tagged candidates. Each candidate must be individually
accepted or rejected; the structured authoring UI directly covers identity,
action-part movement/options, direct card effects, attachment fields, grants /
removes, granted movement, granted slot/stealth, ICE modifiers, draw/hand
modifiers, block-space shape, triggers, and custom text.
Bulk Vision creates fresh review drafts only and never overwrites an existing
draft. Perceptual/OCR similarity can suggest physical copy groups, but only an
author confirmation derives `copies` from source asset IDs. Deck checks catch
duplicate IDs, cross-game groups, duplicate source ownership, missing
provenance, unresolved review data, and unconfirmed groups before the editor
exports one review patch/report per expansion. Shadowraiders retains explicit
`targetAbsent` handling until its canonical target exists. Existing v1 block
sessions are accepted and saved as v4 data-editor sessions.
The action-card editor also shows the shared coverage map so the authored
`ActionCardRecord` contract and the current `/play/` runtime subset are visible
together.

## Separate authoring surfaces

Run the shared local server once:

```powershell
bun tools/block-editor/server.ts
```

- Block layout editor: `http://localhost:4173/`
- Action-card editor: `http://localhost:4173/action-cards/`

The block editor receives only `kind: "block"` manifest entries and retains the
2-3-2 seven-hex placement tools. The action-card editor receives only
`kind: "action-card"` entries. It records a physical-copy group as explicit
asset IDs, derives `copies` from that group, stores source transcription only
in the local review session, and exports normalized gameplay fields plus a
concise source-reviewed summary. The structured preview shown in the inspector
is derived/read-only; normal authoring happens through direct controls, not raw
JSON editing. Both interfaces serve UTF-8 HTML/JSON and never promote an
OCR/vision suggestion without reviewer confirmation.

The block authoring screen exposes an explicit **1–N space → zone mapping**: h1–h7 each map to one gameplay space, while a gameplay space may own one or more physical zones. The seven calibrated zone anchors follow the source circles; outer tile points, entrances, corners, and artwork remain independent geometry.

## Speedrunners tester

`/play/` is a local reducer-backed tester for the current implemented
Speedrunners subset. It groups guided actions by basics/turn flow, movement,
search/placement, combat, icebreaker/control, attachments, bonus economy,
typed effect execution, and reboot. It is intended for rules debugging and
acceptance coverage, not as a source-complete production game client. The
setup screen and live session now surface an explicit shared coverage panel
that distinguishes implemented runtime slices from modeled-but-still-pending
work.

### Play a match

Run `run-sandbox.bat`, open `/play/`, enter 2–4 names and a seed, then choose
**Start quick match**. First to control four blocks through Icebreaker wins.
This experimental profile supports the current seven-block corpus. Official
Speedrunners keeps its 10/8/6 marker allotment and still needs complete source
content and printed recycle/effect support.

Select a runner or card to filter its available actions. Search previews the
next tile and rotation. Click highlighted board spaces or use the path
controls to move. Full spaces can be crossed but cannot be endpoints. Cards
show movement, activations, attachment slots and costs. Split Delete assigns
individual dice, including concentration on one target. Reboot spends four
selected hand entries, including duplicate copies.

**End turn** handles the implemented phases and hides the next player's hand
until **I'm ready**. Combat rolls and the cumulative event log explain results.
Victory freezes the match. Browser-local replay saves enable **Resume saved
match** after reload or server restart. Export/import remains available when
local storage is unavailable. Saves bind to the mode and content checksum;
content changes require a new match. Test Lab and diagnostics remain separate.

### Tabletop controls

`/play/` defaults to perspective; **Top-down** switches cameras. Source-art pawn
standees select actors and hand cards filter actions. Movement targets stay above
the board hit areas. **End turn** opens recycling: select physical unused copies
then choose **Keep hand & draw** or **Discard selected & draw**. Used action parts
stay in the visible played zone until then. A matching Reboot card is also
available where the pawn permits it.

Public Delete rolls before target assignment; repeat targets to concentrate
dice. Test Lab’s **Shadowraiders threat combat** uses the sourced Guard drone
profile and demonstrates awakening, response and priority-constrained fixed
retaliation. All ordinary phase controls are disabled until combat resolves.
Test Lab opens its checkpoint/save disclosure automatically. Source-complete
missions and solo/team modes remain open under T-PLAY-002.

The action-card editor also exposes **Delete skull modifier**, persisted as
`attach.attackModifier` and combined with printed pawn/space skulls by both engines.

## Source-foundation review

The Test Lab offers **Verified starter and card rules**. It loads canonical printed starters and page-one cards on an explicitly synthetic arrow board. Attach Octagon Dex, move back into Core against the arrow, and reset to try paid accelerators or E-Synapse movement. Simstim cancels movement, but its unresolved bonus lifetime remains partial and provisional.

Action-card authoring includes **Ignores direction arrows** and **Movement step modifier**; these fields survive structured editing/export. Guided movement uses actor-aware arrows, modifier-adjusted path budgets and movement cancellation.

The content coverage panel has a searchable **Rule and component checklist** with independent source/runtime status and remaining gaps. Rebuild with `bun tools/rules-coverage.ts`; verify the checked-in output with `--check`.

Quick matches and older Test Lab scenarios use the frozen provisional corpus. Canonical source-foundation traces have a separate checksum; importing a trace against the wrong corpus is rejected. Full official content and later mechanics remain incomplete.

The **Beginning-turn choices** Test Lab scenario exercises Toxin. Start the action phase, then explicitly discard one physical card or sacrifice the pawn. Phase controls stay disabled until the choice resolves; save/replay and undo preserve the pending decision. The action-card editor exposes typed **Turn effects** controls. Rootkit and Selective Disclosure also execute their single phase obligation. Multiple simultaneous obligations remain a visible provisional gap.


Test Lab also includes **Electric Sheep sacrifice and draw**, **Jetpack relocation**, and **Insider Trading hand choice**. Start the action phase to execute/open their beginning effects. Jetpack's destination list comes from the engine; Insider's checkboxes select physical hand indices so duplicate names remain separate copies. Pending choices survive trace replay/undo and keep ordinary phase controls disabled. These are explicit source-review fixtures with synthetic hands/decks; official play readiness remains incomplete.

Typed Turn effects now also author sacrifice-and-draw and selected-discard amounts, plus discard-and-relocate with an optional reviewed threat policy. Leave that policy **Unresolved** for canonical Jetpack until SR-TURN-007/T-RULES-008 is settled. Amount fields and policies survive form refresh/export. Run the full `bun run test:play` suite for editor and play controls; the local verification recipe uses that same suite.


Test Lab's **Dummy elimination prevention** fixture gives Ada a synthetic Delete grant and Bea a synthetic unshielded defense profile, with canonical Dummy attached to Bea's starter. Roll and assign Delete, then Bea can **Discard Dummy to prevent elimination** or **Allow elimination** during Ada's turn. Buttons come from engine-owned responses; ordinary phase controls stay disabled. Save/replay/undo preserves that pending defender window. **Match history → Piece and control-card zones** shows reserve, retained Reboot, excluded starters and card locations for source-mode fixtures.

The card editor also preserves **Discard this attachment to prevent pawn elimination** as `attach.eliminationPrevention: {kind: discard-self}`. Unknown handlers/malformed records fail validation; editor support does not settle the source gaps in SR-CARD-007.


The runner inspector now displays **Classes** from the engine's effective-class helper, including printed Accelerator/E-Synapse/Trade Secret grants. The card form accepts printed **block** type and typed **on-attach** operations. These authoring fields do not enable unresolved block geometry: canonical Gentleman Loser (legacy id `cracker`) rejects unsupported attachment-time placement, while its movement/Icebreaker strip remains usable. The old Typed effects fixture is explicitly historical.

The action-card form now separates Target classes (accepted existing classes) and Forbidden target classes (any match excludes). Own Card classes remain grants to the pawn; these are not target restrictions. Validation/export retains the exclusions. The Test Lab's **Malware target restrictions** fixture offers printed Worm, Under Clocker and Hijacker only against an explicitly synthetic non-Operative target; the two ordinary starters remain ineligible. Reset to try another card. Engine-derived target filtering, gained Malware display, rejected operative requests, replay and undo are covered by host/browser acceptance. Provider-dependent slots and cleanup cascades now execute under SR-CARD-011; remaining component exceptions stay T-RULES-012.

The **Granted slots and cleanup** Test Lab scenario uses explicitly synthetic cards. Choose the native Gadget slot or the provider's Gadget slot in the Action selector (labels show the attachment path); then attach the Weapon/Module chain. End both players' turns and start Ada's next action phase to run the provider's beginning self-discard and dependent refunds. The inspector's Slots row shows engine-owned available/occupied locations. Source attachment options now send `slotRef`; they do not infer placement on the client. Replay and undo preserve it. Source checksums include the v2 slot-rules stamp; older source traces report a data/rules-version mismatch, while historical quick-match traces keep their original checksum. This fixture does not promote unfinished Gunhed/weapon/module content.

The **Gunhed, weapons and Delete activations** Test Lab fixture starts with printed Gunhed, AK-12kM and Servocanon plus an explicitly synthetic Gadget-to-Module adapter. Attach all four, use the free public roll, resolve its three dice, then choose a matching card for another roll. The defender has synthetic fully shielded faces for repeatability. Engine options distinguish paid and free activations; the inspector shows printed skulls and activation badges. A multiple-free-badge conflict is labeled unresolved, with no guessed free option. Export/import, pending-roll replay, costs and undo are covered by host/browser tests. In the card editor, Printed Delete skulls and Printed Delete activation are independent fields: leave activation at Strength only for AK-12kM. Do not also add a legacy Grant Delete/ability-use encoding. Servocanon's multiple-free interaction remains T-RULES-014.

During command submission, passing and recycling, action selectors and inputs are disabled along with buttons. This prevents a selection made against an old action list from being silently replaced by the pending response. The printed weapon browser sequence exercises consecutive attachments and both activation routes.

The **Virus attachment takeover** Test Lab fixture uses printed Virus against a pawn with a clearly synthetic Cleaner class. Attach it to the offered extra Add-on slot, then inspect the four discarded cards, pawn/control-card transfer and Bea's four refunded counters. This does not promote a Cleaner pawn record. The **Lima Flag movement restriction** fixture starts with Lima Flag on Ada's pawn on a synthetic board. Movement options exclude entering Central Core while allowing the other tile; direct invalid submissions reject and replay/undo preserve state. The editor now offers `gain-target-control` with the attachment-time trigger and a **Cannot move onto Central Core** checkbox. Such operations are separate from a card's movement or ability strip. Unsupported placement/relocation interpretations remain explicitly gated.

Control-transfer log entries use the controller and pawn names, including the new Virus cleanup sequence.

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


Selected tile inspection keeps its source artwork visible under the hit target; current block metadata includes non-playable zones. Pawn inspector entries retain a **Provisional · full rules pending** label when their data is incomplete, including Idoru. A verified spawning block does not remove that label from its pawn.

### Idoru card-marker fixture

In Test Lab choose **Idoru control-card marker**. The staged fixture places neutral Idoru on Toyeku and gives Ada one remaining/total marker. Select **Play Worm: Icebreak pawn**, target Idoru and execute. The source engine resolves acquisition, places a marker on the physical control card and declares victory. Inspect Idoru for Pawn ICE1/6 and **Control markers**, then export/re-import the trace or Undo. The piece/control-card zones panel also lists allocations when a pawn is no longer on the board. This one-marker setup is fixture scaffolding, not standard setup.

Idoru's attributes are source-checked, but the pawn/card remains provisional for repeat placement after marker removal. The experimental common-card retention policy and same-owner reacquisition rejection are documented in SR-PAWN-004. The controls must not imply complete Idoru or mode coverage. Current source-v19 traces reject earlier source semantics; frozen regression replays retain their original corpus.

### Internal arrows and Sprawl decisions

In the block editor, **One-way space links** records a printed arrow between adjacent spaces. Choose **One-way link from** and **One-way link to**, then **Add one-way link**. The link permits its forward traversal and bars the reverse; other paths and cross-edge exits remain available. Remove a link with its own Remove button. Save/load/export preserves links. Validation rejects missing, self, non-adjacent and duplicate/reversed endpoints. Renaming/removing endpoints requires reviewing existing links; replacing all geometry clears them. The older Direction field describes a cross-edge restriction and must not stand in for these internal arrows.

Test Lab **Sprawl one-way space links** starts on shield on a rotated source tile. Preview Uplink movement to see the absent rabbit return, attach Octagon to enable that reverse step, then execute it. **Sprawl all-player discards** stages two Ada-controlled pawns and Bea's retained Speedrunner. Play DJ: Search and place Sprawl, choose the exact physical hand cards for each owner, and commit each selection. A commitment does not discard/reveal its cards yet; all required cards become public only after the final submission. Export/re-import or Undo at either window. The host supports either owner's authorized response order; local UI displays the first outstanding decision.

The global commitment timing and underfilled-hand policy remain provisional. Shortfalls preserve the revealed paid Search with an explicit source-review error; Hacktivism placement likewise rejects its unaccepted marker lifecycle. Correct tile graphics/geometry and supported normal-hand controls must not imply full block/mode acceptance. Source-v9 traces reject older source semantics; frozen quick-match traces retain their original corpus.

### Antro and acting Icebreaker authoring

The Antro Test Lab starts on its ordinary lower space with real Gunhed/AK-12kM/Phase-Loop and opposing Dummy. Move to a side space, then decline or choose one engine-listed physical attachment. Gunhed removes its dependent weapon; paid counters return to their controller. Replay, recovery and Undo retain the exact decision and attachment identity. The pawn inspector shows additional Icebreaker dice and Black ICE immunity. This fixture uses provisional targeting/stop policy T-RULES-027 and is not an accepted official match.

For a block effect space, choose **Optional attachment discard** (Add-on or Gadget), then save/load/export. The typed optional Cybernet scope is retained; source review is still required. The card editor separates **Acting Icebreaker modifier** from **Target ICE modifier**. Author extra acting dice, faces, Black ICE risk or immunity there; Phase-Loop uses1 extra die and immunity. The controls do not grant Icebreaker activation. Current source traces use v10 rules checksums; earlier source traces reject, while frozen traces retain compatibility.

### Electromagnetic Pulse

The **Electromagnetic Pulse pawn sacrifices** Test Lab uses the printed block and a clearly synthetic non-Reboot worker. Search/place the tile, then each named controller chooses one of their own live pawns. Selections are public; pieces and attachments remain until both players choose. Finishing removes selected pawns, retains a Reboot starter or releases a non-Reboot worker to reserve/common, discards its attachments and refunds paid counters. Trace export, replay, recovery and Undo preserve partial commitments. The history records pawn selections separately from elimination.

Author **sacrifice-per-player** under **In Cybernet**, amount1, **Minimum controlled pawns**2. Save/load/export retain the typed threshold. Invalid timing/amounts reject. Queries keep unresolved prevention targets visible as explanations, not executable buttons. Global timing, retained targets and Dummy sacrifice interactions remain T-RULES-029/010; this fixture does not accept a full official game. Current source checksum semantics are source-v21/cleaner-b-placement; older source traces reject and frozen traces remain compatible.

When a hand is empty during a pending choice or combat window, its prompt now directs the player to resolve that decision before continuing the turn.

### Copyleft and the physical bonus reserve

The **Copyleft and physical bonus counters** Test Lab begins with two clearly synthetic bonus peers and only three of the 24 counters in reserve. Search/place Copyleft at edge0/rotation0. The engine places one reserve counter on the new icon, then awards one to each player. Attach Phase-Loop, use Fast Uplink to reach the lower portrait space, and play Worm to Icebreak Copyleft. Collection transfers the already placed counter even though reserve is empty. The phase panel shows reserve/supply, on-icon and invested counts; history separates allocation, reserve awards and icon collection. Replay, recovery and Undo preserve every allocation.

Author **gain-bonus-all-players** under **In Cybernet**, amount1, with no target or sacrifice threshold. Save/load/export retain the typed effect. Do not add an EKO/Eiko pawn: the portrait is normal double-space artwork. Unfunded source placement orientations are withheld by the engine without changing RNG. Source-v12 traces reject incompatible earlier source checksums. Reserve-shortfall policy remains T-RULES-030/031; frozen historical quick matches retain their explicit old semantics and do not certify physical source accounting.

### Clandestine Broadcast Reboot destinations

The **Clandestine Broadcast Reboot destinations** Test Lab stages a controlled printed tile and a retained starter. Choose **Play Uplink: Reboot at Clandestine Broadcast** or the original **Central Core** destination, then execute. Matching-card and four-card actions name their destination directly from engine options. Reboot consumes the selected physical payment and returns the retained pawn to the large special space. Export/import, recovery, Undo and Reset preserve or restore destination and costs. The fixture stages control/elimination and does not represent a full official match.

Author **controller-core** under **Effect under control**, target the id of an **unlimited special** space, and leave amount/threshold empty. Keep **Central Core** identity false for Broadcast; it must remain a normal controllable block in the pile. Save/load/export retain the descriptor; validation rejects missing/non-special targets and placement timing. Changed source content changes trace checksums; historical frozen traces retain their original corpus.

Card validation preserves edits made while its request is pending. If the card changes, the editor asks for validation again and stops an export based on the stale result. Older responses and responses for another selected draft do not replace current diagnostics or fields.

### Pink District and Gynoid

In **Pink District and controlled Gynoid placement**, play DJ to Search, place Pink District, use Fast Uplink to enter its Gynoid space and play Worm to Icebreak the block. Tile placement leaves Gynoid in reserve; capture places and controls her on the matching unlimited space. Inspector data shows her exact ICE, defense, card movement and beginning effect. A repeat capture uses the same pawn, with takeover cleanup/refunds; source victory stops further effects immediately.

In **Gynoid beginning-of-turn theft**, block/pawn control is staged. Start the action phase to open the beginning decision. Choose **Decline theft** or an engine-supplied pawn/controller target; one physical hand card is selected only after acceptance. A friendly target is permitted; empty hands are unavailable. Player-view responses and histories hide card identity from unrelated viewers unless it was already publicly revealed at transfer. The Test Lab is a trusted operator view. Export/import, recovery and Undo retain the pending decision and deterministic result. Simultaneous beginning order remains provisional T-RULES-005.

Author Pink District's **place-controlled-pawn** under **Effect under control**, target `gynoid`, and provide exactly one matching pawn space. Do not use the neutral placement trigger or the first open space. Save/load/export retain the descriptor; validation checks timing and matching home. source-v21/cleaner-b-placement changes trace checksums; frozen historical sessions keep their original corpus and behavior.

Yakuza's **Test Lab → Yakuza optional adjacent attack** starts before Search. Reveal/place it, move to dragon and capture with Worm; choose an adjacent pawn or decline using the engine's buttons. Bea's Dummy response appears after a hit during Ada's turn. Export/reload/recover/undo preserve both decision windows and the accepted roll. This is focused mechanic evidence, not a full match.

To author the effect, select **attack-pawn** under **Effect under control**, set amount1, **Target scope: Adjacent blocks**, and **Optional target choice**. Save/load/export retain all fields. Placement timing, absent scope/optionality, nonpositive amounts and fixed targets reject. source-v21/cleaner-b-placement updates source trace checksums; incompatible prior source traces receive the existing clear version error.

**Test Lab → Corporate Scandal whole-hand discard** stages actual tile holdings and Idoru's counted card: Ada starts at five Cybernet markers, Bea at six. Search/place/enter/capture the tile; the new sixth marker triggers both remaining hands. Worm stays face up with played cards. Inspect public history, export/replay and undo/reset. Staged holdings are focused mechanic evidence, not a complete ordinary match.

In the block editor use **discard-hands-above-markers** under **Effect under control** and **More than Cybernet markers: 5**. Leave other costs/amounts/targets empty. Save/load/export retain the threshold. Validation rejects placement timing and unsupported substitutions. source-v21/cleaner-b-placement supersedes prior source trace checksums; frozen historical sessions retain their original corpus.

**Test Lab → Black Clinic and the hand-size space** starts with paid attachments staged through engine actions. Search/place the tile, enter its large unlimited Clinic circle and capture it. The controller must choose a Cybernet pawn; empty pawns are legal, and there is no decline. Clearing Ada removes Gunhed, AK-12kM and Phase-Loop and returns four invested counters. Bea's Dummy is a separate eligible target, with no pawn-elimination response. Export/import/recovery/Undo retain the choice and cleanup.

Then play Uplink to stop on the hand space. **Hand limit at recycling** shows the engine's current base/card/space total; Black Clinic lowers it to four. Finish actions and keep/draw to verify refill. Moving away removes the space contribution; it never permanently changes the base. The test fixture does not prove full official setup/victory. Used-card redraw remains T-RULES-021.

Author the under-control effect as **discard-pawn-attachments**, **Target scope: Any Cybernet pawn**, optional-choice unchecked, with no other costs/targets/amounts. Keep the lower circle **special / unlimited**, the hand-space modifier **hand-size / -1**, and printed defense faces1/2 vulnerable. Save/load/export retain the typed descriptor. Invalid trigger, optionality, scope, zero hand amount or hand-space dice reject. Source traces use source-v21/cleaner-b-placement; v15 source traces receive a clear incompatibility error.

**Test Lab → Engineering War and Drone MK-2** uses the actual Search/capture flow. The tile exposes only its two side entrances: choose **Edge 0 · rotation 5** to enter through the left defense space. Use Fast Uplink for two steps (defense, then Drone MK-2 home), then Worm to capture. Tile placement alone leaves MK-2 in reserve/common; capture deploys and controls its one pawn/card.

Select **Pawn Drone MK-2**, then **Move Drone MK-2 (base: 5 steps)**. Move through defense to Central Core, spending its native movement. Additional paid card movement remains available independently. Play Uplink for **Roll Delete**, then assign the public die to Bea's runner. Export/import/Undo retain the accepted roll and physical markers. Servocanon in hand can test the Module slot's separate paid cost/single free Delete; broader multiple-free/used-card reuse remains provisional. This fixture is not full official-mode acceptance.

Editor authoring uses the existing **place-controlled-pawn** under-control effect, target `drone-mk-2`, and exactly one matching unlimited pawn home. H2/h3/h5/h6 are excluded title/effect zones; only E2/E5 connect. Do not convert the teal inner-circle graphic into an arrow rule. Save/load/export retain the record. Source traces use source-v21/cleaner-b-placement and reject earlier v16 checksums clearly; frozen historical traces retain their original corpus.

**Test Lab → Combat Prototypes and Drone Probe** follows ordinary Search and capture. Play DJ Search; select **Edge 0 · rotation 5**. Move Fast Uplink through **left**, then **drone-probe**, and play Worm to capture. Placement alone leaves Probe in reserve/common; capture deploys and controls it.

Select **Pawn Drone Probe → Search with Drone Probe**. It reveals Engineering War without paying a card and commits only its native Search use. Export/import and Undo retain that reveal; choose **Edge 0 · rotation 5** to place. **Move Drone Probe (base: 5 steps)** remains available independently: select **right** on Combat Prototypes, then **defense** and **drone-mk-2** on Engineering War. This spends movement separately. Additional paid movement remains available; neither free ability refreshes through takeover/relocation. The Module slot can grant a separate free Delete but creates no paid Delete badge. This focused fixture does not accept a full official mode.

Editor source p5c2 uses existing **place-controlled-pawn**, target `drone-probe`, the central unlimited matching home, four surrounding singles, excluded h3/h6 and only E2/E3/E5/E6 entrances. Save/load/export retain geometry and target. Source traces now use source-v21/cleaner-b-placement and reject prior source checksums clearly; frozen regression keeps its original corpus.

**Test Lab → Military Development and Drone Turret** follows Search/capture first. Choose **Edge 0 · rotation 5**, move Fast Uplink through **hand → drone-turret**, then capture with Worm. Finish Ada's turn, advance to Bea's action phase, and move Bea through the same two spaces.

Choose **Let Ada use permitted abilities**, pass the device to Ada, then **I'm ready to use abilities**. The public handoff list reveals only printed pawn permission, without disclosing hand costs. Ada's private options show **Play Uplink: Roll Delete with Drone Turret**. Its public roll and assignment belong to Ada while Bea keeps the active turn. Resolve the target, returning the hand view to Bea. Ordinary matches use a handoff curtain when the decision controller changes. No card or movement permission is invented; Turret cannot activate any movement, including cards/grants. One attached Servocanon offers an independent limited free Delete.

Face-up played cards show their paying controller. Other players' recycling preserves those cards; their payer discards them at their own recycling. Export/import/Undo/reset retain pending controller, roll, card allocation and active turn. Import temporarily disables old decision controls until the restored view loads, preventing stale choices from being submitted. Source traces use source-v21/cleaner-b-placement and reject earlier checksums; frozen traces retain their original corpus.

Editor source p5c3 uses existing **place-controlled-pawn**, target `drone-turret`, h1 unlimited matching home, h7 hand+1 and h4 single spaces, excluded h2/h3/h5/h6 and only E2/E5 entrances. Exact ICE is4/6 at V5, with the other five bonus corners. Save/load/export preserve source data/target. This focused fixture does not accept a complete official match.

**Test Lab → Arms Industry physical counter** stages two controlled synthetic peers and22 free counters, leaving exactly two reserve pieces. Play DJ Search, choose **Edge 0 · rotation 0**, and place. The board holds one three-tile icon counter plus Arms Industry's separate counter; the supply display now says **on board**, covering both locations. Its **1 BONUS** badge and block inspector show the held piece. Center storage is not a movement space.

Play Uplink Move1 into **hand**, observe recycling maximum4, then capture using Worm. At empty reserve, the existing icon counter transfers before the block counter; neither award creates another piece. The badge disappears, the inspector retains the first collector, and takeover cannot award it again. Export/import/Undo/reset retain the allocation and receipt. The fixture is funded; shortage policy remains unresolved under T-RULES-031/047, and strict official construction stays gated.

In the editor pair **In Cybernet: place-block-bonus**, amount1, with **Under control: collect-block-bonus**, no amount/target/optionality. Save/load/export retain both descriptors. The four single spaces are h2/h3/h7/h6; h1 counter storage and h4/h5 effect art are non-playable. Source traces use source-v21/cleaner-b-placement; older source checksums reject, while frozen historical traces keep their original corpus.

**Test Lab → Cleaner B controlled placement** follows Search and capture. Play DJ Search and choose **Edge 0 · rotation 4**, so the hand space faces Core. Placement leaves the Cleaner B pawn in reserve and its control card common. Play Uplink Move 1 into **hand** and read the recycling limit, base 5 with spaces −1. The block inspector lists defense faces 1 and 2 as vulnerable. The hand-to-circuit arrow does not allow the reverse step. Capture with Worm: the one pawn deploys on its home and the control card moves to control. Play Overclock Move 3 onto **defense** to see that pawn’s faces 1, 2, 5 and 6 vulnerable. Export/import, Undo and reset retain the placement, capture and modifier. This focused fixture is not a complete official match.

In the editor set **Under control: place-controlled-pawn**, target `cleaner-b`. Save/load/export retain that target. The shared record also keeps the hand → circuit arrow, the hand-size −1 space, and the two unshielded defense faces. H1 is the non-playable instruction zone. All six edges are entrances. Source traces use source-v21/cleaner-b-placement; older source checksums reject, while frozen historical traces keep their original corpus.

The browser author-approval test supplies synthetic vision candidates, and the tile-layering test supplies a synthetic SVG. These UI checks therefore run without ignored local OCR/artwork caches in a fresh checkout. Source geometry/rule verification remains in the primary-evidence workflow; these fixtures do not certify artwork identity.

Fresh checkouts use the registered canonical layout when local image dimensions/vision are unavailable. Geometry tests compare that actual API projection; source-specific expectations apply only when source geometry exists. Entrance labels keep placement centers clickable in both projections. The authoring controls and game semantics are unchanged by the checkout-portability repair.
