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
