---
title: spec/data is provisional seed content
type: constraint
---
The current `spec/data/speedrunners/*` (5 blocks, 6 pawns, 7 card types) is
**provisional** placeholder content marked `"provisional": true`, sized only to
exercise the engine. It is NOT the real game data.

**Why:** the bootstrap slice needed runnable data before the full content was
transcribed from the print-and-play PDFs.

**How to apply:** the real content — 24 blocks, 16 pawns, 54 action cards, 18
control cards (Speedrunners), plus all Shadowraiders content — must be
transcribed from the `Sp 0x` / `Sh 0x` PDFs into `spec/data/`. Tracked in
`tasks/BACKLOG.md`. Do not treat provisional stats as balanced or canonical.
