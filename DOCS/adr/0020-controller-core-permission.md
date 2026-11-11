# ADR-0020: Controller Core permission

- Status: accepted
- Date: 2026-10-17
- Related: [Broadcast rule](../rules/speedrunners/board-and-movement.md), [domain model](../domain-model.md), [parity](../parity.md)

## Context

Clandestine Broadcast permits its controller to use the block as a Central Core. Marking it as a physical Core would incorrectly affect setup, block-pile composition and movement restrictions. Earlier Reboot always selected the first Core, leaving no player choice.

## Decision

Use shared typed under-control `controller-core` data naming the large unlimited special landing space. Derive the optional permission from current placed-block ownership. Do not copy a grant into player state, relocate on capture, grant Reboot itself or infer behavior from printed prose. Keep actual Core identity distinct.

Expose mirrored pure detached destination queries. Reboot actions and compatible low-level entry points accept an optional coordinate/space reference; omitted destinations preserve original Core behavior. All routes retain ordinary ownership, activation, costs, multiplicity and timing checks. AvailableActions and the sandbox enumerate engine-owned destination actions. Existing snapshot fields already retain permission ownership, so no state-format change is needed. Source-v12 remains; content hashes distinguish changed bundles and frozen regression keeps its bytes/outcomes.

## Consequences

Source-backed mirrored tests cover graph/ICE/defense, shared byte snapshots/events/options, capture/loss, last-marker victory, costs/conservation, query/RNG purity and rejection. Editor/sandbox controls, replay/recovery/undo and docs track this component. This accepts the permission representation and base Reboot interpretation; future modes adding other Core functions require independent sourced composition and outcome evidence.
