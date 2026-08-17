# ZAIBATSU

Zaibatsu is a digital, data-driven re-implementation of the print-and-play
cyberpunk board game by Froylan Rutiaga. Players are rival megacorporations
building the Cybernet, controlling pawns, and racing to place their control
markers. The original game remains under its CC BY-NC 2.5 MX license.

Speedrunners is the base game. Shadowraiders extends it with threats, missions,
medals, stealth, and additional modes.

## Repository shape

This workspace has one language-neutral specification and two independently
implemented, behaviorally mirrored engines.

| Path | What it is |
|---|---|
| `spec/` | Shared JSON Schema, game data, provenance, assets, and knowledge catalog. |
| `impl/go/` | Go mirror of the engine. |
| `impl/ts/` | TypeScript/Bun mirror of the engine. |
| `DOCS/` | Governed design record. Start at [DOCS/INDEX.md](DOCS/INDEX.md). |
| `MEMORIES/` | Durable project context, indexed by `MEMORIES/INDEX.md`. |
| `tasks/` | Ordered live delivery backlog. |
| `AGENTS.md` | Contributor and agent rules. |

The mirrors share `spec/`, not code. The [parity contract](DOCS/parity.md)
records their required structural and behavioral equivalence.

Original PDFs and print archives are local reference material and are not
committed. Their identities, checksums, transcripts, and source links are
tracked through the documentation and provenance workflow.

## Quick start

**Go**

```bash
cd impl/go
go test ./...
go run ./cmd/zaibatsu
```

**TypeScript**

```bash
cd impl/ts
bun install
bun test
bun run src/index.ts
```

## Documentation and verification

For implementation, rules transcription, and content tooling, start from
[the documentation index](DOCS/INDEX.md). The Speedrunners provisional core is
implemented in both mirrors: setup, turn phases, placement, core abilities,
control changes, attachments, snapshots, and golden scenarios. Source-backed
component transcription, space-to-space movement, applied attachment effects,
bonus economy, and Shadowraiders remain in progress.

Use [the parity contract](DOCS/parity.md) for mirror evidence and
[the backlog](tasks/BACKLOG.md) for live delivery status. For relevant changes,
run:

```bash
bun tools/validate-docs.ts
bun tools/verify-artifacts.ts
bun tools/validate-spec.ts
```

## License

Engine-code licensing is tracked in `tasks/BACKLOG.md`. The underlying game,
rules, names, and artwork remain the property of their creators under the
original CC BY-NC 2.5 MX license.
