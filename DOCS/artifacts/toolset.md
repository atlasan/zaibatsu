# Artifact toolset

`python -m tools.artifacts` turns checksum-pinned printable source sheets into
local game-client assets. It is a development tool: PDFs and generated images
stay ignored; only `spec/assets/manifest.json` and source-linked metadata may
be committed.

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
the grid detector. English block, pawn, and marker pages use `page-content`:
their cut lines and irregular, edge-to-edge artwork do not yield safe
individual rectangular cells. The pipeline records one stable `*-pNN-sheet`
asset per printable page (`block-sheet`, `pawn-sheet`, or `marker-sheet`) and
does not claim it is a gameplay-entity crop. A future verified override recipe
may split a sheet into `block/<id>`, `pawn/<id>`, or marker records. Pass
`--detector grid` or `--detector page-content` only for diagnostic work; the
default `auto` selection is the reproducible build configuration.

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
