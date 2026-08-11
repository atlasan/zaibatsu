# hexvision

A **new, standalone** tool that turns the Zaibatsu block art into structured
block data. It **does not touch `tools/artifacts/`** — it *consumes* that
pipeline's pre-cut tile PNGs and infers per-tile geometry and features.

## What it produces

For every cut block tile (`tmp/artifacts/build/<asset>/png/<asset>-pNN-cMM.png`):

- **Hexagon geometry** — center, the 6 vertices, and the inradius, taken from the
  tile's alpha outline. **Reliable.**
- **Passages** — `edges[6]`: which of the 6 edges expose a connecting space.
- **Placements** — the circular space slots inside (`spaces[]`, normalized).
- **Bonus slots** — `bonusCorners[6]`: bonus fragments at the corners.

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
(default `tmp/artifacts/build`), `--out` (default `tools/hexvision/out`).

Outputs live in `tools/hexvision/out/` and are **git-ignored** (regenerate any
time). The `.vision.json` is marked `"provisional": true`.

## Workflow

1. Run the artifacts pipeline so the cut tiles exist.
2. `generate` → review `out/overlays/*.overlay.png`.
3. Correct low-confidence tiles (`check` flags all-open/all-wall edges and
   space-less tiles) by hand.
4. Promote the verified geometry into `spec/data/speedrunners/blocks.json`
   (`edges`, `boundarySpaces`, bonus-corner fragments) — the fields the engine's
   data-gated items need (see `DOCS/engine-resume-plan.md`).

## Tests

```bash
cd tools/hexvision && python -m pytest
```

Synthetic tests are self-contained; the real-tile test runs only if the
pipeline's cut tiles are present.
