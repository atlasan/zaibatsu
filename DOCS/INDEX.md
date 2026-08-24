# Documentation index

`DOCS/` is Zaibatsu's maintained design record. Start from the path that matches
your work, then update the canonical artifact that owns the fact rather than
copying status into a second document.

## Start by role

| If you are… | Start here | Then use |
|---|---|---|
| Contributing to the engine | [architecture](architecture.md) and [domain model](domain-model.md) | [parity contract](parity.md), [turn flow](turn-flow.md), and [governance](governance.md) |
| Transcribing or interpreting rules | [structured rulesets](rules/README.md) | the game landing page, transcripts, provenance, and [lifecycle](lifecycle.md) |
| Implementing a Go/TS mirror change | [parity contract](parity.md) | the affected rules module, `spec/`, and `tasks/BACKLOG.md` |
| Maintaining content tools | [block-editor plan](block-editor-plan.md) | [artifacts](artifacts/README.md), [knowledge guide](knowledge/INDEX.md), and [governance](governance.md) |
| Maintaining the local tester | [web-sandbox-plan](web-sandbox-plan.md) | [turn flow](turn-flow.md), [parity contract](parity.md), and `tools/block-editor/README.md` |

## Canonical document map

| Area | Owner | Canonical artifact | Purpose |
|---|---|---|---|
| Documentation policy | documentation | [governance.md](governance.md) | classes, authority, ownership, and required updates |
| Architecture | engine | [architecture.md](architecture.md) | layers and dependency direction |
| Domain | engine | [domain-model.md](domain-model.md), [glossary.md](glossary.md) | shared engine language and model |
| Rules | rules | [rules/](rules/) | sourced, topic-based implementable rules |
| Mirror contract | engine | [parity.md](parity.md) | Go/TypeScript structural and behavioral parity |
| Delivery | delivery | [roadmap.md](roadmap.md), [../tasks/BACKLOG.md](../tasks/BACKLOG.md) | phase outcomes and ordered live work |
| Lifecycle | delivery | [lifecycle.md](lifecycle.md) | required evidence from source to shipped behavior |
| Decisions | engine | [adr/](adr/) | accepted, durable architecture and delivery decisions |
| Sources and audit | sources | [artifacts/](artifacts/) | source catalog, rights, and artifact workflow |
| Knowledge catalog | sources | [knowledge/](knowledge/) | human guide to machine-readable cross-references |

## Precedence and status

The source of truth order is primary source, accepted ADR, verified `spec/`
content shape, canonical document, then a workstream plan/backlog item. Only a
primary source or accepted ADR establishes a new rule or durable decision.

- **authoritative** — primary upstream evidence.
- **derived** — documentation, schema, data, or behavior based on evidence.
- **provisional** — incomplete or inferred; never canonical gameplay content.
- **source-verified** — checked against a cited primary source.
- **implemented** — present and tested in both mirrors.
- **partial** / **planned** — incomplete engine coverage; consult parity and backlog.

Full definitions and review obligations are in [governance.md](governance.md).

## Workstream context

These are useful detailed guides, but do not own live project status:

- [Engine resume plan](engine-resume-plan.md)
- [Standalone game-data editor plan](block-editor-plan.md)
- [Local Speedrunners rules sandbox](web-sandbox-plan.md)

For the local tools, use the repo README for launch commands, the tool README
for operator-facing behavior, and the workstream plan for scope/boundaries.

## Local command shortcuts

Windows contributors can use the root launchers documented in
[the repository README](../README.md#quick-start): `run-sandbox.bat`,
`run-editor.bat`, `stop-local-server.bat`, `check-docs.bat`, and
`test-engines.bat`. The two start commands restart only the local process
listening on port `4173`. They are convenience wrappers only; they do not
change the documentation, engine, or source-data obligations above.

Original upstream assets are ignored under `DOCS/Original/`; their identities
and checksums are cataloged in
[artifacts/source-catalog.json](artifacts/source-catalog.json). Tracked
transcripts are review artifacts, not canonical gameplay data.
