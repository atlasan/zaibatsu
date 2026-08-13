# Development artifact lifecycle

Every game rule and implementation change must retain evidence across this
chain:

```
original source -> transcript / rules digest / ADR -> schema -> data + provenance
-> knowledge catalog -> Go and TypeScript behavior -> parity contract
-> tests -> task completion
```

## Ownership and transitions

| Artifact | Owner / location | Required before it advances |
|----------|------------------|-----------------------------|
| Original source | ignored `DOCS/Original/`; cataloged in `DOCS/artifacts/` | catalog id, SHA-256, edition/language, authority and role |
| Transcript derivative | `DOCS/rules/transcripts/` | cataloged source artifact, page identity, reviewer-visible extracted text |
| Rule fact or ambiguity | `DOCS/rules/` | source id + locator; interpretations state rationale |
| Architectural choice | `DOCS/adr/` | alternatives, decision, consequences and supersession link |
| Schema and content | `spec/schema/`, `spec/data/`, `spec/provenance/` | schema-first change; every canonical record has source locators |
| Knowledge catalog | `spec/knowledge/` | tags, relations, source/doc/asset refs stay consistent with canonical files |
| Engine behavior | `impl/go/` and `impl/ts/` | idiomatic mirror API/behavior and equivalent tests |
| Parity evidence | `DOCS/parity.md` | symbol/status update and any intentional gap task id |
| Delivery work | `tasks/BACKLOG.md` | stable task id, phase, status, dependencies and artifact links |

## Change rules

1. Start from an authoritative source or an accepted ADR. Never encode a
   rulebook interpretation only in code.
2. Generate or update the tracked transcript when a new rulebook/component source
   becomes implementation-relevant. Raw extraction output may stay ignored, but
   the repo should retain a searchable cited transcript artifact.
3. Extend the shared schema before adding a new content field. Update both
   loaders and both domain models in the same change.
4. For a transcription, add the record-level entry to the matching
   `spec/provenance/<expansion>.json` with source artifact IDs and page/card
   locators. A `provisional` record may cite candidate sources but must not
   claim verification.
5. Regenerate `spec/knowledge/catalog.json` and `spec/knowledge/relations.json`
   so the new or changed record has current tags, source refs, asset refs, doc
   refs, and cross-links.
6. Implement engine behavior in Go and TypeScript together; update
   `DOCS/parity.md` and add equivalent tests. A temporary gap is exceptional
   and must have a backlog task id.
7. Close a task only when its linked source, docs, schema/data, knowledge
   catalog, both mirrors,
   and tests are current. Update its status in the same commit.

## Decision and memory policy

An ADR is the canonical record for a material, durable architectural decision.
Use a new ADR for decisions that constrain future design, data shape, behavior,
or delivery. A memory is a short operational fact for people and agents;
decision memories link to their ADR and do not replace it.

## Source handling

Original PDFs, archives, and print assets are local reference material and stay
ignored. Add or change them only by updating the source catalog with the exact
path, byte count, SHA-256, edition, language, role and authority. Do not commit
the copyrighted source files.

Run `bun tools/verify-artifacts.ts --require-originals` when the local source
set is available. The default command is clone-safe: it reports unavailable
ignored sources but does not fail solely because they are absent.

## Current baseline

The catalog contains the local 2017 Speedrunners and Shadowraiders releases plus
print/archive support. Existing `spec/data/speedrunners/` records are
explicitly **provisional** seed data; they are not verified transcriptions.
Current loaders perform light structural checks only. JSON-Schema validation is
tracked by task `T-101`.

## Inventory verification

`spec/inventory.json` may verify release-level component counts and mode facts
before individual component transcription. Such evidence is recorded as
`cataloged` provenance, never as a verified component record. Run
`bun tools/validate-spec.ts` to validate the inventory, knowledge catalog, its
source locators, and component evidence.

## Derived assets

The artifact pipeline may create a tracked `spec/assets/manifest.json` entry
only after its source PDF passes catalog checksum validation. It records a
render DPI, page, stable automatic crop ID, crop geometry, and output hashes.
The PNG/WebP crops and atlas files remain ignored. A `gameplayRef` may be added
only when its matching content record has record-level provenance; an asset
with `gameplayRef` must therefore also resolve to a **verified**
`spec/knowledge/catalog.json` entry. Keep asset linking honest: cataloged crops
are useful before transcription, but they are not gameplay identity.
