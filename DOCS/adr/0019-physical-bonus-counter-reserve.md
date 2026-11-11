# ADR-0019: Physical bonus-counter reserve

- Status: accepted
- Date: 2026-10-17
- Related: [resource rules](../rules/speedrunners/setup-and-victory.md), [Copyleft](../rules/speedrunners/board-and-movement.md), [domain model](../domain-model.md)

## Context

Copyleft awards every player a reserve counter. The base game has24 physical counters, and placement allocates counters to completed icons before block effects. Earlier resource handling created a counter only on collection and had no finite supply. The EKO artwork was also incorrectly planned as a pawn prerequisite; the complete control-card/pawn set contains no such component.

## Decision

Store the sourced supply in shared mode data and copy it into source state. Derive reserve from free player counters, paid physical attachments and uncollected on-icon counters instead of maintaining another mutable balance. Cross-check single-product supply against sourced inventory. Reject invalid allocations before live commands and phase transitions.

New bonus icons allocate physical counters atomically before block effects. Collection transfers an existing counter exactly once, without spending reserve again. Card/threat/global awards share the reserve guard; payments and refunds move existing counters between free and invested locations. Public pool queries are pure, detached and usable by browser/native/simulation clients. Snapshots/clones/player views retain the supply and icon placement.

Copyleft uses a typed all-player award and normal artwork spaces, with no new pawn. Placement previews use a virtual block and public geometry/resources to withhold unfunded orientations without RNG. Unknown exhaustion/partial-fulfillment policy remains T-RULES-030/031: preserve an accepted Search reveal and reject the entire unaccepted placement. Strict official construction gates Copyleft's unaccepted shortage family even after provisional flags are cleared. This ADR accepts resource representation and delivery isolation, not a shortage ruling or complete mode acceptance.

Go icon detection/collection now return checked errors, matching TypeScript exceptions; callers are updated. High-level NewGame/action/phase contracts remain intact. Source semantics/checksums advance to source-v12 / source-v12/physical-bonus-reserve; prior source traces reject. Explicit frozen regression retains original resource semantics and exact bytes.

## Consequences

Mirrored tests share byte snapshots, public options/views/pool summaries and ordered allocation/award/collection events. They cover exhausted-reserve transfers, investment/refunds, other award paths, selective previews, malformed state/data, conservation, rejection/RNG and official gates. Sandbox/editor controls and traces expose the completed mechanics while interpretation and full content/setup/mode gaps remain visible.
