# Architecture decision records

ADRs preserve decisions that materially constrain future work. They are
immutable once accepted except for status and links to a superseding ADR.

## Lifecycle

1. Copy [TEMPLATE.md](TEMPLATE.md) to the next zero-padded number.
2. Propose the decision with alternatives and consequences.
3. Mark it **accepted** only when the decision is adopted.
4. Link related rules, schemas, tasks, parity entries and memories.
5. If the decision changes, create a new ADR and mark the old one
   **superseded by ADR-NNNN**; do not rewrite history.

## Register

| ADR | Status | Decision |
|-----|--------|----------|
| [0001](0001-mirror-implementations.md) | accepted | Go and TypeScript are independent mirrors over one shared specification |
| [0002](0002-data-driven-game-rules.md) | accepted | Game content is declarative shared data, not engine code |
| [0003](0003-seeded-determinism.md) | accepted | All game randomness uses the shared seeded RNG protocol |
