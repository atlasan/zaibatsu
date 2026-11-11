# ADR-0023: Marker thresholds and source card-payment timing

- Status: accepted
- Date: 2026-10-17
- Related: [board rules](../rules/speedrunners/board-and-movement.md), [turn rules](../rules/speedrunners/turns-and-actions.md), [domain model](../domain-model.md), [parity](../parity.md)

## Context

Corporate Scandal discards the remaining hand of every player above five Cybernet control markers. Current source rules include Idoru's counted card allocation. The old block-Icebreaker path removed its card only after effects, allowing the activating card to be swept into a whole-hand discard.

## Decision

Store a typed under-control effect with positive exclusive markerThreshold. Derive counts from physical Cybernet block/card allocations, after new capture and old-marker return. Discard every qualifying hand, preserving physical duplicates and public receipts; empty hands need no choice or RNG.

Validate source card-paid block targets before committing payment, then move the activating card to played cards before the roll/control/effects. Preserve public low-level entry compatibility and frozen regression timing. Record typed source control transitions before dependent effects. Use full action rollback for rejected commands. Source protocol/checksums advance to v15/marker-hand-discard.

## Consequences

Mirrored byte evidence and tests cover count boundaries, Idoru, takeover, actual payment, duplicate conservation, empty hands, public views, rejection/RNG and immediate victory. Sandbox/editor expose the threshold and supported command sequence. This accepts Corporate Scandal only; Idoru's other gaps, complete official content and all modes remain separate gates.
