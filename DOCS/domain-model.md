# Domain model

Component transcription evidence also lives in the
[asset review sidecar](artifacts/asset-review.md). Its shared review schema
records source/image fingerprints, text, description, symbols, actions,
instructions and sheet parts. It is deliberately outside executable content;
visual review does not alter either mirror's domain types or loader inputs.

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
- **SpaceModifier**: `defense` | `hand-size` | `attack` | `ice`
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
  For multi-target Delete, those dice are assigned in order across co-located
  targets and may be concentrated on the same target. For an area attack, that
  same roll is applied to every pawn in the area of effect.
- **AttackDie** _(shadowraiders)_: a *fixed* attack value (4, 5, or 6) carried by
  threats.

---

## Entities

### Block (information block / hex tile) _(slice: id/name/ice/spaces/core; effects partially live)_
A hexagonal tile forming the Cybernet.
- `id`, `name`, `expansion`
- `isCentralCore: bool` — the Central Core (and Shadowraiders' Central Core 02)
- `iceValue: IceValue` — defense vs Icebreaker; `none` means uncontrollable
- `iceFaces?: int[]` — the specific 1–6 die faces a successful Icebreak must match. When present the engine uses these instead of deriving from `iceValue`.
- `blackIce?: bool` — a failed Icebreak against this block eliminates the attacker.
- `spaces: Space[]` — the cells pawns occupy
- `edges: bool[6]` — which of the 6 outer entrances are open. Each has one standardized target hex in clockwise order: `E1→h3`, `E2→h4`, `E3→h5`, `E4→h6`, `E5→h7`, `E6→h2`.
- `boundarySpaces: SpaceId[][6]` — derived from each open entrance's target hex and its current gameplay-space owner; authors do not hand-enter it.
- `bonusFragments: int` — count of one-third bonus-icon corners (0..6), mirrored by the true count in `bonusCorners` when present
- `bonusCorners?: bool[6]` — source-layout flags for the six clockwise corners; when present their true count equals `bonusFragments`. Together with block placement they drive deterministic bonus-icon formation.
- `assetRefs?: assetId[]` — source-linked physical assets resolved from the asset manifest.
- `effects: { inCybernet?, underControl? }` — each is a legacy effect-id string **or** a typed effect `{ kind: gain-control-card|place-pawn|place-neutral-pawn|area-attack|all-players|modify-ice|custom, amount?, target?, text? }`, fired on placement / on gaining control. Typed area attacks and source neutral placement dispatch in both mirrors. Historical/synthetic controlled placement stays distinct; complete source under-control matching-space/pawn effects remain T-RULES-006. Other effect kinds stay planned.

### Space
A cell on a block.
- `id`, `type: SpaceType`
- `capacity` — explicit occupancy; finite values default to selected-zone count, while special/pawn spaces default to unlimited
- `modifier?: { kind: SpaceModifier, dice?: DefenseDie[], amount?: int }` — `kind ∈ defense|hand-size|attack|ice` (`ice` modifies a target's ICE)
- `direction?: int` — directional restriction (printed arrow): a pawn may only exit the space toward this local edge (0=top, clockwise). Enforced by `StepTargets`/`MoveStep` for cross-edge hops.
- `pawnId?` — for `pawn` spaces, the pawn that belongs there
- `effectId?` — for `effect` spaces, optional activatable effect
- `location?: { x, y }` — normalized 0..100 source-layout position used by content tools; it is **not** a movement coordinate.
- `layoutId: standard-seven-zone-2-3-2-pointy` - every block uses seven standardized point-up placement hexes arranged `h2 h3 / h7 h1 h4 / h6 h5`. Outer tile points, entrances, corners, and source artwork remain separate geometry; canonical anchors live in `spec/data/block-layouts.json`.
- `zoneIds: ZoneId[]` - one or more standardized placement hexes; a zone has one gameplay-space owner. Verified blocks account for all seven exactly once.
- `displayShape?: auto | circle | capsule | compound` - source-facing editor metadata derived from the mapping unless reviewed otherwise; it has no engine behaviour.
- `capacity: positive int | unlimited` - explicit occupancy. The editor defaults finite capacity to selected-zone count; a different value needs `capacityNote` evidence. `special` and pawn-home spaces default to `unlimited`.
- `neighbors: SpaceId[]` - symmetric gameplay-space links inferred from touching selected zones and loaded by both mirrors. `StepTargets` traverses them for executable intra-block movement; source transcription still reviews each record before it becomes non-provisional.

`double` remains readable only for legacy saves. Newly authored canonical data expresses a two-capacity location as a normal/effect space selecting zones with explicit capacity `2`; physical zone geometry never silently creates an engine movement rule.
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

### ActionCard _(slice: identity + attach metadata; use-resolution partially live)_
A card from the shared action deck. **Multi-use**: when played, the controller
chooses exactly one use; the others are void.
- `id`, `name`
- `movement?: int` — steps it grants through the card-consuming `play-move`
  action, independent of the pawn's once-per-turn movement
- `activates?: Ability[]` — abilities it can activate when played
- `effects?: { kind: gain-control-card|gain-target-control|place-pawn|area-attack|all-players|modify-ice|draw-cards|gain-bonus|sacrifice-pawn|custom, amount?: int, target?: string, text?: string, trigger?: on-attach|on-play|begin-turn|end-turn|on-control|on-icebreak|continuous }[]`
- `attach?: { as: 'pawn'|'enemy'|'block', slot?: SlotType, class?: Class[] (accepted targets), forbiddenClasses?: Class[] (excluded targets), forbiddenDestinations?: central-core[], grants?: Ability|move[], removes?: Ability|move[], grantsSlot?: SlotType[], grantsMovement?: MovementGrant[], grantsStealth?: bool, abilityUses?: AbilityUse[], defenseOverride?: DefenseDie[], nullifiesIce?: bool, iceModifier?: { faces?: int[], deltaDice?: int, black?: bool }, drawModifier?: int, handModifier?: int, effectText?: string, effectTrigger?: ... , cost?: int }`
- Live resolution currently uses:
  - `grants` / `removes` for ability availability;
  - `effects` for typed placement handlers in frozen/synthetic fixtures; the earlier printed Gentleman Loser Icebreaker trigger was revoked under SR-CARD-009;
  - `grantsSlot` when checking whether a follow-up attachment may be equipped;
  - `grantsMovement` + move-scoped `abilityUses` for explicit granted movement options and their card / once-per-turn / `perTurn` / `d6` budgets;
  - `grantsStealth` to mark movement as stealth-capable in reducer options/results;
  - `defenseOverride` / `nullifiesIce` when resolving defense and Icebreaker against the attached target;
  - `iceModifier.faces` / `iceModifier.deltaDice` / `iceModifier.black` when resolving Icebreaker against the target;
  - `drawModifier` / `handModifier` during recycle for the controller of the attached target.
- Printed Delete contributions now use `attach.delete`, with independent paid/single-free routes (SR-ABILITY-003). Broader non-move `abilityUses` budgets and `attach.effectText` remain pending; unsupported Delete budgets reject at source construction.

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

### Cybernet (board) _(slice: hex model + block placement; pawn positions, bonus icons, and attachments live)_
The growing hex layout of placed blocks. Model:
- **Coord** — axial `(q, r)`. Six edge/grid directions `0..5`; `HexDirections[i]`
  is the neighbor delta across edge `i`; `Opposite(i) = (i+3) mod 6`.
- **PlacedBlock** — `{ blockId, rotation (0..5), coord }`. A block's *local* edge
  `e` faces grid direction `(e + rotation) mod 6`; so the local edge exposed on
  grid direction `d` is `(d − rotation) mod 6`, and `edgeHasSpace(block, rot, d)`
  reads `block.edges[(d − rot) mod 6]`.
- **BonusIcon** — `{ key, coords[3], collectedBy? }`. Each icon is identified by
  the sorted triple of incident block coordinates around one shared vertex, is
  created when authored `bonusCorners` complete that vertex, and awards one
  bonus counter the first time a single player controls all three contributing
  blocks.
- **Cybernet** — placed blocks in placement order (deterministic iteration);
  `At(coord)` / `Occupied(coord)` scan the small set, and `bonusIcons[]` tracks
  formed/collected board icons. Setup seeds the **Central Core at `(0,0)`,
  rotation 0**.

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
capacity prefers explicit source-reviewed `Space.capacity`; legacy data falls back to type (normal/effect = 1, double = 2, special/pawn = unlimited)
(`SpaceCapacity`). `CanEndOn` enforces capacity (a moving pawn doesn't count
against itself).

**Movement:** `ResolveSteps` yields an activation's step budget — fixed `steps`,
`d6`, `2d6` (seeded RNG), or `hex` (1 block) — plus cumulative modifiers, clamped
at zero. `CanActivateMovement` gates on the activation mode (`card` /
`once-per-turn` with a start-of-turn marker / `none`). A movement-valued action
card executes the same path rules with its printed budget, consumes that card,
and does not spend the pawn's once-per-turn movement. Attachments may now grant
additional explicit movement options with their own activation mode and
per-turn / `d6` use budgets. **`MoveHex`** executes one
block of hex movement (ignores spaces/modifiers; needs only a placed block with
room to land). **`StepTargets`**, **`MoveStep`**, and **`MoveSteps`** execute
`steps`/`d6`/`2d6` paths through intra-block neighbours and rotation-aware
cross-edge boundary spaces. A path may pass occupied spaces but must finish at
a space with capacity. Source die movement commits a public roll before path
selection; frozen regression keeps path-before-roll validation. Unused budget is lost. The engine is live; individual provisional adjacency
records still require source review.

_Implemented:_ pawn/block attachments and placed bonus icons/counters. Complete source marker accounting and component promotion remain open.

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

### Live transition and trace interfaces

`AdvancePhase` / `advancePhase` advances exactly one phase: `beginning` clears
the active player's start-of-turn markers and enters `action`; `action` enters
`recycle` without drawing. A `recycle` action chooses unused card copies, discards that player’s allocated face-up cards and applies attachment-driven draw/hand modifiers before refill; it enters `end` and checks victory;
`end` advances the player and turn, returning to `beginning` when no player won.
`RunTurn` / `runTurn` remains the compatibility convenience API.

`ApplyWithEvents` / `applyActionWithEvents` accepts actions only in `action`
for the active player and that player's acting pawns. Card-activated abilities
require card actions; card-activated movement requires and spends a movement
card. Free marker placement and client-injected combat modifiers are rejected.
Rejections restore the entire state and RNG stream through independent state
copies (`CloneState` / `cloneGameState`). Completed matches reject further
live actions and phase advances. The low-level compatibility reducer retains
its utility actions for existing fixtures/demos. A `TransitionResult` is `{ accepted, phase, events,
error? }`. Events are structured records, not display strings: phase advance,
accepted action, roll, draw, elimination, control change, winner declaration,
or validation failure. The local sandbox uses these events and the canonical
snapshot; it does not add web-only state to `GameState`.

A local play trace is `{ format, setup: { playerNames, seed, modeId? }, dataChecksum,
commands }`, where commands are accepted `{ kind: 'phase' }` or `{ kind:
'action', action }` inputs. The checksum binds a trace to the exact local data
inputs; it is a local tooling format rather than shared runtime game data.

---

## Setup constants (Speedrunners)

- Control markers per player by player count: **2p→10, 3p→8, 4p→6**.
- Default max hand size: **5**.
- Opening hand deal is asymmetric (starting player gets fewer). The exact table
  is source-verified as p1→3, p2→4, p3→5, p4→5; see
  `DOCS/rules/speedrunners/setup-and-victory.md` (`SR-SETUP-003`). After turn 1 everyone draws to max normally.

## Win condition

A player wins the instant they have placed **all** of their control markers in
the Cybernet (`controlMarkersPlaced == controlMarkersTotal`).

The optional `speedrunners-quick-match` profile in shared `modes.json` uses
four markers at every supported player count. `Mode.provisional` /
`Mode.Provisional` identifies this local experimental profile; `loadMode` /
`LoadMode` selects it while the default loader retains official Speedrunners.
Its rationale and acceptance boundary are recorded in [ADR-0005](adr/0005-local-quick-match.md).

## Content verification boundary

`spec/inventory.json` is the source-verified product, component-count, and
mode register. `GameData` additionally exposes optional control cards, threats,
missions, and mode collections so both mirrors can consume complete structured
content as it is transcribed. Inventory verification does not imply that every
effect is executable; that status remains governed by `DOCS/parity.md`.

Cross-cutting metadata does **not** belong in the runtime model by default.
Source links, asset links, status labels, documentation links, and relation
graphs now live in `spec/knowledge/`, which joins:

- `spec/data/` runtime records;
- `spec/provenance/` verification facts;
- `spec/assets/manifest.json` physical asset identities;
- `DOCS/` human explanations and workflow guidance.

That split is deliberate: mirrors load gameplay data, while the knowledge
catalog gives humans and tools a reusable index over the same canonical facts.

See [the knowledge index](knowledge/INDEX.md) for scope and source policy.

## Tabletop and threat combat state

`Pawn.artwork` is a source sheet window (asset id, sheet dimensions, crop and
rotation); it has no game effect. `ActionCard.assetRefs` supplies hand artwork.
The tabletop camera changes only presentation; source edge 1 is northeast and
rotations remain clockwise in both mirrors.

`GameState.playedCards` holds spent movement and matching-ability cards until
recycle. Explicit discard costs bypass that zone. `recycle.cardIds` is a multiset
of physical hand copies. Matching-card `play-reboot-card` and discard-four
`play-reboot` coexist.

`Space.type` includes `event` and `drone`, and `Space.threatId` names a fixed
profile. `Threat` adds six defense faces and a physical copy count. The seeded
`threatPile` supplies event spaces; `ThreatOnBoard` retains id, definition id,
coordinate, space and inactive/active/eliminated status. Repeated deployment
does not redraw occupied event spaces. Threats never count as pawn occupancy.

`PendingAttack` stores the paying player, attacker ids, coordinate and public
roll. `PendingThreatCombat` stores the block, responding attackers and response
or retaliation stage. Ordinary movement stops at the first threatening block;
stealth and typed threat immunity bypass activation. `roll-delete` pays once;
`assign-delete` uses the known dice against pawns or threats. Joint attacks sum
participants’ effective skulls. Fixed retaliation assigns one die per threat
with own-pawn/attacker priority. These windows prevent unrelated actions and
phase advances. Both are deep-cloned and represented in snapshots.

`Attach.attackModifier` and attack-space modifiers add to printed Delete skulls
in targeted, split, area and public-roll attacks. `Mode.allowedPlayerCounts`
can restrict a range to discrete counts, as required by Cyber-Revolution. The
source mode register still does not imply complete executable expansion modes.

Collected event-token spaces are recorded in `clearedEvents` by coordinate/space
key; they become normal spaces and cannot redraw a token on later deployment.

## Source-foundation contracts

The original mixed content is frozen in `spec/fixtures/provisional-v1/`, including its schemas, validation manifest and golden evidence. `LoadRegression` / `loadRegression` loads that corpus explicitly. Canonical source promotion must not overwrite the fixture or describe it as an official deck.

`Pawn.color` binds a verified starter to its printed piece/control-marker color. `Pawn.icebreakerModifier` describes the acting pawn's extra success faces, roll dice, Black ICE addition and Black ICE immunity; it is distinct from `Pawn.iceFaces` (the target's own ICE). Source-backed starters currently use the extra-face subset.

`GameState.controlCards` records physical card id, subject, owner and an explicit source-mode `zone` (`control`, `common`, `out-of-game`). An empty owner alone does not distinguish common cards from excluded starters. Assignment, control changes and non-Reboot elimination keep the zone synchronized. Clones/snapshots preserve these fields; remaining source control-card definitions still need promotion.

`Attach.ignoresDirectionArrows` changes actor-aware `StepTargets`; `Attach.movementModifier` changes step budgets once, including card movement, and never changes hex movement. Removing movement also prevents the direct card-path resolver from bypassing the restriction.

`AvailableActions` / `availableActions` returns action templates with movement targets, selectable maximum budgets and directions. Callers complete paths or dice assignments; the live reducer remains authoritative for complete commands. Queries use independent state/RNG copies for deterministic eligibility checks. Source dice expose declaration only before rolling, then the committed budget in the pending movement window. Pending combat limits returned templates to its response action. The source-foundation sandbox uses these templates to constrain controls; legacy fixtures retain their compatibility interface.

Rule/component implementation evidence lives outside runtime state in `spec/knowledge/implementation.json`. `tools/rules-coverage.ts` joins it to reviewed physical assets, rule modules and the eight-mode register, producing `spec/knowledge/coverage.json`. Source verification, runtime support, mirrored test references, sandbox support and open gaps remain separate fields.

## Initial typed phase decisions

`Attach.phaseEffects` contains source-derived `trigger` (`begin-turn` or `end-action`) and `kind` (`discard-self`, `discard-hand`, `discard-or-sacrifice`, `sacrifice-and-draw`, `discard-and-relocate`, `discard-cards`). It does not execute source prose.

`GameState.pendingPhase`, `pendingEffects` and `pendingChoice` hold deterministic effect identities and an authorized respondent. The `resolve-choice` action names `choiceId`, chooses `discard` or `sacrifice`, and supplies exactly one physical hand card for the discard alternative. A beginning decision holds the game in `beginning`; start-of-turn markers and threats reset only after it completes. Rootkit runs during the action-to-recycle boundary, leaving played cards for ordinary recycle.

Clones and canonical snapshots include pending state. Events include `choice-required`, `choice-resolved` and physical `card-discarded` records. The single-effect slice is tested against shared pending-state and ordered-event goldens. Multiple simultaneous obligations are explicitly rejected without mutation until source ordering is resolved; this is a tracked shared limitation, not a silent fixed-order implementation.

Official constructors refuse provisional records unless the selected mode is explicitly provisional or the caller opts into `Config.AllowProvisional` / `Config.allowProvisional` for a source-review fixture. Unsupported setup and win/loss ids are rejected even with that opt-in. Regression loaders mark their returned mode as experimental in memory; frozen source bytes are unchanged. Historical threat sidecars also support explicit regression loading, and frozen files bypass Git newline conversion to preserve their recorded hashes.


Phase effects that draw or require a selected discard carry a positive `amount`; schema variants reject missing amounts and unrelated fields. `PendingChoice.kind` distinguishes `discard-or-sacrifice`, `discard-cards` and `relocate-pawn`. Required discards carry their amount, and `resolve-choice` validates the exact physical multiset before changing the hand. Relocation responses use `optionId: relocate`, `coord` and `spaceId`; queries expose capacity-valid destinations on copied coordinates. Pawn ownership/choice authority, stale ids, occupied/unknown destinations and mixed payment/relocation payloads are checked before committing.

`PhaseEffect.threatMode` is optional only on relocation: `normal-movement` activates threats; `placement` does not. Unset semantics exclude/reject threatening destinations. Canonical Jetpack deliberately leaves this unset (SR-TURN-007). A phase interruption retains `pendingPhase` through public combat; only combat responses are accepted until it resolves, paid action cards remain in `playedCards`, and beginning marker/threat reset runs afterward. Sacrifice-and-draw uses the ordinary seeded draw/recycle helper and never caps a beginning draw to maximum hand size.

`ActionCard.type` and `ActionCard.class` retain the existing schema's printed card category and own classification in both loaded domains. They are distinct from attachment target classes; own classes now fold into the attached pawn under SR-CARD-008. Target eligibility executes under SR-CARD-010 and provider-slot cleanup under SR-CARD-011; remaining component-specific exceptions stay visible in the backlog.


Phase handlers emit operation events in resolution order, separately from final-state deltas. This preserves a discard even when that same card is immediately recycled/drawn (Electric Sheep). The live adapter adds unrelated deltas once, without duplicating those semantic events. `pawn-relocated` includes `pawnId`, `coord` and `spaceId`; choice completion and phase advancement follow the resolved effects. Combat response queries include the choice to accept fixed retaliation without playing a Delete card. Constructors reject unknown phase triggers/kinds, invalid card counts and unsupported relocation policies before starting a match.


## Source lifecycle and replacement decisions

Ordinary constructors now create `rulesVersion: source-v13` (physical slots; originally source-v1 lifecycle), `reserve` and `outOfGame`. Unselected starting Speedrunners are excluded, not reserve pieces; their physical control cards have `zone: out-of-game`. Other available pieces start in reserve. A pawn with effective Reboot at elimination moves to the retained `eliminated` pool on its controller's card; a pawn without it returns to reserve, discards/refunds attachments and releases its card to `common`. The decision is made before attachments are lost. Placement removes the corresponding reserve entry and cannot bring an excluded starter into play. Whole-piece tests compare board, retained, reserve and excluded ids against the loaded definition set; that does not imply the loaded corpus is complete.

`LoadRegression` / `loadRegression` alone tags `GameData.RegressionFixture` / `regressionFixture` as `provisional-v1`. Constructors preserve that explicit fixture's old state/lifecycle protocol without inferring compatibility from a card alias or provisional flag. Source review remains experimental until complete, even with the source rules version. [ADR-0007](adr/0007-source-lifecycle-and-replacement-windows.md) records this boundary.

`Attach.eliminationPrevention` is a registered `{kind: discard-self}` handler. Elimination attempts may create `pendingEliminations` and a `PendingChoice.kind: prevent-elimination`, with the controller as respondent, a monotonic `decisionSerial`, and eligible attached `cardIds`. Engine queries supply complete `responses` for preventing with an attachment or allowing cleanup. Responses cannot mix in a hand payment, another target or a movement. Only the named respondent bypasses ordinary active-player authority, and only for that pending choice.

Final cleanup runs after the choice. The shared finalizer records piece removal, reserve/retained placement, attachment discards/refunds, then card release as applicable. A prevention response discards only the selected protection card and records `elimination-prevented`. The phase scheduler remains paused through both combat and replacement decisions, then resumes marker/threat bookkeeping. Snapshots and independent clones include the queue, serial, pools, card zones and authorized choice. Rejected live and compatibility commands restore newly created optional fields as well as existing state and RNG; Go block effects/Search/ICE now propagate replacement failures instead of losing the error.

Sacrifice replacement and multiple protected casualties remain explicit rejected provisional combinations (SR-CARD-007). The broader effect queue, attachment class/slot cascades, full physical counters and complete source corpus remain open.


`ActionCard.type` also permits printed Block cards. `CardEffect.trigger: on-attach` identifies effects belonging only to attachment use; playing a movement/ability strip never runs that trigger. The first corrected Block record, Gentleman Loser (legacy id `cracker`), remains provisional: attachment-time resolution/geometry is not yet implemented. All attachment entry paths reject those effects before payment, and strict official construction rejects their unsupported mechanic. Source-review construction may retain the inactive provisional definition to exercise other settled card uses; that is not attachment support.

`effectivePawnClasses` / `EffectivePawnClasses` now folds printed top-level card classes as well as `attach.class` grants only for explicitly frozen regression data. It does not mutate definitions. The reviewed first-page class-bearing cards and two Trade Secrets have explicit own-class data. Target-class restrictions execute under SR-CARD-010; physical provider cleanup now executes under SR-CARD-011. Remaining component-specific exceptions are still unfinished. The sandbox projects current pawn classes through the engine query helper rather than reading only native definition classes.

Source-version states also route `Apply` / `applyAction` through live authority and phase checks. Only explicitly tagged historical fixtures retain phase-free compatibility dispatch. Primitive resolution helpers remain separate from the command API. Mirrored tests reject phase and foreign-player bypass through the compatibility entry as well as through the eventful entry.

### Attachment target eligibility

Source bundles interpret `Attach.class` as an optional list of accepted target classes (any matching effective class suffices) and `Attach.forbiddenClasses` as excluded classes (any match rejects). Both run before cost/payment or hand removal, and evaluate the existing target without the candidate card. Own printed classes remain `ActionCard.class`. The explicit `regressionFixture: provisional-v1` path alone preserves historical restriction-as-grant behavior. Live synthetic placeholder class metadata was moved to top-level own classes; frozen files are unchanged.

Worm, Under Clocker and Hijacker use the shared enemy/add-on handler, Operative exclusion, Malware own class and existing typed continuous penalties (handModifier -1, removes Delete, removes move). Engine options and sandbox targets use the same rejection rules. This establishes attachment-time eligibility; later class changes do not invent an unsourced automatic discard rule. Slot providers/cascades remain a separate open prerequisite.

### Physical attachment slots and source protocol v2

`Attachment.slotRef` records a physical rooted location, such as `pawn:add-on`, `pawn:add-on/weapon`, or `pawn:add-on/weapon/module`. The occupant provides the next path segment through the existing shared `Attach.grantsSlot` array. Equal slot types at different paths remain separate. `pawnAttachmentSlots` / `PawnAttachmentSlots` returns locations, occupancy, provider card id and occupied attachment index; `availableAttachmentSlots` / `AvailableAttachmentSlots` returns free locations without mutation. Only providers connected to printed native slots can contribute slots. Old hand-authored fixture entries without refs are inferred in array order; accepted source actions always store refs.

`Action.slotRef` selects a location for `attach-pawn`/`attach-enemy`. Omitting it is accepted only when exactly one matching slot is free; ambiguous placement rejects before payment. Options enumerate each legal location. Other action kinds reject a supplied nonempty slot reference. `discardPawnAttachment` / `DiscardPawnAttachment` removes a selected physical attachment and descendants, preserves unrelated native/provider slots and benefits, and refunds each paid counter exactly once. Phase self-discard and elimination prevention call this helper. Whole-pawn takeover/elimination retains its existing full-discard path.

New source states use `rulesVersion: source-v13`; canonical attachment snapshots include optional refs. Cloning preserves them independently. The source replay checksum also includes a rules-version stamp, so older source traces fail with a clear version/checksum error. Frozen regression bytes, state layout and checksums remain unchanged. See ADR-0008 and SR-CARD-011.

### Printed Delete attributes and activation selection

`Attach.delete: {skulls: number, activation?: card|once-per-turn}` contributes printed strength independently from its optional activation badge. The source loader domains use `DeleteAttribute` in Go and the matching TS type. Required positive skulls and supported activation values are schema-checked. The same card cannot mix this representation with legacy Delete `grants`/`abilityUses`, and a Block attachment cannot carry it. Constructors reject incompatible attributes or unsupported Delete use budgets before creating a source match.

`deleteProfile` / `PawnDeleteProfile` combines native and attached strength, matching-card availability, free-badge count and cancellation. `deleteActivationOptions` / `DeleteActivationOptions` yields independent supported activation routes. Existing `effectiveAbility` callers receive the first compatible route, but action/option code uses the full route list. Card wrappers explicitly select card activation; free commands select the free route. Public attacks pay once, roll the aggregate strength and preserve the chosen route's marker behavior through assignment windows. Source joint combat activates/marks only its initiator; other co-located controlled pawns contribute printed skulls without gaining an invented activation.

A native/attached free-badge count above one is visible as an unresolved source conflict, not an adopted budget. Queries withhold that free route and its commands reject before payment or RNG. A separate card route remains valid. Servocanon stays provisional under T-RULES-014. Source snapshot shape uses source-v13; changed live content/checksums invalidate older source traces while frozen traces remain unchanged. See SR-ABILITY-003/004, SR-CARD-012/013 and SH-THREAT-003.

### Attachment-time control and movement-entry policy

`CardEffect.kind: gain-target-control` is a registered attachment-time operation. Its source shape requires `trigger: on-attach`, an Enemy attachment with no cost, and no unrelated target/amount fields. Unsupported timing/sequencing fails before construction/payment. The shared schema distinguishes this operation from generic card effects. The capability gate now allows this settled handler while still rejecting unsupported block-attachment placement. Execution attaches the card, journals all attached-card discards/refunds, then transfers pawn/control-card ownership. Source Enemy attachments require a registered opposing controller; neutral pawns are separate. Strip activation does not dispatch attachment effects.

`Attach.forbiddenDestinations: [central-core]` supplies a movement-entry category restriction. `movementEntryError` / `MovementEntryError` is shared by step/path and hex execution and their options. It compares origin/destination blocks; within-block movement and leaving remain legal. Placement and `canEndOn` capacity remain independent. Phase relocation checks the post-discard state on a clone before exposing destinations or accepting a choice, preserving discard-before-move sequencing and live RNG. Unknown movement-versus-placement policy rejects restricted destinations under T-RULES-008.

Go `SpaceRef` now serializes `coord` and `spaceId` explicitly, matching TS action paths/options and the shared target evidence. Decoding remains compatible with prior Go field capitalization; frozen snapshots/checksums remain unchanged. Source content changes invalidate older live-deck traces through their existing checksum. See SR-CARD-014/015; Spammer remains a documented source dependency under SR-CARD-016/T-RULES-015.

### Player-view contract and continuous hand visibility

`Attach.controllerHand: face-up` is a typed pawn-attachment attribute. `controllerHandRevealed` / `ControllerHandRevealed` evaluates current pawn ownership and attachments; it stores no stale visibility state. `playerView` / `PlayerView` returns a detached `zaibatsu-player-view/v1` whitelist: public board/control/resources, public card zones, hidden-pile counts, and hands `{count, visibility, cards}`. Visibility is `hidden`, `owner`, or `face-up`; hidden cards are an empty list while count stays accurate. Empty viewer means spectator; unknown nonempty viewers reject.

Only the pending choice's authorized responder (otherwise the active player) receives action templates and full current choice details. Everyone can see the public decision id/kind/responder; reveal does not delegate actions. Search templates omit hidden-tile placement coordinates/orientation. Source draw/reveal/placement now executes under SR-BOARD-005 and ADR-0010. `eventsForPlayer` / `EventsForPlayer` preserves own draw identities, strips other draw identities, and withholds private validation failures from other viewers. Historical reveal provenance is not invented. Snapshots/cloning/replay remain trusted and compatible; adding Trojan changes only the source-content checksum and source goldens. See ADR-0009 and SR-CARD-017/SR-ZONE-001.

### Committed Search draw and placement

`beginSearch` / `BeginSearch` uses public declaration eligibility and commits the selected physical hand card or supported free-use marker. It removes exactly the top block from `blockPile` and creates `PendingChoice.kind: place-block`, with `blockId` and `reference` in addition to the searching pawn/controller and decision id. This pending block is a separate physical zone for conservation. No executable content depends on printed prose.

`searchDeclarationError` / `SearchDeclarationError` and source `availableActions` / `AvailableActions` expose declarations without hidden-tile previews. `searchPlacementResponses` / `SearchPlacementResponses` enumerates authoritative `resolve-choice` responses using `optionId: place:<dir>:<rotation>`. `resolveSearchPlacement` / `ResolveSearchPlacement` validates the decision, actor/reference and placement, then places the held block, performs bonus detection, supported placement effects and threat deployment. Rejection restores the pending state/RNG while retaining the prior accepted cost. Strict official construction rejects unsupported placement effects; provisional content does not silently execute them.

Player views expose `revealedBlock: {blockId, reference}` to all observers during the window and response options only to the authorized player. Snapshot/cloning already include pending choices; the shared Search golden also asserts a byte-identical intermediate snapshot. Source state is `source-v13`; replay checksums use `source-v13/native-phase-theft`. Synchronous Search/PlaySearch helpers are historical-regression entry points and reject source data. Legacy preselected direction/rotation on a source declaration cannot bypass the new choice. Frozen fixture files/checksums remain unchanged. See SR-BOARD-005 and ADR-0010.

Source Search placement journals `block-placed`, newly formed `bonus-icon-created` events, then any supported area-effect `roll` in printed order. Tests force a later threat-data failure after that roll and prove rollback restores the pending tile, board, pile and RNG without refunding the prior accepted activation.

### Committed rolled movement

`roll-movement` selects a native/granted die movement without a path. `beginRolledMovement` / `BeginRolledMovement` validates before RNG, consumes one physical card into the played zone when required or spends the free route, rolls once and creates `PendingChoice.kind: move-path`. `PendingChoice.movement` / `PendingChoice.Movement` stores `{roll, budget, origin: {coord, spaceId}, movementIndex, movementKey, stealth}`. Budget is nonnegative and already includes the attachment modifier. Pending choices clone/snapshot this record independently.

`movementChoicePreview` / `MovementChoicePreview` validates prefixes without mutation/RNG, permits pass-through occupancy, reports exact budget/next targets/stop legality, and withholds continuation past an ordinary threat stop. `resolveMovementChoice` / `ResolveMovementChoice` accepts `optionId: move` plus a complete path, including an empty stop. It uses the committed allowance without another modifier/cost/roll, emits `pawn-moved` for a nonempty path, then opens threat combat if needed. Rejection restores the pending state. Source old path-first dice helpers reject; fixed card movement remains independent of free-use markers. The source public view adds `movement` for public roll/budget/origin data while only its authorized responder gets options.

Native `activation: none` is a cancellation, so `effectiveMovementOptions`, source card paths, step-entry checks and hex queries reject it even with grants. Attached cancellation has the same effect. Explicit normal relocation checks the post-discard cancellation state, while explicit placement stays distinct. Source constructors reject legacy rolled-use-count metadata; use typed d6/2d6 movement for die steps. Protocol/checksum v4 invalidates older source semantics without changing frozen fixture bytes or envelope formats. Source occupied-space diagnostics now use the same coordinate text in Go/TS; frozen Go messages remain compatible.

Source `nativeUseMarkers` stores `{pawnId, ability, uses}` on the physical control-card subject independently of player caches. Each equipped attachment has `instanceId` and optional `useMarkers: {ability,uses}[]`; movement grants use `move:<grantIndex>` inside that card. `attachmentSerial` allocates deterministic unique ids without RNG. Supported free gates use these references, so ownership transfer, duplicate cards and unrelated removal cannot refresh a spent ability. Beginning cleanup follows current control after supported beginning effects, including retained cards; common cards remain marked.

`unresolvedUseCards` preserves marked discarded attachment metadata while the actual card enters normal discard. It is evidence, not a physical card/counter zone. Its historical `bonusPaid` is not a live allocation. Discard/redraw marker removal is not explicit in the reviewed source. Definition-only deck/hand ids cannot distinguish that recycled physical copy, so affected reattachment rejects atomically by definition. Strict official bundles with limited-use attachments reject pending T-RULES-021. Player views expose detached `useMarkers` allocations; journal deltas emit `ability-use-marked`, `ability-use-cleared` and `ability-marker-retained`. Marker events precede corresponding rolls, and beginning cleanup precedes the action-phase event. Snapshots/clones preserve all fields. Frozen states keep their historical caches and shape. See SR-MOVE-005 and ADR-0012; this subsystem remains partial.


Source fixed/card movement accepts an empty path as a spent zero-step activation. A current-space capacity check still applies. Modifiers clamp at zero; no movement, entry or threat awakening occurs on an empty path. Native/granted limited uses or one physical payment are consumed normally, while independent card movement leaves native free use untouched. Free fixed/hex actions with an extraneous payment reject. Engine `AvailableAction.responses` / `AvailableAction.Responses` includes a fully specified zero-step action (omitted path means empty), even with no adjacent target or zero maximum. Positive allowances keep movement targets; zero allowances omit them. Source sandbox fixed/card options now come directly from these engine templates, and preview finishability is confirmed on a cloned reducer state. See SR-MOVE-006 and ADR-0013. Frozen helpers retain empty-path rejection.


Blocks can declare `nonPlayableZoneIds` to account for title/art regions that contain no gameplay space. They create no capacity, entry or movement target. A verified block accounts for all seven source zones through gameplay ownership or explicit non-playable zones, without overlap; source validation also checks reciprocal/geometric neighbors, exact boundaries, corner counts and printed ICE arrays. Toyeku's center h1 is excluded while its four spaces use the outer six zones.

`SpaceModifier.dice` / `SpaceModifier.Dice` stores exact `{value,shielded}` defense changes; it is valid only for defense modifiers, with unique faces and no nonzero numeric adjustment. `DefenseProfile(s,gd,pawn)` / `defenseProfile(s,gd,pawn)` returns a detached current pawn/armor/space profile or an explicit unsupported-data error. All pawn attack paths use it, including fixed threats; callers that need only the historical pawn/armor summary may keep the two-argument effective-defense helper. Numeric provisional defense placeholders are not executable source rules. The sandbox obtains profile/error summaries from the engine instead of displaying only innate defense.

`BlockEffect.kind: place-neutral-pawn` is a distinct source placement handler. It requires the unique reserve pawn, matching unlimited pawn space and common-area card, then places with empty `ownerId`, removes reserve membership and keeps common ownership. It never grants a control marker or resolves a control-card exception. Invalid physical states reject and keep a committed Search pending, without inventing revival/relocation. Neutral placement events report the public destination and omit a controller. Source protocol v7 and its checksum stamp version the changed semantics; frozen data/state/checksum behavior remains unchanged. See SR-BOARD-006/007, SR-DEFENSE-001 and ADR-0014.

### Counted control-card markers

`Pawn.controlMarkerEffect` is the typed `place-on-control-card` instruction with amount1. It uses shared JSON rather than parsing special text. Printed classless pawns use an empty class array. `GameState.controlCardMarkers` records each physical allocation as playerId/cardId/amount; it is distinct from bonus counters and ability-use markers. Block markers remain represented by placed-block ownership. `ControlMarkerAllocations` / `controlMarkerAllocations` returns detached public block and card locations. The existing player placed/remaining totals include both locations.

`GainPawnControl` / `gainPawnControl` executes actual acquisition and the card instruction, returning other owners' allocated markers first and checking immediate victory. `SetPawnControl` / `setPawnControl` only synchronizes pawn/card ownership and zones; Reboot and reserve release do not execute acquisition again. Icebreaker, attachment takeover and typed owned placement call the acquisition operation. Both effect pipelines propagate errors through the atomic command boundary. Source snapshots, cloning and public player projections retain card allocations, including a common-area card whose marker is retained by the explicitly provisional literal lifecycle reading. Ordered events expose returned/placed card markers. The Idoru rule module owns unresolved repeat and same-owner reacquisition semantics; these are not official-mode acceptance.

### Internal arrows and global block discard windows

`Block.spaceArrows` contains typed from/to space links over the physical symmetric neighbor graph. It is distinct from legacy `Space.direction` edge exits. Both engines validate adjacent known distinct endpoints and a single direction per link, then filter reverse traversal in the common step graph. Octagon's existing arrow exception bypasses the filter; removal ends the exception. Rotated cross-edge exits remain available. The editor normalizes/persists these links, validates them and can reset them when replacing all geometry.

Typed block effect `discard-per-controlled-pawn` creates `pendingBlockDiscards: {blockId, coord, decisions}`. Each decision has its own id/playerId/amount/submitted flag and optional trusted private cardIds. Count the union of owned board pieces and controlled pawn cards, including retained controlled pawns, once per pawn. Snapshot counts at effect activation. `pendingChoice` points to the first unsubmitted decision for local UI convenience, but any authorized affected player may answer their own current decision id. Optional viewerId on AvailableActions/availableActions selects that owner's pending template. All ordinary actions and phase transitions stay blocked.

Selections are validated as physical multisets, retained as metadata without moving cards, and published/discarded only when every affected player submits. Revalidate all selections before any hand/pile mutation. Apply them in seat and original-hand order, making final state independent of response order. Source views publish per-player required/submitted metadata, expose only the viewer's pending decision/options, and omit private selections; snapshots and clones retain trusted recovery state. Owner-attributed discard events suppress duplicate generic deltas while retaining one event per physical copy.

This normal-hand commitment policy remains experimental under SR-BOARD-009/T-RULES-026. A hand shortfall rejects placement against the accepted revealed Search, preserving full state and RNG; no discard-as-many rule is invented. The typed Hacktivism return-control-marker instruction also rejects explicitly pending T-RULES-025. Their corrected geometry/ICE/defense/bonus data does not promote these full components. Source protocol/checksum is now source-v21 / source-v21/cleaner-b-placement; the frozen corpus remains unchanged.

### Optional stopping-space effects and acting Icebreaker attachments

`Space.effect` is a typed optional `discard-attachment` descriptor with Add-on/Gadget family and an explicitly provisional Cybernet scope. Positive movement finishing on Antro opens `PendingChoice.kind: space-discard`, with responder, pawn, block, space and coordinate. Exact engine responses carry `targetId` and globally unique `attachmentId`; costs or unrelated action fields cannot be mixed in. Declining is explicit. Physical provider cleanup removes dependent attachments, refunds each card's paid counters and retains unresolved use evidence. No free voluntary-discard action is introduced. Normal relocation may suspend phase completion behind this choice. Passing through, zero movement and explicit placement do not trigger the experimental stop boundary; ambiguous relocation/threat combinations reject. Official effect-space bundles remain gated under T-RULES-027.

`Attach.icebreakerModifier` changes only the acting pawn: union exact faces, sum extra roll dice, OR Black ICE risk/immunity. It does not create or change a target's ICE, grant an activation, or apply from a hand card's action strip. Phase-Loop uses extra die1 and immunity, together with hand limit−2 and cost1. Both Icebreaker routes and cleanup use the same data. Current source state/checksum semantics are source-v21 / source-v21/cleaner-b-placement; frozen regression is unchanged.

### Global pawn-sacrifice decisions

`BlockEffect.kind: sacrifice-per-player` carries `amount:1` and `minimumControlledPawns`. Electromagnetic Pulse supplies threshold2 in shared JSON. Source constructors validate descriptors and reject this family in strict official bundles pending T-RULES-029. `PendingBlockSacrifices` stores the block/coordinate and one public decision per affected controller, with sorted candidate pawn ids, submission status and optional selected pawn id. Count distinct controlled board/card pawns, including retained control; live board candidates may come from anywhere in Cybernet. An affected retained-only controller preserves the paid Search window with an explicit source-gap error.

`blockSacrificeChoice` / `BlockSacrificeChoice` and options accept each owner's current decision, including outside the active player's turn. Responses use `targetId` plus `optionId:sacrifice`; no hand payment or decline. `AvailableAction.unresolvedTargets` describes prevention combinations separately from executable responses. Submitted selections are public and remain recovery metadata until every owner commits. Revalidate every selected pawn before any cleanup, then eliminate in seat order through normal sacrifice lifecycle and deploy threats after completion. Choices, clones, snapshots and player views retain the batch; opponents receive no hidden hand/deck identities. `pawn-sacrifice-selected` records the public commitment. The simultaneous/retained/Dummy policies remain provisional; no full mode is accepted. Current source protocol/checksum is source-v21 / source-v21/cleaner-b-placement; frozen regression is unchanged.

### Physical bonus supply and reserve

`Mode.bonusCounterSupply` is shared data, verified against the product inventory for a single-product mode. Speedrunners supplies24. Source state copies that immutable quantity into `GameState.bonusCounterSupply`; frozen regression states omit it. A pure `bonusCounterPool` / `BonusCounterPool` query returns supply, reserve, free, invested and onBoard. Derive reserve from player free balances, physical pawn/block attachments' paid counters and uncollected icon counters; discarded use metadata is not another physical allocation. Invalid negative or excessive allocations reject before public actions/phase transitions. Official construction requires configured supply; unconfigured source awards fail explicitly.

`BonusIcon.counterPlaced` records its actual reserve counter. Detect every new icon first, check the full budget, then allocate atomically. Collection validates/transfers those existing counters to the controller once, clears their on-board placement, and leaves reserve unchanged. Attachment payments/refunds transfer free/invested allocations without issuing reserve counters. Card, threat and all-player positive awards share the reserve guard. Go detection/collection helpers now return checked errors; TypeScript throws. NewGame, action and phase entry points retain their contracts. Clones, canonical snapshots and public player views include the supply/allocation or derived public pool.

Copyleft's typed `gain-bonus-all-players` effect awards its shared amount to every player after icon allocation. Pure placement previews add a virtual block and inspect only public geometry/resources, never RNG, to withhold unfunded orientations. Source shortfalls preserve the already accepted Search draw and reject the whole unaccepted placement; no smaller payment/priority is invented. Copyleft and the wider shortage rule stay provisional under T-RULES-030/031. EKO artwork creates no pawn or pawn-space lifecycle. Source protocol/checksum is source-v21 / source-v21/cleaner-b-placement; historical frozen resource semantics remain explicit.

### Controller Core permission and Reboot destinations

`Block.effects.underControl = {kind: "controller-core", target: spaceId}` grants its current block controller optional Core use. The target must identify one unlimited special space; nonzero amounts/thresholds and placement timing reject. This is separate from `isCentralCore`, which still identifies the physical setup Core. No effect parsing, copied mutable permission or automatic pawn placement is involved.

Mirrored `RebootDestinations` / `rebootDestinations` returns detached public landing references from physical Cores and the player's controlled permission blocks, without RNG changes. `reboot`, matching-card and discard-four actions may select `coord` plus `spaceId`; both are required for an explicit selection. Existing omitted destinations still select the physical Core. AvailableActions enumerates executable destinations with the actual activation/cost, including synthetic free-Reboot coverage. Transfer/removal of block control immediately changes eligibility, leaving existing pawns in place. Snapshots, clone and player views already retain the underlying ownership; shared byte evidence covers Reboot placement/events. See SR-BOARD-013 and ADR-0020. Future mode Core functions require their own sourced recipes.

### Native pawn phase effects and physical controlled placement

`Pawn.phaseEffects` carries typed native special effects. The first descriptor is `{trigger:"begin-turn", kind:"steal-random-card", amount:1, scope:"cybernet", target:"another-pawn", optional:true}`. Constructors validate every descriptor and its unique physical control card. Gynoid's raw `special` prose is replaced by this executable data; her movement has no invented fixed step count, and exact pawn ICE uses rhombus faces rather than a category.

Native queue entries retain `source:"pawn"`, scope/target/optional fields alongside the normal effect identity/responder/pawn. `PendingChoice.kind: steal-card` exposes only authorized `resolve-choice` responses with `optionId: steal|skip` and a public target pawn id. Revalidate the beginning phase, current controller, physical control card and target before any randomness. Select one physical hand position uniformly, remove it and append it to the receiving hand; same-controller targets preserve multiplicity. The queue resumes beginning marker cleanup after resolution. No repeated action-phase or out-of-turn activation is granted. Single native obligations execute; simultaneous native/attached phase order remains T-RULES-005 and strict official native construction rejects it independently of flags.

`card-stolen` is a transfer event, not a deck draw. Inferred hand deltas consume this receipt rather than adding a duplicate draw. Trusted events retain card identity; histories show it only to the losing/receiving controller unless `cardRevealed:true` records a source-defined public hand at transfer time. Present or future Trojan state cannot retroactively expose or conceal that event. Snapshots canonically order native queue fields, cloning detaches them, and player options/hand projections preserve privacy.

`Block.effects.underControl = {kind:"place-controlled-pawn", target:pawnId}` requires one matching pawn space and control card. It validates reserve/retained/on-board accounting, places or relocates the same physical piece into that space, synchronizes its control card and changes ownership through the shared control operation. On takeover, physical attachments discard/refund before relocation/control; same-controller placement preserves them and their use state. Actual last-marker victory suppresses further source block effects. Optional event sinks preserve operation order without breaking existing low-level calls. Source state/checksums now use source-v21 / source-v21/cleaner-b-placement; frozen regression bytes and outcomes remain unchanged.

## Optional adjacent block attacks

`Block.effects.underControl = {kind:"attack-pawn", amount:1, scope:"adjacent-blocks", optional:true}` opens a `PendingChoice.kind = "block-attack"`. It retains source block id/coordinate, controller, effect id and skull amount. Both constructors reject unsupported scope, trigger, amount, optionality or fixed targets independently of provisional flags. Pure `AvailableActions`/`availableActions` returns explicit skip plus live pawns on the six physically adjacent placed blocks; entrances, arrows and rotations do not impose attack range. The source says pawn, so friendly/neutral pieces are eligible.

An authorized accepted target produces `block-attack-targeted`, then the one-skull roll. No pawn Delete activation, card, use marker or modifier is added. Effective defense and ordinary elimination cleanup/refunds apply; the original choice clears before a source-permitted defender prevention window opens, retaining the accepted roll. Decline and previews consume no RNG. Immediate final-marker victory skips further block effects. Pending fields survive cloning/snapshots; rejected choices preserve full state and RNG. Source protocol/checksum is now source-v21 / source-v21/cleaner-b-placement. Historical frozen semantics remain unchanged. See SR-BOARD-015 and ADR-0022.

## Mandatory marker-threshold hand discard

`Block.effects.underControl = {kind:"discard-hands-above-markers", markerThreshold:5}` represents Corporate Scandal's exclusive threshold, with no invented amount/target/optional choice. Both loaders/models and validators carry the positive threshold. `CybernetControlMarkerCount` / `cybernetControlMarkerCount` derive physical block and counted control-card allocations; unallocated reserve and ordinary pawn control are excluded. Capture updates the new/old markers before evaluating every player. Idoru's accepted counted allocation contributes without resolving her separate reacquisition/removal gaps.

Source matching-card Icebreaker payment runs after target validation and before roll/control effects. Its played card survives whole-hand discard; later illegal resolution restores the whole action state/RNG. Existing low-level entry points remain compatible and frozen card timing remains explicit. Source typed capture receipts now record control before dependent effects. `block-hand-discarded` identifies each qualifying player and count (omitted for zero); physical `card-discarded` receipts follow in hand order. Empty hands resolve without choices or RNG. Attachments/played cards/markers stay allocated. Last-marker victory suppresses the effect. Current source protocol/checksum is source-v21 / source-v21/cleaner-b-placement; frozen regression remains unchanged. See SR-BOARD-016 and ADR-0023.

## Global pawn detachment and space hand profiles

`Block.effects.underControl = {kind:"discard-pawn-attachments", scope:"cybernet"}` opens a `block-detach` pending choice retaining source block/coordinate, controller and effect identity. Both validators require mandatory under-control timing without invented amounts/targets/optionality. Pure `AvailableActions`/`availableActions` exposes one discard response per live Cybernet pawn, including empty/neutral/friendly/distant targets. Only the block controller may resolve; decline and extra attachment/card selections reject. The accepted response emits `block-attachments-discarded`, then ordered physical `card-discarded` receipts. Shared all-attachment cleanup removes provider descendants once, refunds investments, recalculates benefits/reveal and retains existing spent-card evidence. It does not eliminate, move or transfer pawn/control-card ownership. Final-marker victory skips further block effects. Cloning/snapshots retain the frame.

Go `HandSizeProfileFor` / TS `handSizeProfile` returns public `{base, attachments, spaces, maximum}`. Current stopped controlled pawns contribute authored nonzero signed hand-space amounts; passing/leaving/controller changes do not permanently alter base. Recycling uses the profile maximum alongside existing draw modifiers. Views expose the detached profile while keeping hands private. Existing attachment-only modifier APIs stay compatible; frozen source-free states retain their old recycling/view behavior. Constructors and authoring/source validators reject zero/noninteger hand amounts or defense dice on hand spaces. See SR-TURN-008 for the recorded occupancy interpretation.

Current source protocol/checksum advances to source-v21 / source-v21/cleaner-b-placement. Earlier source traces reject clearly and source evidence refreshes; the22 frozen files remain unchanged. Black Clinic and hand-space behavior execute, while T-RULES-021 used-card redraw, full corpus/deck/setup and modes remain unaccepted.

## Verified native Drone MK-2 bundle

Engineering War and Drone MK-2 use existing schema/model fields and shared handlers; no prose-specific engine branch is added. The block's three spaces, two side entrances, excluded title/effect zones, exact ICE/defense/bonus geometry and controlled-placement target are JSON. The pawn/card defines Drone, exact shielded1–3/vulnerable4–6 and ICE2/6, native five-step free movement, one-skull card Delete and one Module slot. One physical reserve/common pawn/card enters its matching home on capture. Native markers remain on the physical control card across ownership/common release and clear at a controlled beginning; relocation/reacquisition does not refresh them. Module cleanup/refunds remain ownership-sensitive. SR-BOARD-018 records the teal-glyph artwork reading and SR-PAWN-006 owns attributes/timing.

Pure options expose native five-step movement separately from additional paid movement and public paid-Delete assignment. Existing player views, clones and snapshots retain the new physical record; loader/foundation inventory now includes nine control-card definitions (four starters, Idoru, Gynoid, MK-2, Probe, Turret). This is incomplete official content. Source protocol/checksum is source-v21 / source-v21/cleaner-b-placement; prior source traces reject and frozen fixtures stay unchanged.

## Verified Drone Probe free Search bundle

Combat Prototypes, Drone Probe and its physical control card use existing typed schema/loaders/handlers. JSON owns five-space/four-entrance geometry, excluded title/effect zones, exact ICE4/6 and bonus corners, matching home and controlled placement. The pawn defines Drone, Module-only eligibility, shielded1–2/vulnerable3–6, ICE1/3/6 and independent native once-per-turn Search and five-step movement. Decorative skull art is not a Delete activation. SR-BOARD-019/SR-PAWN-007 own the exact sourced readings.

An accepted native Search commits only its Search marker and reveals the top tile before authorized placement, without a card payment. Eligibility is public (reference edges, occupancy, pile count), so previews do not inspect hidden top identity or alter state/RNG. Placement rejection preserves the earlier accepted reveal/use. Native movement has a separate physical marker and accepts independent additional paid movement. Neither free source refreshes on relocation/takeover/common release; the current controller beginning clears both. Module-granted free Delete does not create a paid Delete badge. Existing deferred block-placement effects retain the committed Search use even when a later choice sacrifices its pawn. Sprawl/EMP wider interpretations remain provisional.

Nine current control-card definitions now include four starters, Idoru, Gynoid, MK-2, Probe and Turret; this is not the complete official corpus. Source protocol/checksum is source-v21 / source-v21/cleaner-b-placement; prior source traces reject clearly, all28 current source evidence files refresh, and the22 frozen fixture files remain unchanged.

## Any-player-turn ability permission and owned played cards

Pawn `abilityTurn?: any-player-turn` / `Pawn.AbilityTurn` is schema-validated data, implemented by `permittedAbilityTurn` / `PermittedAbilityTurn` and rejected for unsupported values at source construction. It changes timing of a controlled pawn's abilities only. Action `playerId` remains the real controller; costs, ownership, activation, targets, pending windows and victory still validate. No movement, attachment, other-pawn or turn-advancement permission is granted. Source Turret crosses out every movement activation. Source readings are SR-BOARD-020, SR-PAWN-008 and SR-TURN-009; ADR-0025 owns the architecture.

Public Delete's optional controller argument selects the paying player. Pending attack `playerId` owns assignment even during another player's turn; the engine never temporarily changes active player/phase in mutation. Ordinary direct entry points retain their active-player defaults. Other pending decisions retain their explicitly authorized responders. Pure viewer options enumerate detached ordinary candidates then validate the actual timing exception; actual state/RNG and hidden hands remain unchanged. Shadowraiders threat initiative stays a separate source composition.

GameState `playedCardOwners?: string[]` / `PlayedCardOwners` parallels the existing physical `playedCards` zone by index, retaining duplicate definitions and order. It is public allocation metadata, not a duplicate zone. Source paid plays record the payer in all permitted phases; explicit discard costs bypass the face-up zone. Recycling discards only that player's allocated cards before refill; other owners' cards survive turn changes, pawn elimination and takeover. Clones, snapshots and views copy the metadata. Present mismatched/unknown owners reject before resolution; programmatic fixtures lacking metadata keep the active-player fallback, and frozen games keep historical global recycling.

Military Development has the exact three-space/two-entrance geometry, ICE4/6 at V5, five fragments and hand+1 stopped-controller space in shared data. Capture deploys one matching Turret pawn/card. The pawn replaces its pilot with Drone, shielded1–4/vulnerable5–6, ICE1/4, Module-only, card one-skull Delete and no movement. Nine current control-card definitions are loaded in the mixed corpus (20 blocks/11 pawns); these are not official physical completeness counts. Source protocol/checksum is source-v21 / source-v21/cleaner-b-placement. All28 source evidence files refresh, old source traces reject, and22 frozen fixture files stay unchanged.

## Physical Bonus counters on blocks

PlacedBlock.bonusCounter / domain.PlacedBlock.BonusCounter is a public optional allocation. Presence with no collectedBy means one physical counter held on that block; collectedBy is a persistent first-recipient receipt after transfer. It is separate from the three-block BonusIcon zone. Snapshots, clones and player views include a detached record; the center storage area creates no gameplay space. bonusCounterPool/BonusCounterPool onBoard now includes both held block counters and uncollected icons, preserving supply = reserve + free + invested + onBoard. Unknown recipients/over-allocation reject.

Shared effect identifiers place-block-bonus(amount1) at inCybernet and collect-block-bonus at underControl form a validated mandatory pair. NewGame rejects malformed timing, targets, optionality and extra costs. Placement preview requires combined funding for newly formed icons plus this block counter, and remains pure. Icon allocation occurs before block placement effects; successful capture records control, collects eligible icon counters, then transfers the held block counter. Explicit ordered receipts prevent delta-event reordering. Existing collected receipts prevent takeovers from minting a second award; no reserve is drawn on collection. Immediate final-marker victory suppresses the under-control transfer.

Arms Industry uses exact four-space chain geometry, center/effect exclusions, four entrances, Black ICE6, four fragments and hand−1. Its funded behavior executes, but the record stays provisional under SR-BOARD-021/SR-BONUS-002 and T-RULES-031/047: reserve exhaustion has no accepted ruling, and strict official construction rejects even a disguised non-provisional record. ADR-0026 owns this model decision. Source protocol/checksum is source-v21 / source-v21/cleaner-b-placement; current source evidence refreshes and22 frozen fixture files stay unchanged. The mixed corpus has21 block definitions,12 pawns and10 control cards; those are not physical completeness counts.

## Cleaner B controlled placement

Cleaner (B) reuses `underControl.kind = place-controlled-pawn` with target `cleaner-b`. No new effect symbol is added. The block record carries the verified spaces: hand-size −1, unshielded defense faces 1 and 2, one hand-to-circuit arrow, high ICE face 6, one V3 bonus fragment, all-open edges and the unlimited matching pawn home. The pawn record is classless, has no ICE faces, card-activated one-skull Delete, card-activated movement without a printed step count, Add-on/Weapon/Armor slots, and shielded defense 1–4. Placement does not deploy the pawn; capture does, and immediate victory still stops first. See SR-BOARD-022 and SR-PAWN-009.
