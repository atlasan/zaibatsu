# ADR-0017: Optional space effects and acting Icebreaker attachments

- Status: accepted
- Date: 2026-10-17
- Related: [board rules](../rules/speedrunners/board-and-movement.md), [card rules](../rules/speedrunners/pawns-abilities-and-cards.md), [domain model](../domain-model.md)

## Context

Antro permits optional attachment discards when a pawn stops on its side spaces. A public free-discard action would contradict the general attachment rule. Selection needs physical copy identity, provider cleanup, refunds and pending-choice authorization. Target scope and some stop interactions remain unresolved. Phase-Loop is the first printed Gadget and supplies a verified prerequisite for that family.

## Decision

Encode optional space behavior as typed data. After positive movement stops there, open a controller-owned pending choice with exact physical attachment responses and an explicit decline. Use existing provider cleanup. Block unrelated commands and pause phase completion when normal relocation opens this choice. Queries and invalid commands preserve state/RNG, including committed movement rolls and use markers.

Use the experimental Cybernet-wide matching scope and stop boundary documented in SR-SPACE-001. Withhold undefined relocation destinations and reject conflicting threat windows. Keep Antro provisional and reject effect-space content in strict official construction. This accepts the representation, not an authoritative ruling for T-RULES-027.

Represent acting Icebreaker modifiers separately from target ICE. Merge native/attached faces, extra dice, risk and immunity for both target routes. Phase-Loop is one cost1 Cyberdeck Gadget, hand limit−2, extra acting die1 and Black ICE immunity. Its independent action strip does not apply attached benefits.

Advance source semantics/checksums to source-v10 / source-v10/optional-space-discard. Earlier source traces reject explicitly. Preserve frozen regression bytes and replay behavior.

## Consequences

Mirrored tests/shared evidence, sandbox physical responses, replay/undo/recovery and editor retained fields cover the delivery. Antro interpretations and the wider official content/setup/mode gates remain incomplete. Expansion content can use these typed fields and registered handlers without prose execution.
