# Working in the Zaibatsu repo

Instructions for humans and agents contributing here. Read this before touching
code. It is deliberately short; the detail lives in `DOCS/`.

## The prime directive: the two implementations mirror each other

`impl/go/` and `impl/ts/` are **the same engine in two languages**. A change to
one is incomplete until the other matches. "Match" means: same domain concepts,
same engine phases, same behavior, same test intent — expressed idiomatically
(PascalCase exported identifiers in Go; camelCase in TS). The mapping is the
[parity contract](DOCS/parity.md); update it when you add a concept.

Never let the two drift silently. If you must land them separately, record the
gap in `tasks/BACKLOG.md` and mark the lagging side in `DOCS/parity.md`.

## Rules live as data, not code

Game content — blocks, pawns, action cards, missions, threats — is **data** in
`spec/data/`, validated by JSON Schema in `spec/schema/`. Both implementations
load the *same* files. When you encode new game content:

1. Extend the schema first (`spec/schema/*.schema.json`).
2. Add/adjust the data (`spec/data/**`).
3. Update the loader + domain types in **both** impls.
4. Update `DOCS/domain-model.md` and `DOCS/parity.md`.

Provisional data (not yet transcribed exactly from the PDFs) is marked with
`"provisional": true` and must be flagged in `tasks/BACKLOG.md`.

## Source of truth for rules

The rulebooks are the authority. Digests live in `DOCS/rules/speedrunners.md`
and `DOCS/rules/shadowraiders.md`. When a rule is ambiguous in the PDF, write
down the interpretation you chose and *why* in the digest — don't bury it in
code.

## Workflow

- **Docs**: design decisions → `DOCS/`. Keep `DOCS/domain-model.md` the single
  canonical description of the model both impls follow.
- **Memory**: durable project decisions/context → a file in `MEMORIES/`, indexed
  in `MEMORIES/INDEX.md`. One fact per file. See `MEMORIES/INDEX.md` for format.
- **Tasks**: `tasks/BACKLOG.md` is the ordered work list. Pull from the top;
  add discovered work at the right priority.
- **Tests**: every engine behavior has a test in *both* languages. `go test ./...`
  and `bun test` must both stay green.

## Conventions

- Go module: see `impl/go/go.mod`. Package layout under `internal/`.
- TS: Bun runtime, ESM, strict TypeScript, no runtime dependencies in `core`.
- No external runtime dependencies in the core engine on either side — the core
  must stay portable to future targets (web, native, WASM, simulation).
- Determinism: all randomness (dice, shuffles) goes through an injectable RNG so
  games are reproducible from a seed. Never call a global random source directly.
