# ADR-0015: Physical control-card allocations and source protocol v8

- Status: accepted
- Date: 2026-10-17
- Related: [domain model](../domain-model.md), [Idoru rule](../rules/speedrunners/pawns-abilities-and-cards.md#sr-pawn-004-idoru-attributes-and-counted-control-card-marker), [backlog](../../tasks/BACKLOG.md)

## Context

Toyeku can place a neutral pawn, but the pilot Idoru record had invented class/abilities and misread ICE. Her special instruction counts a marker placed on a control card toward Cybernet victory. Block ownership alone cannot locate that marker or return it on takeover. The source does not settle every later repeat/lifecycle case.

## Decision

Store typed acquisition instructions in shared pawn JSON and explicit physical card allocations in state. Keep actual acquisition separate from card-zone synchronization, so Reboot and turn changes cannot repeat an instruction accidentally. Include allocations in canonical snapshots, clones, public projections and semantic events; expose a detached query spanning block and card locations. Player placed/remaining totals count both. Propagate acquisition errors through both typed effect pipelines and atomic command boundaries.

The ordinary capture/other-owner transfer path executes in both engines and can win immediately. The Idoru record remains provisional. Its rule module owns the experimental literal common-card retention reading, explicit same-owner reacquisition rejection and unresolved refill policy. This ADR chooses representation and error handling; it does not settle those rules. Strict official bundles continue rejecting provisional content.

Advance source state/checksum semantics to `source-v8` / `source-v8/control-card-markers`. Existing source-v7 traces cannot silently replay under changed attributes or allocations. Frozen regression keeps its original bytes and behavior. Omit absent previous-owner fields consistently in both event journals.

## Consequences

Shared Idoru snapshots/events and mirrored behavioral tests cover real acquisition, return/allocation ordering, immediate victory, costs, malformed allocation rollback, query RNG, detached projections and explicit unresolved gates. A staged one-marker sandbox fixture exercises the existing engine options, inspection, victory, replay and undo. Full Idoru, Hacktivism and official-mode acceptance remain open.
