# ADR-0012: Physical ability use markers and source protocol v5

- Status: accepted
- Date: 2026-10-17
- Related: [ADR-0011](0011-rolled-movement-decisions.md), [movement rules](../rules/speedrunners/board-and-movement.md#sr-move-005-physical-ability-marker-identity-and-unresolved-discard-lifetime), [domain model](../domain-model.md), [backlog](../../tasks/BACKLOG.md)

## Context

Both rulebooks p.18 put a start marker on the used ability and remove markers from cards under the beginning player's control. Pages 22–23 transfer control cards or retain/release them after elimination without specifying a native marker reset. Page 33 discards attached cards on takeover, elimination or lost slots. The existing owner-local native keys and attachment-position keys could refresh an ability when control or list positions changed.

## Decision

Native spent uses belong to `GameState.nativeUseMarkers`, keyed by pawn control-card id and ability. Transfer, retained elimination and release to common/reserve preserve them. Beginning cleanup removes only markers on cards currently under that player's control, after supported beginning effects resolve. Unowned cards do not reset on their former owner's turn.

Each source attachment receives an `instanceId` from a deterministic monotonic `attachmentSerial`, independently of game RNG. Its `useMarkers` carry ability identifiers and counts. Movement grant indices identify a grant inside that physical card, not a position in the pawn's attachment array. Duplicate cards remain independent. Removing another attachment cannot refresh the survivor. Native and attached Delete, movement, Search, Icebreaker and Reboot use these references where their supported free routes apply. Existing unsupported non-move activation budgets remain unsupported.

The reviewed sources do not explicitly resolve a marked attachment's discard/redraw lifetime. Preserve its marker metadata in `unresolvedUseCards` when it is discarded, while the actual card goes to the ordinary discard pile. This is historical evidence, not another physical card/resource zone; historical `bonusPaid` does not represent a still-allocated counter. Beginning cleanup cannot silently clear this evidence. Deck/hand cards still use definition ids, so an unresolved marked discard conservatively blocks reattachment of that definition, including indistinguishable duplicates. Reject atomically before payment, serial allocation or RNG. T-RULES-021 owns a sourced ruling and physical copy tracking through deck/hand reuse. Strict official bundles containing limited-use attachments reject at construction until that lifecycle is supported; experimental fixtures remain available.

Expose detached public marker allocations in player views and semantic events for marking, clearing and retained unresolved evidence. The sandbox reads those allocations in its inspector and offers a capture/reset scenario. Source snapshots/clones include native markers, attachment ids/uses, unresolved evidence and the attachment serial. The source protocol/checksum advances to `source-v5` / `source-v5/physical-use-markers`; older source checksum stamps reject clearly. Frozen regression keys, state layout, data and checksums remain unchanged.

## Consequences

Shared snapshots/events prove native transfer and controller reset. Mirrored tests cover duplicates, provider cleanup, retained/common/reserve cards, pure queries/clones, rejected commands, recycle/re-entry rejection and physical inventory conservation. Sandbox replay/undo preserves the spent marker. SR-MOVE-005 remains partial because discarded-card lifetime is unresolved; this decision does not certify a full mode or all activation budgets.

## Alternatives considered

Owner-local keys incorrectly treat capture as a new free use. Array-position keys incorrectly refresh a surviving card after unrelated removal. Clearing markers automatically on discard or redraw invents an unstated rule. Treating evidence as a second card would violate inventory accounting. These alternatives are rejected.
