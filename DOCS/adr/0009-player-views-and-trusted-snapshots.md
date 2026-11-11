# ADR-0009: Player views and trusted snapshots

- Status: accepted
- Date: 2026-10-17
- Related: [domain model](../domain-model.md), [parity](../parity.md), [Trojan](../rules/speedrunners/pawns-abilities-and-cards.md#sr-card-017-trojan-controller-hand-reveal), [backlog](../../tasks/BACKLOG.md)

## Context

Both rulebooks p.10 keep hands and face-down pile contents private. Trojan explicitly makes its controller's hand face up. Canonical snapshots, seeded traces and the local operator host already expose complete simulation state for deterministic testing and recovery; those are unsuitable as player-facing contracts.

## Decision

Add mirrored `playerView` / `PlayerView` projections with format `zaibatsu-player-view/v1`. Whitelist public fields, represent hidden piles by counts, and represent each hand by count, visibility and a detached card list. The empty viewer is a spectator; a nonempty unknown player rejects. Only the authorized pending responder, or otherwise the active player, receives action options and private pending-choice details. A revealed opponent hand never confers action authority.

Compute `Attach.controllerHand: face-up` continuously from attachments on pawns controlled by that player. Do not store a reveal flag that can outlive takeover, elimination or provider cleanup. Current draws appear immediately in current views. Historical events have no event-time reveal provenance, so `eventsForPlayer` / `EventsForPlayer` always removes other players' draw identities and private validation errors. This does not pretend to erase information a human already saw.

Search options in player views expose declaration templates without hidden-tile placement previews. Full trusted options remain available to the operator sandbox. A source-complete Search draw/reveal/placement decision remains a separate delivery requirement; it must not be inferred complete from these views.

Return detached values without modifying state or RNG. Preserve full snapshots and trace formats/checksums for trusted regression and operator use. The sandbox hand dock and displayed history consume projections; a dedicated read-only player-view endpoint contains no seed, replay or operator state. Label trusted diagnostics and replay access explicitly.

## Consequences

Future missions, team/solo state, reveal effects, choice payloads and event types need an explicit visibility review before entering this versioned contract. This local host has no authentication or seat authorization and still provides operator endpoints. Network hosting must authenticate the viewer server-side and restrict operator transport; a client-supplied viewer id is not authentication.

## Alternatives considered

Masking cards in CSS or reusing complete snapshots would leave hidden information in player payloads. Storing a permanent reveal flag would create stale visibility after cleanup. Revealing old draw events based on current attachments would disclose history that was private when it occurred. These approaches were rejected.
