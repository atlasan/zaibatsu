# ZAIBATSU

A digital, data-driven re-implementation of **Zaibatsu** — the print-and-play
cyberpunk board game by Froylan Rutiaga (art by KoTdeSigN & Froylan Rutiaga),
originally released under the Creative Commons Attribution-NonCommercial 2.5
Mexico license.

Zaibatsu is a tile-laying / area-control game set on the **Cybernet**: players
are rival megacorporations ("Zaibatsu") deploying pawns to explore a growing
hex board of **information blocks** and race to plant all their **control
markers**. This repository turns that tabletop system into a reusable software
engine, plus its expansions and game modes.

> **Upstream games** (the source of truth for rules and components):
> - **Zaibatsu Speedrunners** — the base game / core engine.
> - **Zaibatsu Shadowraiders** — expansion adding threats, missions, medals,
>   stealth, and four new game modes (Shadowraiders, Chaos, Outbreak, Total War).

---

## Repository shape

This is an umbrella workspace with **one language-neutral specification** and
**two mirror implementations** that are kept in structural lockstep.

| Path         | What it is |
|--------------|------------|
| `spec/`      | **Single source of truth.** JSON Schemas (`spec/schema/`) + shared game data (`spec/data/`) consumed by *both* implementations. Rules live here as data, not code. |
| `spec/knowledge/` | Machine-readable catalog joining data, provenance, assets, docs, tags, and relations. |
| `impl/go/`   | Go mirror of the engine. |
| `impl/ts/`   | TypeScript / Bun mirror of the engine. |
| `DOCS/`      | Design docs: architecture, domain model, turn flow, glossary, parity contract, roadmap, and per-game rules digests. |
| `MEMORIES/`  | Project memory — durable decisions and context, indexed by `MEMORIES/INDEX.md`. |
| `tasks/`     | Prioritized work backlog (`tasks/BACKLOG.md`). |
| `AGENTS.md`  | Instructions for humans and agents working in this repo. |

The two implementations are **mirrors**: same domain model, same engine phases,
same test intent, expressed idiomatically in each language. The
[parity contract](DOCS/parity.md) is what keeps them honest.

The original PDFs and print archives (`ShadowRaiders/`, `SpeedRunners/`,
`SortMe/`) are kept locally for reference but are **not** tracked in git — their
*transcribed* content lives under `spec/`.

For a repo-wide content view, start with `spec/knowledge/` for machine-readable
catalog data and `DOCS/knowledge/` for the human guide to that catalog.

---

## Quick start

**Go:**

```bash
cd impl/go
go test ./...
go run ./cmd/zaibatsu
```

**TypeScript (Bun):**

```bash
cd impl/ts
bun install
bun test
bun run src/index.ts
```

Both entry points run a demo Speedrunners game to completion using the shared
data in `spec/data/`.

---

## Status

Bootstrap: **core slice.** Domain types, a shared-data loader, and a working
turn loop (setup → begin/action/recycle/end phases → win detection) exist and
are tested in both languages. Card/block/pawn *effect resolution* and the
Shadowraiders expansion are scaffolded but not yet implemented — see
[`DOCS/roadmap.md`](DOCS/roadmap.md) and [`tasks/BACKLOG.md`](tasks/BACKLOG.md).

## License

Engine code in this repository: see `LICENSE` (TBD). The underlying Zaibatsu
game, its rules, names, and artwork remain the property of their creators under
the original CC BY-NC 2.5 MX license; this project is a non-commercial
re-implementation and pays that forward.
