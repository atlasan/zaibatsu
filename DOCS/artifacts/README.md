# Source artifacts

`source-catalog.json` fingerprints the local, ignored upstream source set.
It is metadata only: it does not distribute PDFs, archives, or artwork.

Each asset has a stable id, local repository-relative path, byte count, SHA-256,
game/release/language, role and authority:

- **primary** — direct rules or component evidence.
- **supporting** — packaging, alternate print format, archive or presentation aid.

Use a catalog id in rules digests and `spec/provenance/` entries. Use a
specific page, card, tile, section, or archive member as the locator; a source
id alone is not enough for a verified transcription.

Tracked rulebook/component transcripts derived from these sources live in
`DOCS/rules/transcripts/`. They are reviewable derivatives, not replacements
for the original PDFs.

## Verification

```bash
bun tools/verify-artifacts.ts
bun tools/verify-artifacts.ts --require-originals
```

The first command validates tracked documentation and reports missing ignored
assets as warnings. The second requires all cataloged local assets and verifies
their exact SHA-256 values.

See [coverage.md](coverage.md) for the current source-set assessment.

The [asset review register](asset-review.md) saves per-component visual
observations, normalized gameplay text, raw source extraction, individual sheet
pieces and remaining interpretation checks.

## External register and rights

`external-sources.json` records the official project, game, and download pages,
plus the two BoardGameGeek listing identifiers. Official sources are primary;
BoardGameGeek is supporting metadata only.

The English 2017 rulebooks state CC BY-NC 2.5 MX at p. 2. The source sheets and
art remain ignored even when their license permits non-commercial sharing:
only checksum-pinned source identifiers and structured derivatives are tracked.

## Derived asset pipeline

The [artifact toolset](toolset.md) renders and crops printable PDF sheets into
ignored local PNG/WebP masters and deterministic atlases. Its tracked
`spec/assets/manifest.json` records crop geometry, source hashes, output hashes,
and optional gameplay references; it never embeds original PDFs or artwork.

Core refresh includes both English18-card control sheets. Their36 stable
`control-card` ids now live in the shared manifest rather than the supplemental
review list. The combined review register still has228 unique assets; the core
manifest has201. This makes physical references reusable by both loaders and
clients without promoting unreviewed gameplay definitions.

`gameplayRef` is the promotion boundary between a physical crop and a canonical
gameplay record. Only add it when the target record is record-verified in
`spec/provenance/` and therefore resolves to a **verified** entry in
`spec/knowledge/catalog.json`. A crop may still be cataloged and useful before
that point; it simply remains an asset-first reference instead of a verified
gameplay identity.

Run `python -m tools.artifacts verify` alongside the existing source verifier
and `bun tools/validate-spec.ts` so transcripts, asset links, provenance, and
the knowledge catalog stay aligned.
