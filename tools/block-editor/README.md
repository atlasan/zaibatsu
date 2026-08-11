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
  six edges, boundary spaces, spaces JSON, and provenance.
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
including visual space geometry and resource-type plug-ins.