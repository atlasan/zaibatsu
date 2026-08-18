# Zaibatsu Game Data Editor

A standalone, local-first editor for source-linked Zaibatsu content. The MVP
currently edits **information blocks**; its shell and session contract are
intentionally reusable for cards, pawns, markers, threats, missions, and modes.

It also serves a local-only Speedrunners rules sandbox at `/play/`. Sandbox
state is held in memory, uses the TypeScript engine on the local server, and
never writes canonical `spec/` data.

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

From the repository root on Windows, `run-editor.bat` is the same command.
Use `run-sandbox.bat` to start this host for the Speedrunners sandbox and open
`http://localhost:4173/play/`. Both launchers restart the local listener on
port `4173`; use `stop-local-server.bat` to stop it without starting another.

The sandbox setup screen includes standard seeded play plus a **Test Lab** of
clearly labeled deterministic fixtures. Fixtures are local reducer tests, not
source-complete games; their v2 traces recreate the same fixture on import.

For browser regression coverage, install Chromium once and run:

```powershell
cd tools/block-editor
bun run install:playwright
bun run test:play
```

## What it does now

- Browses all 48 individually cut English blocks: 24 Speedrunners and 24
  Shadowraiders.
- Shows the extracted source image alongside the selected asset/source IDs.
- Creates and edits a source-linked block draft with the current block contract:
  exact ICE faces and Black ICE, central-core status, typed block effects,
  directional and modifier-bearing spaces, source-aligned entrances, bonus
  corners, calibrated seven-zone gameplay-space selection, and provenance.
- Fits each source block and its overlay into the available work area without
  nested scrollbars. HexVision geometry drives its six source vertices, corners,
  and entrance controls when available; the canonical layout is the fallback.
  Each block uses seven standardized point-up placement hexes in a source-aligned 2-3-2 arrangement (`h2 h3 / h7 h1 h4 / h6 h5`). A gameplay space selects one or more zones; finite capacity defaults to selected-zone count, while special/pawn spaces default to unlimited. Source circles, capsules, pills, and large locations are display metadata, not new gameplay types. A `circle` defaults to one zone; a `capsule` spans two contiguous zones like a pill; `large / special` is unlimited and grows across one or more connected hexes.
- Validates draft structure and cross-references before saving or export.
- Saves editable sessions under ignored `.sessions/` and exports ignored
  `exports/*.patch.json` + `*.report.json` files.
- Includes the target data file's SHA-256 in every patch, so a stale draft
  cannot be applied over changed canonical data unnoticed.
- Carries optional session-only knowledge hints (tags / relation hints) through
  export metadata so review can promote them into `spec/knowledge/` without
  leaking them into runtime records by accident.
- Offers a deterministic **Prefill 7 zones** starting point, **Clear all** for
  editable block content, and review-required HexVision application for the
  selected source or all sources. Bulk HexVision creates drafts only where one
  does not already exist and reports skipped/unavailable assets.

The editor never writes `spec/data` itself. Review and apply exported patches
through the normal source/provenance workflow. Canonical status, source links,
asset links, and doc relations are finalized when reviewed changes land in
`spec/data/`, `spec/provenance/`, `spec/assets/manifest.json`, and the
generated `spec/knowledge/` outputs.

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
2-3-2 seven-hex placement tools. The action-card editor receives only
`kind: "action-card"` entries. It records a physical-copy group as explicit
asset IDs, derives `copies` from that group, stores source transcription only
in the local review session, and exports normalized gameplay fields plus a
concise source-reviewed summary. Both interfaces serve UTF-8 HTML/JSON and
never promote an OCR/vision suggestion without reviewer confirmation.

The block authoring screen exposes an explicit **1–N space → zone mapping**: h1–h7 each map to one gameplay space, while a gameplay space may own one or more physical zones. The seven calibrated zone anchors follow the source circles; outer tile points, entrances, corners, and artwork remain independent geometry.
