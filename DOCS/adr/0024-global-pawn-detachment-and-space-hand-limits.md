# ADR-0024: Global pawn detachment and current space hand limits

- Status: accepted
- Date: 2026-10-17
- Related: [board rules](../rules/speedrunners/board-and-movement.md), [turn rules](../rules/speedrunners/turns-and-actions.md), [domain model](../domain-model.md), [parity](../parity.md)

## Context

Black Clinic requires a pawn choice followed by all-attachment discard. Its lower circle is a large special space, not a double capsule. Its separate minus-one hand space exposed an ignored core modifier: recycling previously used attachment hand amounts alone.

## Decision

Represent mandatory Cybernet-wide pawn detachment in shared data, validate it, and retain source/controller identity in an engine-owned choice. Offer every live pawn, including empty/neutral/distant pieces; invent no decline or attachment-only restriction. Reuse all-attachment physical cleanup/refunds and retain spent-card evidence. Discard does not eliminate or change pawn ownership. Stop further effects at source victory.

Represent current public hand limits as base, attachments, spaces and maximum. Evaluate stopped controlled-pawn space amounts with current attachments at recycling. SR-TURN-008 records the source occupancy reading and rationale; repeated stops do not permanently change base. Pure profiles support UI/views while preserving hidden hands. Keep existing attachment modifier APIs and frozen behavior compatible.

Source protocol/checksums advance to v16/global-pawn-detachment. Mirrored snapshots/events/options/profiles and sandbox/editor persistence verify supported behavior; T-RULES-021 spent-card reuse, full content and all official modes retain separate acceptance gates.
