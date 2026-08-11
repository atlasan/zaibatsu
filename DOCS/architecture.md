# Architecture

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Targets (future): web UI, native, CLI, bots, simulation     │
├─────────────────────────────────────────────────────────────┤
│  Engine        setup · turn loop · phases · rules resolution  │  impl/{go,ts}/…/engine
├─────────────────────────────────────────────────────────────┤
│  Domain        Game state + entity types (pure data + logic)  │  impl/{go,ts}/…/domain
├─────────────────────────────────────────────────────────────┤
│  Data loader   parse + validate spec/data into domain types   │  impl/{go,ts}/…/data
├─────────────────────────────────────────────────────────────┤
│  Spec          JSON Schema + game data (language-neutral)     │  spec/
└─────────────────────────────────────────────────────────────┘
```

Dependencies point **downward only**. The core (domain + engine) has **no
runtime dependencies** and no I/O — it is a pure state machine. Loading data and
rendering are the job of outer layers.

## Two mirrors, one spec

`impl/go` and `impl/ts` are independent implementations of the same design. They
do **not** share code; they share **`spec/`** (data + schema) and the design in
`DOCS/`. This gives us:

- a reference to cross-check correctness (a bug usually shows up as a behavioral
  diff between the two),
- freedom to reach different targets (Go → native/servers/WASM; TS → web/Bun),
- a forcing function for clean, data-driven design (anything language-specific
  in the rules is a smell).

Keeping them aligned is governed by [`parity.md`](parity.md).

## Determinism

Every source of randomness (dice rolls, deck/tile shuffles, random draws) flows
through an injectable RNG seeded per game. Given the same seed and the same
sequence of player actions, both implementations must produce identical game
states. This makes games reproducible, testable, and comparable across the two
mirrors.

## State & actions

The engine is a reducer: `state × action → state`. Players never mutate state
directly; they submit **actions** (move, activate ability, attach card, place
control marker, pass) which the engine validates and applies. This keeps the
core UI-agnostic and replayable, and is what lets a future network/bot/sim
target drive the same engine as a human UI.

See [`domain-model.md`](domain-model.md) for the entities and
[`turn-flow.md`](turn-flow.md) for the phase machine.
