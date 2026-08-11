# Zaibatsu — Go mirror

Go implementation of the Zaibatsu core engine. Mirror of [`../ts`](../ts); see
[`../../DOCS/parity.md`](../../DOCS/parity.md).

```bash
go test ./...          # run tests
go vet ./...           # static checks
go run ./cmd/zaibatsu  # play a demo Speedrunners game to completion
```

## Layout

| Path | Role |
|------|------|
| `internal/domain` | Entity types, game state, seeded RNG (pure, no I/O). |
| `internal/data`   | Loads `spec/data/**` into domain types; locates `spec/` by walking up from the working dir. |
| `internal/engine` | Setup + turn-phase state machine (`NewGame`, `Apply`, `RunTurn`, `Winner`). |
| `cmd/zaibatsu`    | Demo entry point. |

No runtime dependencies — the core stays portable (native, server, WASM, sim).
All randomness flows through `domain.RNG` (seeded LCG) so games are reproducible
and match the TypeScript mirror bit-for-bit from the same seed.
