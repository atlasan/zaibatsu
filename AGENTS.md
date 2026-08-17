# Working in the Zaibatsu repo

Read this before touching code. Detailed design and documentation policy live in
`DOCS/`.

## The prime directive: two mirror implementations

`impl/go/` and `impl/ts/` are the same engine in two languages. A change to one
is incomplete until the other matches in domain concepts, engine phases,
behavior, and test intent. Use idiomatic identifiers, keep the mapping current
in [the parity contract](DOCS/parity.md), and record an exceptional temporary
gap in both `tasks/BACKLOG.md` and `DOCS/parity.md`.

## Rules live as data, not code

Game content belongs in `spec/data/`, validated by `spec/schema/`; both mirrors
load the same files. For new content: extend the schema, update data, update
both loaders/domain models, then update `DOCS/domain-model.md` and
`DOCS/parity.md`. Provisional data is marked `"provisional": true` and tracked
in `tasks/BACKLOG.md`.

## Rule authority

Primary rulebooks are authoritative. Stable game landing pages live at
`DOCS/rules/speedrunners.md` and `DOCS/rules/shadowraiders.md`; their topic
modules carry stable rule IDs, source locators, and maturity. Document an
ambiguous interpretation and its rationale in the relevant module, never only
in code. `DOCS/governance.md` defines authority and required updates.

## Workflow

- **Docs:** design decisions and canonical explanations live in `DOCS/`. Keep
  `DOCS/domain-model.md` as the shared model description. Register new authored
  docs in `DOCS/registry.json`; ADRs and generated transcripts retain their own
  established formats.
- **Memory:** durable operating facts live one-per-file in `MEMORIES/` and are
  indexed by `MEMORIES/INDEX.md`.
- **Tasks:** `tasks/BACKLOG.md` is the ordered live work list.
- **Tests:** every engine behavior has a test in both mirrors. Run `go test
  ./...` and `bun test`, plus `bun tools/validate-docs.ts`, `bun
  tools/verify-artifacts.ts`, and `bun tools/validate-spec.ts` for applicable
  documentation, source, schema, or content changes.

## Conventions

- Go module: see `impl/go/go.mod`; packages live under `internal/`.
- TypeScript: Bun, ESM, strict TypeScript, and no runtime dependencies in core.
- The core engine has no external runtime dependencies so it remains portable to
  web, native, WASM, and simulation targets.
- All randomness uses the injectable seeded RNG. Never call a global random
  source directly.
