# Source coverage assessment

Catalog version 1 describes 55 ignored local artifacts: **35 PDFs**, **18 RAR
archives**, and **2 update text files**.

| Release | Primary evidence | Supporting evidence | Coverage status |
|---------|------------------|---------------------|-----------------|
| Speedrunners 2017-06-26 EN | Rulebook, blocks (A4/Letter), control cards, action cards, pawns, markers | readme, packaged archive | Primary source set available |
| Speedrunners 2017-06-20 ES | Manual, blocks (A4/Letter), control cards, action cards, pawns, markers | readme, packaged archive | Cross-language reference set available |
| Shadowraiders 2017-06-28 EN | Rulebook, blocks (A4/Letter), control cards, action cards, pawns, markers, Chaos card, update notes | readme, packaged archive | Primary source set available |
| Shadowraiders 2017-06-28 ES | Manual, blocks (A4/Letter), control cards, action cards, pawns, markers, Chaos card, update notes | readme, packaged archive | Cross-language reference set available |
| Shared print support | — | pawn/marker variants, block/card backs, token backs | Presentation reference only |

## Interpretation

- Rulebooks and component sheets are the authoritative evidence for rules and
  canonical component transcription.
- A4 and Letter files are alternate print layouts, not distinct components.
- Archives are checksum-pinned packaging references; do not treat them as an
  additional rule source unless a cataloged member is explicitly inspected.
- No existing seed data is verified against these sources. The transcription
  tasks in [the backlog](../../tasks/BACKLOG.md) must create record-level
  provenance before removing `provisional: true`.
