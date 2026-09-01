# Rulebook compatibility matrix

This matrix maps the two authoritative English rulebooks to the current source,
documentation, spec/data, engine, and tooling coverage in the repository. It
is the working compatibility ledger for full-stack delivery.

## Scope

- Source authority:
  - `DOCS/rules/transcripts/speedrunners-rulebook.en.md`
  - `DOCS/rules/transcripts/shadowraiders-rulebook.en.md`
- Structured rules:
  - `DOCS/rules/speedrunners.md`
  - `DOCS/rules/shadowraiders.md`
- Executable shared data:
  - `spec/data/speedrunners/`
  - `spec/data/shadowraiders/`
- Mirror engines:
  - `impl/go/`
  - `impl/ts/`
- Local operator tooling:
  - `tools/block-editor/`

## Status meanings

- `implemented`: source-backed and executable in both mirrors.
- `partial`: some source-backed coverage exists, but the full rulebook behavior
  or full content corpus is not yet closed.
- `planned`: modeled or documented target only; not yet delivered as compatible
  behavior.

## Topic matrix

| Topic | Speedrunners source | Shadowraiders source | Rules docs | Shared data/spec | Go | TS | `/play/` / tools | Current status |
|---|---|---|---|---|---|---|---|---|
| Setup and victory | full transcript | full transcript | `DOCS/rules/speedrunners/setup-and-victory.md`, `DOCS/rules/shadowraiders/setup-and-components.md` | `spec/data/speedrunners/mode.json`, `spec/data/shadowraiders/modes.json` | yes (base) | yes (base) | yes (base) | `partial` |
| Board growth and placement | full transcript | full transcript | `DOCS/rules/speedrunners/board-and-movement.md`, `DOCS/rules/shadowraiders/setup-and-components.md` | Speedrunners blocks live; Shadowraiders block data still pending | yes (base) | yes (base) | yes (base) | `partial` |
| Movement and phase flow | full transcript | full transcript | `DOCS/rules/speedrunners/turns-and-actions.md`, `DOCS/rules/shadowraiders/pawns-threats-and-combat.md` | Speedrunners movement live; stealth/mode-specific movement pending | yes (base) | yes (base) | yes (base) | `partial` |
| Combat and elimination | full transcript | full transcript | `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`, `DOCS/rules/shadowraiders/pawns-threats-and-combat.md` | Speedrunners combat live; threats/Chaos combat pending | yes (base) | yes (base) | yes (base) | `partial` |
| Icebreaker and control | full transcript | full transcript | same as above | exact source-backed ICE data still incomplete; Shadowraiders control variants pending | yes (base) | yes (base) | yes (base) | `partial` |
| Attachments and card costs | full transcript | inherited + expansion additions | `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`, `DOCS/rules/shadowraiders/missions-modes-and-symbology.md` | attach schema/data live; bonus-counter economy and mission costs incomplete | yes (partial) | yes (partial) | yes (base) | `partial` |
| Currency and rewards | bonus counters | threat tokens, medals, mission rewards | `DOCS/rules/speedrunners/pawns-abilities-and-cards.md`, `DOCS/rules/shadowraiders/missions-modes-and-symbology.md` | base bonus logic incomplete; expansion reward data mostly shell-only | no | no | no | `planned` |
| Threats and event spaces | n/a | full transcript | `DOCS/rules/shadowraiders/pawns-threats-and-combat.md` | schemas present, records mostly pending | no | no | no | `planned` |
| Stealth movement | n/a | full transcript | `DOCS/rules/shadowraiders/pawns-threats-and-combat.md` | schema hooks needed across pawn/card data | no | no | no | `planned` |
| Missions and tags | n/a | full transcript | `DOCS/rules/shadowraiders/missions-modes-and-symbology.md` | `spec/schema/mission-card.schema.json` exists; `spec/data/shadowraiders/missions.json` is still empty shell | no | no | no | `planned` |
| Solo and mixed modes | n/a | full transcript | `DOCS/rules/shadowraiders/missions-modes-and-symbology.md` | `spec/data/shadowraiders/modes.json` exists, but engine support is absent | no | no | no | `planned` |
| Symbology and source interpretation | full transcript | full transcript | all rule modules | schema/data/provenance split exists | partial | partial | coverage-only | `partial` |

## Known source-review hotspots

These pages should not be treated as plain raw-OCR authority; use the linked
page images and reviewed transcript overrides:

- `sp-en-rulebook` p.29
- `sh-en-rulebook` pp.9, 10, 11, 12, 16

Those findings are maintained in:

- `tools/ruletext/review_notes.json`
- `DOCS/rules/transcripts/review-findings.md`

## Delivery implications

To reach full compatibility, the repository must close all of the following:

1. Finish source-complete Speedrunners content and exact-rule data.
2. Replace remaining Speedrunners provisional mechanics with source-backed
   behavior.
3. Fill the Shadowraiders content shells with source-complete records.
4. Implement threats, stealth, missions, medals, and mode framework in both
   mirrors.
5. Keep docs, parity, backlog, and tooling coverage aligned with the real
   executable surface at every step.
