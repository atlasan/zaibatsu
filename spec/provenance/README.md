# Content provenance

This directory links canonical data records to ignored source artifacts without
embedding source material in the repository.

Each expansion file is JSON with:

- `status`: `provisional`, `cataloged`, or `verified`;
- `files`: file-level source context, useful before transcription;
- `records`: keyed `<kind>/<id>` entries for canonical content;
- each verified record: one or more `sources` containing a catalog `artifactId`
  and a precise `locator` such as page, card or tile.

`records` must remain empty for provisional seed fixtures. When a real record
is transcribed, add its evidence here in the same change that removes its
`provisional` marker.

`cataloged` is valid only for source-verified inventory or mode facts. It does
not mean every physical component has been transcribed. A component record is
`verified` only after its English primary locator and Spanish cross-check are
recorded together.

Asset provenance is complementary: `spec/assets/manifest.json` binds a physical
crop to an artifact/page/hash, while `spec/provenance/` binds the game-data
record to its source locator. Add `gameplayRef` only when both records identify
the same printed component. Generated crop IDs may remain source-page/cell IDs
until the game component is transcribed.

## Review-only component automation

Blocks and action cards may be processed by the local artifact, component-vision,
and data-editor tools. Derived vision/OCR output remains ignored and provisional;
only a reviewer may promote an exported patch after checking its source locators,
asset checksums, and confidence/evidence report. English artwork is primary;
Spanish editions are optional supporting cross-checks. No extraction result is
an executable effect definition.
