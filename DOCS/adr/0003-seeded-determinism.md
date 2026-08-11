# ADR-0003: Preserve determinism through a shared seeded RNG protocol

- Status: accepted
- Date: 2026-08-11
- Related: [architecture](../architecture.md), [parity](../parity.md), [memory](../../MEMORIES/determinism-seeded-rng.md)

## Context

Shuffles, draws and dice must be reproducible for tests, replays and
cross-mirror comparison.

## Decision

All engine randomness flows through the injectable seeded RNG implemented with
matching constants and call ordering in Go and TypeScript. Engine code must not
call a global random source.

## Consequences

The action sequence and seed identify a reproducible game. Any change to RNG or
shuffle call ordering requires matching mirror changes, determinism tests and a
parity update.

## Alternatives considered

Native random APIs are simpler per implementation but cannot guarantee
cross-language replay parity.
