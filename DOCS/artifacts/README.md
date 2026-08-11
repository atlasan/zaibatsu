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

## Verification

```bash
bun tools/verify-artifacts.ts
bun tools/verify-artifacts.ts --require-originals
```

The first command validates tracked documentation and reports missing ignored
assets as warnings. The second requires all cataloged local assets and verifies
their exact SHA-256 values.

See [coverage.md](coverage.md) for the current source-set assessment.
