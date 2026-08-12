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
| Space visual footprint | `Space.Footprint` / `SpaceGridCell` | `Space.footprint` / `SpaceGridCell` |
| Pawn | `domain.Pawn` | `Pawn` |
| Action card | `domain.ActionCard` | `ActionCard` |
| Phase enum | `domain.Phase*` | `Phase` |
| RNG (seeded) | `domain.RNG` / `NewRNG(seed)` | `RNG` / `newRng(seed)` |
| Load game data | `data.Load(dir)` | `loadGameData(dir)` |
| New game | `engine.NewGame(cfg)` | `newGame(cfg)` |
| Apply action (reducer) | `engine.Apply(state, gd, action)` | `applyAction(state, gd, action)` |
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
| Space capacity | `domain.SpaceCapacity(type)` / `domain.Unlimited` | `spaceCapacity(type)` / `UNLIMITED` |
| Step budget | `engine.ResolveSteps(m,rng,extra)` | `resolveSteps(m,rng,extra)` |
| Movement gating | `engine.CanActivateMovement(p,pawn)` | `canActivateMovement(p,pawn)` |
| End-on capacity check | `engine.CanEndOn(...)` | `canEndOn(...)` |
| Hex movement | `engine.MoveHex(...)` | `moveHex(...)` |
| Attack roll | `engine.AttackRoll(rng,skulls)` | `attackRoll(rng,skulls)` |
| Defense-hit test | `engine.Defeats(roll,def)` | `defeats(roll,def)` |
| Delete ability | `engine.Delete(...)` | `deleteAbility(...)` ¹ |
| Multi-target Delete | `engine.DeleteMulti(...)` | `deleteMulti(...)` |
| Eliminate a pawn | `engine.` (internal `eliminatePawn`) | `eliminatePawn(...)` |
| Eliminated pool | `domain.GameState.Eliminated` | `GameState.eliminated` |
| Block controller | `domain.PlacedBlock.OwnerID` | `PlacedBlock.ownerId` |
| ICE faces (provisional) | `engine.IceFaces(ice)` | `iceFaces(ice)` |
| Icebreak a block | `engine.IcebreakBlock(...)` | `icebreakBlock(...)` |
| Icebreak a pawn | `engine.IcebreakPawn(...)` | `icebreakPawn(...)` |
| Search ability | `engine.Search(...)` | `search(...)` |
| Top-of-pile block | `engine.SearchTopBlock(s)` | `searchTopBlock(s)` |
| Valid search placements | `engine.ValidSearchPlacements(...)` | `validSearchPlacements(...)` |
| Reboot ability | `engine.Reboot(s,gd,pawn,player)` | `reboot(s,gd,pawn,player)` |
| Play card → Delete | `engine.PlayDelete(...)` | `playDelete(...)` |
| Play card → Icebreak block | `engine.PlayIcebreakBlock(...)` | `playIcebreakBlock(...)` |
| Play card → Icebreak pawn | `engine.PlayIcebreakPawn(...)` | `playIcebreakPawn(...)` |
| Discard 1 → Search | `engine.PlaySearch(...)` | `playSearch(...)` |
| Discard 4 → Reboot | `engine.PlayReboot(...)` | `playReboot(...)` |
| Attachment | `domain.Attachment` (`PawnOnBoard`/`PlacedBlock.Attachments`) | `Attachment` (`.attachments`) |
| Attach to own pawn | `engine.AttachToPawn(...)` | `attachToPawn(...)` |
| Attach to enemy pawn | `engine.AttachToEnemy(...)` | `attachToEnemy(...)` |
| Attach to block | `engine.AttachToBlock(...)` | `attachToBlock(...)` |
| Effective classes | `engine.EffectivePawnClasses(...)` | `effectivePawnClasses(...)` |
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

`spec/schema/` and `spec/data/` are **shared** — both impls read the same files.
A data change is a single edit; a *schema* change requires updating both loaders.

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
| Data loader | ✅ | ✅ | reads `spec/data/speedrunners` |
| Setup + marker counts | ✅ | ✅ | |
| Turn loop + phases | ✅ | ✅ | |
| Unified action reducer | ✅ | ✅ | `Apply` dispatches every ability/card/attach action; `RunTurn` drives a turn; identical (seed 123 delete) |
| Canonical snapshot + golden games | ✅ | ✅ | byte-identical snapshots; both mirrors assert the SAME `golden/*.snap` fixtures (whole-game + combat scenario) |
| Win detection | ✅ | ✅ | |
| Seeded RNG + shuffle | ✅ | ✅ | LCG, Fisher–Yates |
| Hex model + tile placement | ✅ | ✅ | axial coords; edge-connectivity + valid-orientation (Search) |
| Pawn positions + occupancy | ✅ | ✅ | pawns on core at setup; capacity by space type |
| Movement budget + activation | ✅ | ✅ | fixed/d6/2d6/hex + modifiers; card/once-per-turn/none gating |
| Hex movement execution | ✅ | ✅ | block-to-block; d6 sequence verified identical (seed 99) |
| Combat: Delete + elimination | ✅ | ✅ | single-target attack roll vs defense dice; full pipeline identical (seed 123) |
| Multi-target Delete | ✅ | ✅ | one die per co-located target (up to skull count); identical (seed 3 → roll [3,1]) |
| Icebreaker: block + pawn control | ✅ | ✅ | roll vs ICE faces (provisional), marker placement/steal, Black-ICE penalty; identical (seed 5 → [6], success) |
| Search ability (place from pile) | ✅ | ✅ | draws top of pile, places via placement rules; retryable on failure |
| Reboot ability | ✅ | ✅ | eliminated pawn → Central Core under rebooting player |
| Card-use: activate abilities | ✅ | ✅ | play matching card → Delete/Icebreak; discard 1 → Search; discard 4 → Reboot; identical (seed 123) |
| Card attachment | ✅ | ✅ | attach to pawn/enemy/block, slot + cost checks, discard+refund on elimination/takeover; state identical |
| Block visual layout metadata | OK | OK | six entrances, bonus corners, asset refs, and the source-confirmed seven-small-hex layout; footprints render hex/pill/large print coverage only, with no effect or movement resolution |
| Space-to-space movement | blocked | blocked | backlog - needs source-verified space-adjacency data |
| Card-use: move / attach | ⛔ | ⛔ | backlog — needs space movement / attach system |
| Shadowraiders expansion | ⛔ | ⛔ | backlog |

## Content-catalog parity

Both loaders expose the same optional `controlCards`, `threats`, `missions`, and
`modes` collections. Missing collection files load as empty arrays, while the
primary `mode.json` is always represented as the one-item `modes` fallback.

This is data-model parity only. It intentionally does not claim implementation
