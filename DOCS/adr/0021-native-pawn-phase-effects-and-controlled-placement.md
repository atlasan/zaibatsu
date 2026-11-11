# ADR-0021: Native pawn phase effects and controlled placement

- Status: accepted
- Date: 2026-10-17
- Related: [pawn rules](../rules/speedrunners/pawns-abilities-and-cards.md), [board rules](../rules/speedrunners/board-and-movement.md), [domain model](../domain-model.md), [parity](../parity.md)

## Context

Gynoid's special prose was inert, with incorrect pilot movement/Search/defense. Pink District grants controlled placement on capture, unlike Toyeku's neutral tile-placement rule. The existing phase queue only recognized attached sources, and Reboot/ordinary first-space placement cannot represent this matching home and repeat control behavior.

## Decision

Store native pawn phase descriptors in shared JSON and validate their supported kind, timing, scope, optionality, amount and physical control card in both mirrors. Add source-aware native queue entries and authorized target/decline choices. Commit one physical random hand position only after target acceptance. Retain the existing explicit gate on simultaneous native/attached obligations until T-RULES-005 is sourced; strict native official construction rejects this gap even after flags are cleared.

Use a distinct typed under-control matching-pawn placement handler. Reconcile physical reserve/retained/on-board/card zones, relocate the same piece on repeat capture, and reuse ordinary ownership/attachment cleanup. Preserve cards/use state on same-owner placement. Optional event sinks retain operation order while keeping existing entry points compatible. Immediate source victory stops further block effects.

Represent a hand transfer with `card-stolen`, suppressing a duplicate inferred deck draw. Transfer parties know the card. Event-time public hand reveal is recorded explicitly; histories do not infer past visibility from current Trojan state. Canonical snapshots/clones retain native queue fields. Source protocol/checksums advance to v13/native-phase-theft; frozen regression remains unchanged.

## Consequences

Mirrored byte snapshots/events/options/views and rejection, costs, conservation, timing, control and reveal tests prove supported behavior. Sandbox/controller choices, replay/recovery/undo and editor matching-home validation expose it. Pink's block behavior is implemented; Gynoid's single theft works but full phase composition remains provisional. This does not accept full content, setup, deck or modes.
