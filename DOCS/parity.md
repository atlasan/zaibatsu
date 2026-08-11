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
| Pawn | `domain.Pawn` | `Pawn` |
| Action card | `domain.ActionCard` | `ActionCard` |
| Phase enum | `domain.Phase*` | `Phase` |
| RNG (seeded) | `domain.RNG` / `NewRNG(seed)` | `RNG` / `newRng(seed)` |
| Load game data | `data.Load(dir)` | `loadGameData(dir)` |
| New game | `engine.NewGame(cfg)` | `newGame(cfg)` |
| Apply action | `engine.Apply(state, action)` | `applyAction(state, action)` |
| Advance one full turn | `engine.RunTurn(state, actions)` | `runTurn(state, actions)` |
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
| Eliminate a pawn | `engine.` (internal `eliminatePawn`) | `eliminatePawn(...)` |
| Eliminated pool | `domain.GameState.Eliminated` | `GameState.eliminated` |

¹ **Naming exception:** `delete` is a reserved word in JavaScript, so the TS
export is `deleteAbility`. This is the only intentional name divergence; behavior
is identical (verified: seed 123 green→yellow yields roll `[2,4]`, eliminated, on
both sides).

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
| Win detection | ✅ | ✅ | |
| Seeded RNG + shuffle | ✅ | ✅ | LCG, Fisher–Yates |
| Hex model + tile placement | ✅ | ✅ | axial coords; edge-connectivity + valid-orientation (Search) |
| Pawn positions + occupancy | ✅ | ✅ | pawns on core at setup; capacity by space type |
| Movement budget + activation | ✅ | ✅ | fixed/d6/2d6/hex + modifiers; card/once-per-turn/none gating |
| Hex movement execution | ✅ | ✅ | block-to-block; d6 sequence verified identical (seed 99) |
| Combat: Delete + elimination | ✅ | ✅ | single-target attack roll vs defense dice; full pipeline identical (seed 123) |
| Space-to-space movement | ⛔ | ⛔ | backlog — needs space-adjacency schema |
| Abilities: Search/Icebreaker/Reboot | ⛔ | ⛔ | backlog (T-104 cont.) |
| Card-use resolution | ⛔ | ⛔ | backlog |
| Shadowraiders expansion | ⛔ | ⛔ | backlog |
