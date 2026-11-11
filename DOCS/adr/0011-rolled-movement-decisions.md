# ADR-0011: Rolled movement decisions and source protocol v4

- Status: accepted
- Date: 2026-10-17
- Related: [ADR-0010](0010-search-decisions-and-source-protocol-v3.md), [movement rules](../rules/speedrunners/board-and-movement.md#sr-move-003-committed-movement-roll-before-path-choice), [domain model](../domain-model.md), [backlog](../../tasks/BACKLOG.md)

## Context

Both rulebooks pp.24–25 give die-based movement a step allowance equal to its roll, permit using fewer steps, and forbid interleaving other actions. The historical combined command selected a path before rolling and refunded both activation and RNG on an overlong result. That shortcut did not provide the source-required informed movement choice.

## Decision

Source `roll-movement` declares one selected die-based native or granted movement. It validates authority and activation before RNG, commits the free-use marker or one physical movement card, rolls once, applies the attachment step modifier once, and opens `PendingChoice.kind: move-path`. The nested movement record stores public dice, fixed budget, origin, selected movement index/key and stealth policy. No path is selected by the declaration.

The authorized player responds with `resolve-choice`, `optionId: move`, and a path after seeing the dice. An empty path stops without moving; the activation remains spent and unused steps are lost. A complete path may pass occupied spaces but must end within capacity. Prefix previews report whether stopping is legal, without moving or consuming RNG. Arrow/Core-entry restrictions and movement cancellation apply. Ordinary movement ends at the first threatening block; selected stealth may pass under the existing threat policy. Combat opens only after the movement decision completes. Other ordinary actions and phase changes wait for the decision.

Expose the movement record publicly through player views and engine-generated options only to its authorized responder. Source action queries offer die-roll declarations rather than speculative maximum-roll paths. Independent fixed card movement remains available alongside a pawn's free ability, including after its free use is spent. The native cannot-move symbol cancels native, granted and card movement; explicit placement remains distinct from normal movement.

Source state/checksums advance to `source-v4` / `source-v4/rolled-movement`; existing trace envelope versions remain unchanged. Incompatible prior source checksums fail clearly. Explicit frozen regression loading keeps its historical combined movement and dice-use budget semantics. Source constructors reject the unverified legacy encoding that rolls a number of activations; die steps use the typed `d6`/`2d6` movement definitions.

## Consequences

Shared tests and source goldens include committed rolls, legal/illegal paths and completion windows. Replay/undo can restore either side independently. A rejected path preserves the accepted roll, paid zone and spent use. Complete printed mover/board content is still a separate requirement. Physical marker identity across control changes, attachment reindexing, discard and re-entry remains T-RULES-019; this decision does not certify that subsystem complete.

## Alternatives considered

Keeping the path-first command or displaying an estimated maximum would still select movement without the actual allowance. Rerolling or refunding after an illegal response would let rejected paths alter an already accepted random outcome. A separate path budget recomputed from current modifiers would apply costs/modifiers more than once. These alternatives were rejected.
