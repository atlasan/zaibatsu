# ADR-0022: Optional adjacent block attacks

- Status: accepted
- Date: 2026-10-17
- Related: [board rules](../rules/speedrunners/board-and-movement.md), [domain model](../domain-model.md), [parity](../parity.md)

## Context

Yakuza prints an optional pawn choice followed by a one-skull attack on an adjacent block. Ordinary Delete instead exposes a public roll before assignment; using its action activation would also invent a pawn cost and modifiers.

## Decision

Store explicit attack kind, adjacent scope, optionality and skulls in shared block JSON. Validate them before construction. Retain source identity/controller in an engine-owned block-attack choice. Pure queries offer decline and live physical-neighbor targets, including literal friendly/neutral pawns. Resolve the selected target before one seeded roll against effective defense. Use no pawn Delete activation, extra card or modifier.

Clear the initial choice before ordinary elimination, allowing a source-permitted single defender to open its own authorized prevention response without rerolling. Reuse cleanup/refund/control-card accounting and immediate victory stopping. Source protocol/checksums advance to v14/adjacent-block-attack; frozen regression remains unchanged.

## Consequences

Mirrored byte snapshots, options, views and ordered receipts include both choice windows. Rejection/RNG, timing, range, cleanup and strict validation tests accompany sandbox/editor persistence/recovery. This accepts Yakuza, not unresolved wider Dummy choices, complete official content or modes.
