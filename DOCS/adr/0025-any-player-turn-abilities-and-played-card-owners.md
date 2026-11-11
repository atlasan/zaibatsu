# ADR-0025: Any-player-turn abilities and played-card owners

- Status: accepted
- Date: 2026-10-18
- Related: [pawn rules](../rules/speedrunners/pawns-abilities-and-cards.md), [turn rules](../rules/speedrunners/turns-and-actions.md), [domain model](../domain-model.md), [parity](../parity.md)

## Context

Drone Turret explicitly permits abilities during any player's turn. The provisional pilot instead encoded free Delete and inert prose. A single unowned played pile also caused another player's recycling to discard a reaction's paid card, contrary to EN/ES p.8.

## Decision

Shared pawn JSON encodes `abilityTurn: any-player-turn`; schemas, both models/loaders and construction validation carry/reject unsupported permissions. Authorize only that controlled pawn's ability actions, retaining real costs, targets and sources. Never switch the active player/phase in mutation. Roll Delete takes an explicit controller (optional parameter preserves ordinary callers); pending attack identity owns assignment. Pending choices/movement/combat/phase resolution stay indivisible under the source reading in SR-PAWN-008. Shadowraiders joint-threat initiative remains separate.

Pure off-turn options enumerate ordinary ability candidates on a detached controller/action-phase projection, then filter each through the actual state's timing permission and executable validation on a second detached clone. Neither the actual turn nor live RNG changes, and rejected/unsupported candidates are not presented. Viewer projection does not disclose another player's hand. Only public pawn permissions determine the sandbox's handoff list; private costs/options load after the controller confirms handoff.

Keep `playedCards` as the physical card zone and add parallel `playedCardOwners`. Every source paid play records its payer, including non-action phases. Recycling removes only that payer's physical entries in order; other players' face-up cards persist. Explicit discard costs remain immediate. Clone/snapshot/view and replay include owners. A present invalid allocation rejects atomically. Legacy programmatic fixtures without allocation retain the active-player default; frozen regression retains old semantics and bytes.

## Validation and consequences

Thirteen mirrored source tests/shared byte evidence cover real Search/capture, private options, every idle phase, public-roll authority, duplicate physical payments, own recycling, indivisible pending windows, Dummy, separate Module free use, control/elimination and victory. Sandbox handoff/replay/import/recovery/undo/reset and editor source-target persistence are tested. Source protocol/checksum is v19/any-turn-abilities; older source traces reject, source goldens refresh and frozen fixtures stay unchanged. This does not accept full modes, simultaneous declaration priority or unresolved multiple-free/marked-card reuse.