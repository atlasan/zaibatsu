---
title: Player views are separate from trusted simulation state
type: decision
---
Use mirrored `playerView` / `PlayerView` and event projections for player payloads.
Snapshots, seeds, replay traces and local operator endpoints remain trusted access.

**Why:** [ADR-0009](../DOCS/adr/0009-player-views-and-trusted-snapshots.md) preserves
hidden hands and piles while supporting source-defined continuous reveals.

**How to apply:** whitelist new public state fields, review new choice/event
payloads, detach projections, and test state/RNG preservation. The local sandbox
does not authenticate seats; network hosting must restrict operator access and
derive viewer identity from authenticated server context.

Source Search now exposes the drawn block publicly in `revealedBlock` and its placement responses only to the authorized controller. Before declaration, even trusted source action queries omit hidden-tile placement previews. See [ADR-0010](../DOCS/adr/0010-search-decisions-and-source-protocol-v3.md).
