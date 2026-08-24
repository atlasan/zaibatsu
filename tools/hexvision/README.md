# hexvision

A **new, standalone** tool that turns the Zaibatsu block art into structured
block data. It **does not touch `tools/artifacts/`** — it *consumes* that
pipeline's pre-cut tile PNGs and infers per-tile geometry and features.

## What it produces

For every cut block tile (`tmp/artifacts/build/<asset>/png/<asset>-pNN-cMM.png`):

- **Hexagon geometry** — center, the 6 vertices, and the inradius, taken from the
  tile's alpha outline. **Reliable.**
- **Placements** — `spaces[]`: cells are outlined by **white lines** (a hex grid
  marks the cells), so circles are detected on the white mask and kept only when
  their circumference actually lies on a white ring (rejecting decorative art),
  with non-max-suppression so they don't overlap. Pills are approximated as
  circles.
- **Passages** — `edges[6]`: an edge is a passage where a **white grid line
  crosses the black wall** out to the tile boundary (the white cell grid reaches
  through the wall to connect to the neighbour); a solid dark wall is not.
- **White corners** — `whiteCorners[6]`: which corners are white (measured among
  in-tile pixels via the alpha mask). A **bonus zone** forms on the board where
  three white corners meet — the tool reports the raw signal, not the bonus.

Geometry is trustworthy; **passages / placements / bonus are assistive candidates**
on stylised art. Every run writes a verification **overlay** so a human confirms
before anything is promoted into `spec/data`. This matches the project's
provenance-first rule: nothing becomes canonical without review.

Edge/vertex convention (pointy-top): vertex 0 = top, clockwise; edge `i` is
between vertex `i` and `i+1`.

## Usage (from the repo root)

```bash
pip install -r tools/hexvision/requirements.txt   # opencv-headless + numpy
python -m hexvision generate     # extract -> out/<asset>.vision.json + out/overlays/
python -m hexvision check        # structural validation + verify-me warnings
python -m hexvision verify       # re-extract; confirm determinism vs the JSON
```

Options: `--asset` (default `sp-en-blocks-a4`), `--build-dir`
(default `tmp/artifacts/build`), `--out` (default
`<build>/<asset>/hexvision/`).

Outputs live under the artifacts pipeline's own build tree —
`tmp/artifacts/build/<asset>/hexvision/` (overlays + `<asset>.vision.json`) — so
the process is **unified** with the asset tool and everything for an asset sits
together. It's **git-ignored** (regenerate any time); the JSON is marked
`"provisional": true`.

## Workflow

1. Run the artifacts pipeline so the cut tiles exist.
2. `generate` → review `out/overlays/*.overlay.png`.
3. Correct low-confidence tiles (`check` flags all-open/all-wall edges and
   space-less tiles) by hand.
4. Promote the verified geometry into `spec/data/speedrunners/blocks.json`
   (`edges`, `boundarySpaces`, bonus-corner fragments) — the fields the engine's
   data-gated items need (see `DOCS/engine-resume-plan.md`).

## Tests

```powershell
cd tools/hexvision ; python -m pytest
```

Synthetic tests are self-contained; the real-tile test runs only if the
pipeline's cut tiles are present.

## Action cards

`generate --asset sp-en-action-cards` and `generate --asset sh-en-action-cards`
now analyse the 54 cut cards for each English deck. The output records orientation,
optional local-Tesseract text regions, colour/icon candidates, perceptual hashes,
and duplicate groups. Tesseract is optional and no network OCR is used. Every
card candidate remains review-required and the overlay is evidence, not a game
rule transcription.

## Seven-hex mapping

The standard block model is h2 h3 / h7 h1 h4 / h6 h5.
Hexvision renders those anchors and emits suggestedZoneIds plus confidence
for every detected circle. These are editor review hints only; they never
promote block data automatically.
