# Component and mode catalog

The structured inventory is the canonical count and source locator register:
[`spec/inventory.json`](../../spec/inventory.json).

The broader cross-reference catalog now lives in:

- [`spec/knowledge/catalog.json`](../../spec/knowledge/catalog.json) - one
  entry per tracked entity;
- [`spec/knowledge/relations.json`](../../spec/knowledge/relations.json) -
  explicit links between records, sources, assets, docs, and workflow steps;
- [`spec/knowledge/taxonomy.json`](../../spec/knowledge/taxonomy.json) -
  allowed tags and relation types.

Use this page as the quick human summary. Use `spec/knowledge/` when a tool,
reviewer, or editor needs a stable answer to "what is this thing connected to?"

| Product | Canonical release | Verified physical inventory |
|---|---|---|
| Speedrunners | EN, 2017-06-26 | 24 blocks, 54 action cards, 18 control cards, 16 pawns, 24 bonus counters, 40 control markers, 16 start-of-turn markers |
| Shadowraiders | EN, 2017-06-28 | 24 blocks, 54 action cards, 18 control cards, 16 pawns, 24 threat tokens, 32 control markers, 16 start-of-turn markers |

## Mode register

| Mode | Players | Component set |
|---|---:|---|
| Speedrunners | 2-4 | Base game |
| Shadowraiders | 2-4 | Shadowraiders |
| Chaos | 1 | Shadowraiders |
| Outbreak | 1 | Speedrunners plus Central Core 02 / Outbreak material |
| Total War | 2-8 | Both sets |
| Strategic Alliance | 2-4 | Total War alternate rules |
| Cyber-Revolution | 2-8 | Total War alternate rules |
| Total War - Chaos | 1-8 | Total War plus Chaos |

Every row links to an exact rulebook locator in `spec/inventory.json`. Individual cards, pawns, blocks, missions, and threats move from this inventory to record-level provenance only after direct transcription from the matching component sheet.

## Reading the catalog

Each machine-readable entry answers the same baseline questions:

- `kind` / `localId` / `title` - what it is;
- `status` - provisional, cataloged, verified, or implemented;
- `tags` - controlled vocabulary from `taxonomy.json`;
- `refs.filePaths` - canonical tracked files that own the fact;
- `refs.docPaths` - human docs that explain it;
- `refs.assetIds` - physical derived assets, if any;
- `refs.sourceIds` - authoritative source artifacts behind it.

`relations.json` then makes the graph explicit: for example, a card can be
documented by a rules digest, evidenced by a source sheet, and depicted by one
or more asset crops without forcing each consumer to rediscover those links.
