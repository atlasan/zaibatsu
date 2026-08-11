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
