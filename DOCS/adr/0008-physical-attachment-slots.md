# ADR-0008: Physical attachment slots and source protocol v2

- Status: accepted
- Date: 2026-10-17
- Related: [ADR-0007](0007-source-lifecycle-and-replacement-windows.md), [SR-CARD-011](../rules/speedrunners/pawns-abilities-and-cards.md#sr-card-011-physical-slots-and-dependent-attachment-cleanup), [domain model](../domain-model.md), [parity](../parity.md), [backlog](../../tasks/BACKLOG.md)

## Context

The bilingual rulebooks pp.33–34 give attachments their own additional physical slots and prohibit moving attached cards. Gunhed's illustrated Add-on slot is distinct from the occupied native Add-on slot beneath it. A deduplicated set of slot types cannot represent this, distinguish multiple providers, or decide which cards lose their supporting slot when a provider disappears.

## Decision

Represent each physical slot with a stable rooted path: native `pawn:add-on`, then `/weapon` for a slot supplied by its occupant. Each path holds one attachment. Store the chosen path as `Attachment.slotRef`; permit `Action.slotRef` on pawn/enemy attachment actions. A single free slot may be selected implicitly for compatibility, but multiple free slots require an explicit choice. Both engines enumerate all legal choices without modifying state or RNG.

Compute grants only from attachments grounded in a native slot. A card cannot provide the very slot needed to attach itself. Cards with absent references in hand-authored fixtures are inferred in attachment order without mutating them. Newly accepted source actions always store explicit paths. Frozen regression loading retains its historical one-slot-per-type behavior.

When a source attachment is discarded, discard cards occupying its descendant paths rather than moving them to other slots. Refund each card's paid counters once to the existing pawn controller. Record the selected card first, then descendants in path-depth and original-attachment order. This ordering describes structural cleanup only; it does not establish simultaneous triggered-effect ordering (T-RULES-005). Whole-pawn elimination/takeover still discards every attachment once. No general voluntary discard action is added.

Construct new source states as `rulesVersion: source-v2`. Extend canonical attachment snapshots with optional `slotRef`, preserving frozen byte layouts when absent. Source replay checksums include the `source-v2/physical-slots` rules stamp in addition to content. The existing trace envelope is unchanged; older source checksums reject clearly as a data/rules-version mismatch. Frozen corpus traces/checksums remain unchanged.

## Consequences

Independent native and granted slots, repeated copies, explicit decisions, nested cleanup, phase self-discard and elimination prevention share one implementation. Snapshots, cloning and replay retain locations. The sandbox renders engine-owned slot choices and current slot occupancy. Synthetic fixtures prove these generic rules; they do not promote Gunhed's remaining Delete activation/strength semantics or any other unfinished weapon/module component.

The printed Gunhed/AK-12kM example informs the model. Full content correction and cumulative Delete activations remain prerequisites before completing that component family under T-RULES-012. Partial source coverage remains visible.

## Alternatives considered

- Count slots by type: loses attachment/provider relationships and can rescue a card by moving it after its provider disappears.
- Use attachment-array indices as identity: removals reorder indices and break descendants and replays.
- Add globally unique card-instance ids now: viable later for broader physical-card accounting, but unnecessary for rooted slot locations and not a reason to postpone this prerequisite.
