# Zaibatsu — TypeScript / Bun mirror

TypeScript implementation of the Zaibatsu core engine, run on Bun. Mirror of
[`../go`](../go); see [`../../DOCS/parity.md`](../../DOCS/parity.md).

```bash
bun install
bun test               # run tests
bun run typecheck      # tsc --noEmit
bun run src/index.ts   # play a demo Speedrunners game to completion
```

## Layout

| Path | Role |
|------|------|
| `src/domain` | Entity types, game state, seeded RNG (pure, no I/O). |
| `src/data`   | Loads `spec/data/**` into domain types; locates `spec/` by walking up from the module dir. |
| `src/engine` | Setup + turn-phase state machine (`newGame`, `applyAction`, `runTurn`, `winner`). |
| `src/index.ts` | Demo entry point. |

No runtime dependencies in `core` — it stays portable to web/native targets.
All randomness flows through `Rng` (seeded LCG, BigInt-based) so games are
reproducible and match the Go mirror bit-for-bit from the same seed.

> Imports use explicit `.ts` extensions (Bun-native). `tsc` is configured with
> `allowImportingTsExtensions` for type-checking only (no emit).
