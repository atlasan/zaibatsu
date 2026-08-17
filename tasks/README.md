# Task lifecycle

`BACKLOG.md` is the ordered task index. Every item has a stable `T-NNN` id,
phase, status and affected artifact areas.

## Statuses

- **todo** — scoped, not started.
- **in-progress** — actively changing artifacts or behavior.
- **blocked** — needs a documented decision, source, or dependency.
- **done** — all required artifacts and tests landed.

Complex work may add `tasks/T-NNN-<slug>.md`, but the backlog remains the
canonical ordered list.

An implementation task is done only after shared spec/provenance (where
applicable), both mirrors, parity documentation and equivalent tests are
updated. Cite ADRs, rules digests and source catalog ids directly in a task when
they govern the work.

## Documentation evidence

Use `DOCS/INDEX.md` to find the canonical owner of a fact and
`DOCS/governance.md` for required updates. Rule/transcription work updates the
affected stable rule module and its source locator; schema/data work updates the
domain model and knowledge/provenance evidence; engine work updates parity and
the affected rule module. New authored DOCS pages must be registered in
`DOCS/registry.json`.

Before marking applicable work done, run `bun tools/validate-docs.ts`,
`bun tools/verify-artifacts.ts`, and `bun tools/validate-spec.ts` alongside the
relevant Go and TypeScript tests.
