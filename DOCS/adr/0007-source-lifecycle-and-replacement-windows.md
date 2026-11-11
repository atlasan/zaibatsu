# ADR-0007: Source lifecycle and controller-owned replacement windows

- Status: accepted
- Date: 2026-10-17
- Related: [ADR-0006](0006-source-promotion-and-phase-decisions.md), [domain model](../domain-model.md), [parity](../parity.md), [backlog](../../tasks/BACKLOG.md)

## Context

Primary Speedrunners pp.5/23 distinguish excluded starting pieces, reserve pieces and retained Reboot pieces. The frozen corpus did not represent these separately. Dummy also requires a replacement decision before ordinary elimination cleanup, potentially belonging to a defending controller during another player's turn.

## Decision

Extend ADR-0006 with an explicit runtime `regressionFixture: provisional-v1` marker set by the regression loaders. Ordinary constructors create source-version state with physical reserve/excluded pools and explicit card zones. Source version identifies a state protocol; it does not certify complete content or official readiness. Do not infer old behavior from a provisional flag or component alias.

Represent elimination replacement as typed pending state and a named authorized respondent. The engine supplies complete response actions. Only that response may bypass ordinary active-player checks; snapshots/clones/replay retain it. Final cleanup follows its resolution. Propagate effect failures to the atomic reducers, including compatibility reducers, and restore fields created during a rejected attempt.

Source uncertainties remain governed by primary evidence. Sacrifice replacement and simultaneous protection order are rejected provisional combinations, not gameplay policies adopted by this ADR. Track them under SR-CARD-007/T-RULES-010. New source goldens may include the extended state; original frozen fixtures and trace checksums remain intact.

## Consequences

Clients can render reserve/common/excluded state and defender decisions without owning those rules. Later protection cards can reuse a registered handler. Complete source control-card content, marker accounting, phase/reaction ordering, attachment cascades and mode recipes remain required work. Go effect helpers now propagate errors; TS reducers restore newly created optional fields in addition to existing state/RNG.

## Alternatives considered

- Infer lifecycle from available control-card records: incomplete transcription would change behavior.
- Change frozen fixtures to the new rules: destroys historical evidence.
- Let the client automatically spend Dummy: removes an optional player decision.
- Allow all out-of-turn actions during a response: grants permissions absent from the specific replacement.

## Verification

Both mirrors test shared pending-state/event evidence, prevention/refund, controller authority, source pools, piece conservation, atomic area/sacrifice rejection and beginning-retaliation resumption. Browser tests cover the defender decision and typed editor field; frozen-byte checks remain required.
