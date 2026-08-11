# Project memory index

Durable decisions and context for the Zaibatsu project. One fact per file. This
index is the quick-scan map; open a file for detail. Keep entries one line.

**File format** (each `MEMORIES/*.md`):

```
---
title: <short title>
type: decision | domain | constraint | reference
---
<the fact. For decisions, add **Why:** and **How to apply:** lines.>
```

## Entries

- [stack-two-mirrors.md](stack-two-mirrors.md) — decision: Go + TS(Bun) mirror engines over a shared spec.
- [data-driven-rules.md](data-driven-rules.md) — decision: game content lives as data in spec/, not code.
- [determinism-seeded-rng.md](determinism-seeded-rng.md) — constraint: all randomness via a seeded LCG shared across mirrors.
- [game-identity.md](game-identity.md) — domain: what Zaibatsu is (Speedrunners core + Shadowraiders expansion).
- [provisional-seed-data.md](provisional-seed-data.md) — constraint: current spec/data is provisional; real content must be transcribed from the PDFs.
- [verified-inventory-baseline.md](verified-inventory-baseline.md) - reference: source-verified 2017 release inventory and mode register; component records remain separate.
