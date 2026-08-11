# ADR-0001: Mirror implementations over one shared specification

- Status: accepted
- Date: 2026-08-11
- Related: [architecture](../architecture.md), [parity](../parity.md), [memory](../../MEMORIES/stack-two-mirrors.md)

## Context

Zaibatsu must support several future targets while retaining a strong
cross-check on rule correctness.

## Decision

Maintain independent Go and TypeScript/Bun engine mirrors. They share
language-neutral schemas and game data under `spec/`, not runtime code.

## Consequences

Every engine behavior has matching concepts, behavior and test intent in both
implementations. `DOCS/parity.md` is the required mapping. A temporary
one-sided change must be visible there and linked to a backlog task.

## Alternatives considered

One implementation would reduce short-term work but remove the independent
behavioral cross-check and constrain targets. Shared runtime code would weaken
the language-neutral boundary.
