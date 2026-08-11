# Documentation index

This directory is the maintained design record for the engine. Read this index
before changing a cross-cutting rule or artifact.

| Area | Canonical artifact | Purpose |
|------|--------------------|---------|
| Architecture | [architecture.md](architecture.md) | Layering and dependency direction |
| Domain | [domain-model.md](domain-model.md), [glossary.md](glossary.md) | Shared engine language and model |
| Rules | [rules/](rules/) | Implementable digests of the original rulebooks |
| Mirror contract | [parity.md](parity.md) | Go/TypeScript structural and behavioral parity |
| Delivery plan | [roadmap.md](roadmap.md), [../tasks/BACKLOG.md](../tasks/BACKLOG.md) | Phases and ordered work |
| Lifecycle | [lifecycle.md](lifecycle.md) | Required evidence from source to shipped behavior |
| Decisions | [adr/](adr/) | Long-lived architecture decisions |
| Sources and audit | [artifacts/](artifacts/) | Ignored-original catalog and coverage record |

The local upstream assets live under `DOCS/Original/`. They are deliberately
ignored by Git; their identities and checksums are recorded in
[artifacts/source-catalog.json](artifacts/source-catalog.json), not the assets
themselves.

## Status vocabulary

- **authoritative** — primary upstream evidence, usually a rulebook or component sheet.
- **derived** — a digest, schema, data record, or behavior based on evidence.
- **provisional** — intentionally incomplete or inferred; never treat as canonical.
- **implemented** — represented and tested in both mirrors.
- **verified** — checked against its linked source and recorded evidence.

See [lifecycle.md](lifecycle.md) for the required transitions and review
checklists.
