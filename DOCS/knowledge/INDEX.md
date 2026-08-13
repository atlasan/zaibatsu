# Zaibatsu knowledge base

This directory is the human-facing guide to the canonical machine-readable
catalog in [`spec/knowledge/`](../../spec/knowledge/). The catalog joins the
repository's structured evidence across:

- `spec/inventory.json` - verified release and mode inventory;
- `spec/data/` - engine-facing game records;
- `spec/provenance/` - record verification and candidate-source context;
- `spec/assets/manifest.json` - source-linked physical assets;
- `DOCS/rules/transcripts/` - tracked rulebook and component-sheet transcripts;
- `DOCS/` - rules, lifecycle, and design docs.

It covers the official 2017 Speedrunners base game and Shadowraiders
expansion, including Chaos, Outbreak, Total War, Strategic Alliance,
Cyber-Revolution, and Total War - Chaos.

## Authority and language

English 2017 print-and-play releases are canonical. Spanish releases are retained as cross-language audit evidence. The official project pages are the external primary register; BoardGameGeek records are identifiers and links only, not game-rule evidence.

## Status labels

- **inventory verified**: component count, release, and source locator have been checked.
- **record verified**: a machine-readable record has a primary locator and a Spanish cross-check in `spec/provenance/`.
- **implemented**: both engine mirrors execute the behavior; this is independent of verification.
- **cataloged**: the entry is linked in `spec/knowledge/` with known docs,
  sources, and assets, but is not necessarily record-verified gameplay data.

The current runtime seed records remain provisional until every physical component is transcribed. The inventory is deliberately honest about that gap; it does not promote inferred card or pawn data to canonical status.

## Read next

- [Component and mode inventory](catalog.md)
- [`spec/knowledge/README.md`](../../spec/knowledge/README.md)
- [Source and rights policy](../artifacts/README.md)
- [Speedrunners rules digest](../rules/speedrunners.md)
- [Shadowraiders rules digest](../rules/shadowraiders.md)
- [Rule transcripts](../rules/transcripts/README.md)
