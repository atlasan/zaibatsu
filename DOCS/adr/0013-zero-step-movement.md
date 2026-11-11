# ADR-0013: Zero-step fixed/card activation and source protocol v6

- Status: accepted
- Date: 2026-10-17
- Related: [ADR-0012](0012-physical-ability-use-markers.md), [movement rules](../rules/speedrunners/board-and-movement.md#sr-move-006-zero-step-fixed-and-card-movement-activation), [domain model](../domain-model.md), [backlog](../../tasks/BACKLOG.md)

## Context

Bilingual pp.24–25 allow up-to-step movement and lose unused steps, without a minimum. The committed die-movement decision already permits stopping with zero steps. Older fixed/card helpers required a nonempty path, and queries/UI hid all movement when isolated or reduced to zero allowance.

## Decision

Apply the same zero-step interpretation to source fixed/card movement. Validate current occupancy, cancellation, authority, pending work, free limits and card payment normally. An empty path commits its use/cost and loses its allowance without changing position, consuming RNG or awakening a threat. Clamp negative allowances to zero. Independent card movement remains distinct from the native free marker. Reject extraneous payment on a free fixed/hex command rather than ignoring it.

Expose executable zero-step commands through mirrored available-action `responses`. Omitted path means empty. Offer them even with no adjacent targets or zero maximum; omit nonexistent targets and zero optional maximum consistently across mirrors. Source sandbox fixed/card options come from engine templates, and previews confirm finishability on a cloned reducer state. Show that current-space finish spends the activation; retain path controls when steps are available.

Source state/checksum advances to `source-v6` / `source-v6/zero-step-movement`; prior source checksums reject clearly. Trace envelopes remain unchanged. Explicit frozen regression retains its old empty-path rejection, snapshots, bytes and checksum.

## Consequences

Shared snapshots/events assert costs and two physical duplicate payments. Mirrored tests and sandbox acceptance cover isolation, zero modifiers, limited grants, cancellation, atomic rejection, reset, RNG, threat non-entry, replay and undo. This closes T-RULES-020/SR-MOVE-006 only. Exact printed topology/movers, whole-block variants and discarded attached-card marker lifetime remain separate requirements.

## Alternatives considered

Requiring a step after a fixed/card activation applies a minimum absent from the reviewed up-to wording and conflicts with the die stop contract. Treating zero as a free preview would avoid the source activation cost. Triggering threats for staying in place would turn no entry into a movement entry. These alternatives are rejected.
