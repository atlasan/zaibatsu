# Engine resume plan (paused pending Phase-2 content)

The Speedrunners **core engine is complete for the provisional seed data** and is
**paused**. The remaining Phase-1 engine items are blocked only because the
provisional `spec/data/speedrunners/*` lacks geometric/effect detail. This doc is
the fast-resume checklist: when real content lands, each item below has its
unblock signal, approach, files, and verification already worked out.

## Resume trigger
Pick this back up when `spec/data/speedrunners/**` carries **real records** —
i.e. `"provisional": true` is being removed and blocks/pawns/cards start
populating the fields each item needs (below). The block schema already has
`boundarySpaces`; watch for it (and the others) getting real values.

## Standing rules for every item
Land on **both** mirrors (Go `internal/engine`, TS `src/engine`) · update
[`parity.md`](parity.md) symbols + status · add a `golden/*.snap` scenario (both
mirrors assert it) · keep `go test`, `bun test`, `tsc`, `validate-spec`,
`verify-artifacts` green · verify the new state is byte-identical across mirrors
before committing (the usual cross-check).

## Data-gated items

### 1. Space-to-space movement
- **Needs:** `boundarySpaces` on blocks (which local space(s) sit on each of the
  6 edges) + intra-block space adjacency (which spaces connect within a block).
- **Approach:** build a space graph — intra-block adjacency from the block data,
  cross-block edges by joining the boundary spaces of two edge-connected placed
  blocks. Execute `steps`/`d6`/`2d6` over it: pass through occupied spaces, only
  *end* where `CanEndOn` allows, unused steps lost, no interleaving. `ResolveSteps`
  already gives the budget.
- **Files:** `domain` (space-graph helpers on Cybernet), `engine/movement.{go,ts}`
  (`MoveSteps`/`moveSteps` + a path or step-by-step API), `movement` tests, golden.
- **Then unblocks:** card-activated movement — add a `move`/`play-move` case to the
  unified `Apply` and a `PlayMove` in `cards`.

### 2. Apply attached effects in resolution
- **Needs:** card-effect fields on `ActionCard`/`Attach` — armor `defenseDice`,
  weapon skull bonus, gadget/ability grants, movement grants, hand-size + ICE
  modifiers.
- **Approach:** add effective-* helpers and thread them through resolvers:
  `EffectiveDefense(pob)` (armor **replaces** defense dice and **nullifies** ICE),
  `EffectiveSkulls` (weapon adds; used by `Delete`/`DeleteMulti`),
  `EffectiveIce` (armor → none; used by `IcebreakPawn`), effective movement/
  abilities/hand-size. `EffectivePawnClasses` already exists as the template.
- **Files:** `domain` (card-effect fields), `engine/attach.{go,ts}` (effective-*),
  wire into `combat`/`icebreaker`/`movement`, tests, golden.

### 3. Bonus fragments → bonus icons → bonus counters
- **Needs:** per-corner fragment data on blocks (which of the 6 corners carry a
  ⅓ fragment) — today `bonusFragments` is only a count.
- **Approach:** on block placement, check each shared vertex (3 hexes meet at a
  vertex); if all three placed blocks expose a fragment at that corner, a bonus
  icon forms → place a bonus counter. Collected when one player controls all
  three blocks. This feeds attach costs (item 2) and the economy.
- **Files:** `domain` (hex-vertex model + corner exposure by rotation),
  `engine/placement.{go,ts}` (post-place icon detection), collection on
  Icebreaker control, tests, golden.

### 4. Real ICE die faces (replace provisional `IceFaces`)
- **Needs:** actual ICE die faces on blocks/pawns (today derived from the
  low/medium/high/black category).
- **Approach:** `IceFaces` reads real faces; implement ICE-value modifiers
  (add specific winning numbers, with redundancy handling per the rulebook).
- **Files:** `domain` (ice faces field), `engine/icebreaker.{go,ts}`, tests.

## Not data-gated (can be done any time)
- Multi-dice concentration on one target + area attacks (Bomb class / block effects).
- Card-activated movement + attach via the unified `Apply` (attach resolvers exist;
  just add action cases) — partly waits on item 1 for move.
- CI: run both test suites + `tsc` + `validate-spec` + `verify-artifacts` + the
  golden/demo parity on every change.

## State at pause
- Commits through `fbb3433` (golden-game harness). Working tree clean, all green.
- Backlog: [`tasks/BACKLOG.md`](../tasks/BACKLOG.md). Parity: [`parity.md`](parity.md).
