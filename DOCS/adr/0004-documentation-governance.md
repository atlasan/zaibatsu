# ADR-0004: Govern documentation through a registry and structured ruleset

- Status: accepted
- Date: 2026-08-17
- Related: [documentation governance](../governance.md), [documentation index](../INDEX.md), [lifecycle](../lifecycle.md), [task lifecycle](../../tasks/README.md)

## Context

Zaibatsu already records rules, source evidence, architecture, parity, and
delivery work, but the documents grew as broad digests and independent plans.
That made it easy for a status note to drift from the engine or backlog and
gave contributors no machine-checkable contract for future documentation.

## Decision

Keep established top-level documentation paths as stable landing pages. Organize
the two game digests as topic modules with stable rule IDs and source evidence.
Use `DOCS/registry.json` to register governed documentation and
`tools/validate-docs.ts` to check its structure, links, rule IDs, and evidence.

The registry governs authored documentation. ADRs remain governed by their
existing immutable format, while generated rule transcripts are validated as
source artifacts. Automated checks enforce structural integrity and
traceability; review remains responsible for prose quality and interpretations.

## Consequences

Contributors have one navigation and governance entry point, rules can be
linked at topic and rule level, and knowledge tooling no longer maintains a
separate hand-curated canonical-document list. Documentation changes carry a
small registry/validator maintenance cost when a new governed document class is
introduced.
