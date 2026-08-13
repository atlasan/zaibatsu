# Zaibatsu Game Data Editor

A standalone, local-first editor for source-linked Zaibatsu content. The MVP
currently edits **information blocks**; its shell and session contract are
intentionally reusable for cards, pawns, markers, threats, missions, and modes.

## Run it

First ensure the local block images exist:

```powershell
.\tools\refresh-artifacts.ps1
```

Then start the editor:

```powershell
cd tools\block-editor
bun run dev
```

Open `http://localhost:4173`.

## What it does now

- Browses all 48 individually cut English blocks: 24 Speedrunners and 24
  Shadowraiders.
- Shows the extracted source image alongside the selected asset/source IDs.
- Creates and edits a source-linked block draft: identity, expansion, ICE,
  source-aligned entrances, six bonus corners, calibrated seven-zone gameplay-space selection, and provenance.
- Renders each source block at an inspectable size in a vertically scrollable canvas.
  Each block has seven printed small hexes (one centre plus six adjacent). spaces select one or more physical zones; finite capacity defaults to selected-zone count, while special/pawn spaces default to unlimited
  pill; `large / special` is unlimited and grows across one or more connected hexes.
- Validates draft structure and cross-references before saving or export.
- Saves editable sessions under ignored `.sessions/` and exports ignored
  `exports/*.patch.json` + `*.report.json` files.
- Includes the target data file's SHA-256 in every patch, so a stale draft
  cannot be applied over changed canonical data unnoticed.

The editor never writes `spec/data` itself. Review and apply exported patches
through the normal source/provenance workflow.

## Tests

```powershell
bun test
```

See [the editor plan](../../DOCS/block-editor-plan.md) for the next phases,
including richer space topology and resource-type plug-ins.
## Action-card workflow

The editor now also browses source-linked `action-card` assets for both English
editions. A card draft stores the printed transcription and vision evidence
outside canonical game data. OCR, icon candidates, and duplicate groups are
suggestions only: confirm both the transcription and copy grouping before
export. Card exports target `action-cards.json`; a missing Shadowraiders target
is represented by an explicit `targetAbsent` precondition in the review patch.
Existing v1 block sessions are accepted and saved as v2 data-editor sessions.
## Separate authoring surfaces

Run the shared local server once:

```powershell
bun tools/block-editor/server.ts
```

- Block layout editor: `http://localhost:4173/`
- Action-card editor: `http://localhost:4173/action-cards/`

The block editor receives only `kind: "block"` manifest entries and retains the
seven-small-hex placement tools. The action-card editor receives only
`kind: "action-card"` entries. It records a physical-copy group as explicit
asset IDs, derives `copies` from that group, stores source transcription only
in the local review session, and exports normalized gameplay fields plus a
concise source-reviewed summary. Both interfaces serve UTF-8 HTML/JSON and
never promote an OCR/vision suggestion without reviewer confirmation.