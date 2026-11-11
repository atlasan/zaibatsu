# ADR-0018: Public global pawn-sacrifice decisions

- Status: accepted
- Date: 2026-10-17
- Related: [board rules](../rules/speedrunners/board-and-movement.md), [domain model](../domain-model.md), [parity](../parity.md)

## Context

Electromagnetic Pulse requires each qualifying controller to select a pawn. The active player cannot select for others. Retained control counts toward the threshold, but sources leave retained target eligibility and simultaneous order unclear. Sacrifice/prevention already has a separate unresolved source dependency.

## Decision

Use shared typed effect data with a minimum controlled count and an explicit one-pawn amount. Capture affected players and sorted live candidates in a source pending batch. Each owner may submit their current decision, including outside the active player's ordinary turn. Public selections remain visible and do not remove pieces until all affected owners select.

Revalidate the entire batch before cleanup. Eliminate in stable seat order through the existing sacrifice lifecycle, including physical attachments, paid-counter refunds, Reboot retention and reserve/common release. Record selection separately from elimination. Snapshot, clone and replay the full batch; player views expose public choices and only the viewer's executable options. Queries consume no RNG and distinguish unsupported prevention targets from executable responses.

This public commitment/seat-order resolution and live-only candidate policy is experimental under T-RULES-029. A retained-only affected owner rejects placement against the accepted Search reveal. Prevention combinations stay explicit under T-RULES-010. Strict official construction rejects the effect family even if provisional flags are cleared. This ADR accepts representation and delivery isolation; it does not settle those rule interpretations.

Source semantics/checksums advance to source-v11 / source-v11/global-pawn-sacrifice. Prior source traces reject explicitly. Frozen regression bytes and historical outcomes remain unchanged.

## Consequences

Both mirrors share intermediate/final evidence, public semantic events, rejection/RNG and physical conservation tests. The sandbox and editor cover decisions, public commitments, thresholds, replay/recovery/undo and save/load/export. The new fields can support expansion recipes without parsing printed prose. Full component/mode completion remains unaccepted while the recorded source gaps apply.
