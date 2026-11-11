# ADR-0016: Internal arrows, global discard decisions and source protocol v9

- Status: accepted
- Date: 2026-10-17
- Related: [movement/block rules](../rules/speedrunners/board-and-movement.md), [domain model](../domain-model.md), [backlog](../../tasks/BACKLOG.md)

## Context

The page-one block pilots misrepresented title art as a space, double-space geometry, bonus corners and printed arrows. The old Direction field restricts cross-edge exits; it cannot represent the arrows between Hacktivism/Sprawl's adjacent spaces. Sprawl also requires each affected player to choose physical hand cards, including decisions outside the active player's ordinary turn.

## Decision

Represent internal arrows as directed from/to links over the undirected physical space graph. Bar only the reverse traversal of that link. Validate endpoints and unique orientation. Reuse the existing attachment arrow exception, shared path query and movement execution. Keep the edge Direction field distinct. Both loaders and editor normalization/export retain the new data.

Represent Sprawl's pending decisions as a batch with a separate authorized decision id per affected player, fixed amounts and private selections. The first unsubmitted decision is a local UI pointer; either owner may submit their own current decision. Store commitments as recovery metadata while cards stay in their hands. Revalidate and publish all discards together in stable seat/hand order. Clone/snapshot the full trusted batch, while public player views omit selection identities and expose only required/submitted status plus the viewer's own options. Ordinary actions and phase transitions stay blocked throughout.

The commitment timing is an experimental interpretation, not a settled source rule. The reviewed text does not prescribe global ordering or a hand-shortfall policy. Preserve the accepted Search draw and reject an underfilled placement instead of inventing a smaller discard. Hacktivism's actual typed marker-removal effect also rejects until its separate lifecycle dependency is resolved. Keep both full components provisional under T-RULES-025/026. This ADR accepts representation and delivery isolation; it does not resolve those game interpretations.

Advance source state/checksum semantics to source-v9 / source-v9/internal-arrows-block-discards. Preserve the frozen corpus and historical trace behavior. Owner-attributed discard events suppress their generic delta duplicates, retaining one record per physical card.

## Consequences

Mirrored tests assert shared intermediate states, public projections and semantic events. They cover source geometry/defense/ICE/bonus, directed movement and exception removal, reverse response order, retained pawn counts, duplicate cards, authority/interleaving, shortfalls, cloning and unchanged RNG. Host/browser tests exercise pending decisions, replay/recovery/undo, movement previews and authoring save/load. SR-MOVE-007 is implemented; full blocks and official modes remain unaccepted where the recorded dependencies apply.
