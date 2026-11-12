# Parity contract

`impl/go` and `impl/ts` are mirrors. This table is the naming/structure map that
keeps them aligned. Update it whenever you add or rename a concept in either.

## Naming conventions

| Concept | Go | TypeScript |
|---------|----|-----------|
| Exported identifier | `PascalCase` | `camelCase` (types `PascalCase`) |
| Enum values | typed string consts | string-literal union types |
| Package / module dir | `internal/<layer>` | `src/<layer>` |
| Tests | `*_test.go` (`go test`) | `*.test.ts` (`bun test`) |

## Layer ↔ directory map

| Layer | Go | TypeScript |
|-------|----|-----------|
| Domain types | `internal/domain` | `src/domain` |
| Data loader | `internal/data` | `src/data` |
| Engine | `internal/engine` | `src/engine` |
| Entry / demo | `cmd/zaibatsu` | `src/index.ts` |

## Core symbols (must exist and behave identically on both sides)

| Meaning | Go | TypeScript |
|---------|----|-----------|
| Game state | `domain.GameState` | `GameState` |
| Player | `domain.Player` | `Player` |
| Block | `domain.Block` | `Block` |
| Block visual layout | `Block.LayoutID`, `Block.BoundarySpaces`, `Block.BonusCorners`, `Block.AssetRefs` | `Block.layoutId`, `Block.boundarySpaces`, `Block.bonusCorners`, `Block.assetRefs` |
| Space visual location | `Space.Location` | `Space.location` |
| Seven-zone space geometry | `Space.ZoneIDs`, `Space.Capacity`, `Space.DisplayShape`, `Space.Neighbors` | `Space.zoneIds`, `Space.capacity`, `Space.displayShape`, `Space.neighbors` |
| Pawn | `domain.Pawn` | `Pawn` |
| Action card | `domain.ActionCard` | `ActionCard` |
| Phase enum | `domain.Phase*` | `Phase` |
| RNG (seeded) | `domain.RNG` / `NewRNG(seed)` | `RNG` / `newRng(seed)` |
| Load game data | `data.Load(dir)` | `loadGameData(dir)` |
| Select shared mode | `data.LoadMode(expansion, modeID)` | `loadMode(expansion, modeId)` |
| Provisional mode metadata | `domain.Mode.Provisional` | `Mode.provisional` |
| Independent state and RNG copy | `engine.CloneState(state)` | `cloneGameState(state)` |
| New game | `engine.NewGame(cfg)` | `newGame(cfg)` |
| Apply action (reducer) | `engine.Apply(state, gd, action)` | `applyAction(state, gd, action)` |
| Apply live action + events | `engine.ApplyWithEvents(state, gd, action)` | `applyActionWithEvents(state, gd, action)` |
| Advance one live phase | `engine.AdvancePhase(state, gd)` | `advancePhase(state, gd)` |
| Transition contract | `engine.TransitionResult` / `engine.EngineEvent` | `TransitionResult` / `EngineEvent` |
| Advance one full turn | `engine.RunTurn(state, gd, actions)` | `runTurn(state, gd, actions)` |
| Action (tagged union) | `engine.Action{Type,…}` | `Action {type,…}` |
| Control markers by player count | `engine.ControlMarkersFor(n)` | `controlMarkersFor(n)` |
| Win check | `engine.Winner(state)` | `winner(state)` |
| Hex coordinate | `domain.Coord{Q,R}` | `Coord {q,r}` |
| Neighbor deltas | `domain.HexDirections` | `HEX_DIRECTIONS` |
| Neighbor / opposite | `Coord.Neighbor(dir)` / `domain.Opposite(dir)` | `neighbor(c,dir)` / `opposite(dir)` |
| Board | `domain.Cybernet` (`Blocks []*PlacedBlock`) | `Cybernet` (`blocks: PlacedBlock[]`) |
| Edge-space test | `engine.EdgeHasSpace(b,rot,dir)` | `edgeHasSpace(b,rot,dir)` |
| Validate placement | `engine.CanPlace(...)` | `canPlace(...)` |
| Place a block | `engine.PlaceBlock(...)` | `placeBlock(...)` |
| Enumerate placements | `engine.ValidPlacements(...)` | `validPlacements(...)` |
| Pawn on board | `domain.PawnOnBoard` | `PawnOnBoard` |
| Space capacity | `domain.SpaceCapacityFor(space)` / `domain.Unlimited` | `spaceCapacityFor(space)` / `UNLIMITED` |
| Step budget | `engine.ResolveSteps(m,rng,extra)` | `resolveSteps(m,rng,extra)` |
| Movement gating | `engine.CanActivateMovement(p,pawn)` | `canActivateMovement(p,pawn)` |
| End-on capacity check | `engine.CanEndOn(...)` | `canEndOn(...)` |
| Hex movement | `engine.MoveHex(...)` | `moveHex(...)` |
| Attack roll | `engine.AttackRoll(rng,skulls)` | `attackRoll(rng,skulls)` |
| Defense-hit test | `engine.Defeats(roll,def)` | `defeats(roll,def)` |
| Delete ability | `engine.Delete(...)` | `deleteAbility(...)` ¹ |
| Delete area | `engine.DeleteArea(...)` | `deleteArea(...)` |
| Multi-target Delete | `engine.DeleteMulti(...)` | `deleteMulti(...)` |
| Eliminate a pawn | `engine` (internal `eliminatePawn`) | `eliminatePawn(...)` |
| Eliminated pool | `domain.GameState.Eliminated` | `GameState.eliminated` |
| Block controller | `domain.PlacedBlock.OwnerID` | `PlacedBlock.ownerId` |
| ICE faces (category derivation) | `engine.IceFaces(ice)` | `iceFaces(ice)` |
| ICE faces (authored override) | `engine.iceFacesFor(faces, ice)` | `iceFacesFor(faces, ice)` — prefers `block.iceFaces`, else the category |
| Black ICE elimination | `resolveBlackIceFailure(isBlack, …)` (`iceValue==black \|\| block.blackIce`) | `resolveBlackIceFailure(isBlack, …)` |
| Effective ability (attach grants/removes) | `engine.effectiveAbility(gd, pawn, atts, name)` | `effectiveAbility(gd, pawn, atts, name)` — removes win, else innate, else a granted card-activated ability |
| Boundary-space derivation | `domain.(*Block).DeriveBoundarySpaces()` (at load) | `deriveBoundarySpaces(block)` (at load) — E1→h3 … E6→h2 from open edges + zoneIds |
| Space adjacency graph | `engine.StepTargets(gd, cy, coord, spaceID)` | `stepTargets(gd, cy, coord, spaceId)` — intra-block neighbours + cross-edge boundary hops (rotation- and direction-aware) |
| One validated step | `engine.MoveStep(s, gd, pawnID, coord, spaceID)` | `moveStep(s, gd, pawnId, coord, spaceId)` — reachability + capacity checked |
| Path move under budget | `engine.MoveSteps(s, gd, pawnID, path)` / action `move-steps` | `moveSteps(s, gd, pawnId, path)` / action `"move-steps"` — pass occupied, end where capacity permits, unused steps lost |
| Card movement path | `engine.PlayMove(...)` / action `play-move` | `playMove(...)` / action `"play-move"` — uses printed card budget, consumes the card only after a legal path, leaves once-per-turn pawn movement available |
| Icebreak a block | `engine.IcebreakBlock(...)` | `icebreakBlock(...)` |
| Icebreak a pawn | `engine.IcebreakPawn(...)` | `icebreakPawn(...)` |
| Source Search declaration | `engine.BeginSearch(...)` | `beginSearch(...)` |
| Historical synchronous Search | `engine.Search(...)` | `search(...)` |
| Top-of-pile block | `engine.SearchTopBlock(s)` | `searchTopBlock(s)` |
| Valid search placements | `engine.ValidSearchPlacements(...)` | `validSearchPlacements(...)` |
| Reboot ability | `engine.Reboot(s,gd,pawn,player)` | `reboot(s,gd,pawn,player)` |
| Play card → Delete | `engine.PlayDelete(...)` | `playDelete(...)` |
| Play card → Delete area | `engine.PlayDeleteArea(...)` | `playDeleteArea(...)` |
| Play card → split/concentrated Delete | `engine.PlayDeleteMulti(...)` / `play-delete-multi` | `playDeleteMulti(...)` / `play-delete-multi` |
| Play card → Icebreak block | `engine.PlayIcebreakBlock(...)` | `playIcebreakBlock(...)` |
| Play card → Icebreak pawn | `engine.PlayIcebreakPawn(...)` | `playIcebreakPawn(...)` |
| Discard 1 → Search | `engine.PlaySearch(...)` | `playSearch(...)` |
| Discard 4 → Reboot | `engine.PlayReboot(...)` | `playReboot(...)` |
| Attachment | `domain.Attachment` (`PawnOnBoard`/`PlacedBlock.Attachments`) | `Attachment` (`.attachments`) |
| Attach to own pawn | `engine.AttachToPawn(...)` | `attachToPawn(...)` |
| Attach to enemy pawn | `engine.AttachToEnemy(...)` | `attachToEnemy(...)` |
| Attach to block | `engine.AttachToBlock(...)` | `attachToBlock(...)` |
| Effective classes | `engine.EffectivePawnClasses(...)` | `effectivePawnClasses(...)` |
| Effective slots | `engine.EffectivePawnSlots(...)` | `effectivePawnSlots(...)` |
| Canonical state snapshot | `engine.Snapshot(state)` | `snapshot(state)` |
| Win check / winner | `engine` (internal `checkWin`) / `engine.Winner` | `win.ts` `checkWin` / `winner` ² |

¹ **Naming exception:** `delete` is a reserved word in JavaScript, so the TS
export is `deleteAbility`. This is the only intentional name divergence; behavior
is identical (verified: seed 123 green→yellow yields roll `[2,4]`, eliminated, on
both sides).

² Win logic lives in Go's `engine` package (internal `checkWin`, exported
`Winner`); on the TS side it is factored into `src/engine/win.ts` (`checkWin`,
`winner`) to avoid an import cycle with `icebreaker.ts`. Behavior is identical.

## Shared, not mirrored

`spec/schema/`, `spec/data/`, and `spec/validation/manifest.json` are
**shared**. A data or schema change is a single edit in the shared contract,
then `bun tools/validate-spec.ts` refreshes the validation manifest both
loaders require before they will read the bundle.

## Determinism contract

Same seed + same action sequence ⇒ identical resulting `GameState` on both
sides. The seeded RNG (`NewRNG`/`newRng`) must produce the same sequence given
the same seed; if the two RNGs can't be made bit-identical cheaply, document the
divergence here and compare states *modulo* RNG-internal fields.

> Current status: RNG is a simple, spec-matched LCG on both sides (see
> `domain` in each impl) so sequences match. Shuffle uses Fisher–Yates driven by
> that RNG.

## Parity status

| Feature | Go | TS | Notes |
|---------|----|----|-------|
| Domain types (slice) | ✅ | ✅ | |
| Data loader | ✅ | ✅ | reads `spec/data/speedrunners`; rejects missing, stale, or unvalidated `spec/validation/manifest.json` entries before parsing |
| Setup + marker counts | ✅ | ✅ | |
| Turn loop + phases | ✅ | ✅ | |
| Live phase transitions + structured events | ✅ | ✅ | action-phase gate; rolls, draws, eliminations, control changes, winners, and validation failures are structured |
| Unified action reducer | ✅ | ✅ | `Apply` dispatches every ability/card/attach action; `RunTurn` drives a turn; identical (seed 123 delete) |
| Canonical snapshot + golden games | ✅ | ✅ | byte-identical snapshots; both mirrors assert the SAME `golden/*.snap` fixtures (whole-game + combat scenario) |
| Win detection | ✅ | ✅ | |
| Seeded RNG + shuffle | ✅ | ✅ | LCG, Fisher–Yates |
| Hex model + tile placement | ✅ | ✅ | axial coords; edge-connectivity + valid-orientation (Search) |
| Pawn positions + occupancy | ✅ | ✅ | pawns on core at setup; explicit capacity with legacy type fallback |
| Movement budget + activation | ✅ | ✅ | fixed/d6/2d6/hex + modifiers; card/once-per-turn/none gating |
| Hex movement execution | ✅ | ✅ | block-to-block; d6 sequence verified identical (seed 99) |
| Combat: Delete + elimination | ✅ | ✅ | single-target attack roll vs defense dice; full pipeline identical (seed 123) |
| Area attacks | ✅ | ✅ | Bomb-class area Delete and typed block `area-attack` effects apply one shared roll to every pawn in the affected block; identical across mirrors |
| Multi-target Delete | ✅ | ✅ | attack dice can be divided across co-located targets, including concentrating several dice on one target; identical across mirrors |
| Icebreaker: block + pawn control | ✅ | ✅ | roll vs ICE faces (provisional), marker placement/steal, Black-ICE penalty; identical (seed 5 → [6], success) |
| Search draw/placement decision | ✅ | ✅ | source activation commits before reveal; authorized placement retries retain the paid cost and tile; frozen synchronous behavior remains explicit |
| Reboot ability | ✅ | ✅ | eliminated pawn → Central Core under rebooting player |
| Card-use: activate abilities | ✅ | ✅ | play matching card → Delete/Icebreak; discard 1 → Search; discard 4 → Reboot; identical (seed 123) |
| Card attachment | ✅ | ✅ | attach to pawn/enemy/block, slot + cost checks, discard+refund on elimination/takeover; granted slots, recycle draw/hand modifiers, ICE-face / ICE-dice / Black-ICE modifiers, armor-style `defenseOverride`, ICE nullification, granted stealth reporting, and explicit attachment-granted movement activation with card / once-per-turn / `perTurn` / `d6` move-use budgets now resolve identically |
| Bonus economy | ✅ | ✅ | bonus icons form from authored block corners, collect once when one player controls all three contributing blocks, and pay/refund attachment costs; identical across mirrors |
| Typed effect execution | ✅ | ✅ | typed block `area-attack` and `place-pawn`, plus card-triggered `place-pawn`, execute in both mirrors with structured `pawn-placed` / combat events for the explicitly authored/tested slice; source accuracy is tracked independently |
| Block visual layout metadata | OK | OK | six entrances, bonus corners, asset refs, and the source-aligned 2–3–2 point-up placement layout; displayShape renders circle/capsule/compound source coverage only, with no effect or movement resolution |
| Space-to-space movement | ✅ | ✅ | intra-block neighbours + rotation-aware cross-edge boundary hops; path/capacity/budget behavior is mirror-tested, while provisional data records still need source review |
| Card-use: move / attach | ✅ | ✅ | card movement consumes its printed-budget card; attachment actions are live; attached effect grants/removals remain a separate gap |
| Shadowraiders expansion | partial | partial | threat/public-roll pipeline and validated Guard sidecar; missions, full corpus and all mode loops remain open |

## Content-catalog parity

The [asset review register](artifacts/asset-review.md) is a shared,
non-executable source sidecar: 228 asset records and 557 sheet parts. Neither
mirror loads it, and it creates no temporary language gap. Canonical corpus
promotion, bilingual verification, exact block topology and flagged source
interpretations remain shared gaps under T-SOURCE-REVIEW-002. Existing engine
coverage and provenance maturity are not promoted by this review.

Both loaders expose the same optional `controlCards`, `threats`, `missions`, and
`modes` collections. Missing collection files load as empty arrays, while the
primary `mode.json` is always represented as the one-item `modes` fallback.

This is data-model parity only. It intentionally does not claim implementation

## Local quick-match delivery

Both mirrors load the provisional four-marker profile from shared
`speedrunners/modes.json` while the default mode retains official 10/8/6
markers. Live reducers enforce active-pawn ownership, free-versus-card
activation, movement-card payment, and rejection of free markers/client
combat bonuses. Rejections restore all state and the RNG. Live play freezes
after victory. Paid split Delete and combat roll events match across mirrors.
The legacy low-level utility reducers remain compatible with older demos.

Mirrored `live-match` suites assert ordinary-setup replay against
`golden/quick-match.trace.json` and `golden/quick-match.snap`, a real
four-block victory, finished-state freeze, action authority, RNG rollback,
and split-attack card cost/rolls. The older utility game golden now stops at
the winning action phase. There is no temporary mirror gap in this delivery.
Broader phase effects/non-move use budgets and
source-complete content remain shared accepted gaps in the backlog and
compatibility matrix.

## Tabletop combat wave

T-PLAY-003 changes only the local host/client transport: confirmed recovery
traces, host-scoped session identities and reconnect behavior. Neither mirror's
game state, seeded RNG protocol or game actions change.

| Concept | Go | TypeScript |
| --- | --- | --- |
| Played-card zone / recycle selection | `PlayedCards` / `ActRecycle` | `playedCards` / `recycle` |
| Matching-card Reboot | `PlayRebootCard` | `playRebootCard` |
| Validated threat sidecar | `data.LoadThreats` | `loadThreats` |
| Threat deployment / recovery | `DeployThreats` / `ResetThreats` | `deployThreats` / `resetThreats` |
| Public roll / assignment | `RollDelete` / `AssignDelete` | `rollDelete` / `assignDelete` |
| Fixed retaliation / collection | `AssignThreatAttack` / `CollectThreat` | `assignThreatAttack` / `collectThreat` |
| Cumulative printed skulls | `EffectiveAttackSkulls` | `effectiveAttackSkulls` |

Both mirrors test response interruption, rejection rollback, paid rolls, clone
isolation, post-roll concentration, fixed attack priority, recovery, collection,
matching-card Reboot, physical recycle copies, joint modifiers, stealth, event
deployment and discrete player-count validation. No temporary language gap.
Full source decks/blocks/pawns, missions and Chaos/Outbreak/team mode execution
remain shared gaps under T-PLAY-002.

`golden/threat-combat.snap` also fixes the complete state during the public-roll
response window; both threat suites require the same serialized bytes.

## Source-foundation delivery

| Concept | Go | TypeScript |
| --- | --- | --- |
| Frozen provisional corpus | `data.LoadRegression` | `loadRegression` |
| Physical control-card state | `domain.ControlCardState` | `GameState.controlCards` |
| Pawn/control-card ownership | `SetPawnControl` | `setPawnControl` |
| Acting Icebreaker modifier | `Pawn.IcebreakerModifier` | `Pawn.icebreakerModifier` |
| Arrow exception / step modifier | `IgnoresDirectionArrows` / `MovementStepModifier` | `ignoresDirectionArrows` / `movementStepModifier` |
| Action option query | `AvailableActions` / `AvailableAction` | `availableActions` / `AvailableAction` |

Both source-foundation suites verify canonical Central Core, four printed starters, colors/control-card assignment, extra Icebreaker faces, retained Reboot authority, Octagon arrows/Search removal, Simstim movement cancellation, accelerator costs/step modifiers/refunds, E-Synapse use/reset, and query isolation including RNG. They share `golden/source-foundation.snap`. Existing golden and live-match suites explicitly load the frozen provisional corpus.

No temporary language gap is introduced. Full content, broader lifecycle exceptions, broader phase choices and later modes remain shared gaps. Simstim's bonus lifetime is explicitly unresolved under T-RULES-004 and SR-CARD-006; only its movement cancellation executes. Action templates cover the current source-foundation actions and public combat; broader special effects/reaction queries must grow with their resolvers.

The sandbox preserves the historical quick-match data checksum using the frozen corpus. Canonical source-foundation traces use a separate checksum including control-card data, and cannot be imported under the regression checksum.

## Initial phase-choice delivery

| Concept | Go | TypeScript |
| --- | --- | --- |
| Typed attachment obligation | `domain.PhaseEffect` | `PhaseEffect` |
| Pending phase obligation/decision | `domain.PendingEffect` / `domain.PendingChoice` | `PendingEffect` / `PendingChoice` |
| Begin obligation processing | `StartPhaseEffects` | `startPhaseEffects` |
| Resolve discard/sacrifice choice | `ResolvePhaseChoice` / `ActResolveChoice` | `resolvePhaseChoice` / `resolve-choice` |

Mirrored tests cover Toxin authority, exact physical-card discard, sacrifice/refund, stale/repeated response rejection, phase blocking, RNG/state rollback, queue clone isolation, Rootkit's action-end discard, and Selective Disclosure's self-discard. `golden/phase-choice.snap` and `golden/phase-choice.events.json` are shared across both suites. `golden/source-options.json` also asserts action-template parity.

PHASE-EFFECT-ORDER remains a shared accepted gap under T-RULES-005: multiple same-timing obligations reject atomically rather than adopting an unsupported ordering policy. Toxin, Rootkit and Selective Disclosure remain provisional and partial. The local Beginning-turn choices scenario supports and replays the single Toxin decision. There is no temporary mirror divergence.

Both constructors reject unsupported mode setup steps and win/loss conditions instead of applying the Speedrunners bootstrap to catalog-only expansion modes. Canonical official play also refuses provisional content. T-RULES-006 revokes the three page-one block pilots' incorrect effects/verification in shared data; it creates no language gap. Frozen typed-effect scenarios remain regression evidence only.

Official constructors refuse provisional records unless the selected mode is explicitly provisional or the caller opts into `Config.AllowProvisional` / `Config.allowProvisional` for a source-review fixture. Unsupported setup and win/loss ids are rejected even with that opt-in. Regression loaders mark their returned mode as experimental in memory; frozen source bytes are unchanged. Historical threat sidecars also support explicit regression loading, and frozen files bypass Git newline conversion to preserve their recorded hashes.


## Beginning-card decision extension

| Concept | Go | TypeScript |
| --- | --- | --- |
| Positive draw/discard count | `PhaseEffect.Amount` / `PendingChoice.Amount` | `PhaseEffect.amount` / `PendingChoice.amount` |
| Relocation threat policy | `PhaseEffect.ThreatMode` | `PhaseEffect.threatMode` |
| Engine destination query | `PhaseChoiceTargets` | `phaseChoiceTargets` (via `availableActions`) |
| Resume interrupted bookkeeping | `ResumePhaseEffects` | `resumePhaseEffects` |
| Relocation response | `Action.Coord` / `SpaceID` / `OptionID: relocate` | `Action.coord` / `spaceId` / `optionId: relocate` |
| Printed card type / own classes | `ActionCard.Type` / `Class` | `ActionCard.type` / `class` |

Both `phase_card_effects_test.go` and `phase-card-effects.test.ts` cover Electric Sheep sacrifice-before-draw, refund, retained starter control card, depleted deck/discard, seeded recycling and card conservation; Insider Trading exact duplicate discards, hand-size benefit and atomic shortfall rejection; Jetpack destination capacity, occupied/unknown/mixed responses, query/RNG isolation, refund and unresolved threat destinations. The shared `phase-relocation.snap` and `phase-relocation.events.json` assert the pending window and ordered semantic events. Canonical foundation/choice goldens are refreshed for the added provisional definitions; all frozen historical fixtures remain byte-identical.

Synthetic explicit normal-movement effects test beginning-phase threat response, paid public roll, post-roll assignment, surviving-threat retaliation, elimination and deferred marker/threat reset. Canonical Jetpack does not inherit that synthetic policy. Shared gaps remain PHASE-EFFECT-ORDER, FORCED-DISCARD-SHORTFALL (T-RULES-007), JETPACK-THREAT-ACTIVATION (T-RULES-008), broader reaction timing and remaining content. All six phase cards remain provisional; no language gap is introduced.


Phase-event journals preserve elimination → discard → draw → phase advancement, including cards immediately recycled into hand. Both suites also assert `golden/phase-sacrifice.events.json`, `golden/phase-combat.snap` and `golden/phase-combat.events.json`; the latter covers choice, relocation, public roll, assignment and retaliation before phase resumption. `ValidatePhaseEffect` / `validatePhaseEffect` rejects unsupported triggers/kinds/counts/policies during construction. Queries expose accepting retaliation, and tests cover explicit placement without activation as well as normal movement with/without a Delete response. The sandbox formats choice/discard/relocation events directly. Trace commands retain their existing formats; source-bound checksums reject older canonical corpora and historical frozen traces retain their checksum.


## Source lifecycle and Dummy replacement wave

| Concept | Go | TypeScript |
| --- | --- | --- |
| Explicit historical corpus | `GameData.RegressionFixture` | `GameData.regressionFixture` |
| Source state / physical pawn pools | `RulesVersion` / `Reserve` / `OutOfGame` | `rulesVersion` / `reserve` / `outOfGame` |
| Control-card zone | `ControlCardState.Zone` | `controlCards[].zone` |
| Replacement attempt / final cleanup | `attemptEliminatePawn` / `finalizePawnElimination` | `eliminatePawn` / `finalizePawnElimination` |
| Pending replacement | `PendingEliminations` / `DecisionSerial` | `pendingEliminations` / `decisionSerial` |
| Defender response query | `PreventionResponses` / `AvailableAction.Responses` | `preventionResponses` / `AvailableAction.responses` |
| Replacement response | `ResolveEliminationChoice` | `resolveEliminationChoice` |

Both prevention suites verify a defender response during another player's turn, exact attachment consumption/refund, retention of other benefits, ordinary-action rejection, stale/mixed/unauthorized responses, query/RNG isolation, queue/pool clone isolation, a second attack after protection is spent, Reboot retention versus reserve/common cleanup, typed placement and whole-piece conservation. They share `golden/prevention.snap` and `golden/prevention.events.json`. Tests also cover failed Black ICE, area attacks, fixed retaliation during a beginning movement, deferred phase reset, unsupported handler rejection, and atomic rejection of sacrifice or simultaneous protected casualties. Both compatibility reducers now roll back rejected resolutions; TypeScript also removes optional fields created after its backup.

Direct bilingual p.5 review corrected unused starters: source-mode pieces/cards go out of game. Source-foundation tests cover two/three/four-player exclusion. Canonical source goldens now include version, reserve/excluded pools and card zones; frozen snapshots and corpus bytes are unchanged. Go block-effect APIs now return errors alongside results so replacement failures propagate through Search and Icebreaker. TypeScript mirrors the same failure behavior by throwing to the atomic reducer.

Dummy remains provisional under PREVENTION-SACRIFICE and PREVENTION-SIMULTANEOUS (T-RULES-010). Full source control-card content, starting-player die setup, attachment class/slot cascades and later modes remain shared gaps. No temporary language gap is introduced. The sandbox has an explicit Dummy fixture and public piece/card-zone projection; it replays/undoes defender-owned pending decisions with canonical checksums.


The same re-audit adds SR-CARD-008 own-class grants and corrects printed Accelerator/E-Synapse names and classifications in shared data. Both `source_attachment_classes_test.go` and `source-attachment-classes.test.ts` verify grant/native-definition isolation, paid takeover cleanup and `golden/attachment-classes.json` query parity across seven records. The inspector shows these engine-computed classes.

SR-CARD-009 revokes the old Cracker-card pilot: the canonical alias now names Gentleman Loser, a Block attachment with `on-attach` placement intent. Playing its Icebreaker strip no longer places Cracker. Both mirrors reject its unsupported attachment resolution atomically and refuse to treat it as official content even if provisional flags are cleared. Generic pool-placement tests now use an explicitly synthetic card. Frozen typed-effect fixtures retain their old data/behavior and are labeled historical. Block-extension placement and target decisions remain T-RULES-013; target-class/slot lifecycle remains T-RULES-012. No mirror gap is introduced.

Source-version states also route `Apply` / `applyAction` through live authority and phase checks. Only explicitly tagged historical fixtures retain phase-free compatibility dispatch. Primitive resolution helpers remain separate from the command API. Mirrored tests reject phase and foreign-player bypass through the compatibility entry as well as through the eventful entry.

## Malware attachment eligibility delivery

`Attach.ForbiddenClasses` / `Attach.forbiddenClasses` load the same schema field. Source attach reducers require an existing effective-class match when `class` is present and reject any `forbiddenClasses` match before payment. Own-class aggregation no longer treats target restrictions as grants; only explicit frozen-regression data retains that behavior. The three provisional synthetic class placeholders were migrated in the live JSON; historical corpus bytes and golden traces remain untouched.

Both `attachment_restrictions_test.go` and `attachment-restrictions.test.ts` verify native and gained Operative exclusions, required-class matching and exclusion precedence, inability to qualify a card using its own class, query/rejection RNG isolation, Worm recycle capacity, cancelled Delete/movement, separate action-strip use and takeover cleanup. All three share attached/cleanup snapshots and ordered events in `golden/attachment-restrictions.json`. Canonical fixture snapshots were refreshed for the expanded source deck; frozen regression goldens retain their original checksums. The sandbox's Malware target restrictions fixture, editor exclusion field and browser/replay tests exercise these contracts. No language gap is introduced; provider-dependent slot cleanup remains T-RULES-012.

## Physical attachment slots delivery

| Concept | Go | TypeScript |
|---|---|---|
| Chosen physical location | `Attachment.SlotRef`, `Action.SlotRef` | `Attachment.slotRef`, `Action.slotRef` |
| Rooted location queries | `PawnAttachmentSlots`, `AvailableAttachmentSlots` | `pawnAttachmentSlots`, `availableAttachmentSlots` |
| Single-card and descendant removal | `DiscardPawnAttachment` | `discardPawnAttachment` |

Both `attachment_slots_test.go` and `attachment-slots.test.ts` verify repeated copies in distinct locations, native/granted slots of the same type, explicit ambiguous choices, occupied/unreachable refs, grounded grants, read-only fixture inference, query/RNG and rejected-command isolation, clone independence, phase and prevention cleanup, unrelated benefits, and physical card/counter conservation. They assert shared attached/cleaned snapshots and ordered events in `golden/attachment-slots.json`. Source state/snapshot protocol advances to `source-v2`; source goldens are refreshed while historical fixtures remain byte-frozen.

The sandbox renders engine-enumerated source attachment choices, sends the chosen reference and shows slot occupancy. Host tests execute nested cleanup across ordinary phase progression and verify replay/undo; browser acceptance covers selection and resumed reference preservation. The canonical checksum adds the rules stamp and explicitly rejects old source traces. This generic prerequisite does not complete the remaining Gunhed/weapon/module content or cumulative Delete activations. T-RULES-012 continues with those component corrections; no temporary language gap is introduced.

## Printed Delete delivery

| Concept | Go | TypeScript |
|---|---|---|
| Printed contribution | `Attach.Delete`, `DeleteAttribute` | `Attach.delete` |
| Strength/badge query | `PawnDeleteProfile` | `deleteProfile` |
| Supported activation routes | `DeleteActivationOptions` | `deleteActivationOptions` |

`delete_attributes_test.go` and `delete-attributes.test.ts` cover Gunhed/AK-12kM/Servocanon copy counts, strips, costs, slots and attributes; independent card/free routes; native and attached strength; cancelled activations; insufficient cost; free-use exhaustion/reset; invalid repeated rolls/assignments; pending public-roll snapshots; physical card conservation; takeover refunds; direct/split/area payment semantics; source joint initiator/contributor separation; and malformed/unsupported definitions. Shared `golden/delete-attributes.json` asserts installed and public free/paid windows, next-turn reset, query options and ordered accepted events. Source evidence was regenerated against the corrected deck; frozen corpus evidence remains untouched.

T-RULES-014 records the EN/ES p.26 conflict. Multiple free activators are rejected atomically in both mirrors, while a separate paid route remains legal. Movement p.25 wording agrees and is not revoked. Gunhed and AK-12kM are promoted; Servocanon remains provisional. The sandbox consumes the engine's independent roll choices, shows printed skulls/activators and replays the new Test Lab fixture with a clearly synthetic adapter/defense profile. Editor controls retain printed Delete strength separately from activation. The existing CI suite discovers all new tests; no mirror gap is introduced.

## Virus and Lima Flag delivery

Both mirrors load the same `gain-target-control` effect and `Attach.ForbiddenDestinations` / `Attach.forbiddenDestinations`. The first executes only after legal zero-cost Enemy attachment; it journals all discards, refunds and physical card transfer. Neutral targets now reject in source mode, while frozen regression semantics remain unchanged. The second governs entry into a Central Core category across space/card/rolled/hex movement. Post-discard relocation previews distinguish settled movement/placement and isolate unresolved source wording.

`malware_control_movement_test.go` and `malware-control-movement.test.ts` assert `golden/malware-control-movement.json`: before/after states, Virus slot options, Lima movement targets and ordered semantic events. Mirrored tests cover gained Cleaner classes, consumed source card, paid-counter refunds to the former owner, physical-card conservation, class/own/neutral/range/slot rejections, whole-path/hex entry, internal/exit movement, action-strip separation, explicit versus unresolved relocation policy, discard-before-movement and rejected state/RNG. The raw Go target JSON now uses TS-compatible `coord`/`spaceId` keys; this was exposed by comparing the shared targets directly rather than normalizing them away.

Both sandbox fixtures exercise the real engine handlers using explicitly synthetic target class/topology where required. Host tests cover control-card transfer, options, invalid movement, replay and undo; browser tests verify takeover logs/refunds, movement choices and editor field retention. All source goldens were refreshed for the two added live cards; frozen fixture bytes were not changed. Spammer persistence remains T-RULES-015; Trojan hand reveal is delivered in the following section, while broader official setup/content/mode gates stay open. No temporary language gap is introduced.

## Trojan and player-view delivery

`Attach.ControllerHand` / `Attach.controllerHand` loads the shared `face-up` policy; both source constructors reject unsupported values and block attachments. Trojan has bilingual verified identity, symbols, no cost, one copy and strip. `ControllerHandRevealed` / `controllerHandRevealed`, `PlayerView` / `playerView`, and `EventsForPlayer` / `eventsForPlayer` mirror the ADR-0009 projection contract. They detach nested values and preserve state/RNG. Public view format is `zaibatsu-player-view/v1`; canonical trusted snapshot shape stays unchanged.

`player_view_test.go` and `player-view.test.ts` cover owner/opponent/spectator privacy, pile counts, authorized/off-turn choices, current draws versus historical journal privacy, unknown viewers, option isolation, clone equivalence, costs/conservation, attachment versus strip use, takeover, elimination and provider/duplicate reveal cleanup. Both assert shared `golden/player-view.json` intermediate views and ordered semantic events. Sandbox host/browser tests cover reveal perspectives, replay, undo and editor retention. Source goldens were refreshed for the new physical card; frozen corpus bytes remain unchanged. No language gap is introduced. Search reveal/placement choices are delivered in the following section; authenticated network transport remains a separate requirement; local operator access is explicitly trusted.

## Source Search decisions and protocol v3

`PendingChoice.BlockID` / `blockId` and `Reference` / `reference` hold the drawn physical block. `BeginSearch` / `beginSearch`, `SearchDeclarationError` / `searchDeclarationError`, `SearchPlacementResponses` / `searchPlacementResponses` and `ResolveSearchPlacement` / `resolveSearchPlacement` mirror the commit → draw/reveal → authorized placement sequence. Source queries are independent of hidden tile order. Typed `block-drawn` and `block-placed` events bracket the pending window. `SupportsSearchBlockEffect` / `supportsSearchBlockEffect` gates the registered placement subset; unsupported official content fails construction.

`search_choice_test.go` and `search-choice.test.ts` share `golden/search-choice.json`: pre-declaration, committed draw with byte-identical pending snapshot, response options, observer reveal, placed state and ordered events. Tests cover free-use timing/reset, repeated duplicate physical costs, exhausted piles, public geometry, illegal/stale/unauthorized/interleaved responses, clone/query/RNG isolation, bonus/threat timing, physical block/card conservation and explicit unsupported definitions. The source sandbox consumes engine declarations and responses, previews only revealed tiles and exercises replay/undo on both sides of the choice. Browser tests cover controls, disabled phase skips and restored pending decisions.

Source constructors now emit `source-v3`; source checksums include `source-v3/search-choice`. Previous source slot checksums are rejected clearly. Envelope v1/v2 and frozen corpus behavior/checksums stay compatible. Source goldens were regenerated; no frozen evidence was changed. This completes T-RULES-017's generic sequence, while full printed block/effect coverage and remaining modes stay open; roll-before-choice movement is delivered in the following section. No temporary mirror gap is introduced.

Source Search placement journals `block-placed`, newly formed `bonus-icon-created` events, then any supported area-effect `roll` in printed order. Tests force a later threat-data failure after that roll and prove rollback restores the pending tile, board, pile and RNG without refunding the prior accepted activation.

## Rolled movement decisions and source protocol v4

| Concept | Go | TypeScript |
|---|---|---|
| Committed movement descriptor | `domain.PendingMovement` | `PendingChoice.movement` |
| Roll eligibility | `RolledMovementError` | `rolledMovementError` |
| Commit and roll | `BeginRolledMovement` | `beginRolledMovement` |
| Pure path prefix projection | `MovementChoicePreview` | `movementChoicePreview` |
| Authorized finish/stop | `ResolveMovementChoice` | `resolveMovementChoice` |

Both mirrors accept `roll-movement` before a `move-path` choice, preserve its paid card/use and public dice through rejected responses, and use the committed budget exactly once. Observers see public movement data; only the responder gets options. Native cannot-move and attached cancellation now reject every source movement route, including within-block entry and explicit normal relocation. Explicit placement remains separate. Independent card movement options are exposed alongside and after a free movement ability. Legacy dice-use-count metadata is rejected by source constructors; frozen runtime retains it explicitly.

`movement_choice_test.go` and `movement-choice.test.ts` assert `golden/movement-choice.json`: committed byte-identical snapshots, options, observer view, occupied prefix, completion events and zero-budget option JSON. Tests cover costs/copies, native/granted dice, one/two dice, zero stop, marker commit/reset, stale/unauthorized/over-budget/interleaved rejection, pure views/clones/RNG, occupancy, Core entry, cancellation, threat stops, stealth and placement-versus-movement. Sandbox host/browser tests cover roll-first controls, exact-budget previews, occupied pass-through, replay and undo.

Current source state is `source-v9`, checksum stamp `source-v9/internal-arrows-block-discards`; prior v2/v3/v4/v5/v6/v7/v8 source checksums reject clearly. Trace envelopes and frozen corpus/snapshots/checksums remain unchanged. Source goldens were refreshed. Go source occupancy diagnostics now match TS and the shared preview exactly, retaining historical frozen message formatting.

Physical marker continuity now executes in both mirrors under SR-MOVE-005/ADR-0012. `use_markers.go` maps to `use-markers.ts`; both store native references by control-card subject and active uses inside stable attachment instances. `use_markers_test.go` and `use-markers.test.ts` assert `golden/use-markers.json` for spent/captured/reset snapshots, observer allocations and ordered events. Equivalent tests cover duplicate independence, provider cleanup, unrelated reindexing, retained/common/reserve cards, native ability families, clone/query isolation, rejected reuse/RNG and strict official construction. Sandbox host/browser evidence covers capture, inspector state, beginning reset, replay and undo.

T-RULES-021 remains an accepted shared gap: discarded attached-card marker removal and deck/hand physical copy reuse are unresolved. Both preserve `unresolvedUseCards` evidence, reject affected reattachment before costs/RNG and gate strict official limited-use bundles. Evidence is excluded from card/counter conservation totals. T-RULES-019/SR-MOVE-005 therefore remains partial. Frozen keys/goldens/checksums are unchanged; no printed mover/block is newly promoted. There is no temporary Go/TS implementation gap.


SR-MOVE-006/T-RULES-020 now accepts zero-step fixed/card movement in both mirrors. `zero_movement_test.go` and `zero-movement.test.ts` assert `golden/zero-movement.json` for isolated action options/responses, native spent state, two duplicate physical card payments, final state and ordered events. Equivalent tests cover clamped zero allowance, free/paid limited grants, costs, ownership/cancellation, pending work, phase/winner rejection, unchanged full state/RNG, no threat awakening, beginning reset and frozen rejection. Sandbox controls consume engine fixed/card templates, support current-space finish, and replay/undo both costs. Source goldens refreshed to v6; frozen fixtures/checksums remain unchanged. No temporary mirror gap or full mover/mode completion claim.


SR-BOARD-006/007 and SR-DEFENSE-001 execute in both mirrors. `PlaceNeutralPawn` maps to `placeNeutralPawn`; `DefenseProfile` maps to `defenseProfile`; `ValidateSpaceModifier` / `ValidateBlockDefenseSpaces` map to the same camelCase helpers. Shared JSON includes exact space defense dice, non-playable zones and a distinct neutral placement effect. Both loaders retain those fields. Source v7 stamps reject previous source semantics, and all source goldens are refreshed; frozen fixture bytes and checksum remain unchanged.

`toyeku_test.go` / `toyeku.test.ts` assert `golden/toyeku.json` for the verified tile, initial/pending/placed snapshots, 36 public placement responses, observer state and ordered neutral events. Equivalent tests cover exact topology/capacity/ICE/corners, matching space/card zones, physical-piece conservation, real movement, no phantom center shortcut, repeated block control without pawn capture, invalid reserve/card states, clone isolation and unchanged RNG. The retained id `idoru` is a block alias, not proof that the provisional Idoru pawn is complete.

`defense_spaces_test.go` / `defense-spaces.test.ts` assert `golden/defense-spaces.json` against p.21's exact profiles and armor/space composition. Both mirrors cover every pawn attack route, fixed threat retaliation, moving away, detached queries/data, numeric/malformed rejection and preservation of a committed public roll. Strict official construction rejects unsupported numeric defense modifiers. Sandbox host/browser checks cover real Toyeku placement, neutral inspector/events, current defense, replay/undo and persisted editor dice/title-zone controls. There is no temporary mirror gap. Full Idoru behavior remains T-RULES-023; Hacktivism/Sprawl remain T-RULES-006.

## Control-card markers and Idoru source correction

`control_markers.go` / `control-markers.ts` mirror actual pawn acquisition, counted card allocations, available-marker costs, return-before-new-allocation takeover, immediate victory and detached physical-location queries. Both domain/loaders retain `ControlMarkerEffect` and `ControlCardMarker`; classless Idoru has exact ICE1/6, all six defense faces, card movement, no native ability and two slots. The live pawn/card stays provisional for SR-PAWN-004/T-RULES-023/025.

`control_markers_test.go` / `control-markers.test.ts` assert `golden/idoru-control-markers.json` for attributes, initial/gained/transferred states, public observer projection and ordered semantic events. Tests cover preview RNG, allocation/view/clone isolation, repeat zone synchronization, malformed/missing/exhausted marker rejection, victory, literal reserve/common retention and explicit rejection of unresolved same-owner reacquisition. The source event journal omits absent previous owners in both mirrors. Effect errors now propagate in both pipelines, including typed placement. There is no temporary mirror gap.

Source protocol is now `source-v9`, checksum stamp `source-v9/internal-arrows-block-discards`; changed rules/data cannot replay as older source semantics. Historical regression data and trace/checksum remain unchanged. The sandbox's Idoru marker fixture exercises engine-owned Icebreaker selection, marker inspection, victory, replay/undo and source attributes. This is partial rule coverage, not complete Idoru, Hacktivism or official-match acceptance.

## Internal arrows and Sprawl block decisions

`space_arrows.go` / `space-arrows.ts` validate and filter directed internal links; `block_discards.go` / `block-discards.ts` mirror controlled/retained pawn counting, private per-player physical-hand commitments, deferred public discards and viewer-owned options. Both models/loaders/snapshots/clones include SpaceArrow and PendingBlockDiscards. Go's action defaults and TS's optional zero-valued unused fields are handled equivalently. Hacktivism's typed unresolved effect rejects instead of being silently skipped.

`sprawl_test.go` / `sprawl.test.ts` assert golden/sprawl.json for both corrected tiles, initial/revealed/placement/first-commit/final snapshots, each owner's options, masked projections and ordered semantic events. Equivalent tests cover forward/reverse/alternate links, a rotated cross-edge exit, Octagon attachment/removal, malformed arrow schemas, retained ownership, duplicate cards, reverse response order, stale/wrong/extra choices, phase/action interleaving, shortfalls and unchanged state/RNG. Host/browser tests exercise placement, partial commitments, replay/undo and actual arrow-filtered movement; model/browser tests retain authored links through save/load/export. There is no mirror gap.

Source protocol is source-v9, checksum stamp source-v9/internal-arrows-block-discards. Source goldens refresh under these semantics; old source-v8 traces reject clearly and frozen fixture bytes/checksums/behavior stay intact. SR-MOVE-007 is implemented. Hacktivism and Sprawl remain partial/provisional for T-RULES-025/026; no full mode is accepted.

### Antro optional stops and Phase-Loop (source-v10)

Both mirrors now share `SpaceEffect`, space-discard decisions, `Action.attachmentId`, `SpaceEffectResponses` / `spaceEffectResponses`, stop validation, atomic response/cleanup and phase resumption. Engine-owned options are pure and owner-scoped. Source fixed/card/hex/rolled movement shares the stop hook; normal relocation pauses beginning completion while the optional choice is pending. Rejected responses preserve committed movement rolls/use markers and full state/RNG. Shared `golden/antro.json` records Search, the optional window, physical responses, provider removal/refunds and ordered events. Mirrored tests cover Gadget removal, opponent Add-ons, illegal responses, pass-through/zero/return stops, malformed identity rollback, relocation policy and strict official rejection. Antro remains partial under T-RULES-027.

`EffectiveIcebreakerModifier` / `effectiveIcebreakerModifier` merges acting pawn/attachment attributes; Phase-Loop is source-verified in shared data with extra die1, immunity, hand−2, cost1 and its separate strip. Tests cover both target routes, failed Black ICE before/after removal and absent target ICE. Sandbox physical response buttons, modifier inspector, trace/undo/recovery and editor retained fields cover this slice. Current source protocol/checksum advances to source-v10 / source-v10/optional-space-discard, rejecting v9 traces; frozen22 files and historical replay remain unchanged. This does not accept a full official mode.

### Electromagnetic Pulse and public sacrifice commitments (source-v11)

Both mirrors share typed threshold/amount data, `PendingBlockSacrifices`, per-owner choices, pure executable/unresolved target queries, public selected-pawn events, whole-batch revalidation and normal sacrifice cleanup. Either owner can commit first; eliminated pieces/refunds wait for the full batch, then use stable seat order. Shared `golden/emp.json` covers Search reveal, pending choices, options, public committed views and final states/events. Tests cover source geometry/defense/ICE/bonus/arrow, retained control counts, Reboot retention versus reserve/common release, provider attachments/refunds, card/piece conservation, authority/interleaving, invalid/stale choices, final revalidation, cloning/RNG, unsupported prevention and strict official gates.

TS `block-sacrifices.ts` maps to Go `block_sacrifices.go`; query/choice/validator names have their usual casing. Source snapshots/checksums advance to source-v11 / source-v11/global-pawn-sacrifice, rejecting prior v10 traces. Source goldens refresh; frozen22 bytes and historical semantics stay unchanged. Sandbox Test Lab, player/spectator views, replay/recovery/undo and editor threshold save/load/export cover the delivery. SR-BOARD-011 remains partial under T-RULES-029/010; the experimental public-batch policy is not a full rule interpretation acceptance.

### Copyleft and physical bonus reserve (source-v12)

Both mirrors now load source supply24 from mode data, copy it into state and derive public reserve/free/invested/onBoard quantities. `bonus-pool.ts` maps to `bonus_pool.go`; grant, reserve guards and descriptor checks are shared concepts. Bonus icons allocate real counters before block effects, then transfer them exactly once on collection. All positive card/threat/block awards share the guard; existing pay/refund/provider cleanup preserves allocation totals. Go detection/collection helpers return errors, with all callers updated; TS throws. High-level state/action/phase entry points remain compatible. Frozen files and historical payouts are unchanged.

Shared `golden/copyleft.json` asserts byte-identical initial, revealed, on-board and collected snapshots plus public views/options/pool summaries and ordered allocation/award/collection events. Mirrored tests cover exact geometry/arrow/defense/normal artwork spaces, four-player awards without board-pawn requirements, exhausted-reserve collection, paid attachments/refunds, card/threat reserve guards, malformed allocations/descriptors, pure funded-orientation previews, invalid choices/RNG and official gates. Public queries and snapshots/clones detach new fields. The spec validator cross-checks supply against sourced inventory. Source state/checksums advance to source-v12 / source-v12/physical-bonus-reserve and reject v11 source traces.

Sandbox Copyleft staging, pool summaries, semantic history, replay/recovery/undo and editor save/load/export cover the delivery. The previous Eiko pawn-prerequisite plan was revoked by source inventory/control-sheet review; no such pawn was invented. SR-BOARD-012/SR-BONUS-001 remain partial for T-RULES-030/031 shortage interpretation. This is not full official mode or resource-policy acceptance.

The card/token award cases in the physical-pool tests are explicitly synthetic probes of existing handlers. They do not verify or promote new Shadowraiders rewards, missions, medals or component records.

## Clandestine Broadcast Core permission

SR-BOARD-013/T-RULES-032 adds the bilingual verified p3 tile1: three spaces, one large unlimited defense4/3 circle, white ICE2/6, six entrances and no bonus/arrows. Shared typed `controller-core` under-control data names the landing space. Go `reboot_destinations.go` / TS `reboot-destinations.ts` validate descriptors and expose pure detached `RebootDestinations` / `rebootDestinations`. They derive current permission from block control rather than storing another mutable grant. The physical setup Core stays `isCentralCore`.

All three Reboot action routes support an explicit coordinate/space destination, retaining activation, physical costs, multiplicity, retained ownership and phase gates. Go's low-level entry points accept an optional variadic SpaceRef; TS uses an optional SpaceRef. Omitted destinations preserve the original Core behavior. Both action queries enumerate actual legal destinations and free activation; clone/player views preserve them through existing ownership fields.

Seven tests per mirror cover source attributes, shared byte snapshots/options/views/events in `golden/broadcast.json`, pure queries/RNG, control loss, duplicate costs/conservation, all routes, malformed/unauthorized/stale phase decisions, special defense/normal capacity, Search/control and last-marker takeover victory. Isolated strict constructor acceptance proves only this handler, not complete official content. Sandbox destination controls, replay/recovery/undo and editor save/load/export cover the rule. Source protocol remains v12 because existing commands retain their meaning; changed shared content updates the checksum, so incompatible older content traces reject. All source goldens were refreshed; frozen fixture bytes remain unchanged.

## Pink District and native Gynoid phase choices

SR-BOARD-014/SR-PAWN-005 add verified Pink District topology and corrected Gynoid attributes/shared native theft data. Go `controlled_placement.go` / TS `controlled-placement.ts` validate physical pawn/card/home placement, repeat relocation, ownership-sensitive attachment cleanup/refunds and immediate source victory stops. Optional event sinks on block effects/Icebreaker keep old entry points compatible while recording the new ordered operation.

Go `pawn_phase_effects.go` / TS `pawn-phase-effects.ts` validate native descriptors and join the existing queue. A single beginning obligation opens owner-authorized target/skip responses without RNG; acceptance selects exactly one physical hand index, including duplicate/friendly cases. Native source/control/timing and stale/invalid commands reject atomically. Queue snapshots/clones include source/scope/target/optional fields in canonical order; completion performs normal marker cleanup. Inferred hand deltas recognize a transfer receipt without emitting a duplicate draw.

`card-stolen` identities are visible to both transfer parties; unrelated histories mask them unless event-time source hand reveal sets `cardRevealed`. A Trojan removal test proves historical public visibility does not depend on current attachments. `golden/gynoid.json` asserts byte-identical setup, tile/control, pending native and finished snapshots plus options, observer projection and ordered/private histories. Eleven tests per mirror cover geometry/attributes, physical conservation, costs/refunds, query/RNG purity, decline, authority, phase/cleanup, repeat control and victory, malformed data and independent official gates. Ordinary turn handoffs after a pawn takeover prove the next native decision belongs to the new controller rather than its former owner. Gynoid remains provisional under T-RULES-005; no simultaneous order is invented.

Sandbox Pink control and Gynoid theft scenarios consume engine choices, expose native meaning in the inspector and support trace/recovery/replay/undo/reset. Editor matching-pawn effects retain/validate under-control timing through save/load/export. Source protocol/checksum advances to source-v13 / source-v13/native-phase-theft; earlier v12 source traces reject explicitly. All source goldens refresh and the frozen22 files remain unchanged. Loader/foundation assertions now account for the added physical Gynoid card.

T-RULES-036 also moves36 English control-card crop ids into the repeatable core artifact manifest, reconciling their former supplemental entries. Gynoid's shared asset reference now resolves; all201 core assets and228 unique review assets verify independently. Python detector/core-source tests run in CI. This is physical source integration, not promotion of the remaining pawn mechanics.

## Yakuza optional adjacent attack

SR-BOARD-015/T-RULES-037 adds exact EN/ES p4 tile1 data and shared `attack-pawn` under-control scope/optionality/skulls. Go `block_attacks.go` / TS `block-attacks.ts` validate descriptors, source control, target-before-roll timing and authorized choice responses. Both pure action queries expose decline plus literal live adjacent pawns, independent of movement edges/arrows/rotation. No pawn activation/cost or attack modifier is synthesized. Effective defense, ownership/attachment cleanup, single-defender prevention and immediate victory reuse shared operations.

Ten equivalent tests per mirror and `golden/yakuza.json` assert byte snapshots, both decision windows, pure options/views, ordered events, rollback/RNG, friendly/neutral targets, depleted targets, takeover, cleanup/refunds, arrows and malformed/strict loading. Sandbox Search/capture/attack/defender controls consume engine responses and support replay/recovery/undo/reset; editor scope/optional/skull controls retain save/load/export. Source protocol/checksum advances to source-v14 / source-v14/adjacent-block-attack; v13 source traces reject clearly and source goldens refresh. The22 frozen files remain unchanged. This accepts Yakuza's component behavior only; full setup, deck, content and modes remain open.

## Corporate Scandal whole-hand thresholds and card timing

SR-BOARD-016/T-RULES-038 adds verified EN/ES p4 tile2 geometry, own ICE5/6, shielded3, four fragments and shared `discard-hands-above-markers` / `markerThreshold:5`. Go `block_hand_discards.go` / TS `block-hand-discards.ts` validate descriptors and derive physical Cybernet marker allocations, including Idoru's counted card. Successful capture and old-marker return precede the exclusive threshold. Every qualifying remaining hand discards without a choice/RNG; duplicate copies have separate public receipts, including a zero-card qualifying event.

Source card-paid block Icebreaker validates before moving its payment to played cards, before rolling/control effects. Both low-level APIs retain existing signatures/call compatibility; frozen payment behavior remains unchanged. This prevents whole-hand effects from swallowing the activating card. Typed source capture receipts now record control before dependent block effects. Eleven equivalent tests per mirror and golden/corporate-scandal.json cover byte snapshots, pure options/views/RNG, five/six and Idoru counts, takeover, duplicates, empty/multiple players, failed/illegal captures, exact ring/defense and immediate victory. Sandbox/editor replay/recovery/undo/reset/save/load/export expose the effect and threshold.

Source protocol/checksum advances to v15/marker-hand-discard; prior v14 source traces reject clearly, all source goldens refresh and22 frozen files remain unchanged. Component behavior is accepted; complete official corpus, deck/setup and modes remain unaccepted. Continue p4 tile3 Black Clinic after primary-source verification.

## Black Clinic and current hand-space profiles

SR-BOARD-017/T-RULES-039 adds exact Black Clinic geometry, unlimited lower special space, vulnerable1/2, signed hand-minus1, own ICE3/6, four fragments and helmet-to-hand arrow. Shared mandatory `discard-pawn-attachments` / Cybernet scope maps to Go `block_detach.go` and TS `block-detach.ts`. Source-controller choices retain block identity and offer all live Cybernet pawns without invented enemy/range/attachment/decline restrictions. Ordered events, cleanup/refunds and continuous reveal/slot removal preserve control and physical inventories. Existing T-RULES-021 spent-card reuse evidence/gate remains intact.

SR-TURN-008/T-RULES-040 implements Go `HandSizeProfileFor` / TS `handSizeProfile`: mode/player base plus current attachment and stopped controlled-pawn space contributions, nonnegative physical maximum, used at recycling. The source occupancy interpretation is documented in the rule module. Public projections and sandbox show detached profiles without exposing hidden hands. Frozen attachment-only semantics/views remain unchanged.

Twelve equivalent tests per mirror and golden/black-clinic.json assert byte snapshots, pending choices, options/views/profiles, ordered receipts and refill. Cases cover authority/stale/illegal commands and RNG, nested cleanup/refunds, neutral/distant/empty/retained targets, Dummy/Trojan, spent metadata/reuse guard, geometry/capacity/defense/arrows/Octagon, hand aggregation/control/leaving/clamp, takeover and immediate victory. Sandbox/editor target/cleanup/hand-limit controls support replay/recovery/undo/reset/save/load/export. Source protocol/checksum is v16/global-pawn-detachment; prior v15 traces reject, all24 source evidence files refresh and22 frozen files remain unchanged. This does not accept any complete official mode.

## Engineering War and native Drone MK-2

SR-BOARD-018/T-RULES-041 and SR-PAWN-006/T-RULES-042 add verified bilingual shared content using existing schema/loaders/domain/handlers in both mirrors. Engineering War has three spaces, only two side entrances, exact excluded title/effect zones, ICE3/6, vulnerable defense1 and five fragments. Its teal inner-circle glyph is artwork under the recorded source reading. Controlled placement deploys the one MK-2 pawn/card into its matching unlimited home, repeats relocation/acquisition, applies ownership-sensitive module cleanup/refunds and stops on immediate victory.

Drone MK-2 has native free5 movement, additional paid movement, one-skull card Delete, Module-only eligibility, exact defense1–3 shielded and ICE2/6. Physical native markers survive takeover/common release and clear at the current controller beginning. Twelve equivalent tests per mirror and golden/engineering-war.json cover byte snapshots/options/views/events, two-entrance rotations, real Search/capture, five-step/occupied/zero/cost limits, public roll then assignment, Module/Servocanon single-free interaction, full turn/controller timing, elimination/reentry, matching pools, rollback/RNG and immediate victory. Single-free tests do not resolve T-RULES-014/021.

Sandbox source controls expose placement rotations, capture, native movement and paid public combat through engine options with replay/recovery/undo/reset; editor save/load/export retains matching target and geometry. Loader/foundation assertions account for the new seventh control card. Source protocol/checksum advances to v17/engineering-mk2; v16 source traces reject clearly, all25 source evidence files refresh, and22 frozen files remain unchanged. Full official content/setup/deck and all mode acceptance stay open.

## Combat Prototypes and native Drone Probe

SR-BOARD-019/T-RULES-043 and SR-PAWN-007/T-RULES-044 add bilingual shared content without new schema fields or engine branches. The block has five spaces, four entrances, exact excluded art zones, ICE4/6 and five fragments; capture uses existing matching controlled placement with ownership-sensitive cleanup, physical card/pawn guards, retained uses and immediate-victory stop. Probe has Drone, Module-only slot, shielded1–2, ICE1/3/6, independent free Search and five-step movement; its decorative skull grants no native Delete.

Thirteen equivalent tests per mirror and golden/drone-probe.json compare snapshots/options/views and ordered events through capture, free reveal, authorized placement and independent movement. They cover hidden-safe pure eligibility, empty hands/piles/sealed edges, invalid costs/responders/interleaving and RNG rollback, separate native/card sources, takeover/reset, one Module free Delete without a paid badge, common/reserve elimination and victory. Experimental Sprawl shortfall and EMP sacrifice handoffs retain committed Search without promoting T-RULES-007/025/029. T-RULES-014/021 remain separate.

The sandbox/editor expose the existing engine-owned options, four entrance rotations, cost-free Search and independent movement with replay/recovery/undo/reset and source-target save/load. Source protocol/checksum advances to v18/probe-free-search; prior v17 checksums reject clearly. All26 current source evidence files refresh;22 frozen fixture files remain unchanged. Full official deck/content/setup and every complete mode remain open.

## Military Development / Turret and controller-owned off-turn abilities

SR-BOARD-020/T-RULES-045, SR-PAWN-008/T-RULES-046 and SR-TURN-009/ADR-0025 execute in both mirrors. Shared schema pawn abilityTurn maps to Pawn.AbilityTurn; permittedAbilityTurn/PermittedAbilityTurn implements typed ability timing without active-turn mutation. Controller-aware rollDelete/RollDelete retains default callers; assignDelete/AssignDelete uses pending attack ownership. availableActions/AvailableActions and playerView/PlayerView include permitted private controller options and authorized assignments. Present invalid permissions/played owners reject.

playedCardOwners/PlayedCardOwners parallels physical playedCards by index; consumeCard allocates source payers in all permitted phases, recycle removes only that controller's physical entries, and clone/snapshot/player views preserve detached metadata. Other turn, control change or pawn elimination does not transfer/discard the paid card. Search/four-card Reboot remain immediate discard. Existing programmatic unallocated fixtures use the active-player fallback; frozen behavior is unchanged. Thirteen equivalent tests per mirror and golden/drone-turret.json cover byte snapshots/options/views/ordered events, native paid Delete/Module free use, all idle phases, hidden hands, real Search/capture, duplicate costs/own recycling, invalid authority/RNG, pending windows, Dummy, takeover/elimination, no movement and final victory. Separate Shadowraiders joint-threat and T-RULES-014/021 gaps remain live.

Military Development has three spaces, two side entrances, four excluded title/effect zones, exact ICE4/6 at V5, five corners and hand+1. Turret corrects the provisional free-Delete/ICE/defense pilot to exact bilingual data. Sandbox private handoff, controller-owned public assignment and face-up owner labels integrate existing options with replay/recovery/Undo/reset; editor target persistence and geometry checks pass. Trace import disables stale decision controls until its new view loads. Repeated-payment Search fixtures now explicitly order a known harmless second tile instead of depending on a changing shuffled corpus.

Source protocol/checksum advances to v19/any-turn-abilities; v18 source checksums reject clearly, all27 current source evidence files refresh and22 frozen files are unchanged. Current loaders account for nine control-card definitions. Complete official setup/deck/content and every mode remain unaccepted.

## Arms Industry funded physical block-counter slice

SR-BOARD-021/SR-BONUS-002/T-RULES-047 add the same shared effect identifiers and public PlacedBlock bonusCounter/BonusCounter model in both mirrors. validateBlockBonus/ValidateBlockBonus requires the exact placement1/control-collection pair; source construction keeps the T-RULES-031 strict reserve-shortage gate even if provisional flags are removed. placeBlockBonus/PlaceBlockBonus allocates one reserve piece, collectBlockBonus/CollectBlockBonus transfers the held piece once without requiring reserve, and a first-recipient receipt prevents repeated capture awards.

Search funding sums new icon and block allocations before any commit. BonusCounterPool onBoard counts both physical board locations. Clone/snapshot/player views preserve detached counter state. Successful source Icebreaker now records control and eligible icon collection explicitly before under-control effects, rather than reporting an earlier icon transfer after a later block transfer through delta synthesis. Frozen semantics stay unchanged.

Eleven equivalent tests per mirror and golden/arms-industry.json compare snapshots/options/views and ordered events through actual Search/placement/movement/capture at empty reserve. They cover exact geometry/capacity/Black ICE/hand space, no allocation on reveal, combined shortage and pending-window rollback, pure/detached previews, duplicate placement/takeover, failed Black ICE, Dummy, missing/corrupt allocations, physical card conservation and final-marker victory. Sandbox counter badge/inspector, board-wide supply label, replay/recovery/Undo/reset and editor paired effects execute. The data remains provisional: funded implementation is not full component/mode acceptance.

Source protocol/checksum advances to v20/block-bonus-counters, older source traces reject clearly and28 source evidence generators refresh;22 frozen fixture files remain unchanged. No temporary mirror gap is introduced. Full official corpus/setup, unresolved interpretations and every ordinary full mode remain open.

## Cleaner B controlled placement

SR-BOARD-022/SR-PAWN-009/T-RULES-048 add the bilingual Cleaner (B) block, pawn and control card on the existing place-controlled-pawn, defense, hand-size and space-arrow contracts. No engine branch or schema symbol is added. Both mirrors load the same non-provisional records: five spaces, all-open edges, high ICE 6, one V3 fragment, hand−1, unshielded defense faces 1 and 2, one hand-to-circuit arrow, and one classless pawn with card-activated movement, one-skull card Delete and Add-on/Weapon/Armor slots.

Eight equivalent tests per mirror and golden/cleaner-b.json compare snapshots, options, views and ordered events through Search, placement, capture, hand limit, defense override, arrow rejection, attachment refund and same-controller retention, missing-piece rollback and last-marker victory. Sandbox replay, Undo and reset, and editor save/load of the target and arrow, use the same options. Source protocol/checksum advances to v21/cleaner-b-placement. Older source traces reject. Current source evidence refreshes because the added block changes the pile shuffle. The 22 frozen fixture files stay unchanged. The next printed tile is Cleaner A. No official mode is accepted.
