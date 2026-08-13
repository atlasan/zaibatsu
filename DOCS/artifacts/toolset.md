# Artifact toolset

`python -m tools.artifacts` turns checksum-pinned printable source sheets into
local game-client assets. It is a development tool: PDFs and generated images
stay ignored; only `spec/assets/manifest.json` and source-linked metadata may
be committed.

For searchable page text and review transcripts, use `tools/ruletext/`. The
artifact pipeline handles physical crops; the transcript pipeline handles cited
text derivatives.

## Install and run

Use a virtual environment, then install the development-only dependencies:

```bash
python -m pip install -r tools/artifacts/requirements.txt
python -m tools.artifacts render --artifact sp-en-action-cards --pdftoppm /path/to/pdftoppm
python -m tools.artifacts detect --artifact sp-en-action-cards --page 1
python -m tools.artifacts extract --artifact sp-en-action-cards --page 1
python -m tools.artifacts atlas --artifact sp-en-action-cards
python -m tools.artifacts verify
```

`build` performs render, detect, extract, and atlas for a source sheet. It
fails closed when a grid cannot be detected or a crop falls below the configured
confidence threshold. The detection preview and generated manifest live in
`tmp/artifacts/`.

`build` selects a detector from the catalogued source role. Regular cards use
the grid detector. Both English block PDFs use the source-layout `block-hex`
cutter: it produces three individual, polygon-masked `*-pNN-cNN` block assets
per page (24 for Speedrunners and 24 for Shadowraiders). English pawn and
marker pages use `page-content`, because their irregular, edge-to-edge artwork
does not yet yield safe individual rectangular cells. Those sources remain one
stable `*-pNN-sheet` physical asset per printable page. Block assets and
pawn/marker sheets do not claim a gameplay-entity reference until the source
mapping is verified. Pass `--detector grid`, `--detector block-hex`, or
`--detector page-content` only for diagnostic work; the default `auto`
selection is the reproducible build configuration.

Refresh both English games in one command (render, cut, atlas, promote, and
verify):

```powershell
.\tools\refresh-artifacts.ps1
# If Poppler is not on PATH:
.\tools\refresh-artifacts.ps1 -Pdftoppm C:\path\to\pdftoppm.exe
```

The wrapper delegates to `python -m tools.artifacts refresh-core`; use that
command directly on non-Windows systems.

## Outputs and attribution

The tool emits 300-DPI PNG masters, lossless WebP derivatives, a 2048px atlas,
and deterministic per-source-page 2048px atlas metadata. Asset IDs are stable source-page/cell IDs until a verified
gameplay record supplies a `gameplayRef`.

Use `fetch-web --source <official-source-id>` only for explicitly registered
official sources. It never accepts BoardGameGeek/community sources and writes
the downloaded page to ignored local cache.

The source files remain authoritative. The English rulebooks state CC BY-NC
2.5 MX while separately identifying illustrations as their creators' property;
keep the resulting assets non-commercial and retain the source attribution.

## Core action-card assets

`refresh-core` includes the English Speedrunners and Shadowraiders action-card
PDFs. Each produces 54 `action-card` manifest entries. English files are the
primary transcription evidence; Spanish files may be consulted manually as
supporting evidence and are never substituted automatically.
