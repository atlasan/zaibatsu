# Documentation governance

This document defines how Zaibatsu records decisions, rules, and implementation
evidence. It is the operating policy for contributors and agents; the
[documentation registry](registry.json) is its machine-readable companion.

## Authority and precedence

Use the first applicable source in this order:

1. A cataloged primary rulebook or component sheet in `DOCS/Original/`.
2. An accepted ADR for an architectural or delivery decision.
3. Shared schema and verified data in `spec/` for executable content shape.
4. The canonical documentation named in `INDEX.md`.
5. A workstream plan or backlog item for proposed work only.

Only primary-source evidence or an accepted ADR may establish a new rule or
durable decision. A digest, transcript, schema, data record, or code comment
may explain or implement that rule, but never silently replace its authority.

## Document classes and owners

| Class | Owner role | Purpose |
|---|---|---|
| `governance` | documentation | repository-wide documentation rules and registry |
| `architecture`, `model`, `contract` | engine | durable engine design, domain model, and mirror evidence |
| `ruleset`, `rule-module` | rules | sourced, implementable game rules |
| `source-guide`, `catalog` | sources | provenance, artifacts, and knowledge navigation |
| `workflow`, `plan` | delivery | lifecycle and delivery process |
| `workstream` | owning subsystem | time-bound implementation context; not a source of truth |

The registry records the owning role, authority, and related artifacts for each
governed document. ADRs and generated transcripts have their own formats and
are exempted there rather than duplicated in the registry.

## Status vocabulary

- **authoritative**: primary upstream evidence.
- **derived**: an explanation, schema, digest, or behavior derived from evidence.
- **provisional**: intentionally inferred or incomplete; never canonical content.
- **source-verified**: checked against a cited primary source.
- **implemented**: present and tested in both mirrors.
- **partial**: only some behavior or data is implemented; link the remaining work.
- **planned**: accepted target behavior that is not yet implemented.

`source-verified` describes evidence, while `implemented` describes engine
coverage; a rule may legitimately have both properties. Do not promote either
status during a documentation-only change.

## Ruleset format

Game landing pages in `DOCS/rules/` are stable entry points. Their topic modules
contain rule entries with this required shape:

```md
## SR-AREA-001 — Short rule title

- **Source:** `sp-en-rulebook` — p. 6, “Heading”.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Normative, concise behavior.
```

`SR-` IDs belong to Speedrunners and `SH-` IDs to Shadowraiders. IDs are stable:
supersede an incorrect rule with a note and new entry rather than reusing its
identifier. A rule without an exact locator is marked `provisional` and linked
to source review or the backlog.

## Required updates

| Change | Required documentation evidence |
|---|---|
| Rule interpretation or source transcription | affected rule module, source locator, provenance, and backlog/ADR when needed |
| Shared schema or game data | rule module, `domain-model.md`, provenance/knowledge output, and `parity.md` when loaders change |
| Go or TS engine behavior | both mirrors and tests, `parity.md`, and the affected rule module or an explicit reason it is unchanged |
| Durable architecture/delivery choice | new or superseding ADR, related canonical docs, and memory when it is a durable operating fact |
| Work planning/status | `roadmap.md` for phase outcomes, `tasks/BACKLOG.md` for ordered current work, and a workstream plan only for detailed gates |

Before completing applicable work, run `bun tools/validate-docs.ts`,
`bun tools/verify-artifacts.ts`, and `bun tools/validate-spec.ts`, plus both
engine test suites. Review prose and source interpretation separately; the
automated checks validate structure and traceability, not judgment.

## Review rules

Keep navigation pages concise and link to the one owner of each fact. Prefer
stable paths, descriptive headings, and relative links. Do not copy live task
status into architecture or rules pages. When a temporary mirror gap is truly
necessary, record its task ID in both `tasks/BACKLOG.md` and `parity.md`.
