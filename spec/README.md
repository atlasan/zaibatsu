# Shared specification

`spec/` is the language-neutral contract consumed by both engine mirrors.
It contains no executable game behavior.

| Location | Role |
|----------|------|
| `schema/` | JSON Schema definitions for individual content records |
| `data/<expansion>/` | Shared mode and game-content JSON |
| `validation/manifest.json` | Generated checksum gate proving `tools/validate-spec.ts` last approved the executable data bundle |
| `provenance/<expansion>.json` | Source evidence for canonical transcriptions |

## Content workflow

1. Identify the source artifact in
   [`DOCS/artifacts/source-catalog.json`](../DOCS/artifacts/source-catalog.json).
2. Record rule facts or ambiguity decisions in `DOCS/rules/`.
3. Extend a schema before using a new data field.
4. Add the content data and a provenance entry with source id plus a page/card
   locator. Mark evidence `verified` only after the source check.
5. Update both data loaders/domain types, the domain model and parity contract.
6. Add equivalent Go and TypeScript behavior tests.

## Validation status

`bun tools/validate-spec.ts` is the schema authority for the executable shared
bundle. It validates the current Speedrunners loader inputs against the tracked
JSON Schemas, then writes `spec/validation/manifest.json` with the approved
file checksums.

Both Go and TypeScript loaders require that manifest and verify every listed
hash before loading `spec/data`. A data or schema edit therefore fails loudly
until the validation step is rerun. The loaders still keep their light
post-parse structural checks as a final engine-facing guard.

## Provisional data

All current `data/speedrunners/` component records are seed fixtures and carry
`provisional: true`. Their file-level candidate source map is deliberately not
record-level verification. Do not remove that marker until the relevant
transcription and provenance task is complete.
