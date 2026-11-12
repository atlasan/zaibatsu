# Local verification

GitHub Actions discovers workflows only in `.github/workflows/`. This directory
is outside that path on purpose, so `verify.yml` does not run on push or pull
request. The file keeps the full repeatable check list.

The recipe covers Python artifact tests, documentation, knowledge rebuild,
spec validation, coverage freshness, frozen fixtures, both engine suites,
TypeScript checking, a clean diff of generated knowledge and manifest files,
and the block-editor browser suite. It does not need the ignored primary PDFs,
generated page renders, or local OCR caches. An audit that requires the
originals is `bun tools/verify-artifacts.ts --require-originals`.

On this machine, `check-docs.bat` covers the documentation, knowledge, spec,
coverage, frozen-fixture, and artifact steps. `test-engines.bat` covers `bun
test` and `go test ./...`. The recipe also runs:

```bash
python -m unittest discover -s tools/artifacts/tests
cd impl/ts && bun run typecheck
cd tools/block-editor && bunx playwright install --with-deps chromium && bun run test:play
```

After `bun tools/build-knowledge.ts` and `bun tools/validate-spec.ts`,
`spec/knowledge/catalog.json`, `spec/knowledge/relations.json`, and
`spec/validation/manifest.json` must have no uncommitted diff.
