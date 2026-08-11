# ADR-0002: Model game content as shared declarative data

- Status: accepted
- Date: 2026-08-11
- Related: [spec guide](../../spec/README.md), [lifecycle](../lifecycle.md), [memory](../../MEMORIES/data-driven-rules.md)

## Context

Blocks, pawns, cards, modes and expansion content originate in rulebook assets
and must remain consistent across both engine mirrors.

## Decision

Represent game content under `spec/data/`, describe its shape in
`spec/schema/`, and record its source evidence under `spec/provenance/`.
Keep rule resolution generic; use stable data/effect identifiers instead of
embedding specific game content in engine code.

## Consequences

Schema changes precede data and require both loaders/domain models to change.
Canonical transcriptions carry source IDs and locators. Provisional data is
marked and may not be presented as verified content.

## Alternatives considered

Hard-coded per-language content would be faster initially but would create
silent mirror divergence and make auditing against source assets difficult.
