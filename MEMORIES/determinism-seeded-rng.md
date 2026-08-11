---
title: Determinism via a shared seeded RNG
type: constraint
---
All randomness (dice, shuffles, draws) flows through a seeded 64-bit LCG with
identical constants in both mirrors (`impl/go/internal/domain/rng.go` and
`impl/ts/src/domain/rng.ts`). Given the same seed and action sequence, both
implementations produce bit-identical game states — verified: the Go and TS
demos both assign the same pawns and reach the same winner from seed 42.

**Why:** reproducible games, replayable state, and a cross-mirror equivalence
check.

**How to apply:** never call a global/unseeded random source in the engine;
thread the RNG through. If you change the RNG or shuffle, change both sides
together and re-verify demo parity.
