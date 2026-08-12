# Domain model

Canonical description of the entities both implementations model. When this doc
and the code disagree, this doc is what we intend; fix the code or fix the doc,
never leave them diverged.

Legend: fields marked _(slice)_ exist in the current bootstrap slice; fields
marked _(planned)_ are modeled in the schema/docs but not yet fully resolved by
the engine.

---

## Enumerations

- **Expansion**: `speedrunners` | `shadowraiders`
- **Phase**: `beginning` | `action` | `recycle` | `end`
- **Ability**: `search` | `delete` | `reboot` | `icebreaker`
- **Activation**: `card` (played via action card) | `once-per-turn` (free) | `none` (cannot activate)
- **IceValue**: `none` | `low` (3 dice) | `medium` (2 dice) | `high` (1 die) | `black`
- **SpaceType**: `normal` (1 pawn) | `double` (2 pawns) | `special` (unlimited) | `pawn` (specific pawn's home) | `effect`
- **SpaceModifier**: `defense` | `hand-size` | `attack`
- **SlotType**: `add-on` | `gadget` | `weapon` | `armor` | `module` | `mission`
- **MovementType**: `steps` (fixed N) | `d6` | `2d6` | `hex` (one whole block)
- **Class** (non-exhaustive, data-driven): `operative`, `drone`, `bot`, `cyborg`,
  `lovedoll`, `cyberdeck`, `malware`, `trade-secret`, `explosive`, `brainchip`,
  `hazard`, `accelerator`, `e-synapse`, `bomb`, `mercenary`, `shadowraider`, …
- **ThreatType** _(shadowraiders)_: `drone` | `token` | `mark` | `chaos`

## Value objects

- **DefenseDie**: `{ value: 1..6, shielded: bool }`. A pawn's defense is a set of
  these. An attack die value that matches an **unshielded** die eliminates the
  pawn; a match on a **shielded** die is blocked.
- **AttackRoll**: N six-sided dice, one per **skull icon** on the Delete ability.
- **AttackDie** _(shadowraiders)_: a *fixed* attack value (4, 5, or 6) carried by
  threats.

---

## Entities

### Block (information block / hex tile) _(slice: id/name/ice/spaces/core; effects planned)_
A hexagonal tile forming the Cybernet.
- `id`, `name`, `expansion`
- `isCentralCore: bool` — the Central Core (and Shadowraiders' Central Core 02)
- `iceValue: IceValue` — defense vs Icebreaker; `none` means uncontrollable
- `spaces: Space[]` — the cells pawns occupy
- `edges: bool[6]` — which of the 6 hex sides expose a connecting space (drives
  legal tile placement/orientation) _(planned use)_
- `bonusFragments: int` — count of one-third bonus-icon corners (0..6) _(planned use)_
- `bonusCorners?: bool[6]` — source-layout flags for the six clockwise corners; when present their true count equals `bonusFragments`. This is visual/reference data, not an effect resolver.
- `assetRefs?: assetId[]` — source-linked physical assets resolved from the asset manifest.
- `effects: { inCybernet?, underControl? }` — effect ids fired on placement /
  on gaining control _(planned resolution)_

### Space
A cell on a block.
- `id`, `type: SpaceType`
- `capacity` — derived from type (normal 1, double 2, special/pawn ∞)
- `modifier?: { kind: SpaceModifier, dice?: DefenseDie[], amount?: int }`
- `pawnId?` — for `pawn` spaces, the pawn that belongs there
- `effectId?` — for `effect` spaces, optional activatable effect
- `location?: { x, y }` — normalized 0..100 source-layout position used by content tools; it is **not** a movement coordinate.
- `layoutId: standard-seven-small-hex-grid` - every information block has the same seven printed small hexes: one centre plus six adjacent positions. The canonical coordinates live in `spec/data/block-layouts.json`.
- `footprint?: { shape, cells }` - source-layout-only coverage of those seven named positions. `hex` is one printed cell; `pill` is exactly two adjacent cells; `large` is one or more connected cells. It does **not** create movement links or override capacity.

The rule type remains authoritative for occupancy: `normal` and `effect` hold one pawn; `double` holds two and must use a two-hex `pill`; `special` is the large/unlimited space and may use a connected one-or-more-hex `large` footprint; a `pawn` home is unlimited and uses one visual hex. The footprint records what is printed on the tile, not a second board grid.
### Pawn _(slice: identity/defense/movement/abilities/class/slots; effects planned)_
An agent, represented by a piece (position) + control card (attributes).
- `id`, `name`, `expansion`, `class: Class[]`
- `defense: DefenseDie[]`
- `movement: { type: MovementType, steps?: int, activation: Activation }`
- `abilities: { ability: Ability, activation: Activation, skulls?: int, modifiers?: … }[]`
- `iceValue?: IceValue` — if present, the pawn can be Icebroken/taken over
- `slots: SlotType[]` — attachment slots the pawn exposes
- `special?: string` — free-text special ability (resolved case-by-case)
- _(shadowraiders)_ `blackIce?: bool`, `mercCost?: int`, `missionSlot?: bool`

### ActionCard _(slice: identity + attach metadata; use-resolution planned)_
A card from the shared action deck. **Multi-use**: when played, the controller
chooses exactly one use; the others are void.
- `id`, `name`
- `movement?: int` — steps it can grant when used for movement
- `activates?: Ability[]` — abilities it can activate when played
- `attach?: { as: 'pawn'|'enemy'|'block', slot?: SlotType, class?: Class[], grants?: {…}, cost?: int }`

### MissionCard _(shadowraiders, planned)_
Attached to a pawn's mission slot; tracks state via tags (mark/cargo/counter);
completing grants **medals** (→ control markers) or **control of a pawn**.

### Counters
- **ControlMarker** — a player's claim on a block/mission. **Placing all of
  yours is the win condition.** Count per player set at setup by player count.
- **BonusCounter** — currency to pay card costs; returned to owner, never lost.
  _(shadowraiders: **ThreatToken** replaces BonusCounter and is interchangeable
  in Total War mode.)_
- **StartOfTurnMarker** — marks a once-per-turn ability as spent; all of a
  player's are cleared in their `beginning` phase.
- **Medal** _(shadowraiders)_ — earned from missions; each medal = one control
  marker you may place.

### Cybernet (board) _(slice: hex model + block placement; pawn positions & attachments planned)_
The growing hex layout of placed blocks. Model:
- **Coord** — axial `(q, r)`. Six edge/grid directions `0..5`; `HexDirections[i]`
  is the neighbor delta across edge `i`; `Opposite(i) = (i+3) mod 6`.
- **PlacedBlock** — `{ blockId, rotation (0..5), coord }`. A block's *local* edge
  `e` faces grid direction `(e + rotation) mod 6`; so the local edge exposed on
  grid direction `d` is `(d − rotation) mod 6`, and `edgeHasSpace(block, rot, d)`
  reads `block.edges[(d − rot) mod 6]`.
- **Cybernet** — placed blocks in placement order (deterministic iteration);
  `At(coord)` / `Occupied(coord)` scan the small set. Setup seeds the **Central
  Core at `(0,0)`, rotation 0**.

**Placing a block (Search), relative to a reference block:** the target cell must
be empty and adjacent to the reference; the reference's edge facing the target
must expose a space; and the new block, at the chosen rotation, must expose a
space on the edge facing the reference. `ValidPlacements(refCoord, block)`
enumerates every legal `(dir, rotation)`.

> **Interpretation (documented):** the base rulebook only requires a spaced
> connection to the *reference* block. We deliberately do **not** additionally
> constrain the new block against other incidental neighbors it may touch — the
> rules don't. Revisit if Total War's table-space rule or play experience
> demands it.

**Pawns on the board:** a `PawnOnBoard` is `{ pawnId, ownerId, coord, spaceId }`.
Each player's starting pawn is placed on the Central Core at setup. A space's pawn
capacity is by type: normal/effect = 1, double = 2, special/pawn = unlimited
(`SpaceCapacity`). `CanEndOn` enforces capacity (a moving pawn doesn't count
against itself).

**Movement:** `ResolveSteps` yields an activation's step budget — fixed `steps`,
`d6`, `2d6` (seeded RNG), or `hex` (1 block) — plus cumulative modifiers, clamped
at zero. `CanActivateMovement` gates on the activation mode (`card` /
`once-per-turn` with a start-of-turn marker / `none`). **`MoveHex`** executes one
block of hex movement (ignores spaces/modifiers; needs only a placed block with
room to land). _Space-to-space stepping for `steps`/`d6`/`2d6` execution is
deferred_ — it needs a space-adjacency graph the provisional data doesn't yet
encode (tracked in `tasks/BACKLOG.md`); the step budget already resolves.

_Planned:_ attached cards and placed counters on the board.

### Zaibatsu (player)
- `id`, `name`, `color`
- `controlMarkersTotal`, `controlMarkersPlaced`
- `bonusCounters: int`
- `hand: cardId[]`, `maxHandSize` (default 5)
- controlled pawns / blocks / missions

### GameState
- `players: Zaibatsu[]`, `currentPlayerIndex`, `turn`, `phase`
- `cybernet`, `deck: cardId[]`, `discard: cardId[]`, `blockPile: blockId[]`
- `common` (uncontrolled control cards), `reserve` (unused pieces)
- `rng` (seeded), `winnerId?`

---

## Setup constants (Speedrunners)

- Control markers per player by player count: **2p→10, 3p→8, 4p→6**.
- Default max hand size: **5**.
- Opening hand deal is asymmetric (starting player gets fewer). The exact table
  is transcribed provisionally as p1→3, p2→4, p3→5, p4→6; see
  `DOCS/rules/speedrunners.md`. After turn 1 everyone draws to max normally.

## Win condition

A player wins the instant they have placed **all** of their control markers in
the Cybernet (`controlMarkersPlaced == controlMarkersTotal`).

## Content verification boundary

`spec/inventory.json` is the source-verified product, component-count, and
mode register. `GameData` additionally exposes optional control cards, threats,
missions, and mode collections so both mirrors can consume complete structured
content as it is transcribed. Inventory verification does not imply that every
effect is executable; that status remains governed by `DOCS/parity.md`.

See [the knowledge index](knowledge/INDEX.md) for scope and source policy.
