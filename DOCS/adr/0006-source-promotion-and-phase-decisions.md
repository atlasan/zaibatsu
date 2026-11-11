# ADR-0006: Source promotion, explicit experimental setup and phase decisions

- Status: accepted
- Date: 2026-10-17
- Related: [engine completion workstream](../engine-resume-plan.md), [domain model](../domain-model.md), [parity](../parity.md), [backlog](../../tasks/BACKLOG.md)

## Context

The accepted completion plan replaces provisional gameplay data progressively
while retaining historical regression evidence. Several pilot component
interpretations do not match the printed sheets. Source verification alone
also does not prove that every effect executes. Phase-triggered cards require
player decisions before the turn may advance.

## Decision

Freeze the existing mixed corpus, schemas, validation manifest and golden
evidence under `spec/fixtures/provisional-v1/`. Preserve exact bytes, including
old CRLF schema hashes, using a Git attribute override. Regression loaders
explicitly select that corpus and mark the returned mode experimental in
memory. Canonical promotion never rewrites the frozen inputs.

Official constructors reject provisional content. A provisional mode or the
explicit source-review `AllowProvisional` / `allowProvisional` configuration
permits experimental fixtures; unsupported setup and end-condition identifiers
still fail. Keep evidence status outside runtime state in the existing
knowledge/coverage layer.

Represent phase obligations and authorized responses as typed state and
actions in both mirrors. Include them in snapshots and independent clones;
reject stale or unauthorized responses and phase bypass without state/RNG
changes. The compatibility turn helper stops at a pending decision. The local
sandbox consumes the same state/actions and preserves pending decisions in
checksum-bound replay.

Only the sourced single-obligation slice is executable initially. Conflicting
same-timing effect order remains unresolved: reject that combination atomically
instead of inventing a normative order. Record it in SR-TURN-006 and the backlog.

## Consequences

Historical quick matches remain reproducible while canonical data changes.
Official readiness becomes stricter, and source-review fixtures must opt in
explicitly. Partial modes and effects remain visible in coverage rather than
being counted as complete. No extra runtime dependency or UI-owned game rule
is introduced.

Source facts remain governed by the primary sheets/rulebooks. This decision
does not establish a new gameplay interpretation for Simstim or simultaneous
phase effects, or certify the full component corpus and expansion modes.

## Alternatives considered

- Replace seed data and regenerate its historical goldens: loses regression
  evidence and obscures source corrections.
- Allow official setup whenever enough blocks exist: misses incomplete cards,
  pawns, effects and mode procedures.
- Choose a fixed phase-effect order in code: establishes an unsupported rule.
- Resolve choices only in the client: prevents mirrored headless execution,
  reliable replay and independent validation.

## Verification

Both engines assert shared setup, action-option, pending-choice and ordered-event
evidence. Tests cover authority, physical card costs, clone isolation, rollback,
phase blocking and winner freeze. Browser tests exercise the source-foundation
and Toxin fixtures plus historical quick-match recovery. CI checks suites,
types, governed documentation, generated metadata and frozen fixture hashes.
