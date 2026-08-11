---
title: Game content is data, not code
type: decision
---
Blocks, pawns, action cards, missions, threats, and mode definitions live as
data under `spec/data/`, validated by JSON Schema under `spec/schema/`. Both
implementations load the same files.

**Why:** keeps the two mirrors honest (anything language-specific in the rules is
a smell), makes content transcription from the PDFs a data task, and lets mods /
expansions be additive data rather than core forks.

**How to apply:** to add content — extend the schema, add the data, update both
loaders + domain types, then update `DOCS/domain-model.md` and `DOCS/parity.md`.
