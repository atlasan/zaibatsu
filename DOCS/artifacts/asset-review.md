# Asset review register

The asset-by-asset review requested on 2026-10-14 saves consistent transcription,
visual details, description, actions and specific instructions. Every English
gameplay crop and distinct supporting printable variant has its own record.
Repeated pieces inside sheets have individual child IDs and locators.

## Saved outputs

- [Asset-by-asset report](../rules/transcripts/asset-review.md): readable records
  with normalized printed prose, symbols, instructions and individual pieces.
- [Structured records](../../spec/review/asset-review.json): source/image hashes,
  transcription, details, actions, instructions, uncertainty and sheet parts.
- [Asset table](../../spec/review/asset-review.csv) and
  [sheet-part table](../../spec/review/sheet-parts.csv): sortable records.
- [Source transcriptions](../../spec/review/source-transcriptions.json): all 55
  cataloged originals, raw text for their 294 PDF pages, both update notes,
  archive membership, and raw text for 22 distinct supporting-member pages.
- [Archive member register](../../spec/review/archive-members.json): all 62
  members, byte counts, hashes, exact-original equivalences and locators.
- [Observations](../../spec/review/observations.json): editable review notes;
  [supplemental assets](../../spec/review/supplemental-assets.json): review crops
  absent from the runtime art manifest.
- [Schema](../../spec/schema/component-review.schema.json) and
  [review tool](../../tools/ruletext/review_assets.py): generation and validation.

## Coverage and counting

| Asset kind | Reviewed records |
|---|---:|
| Action cards | 108 |
| Control cards | 36 |
| Blocks | 48 |
| Pawn sheets | 5 |
| Marker sheets | 4 |
| Chaos card and optional back sheet | 1 |
| Shared token/backing sheets | 4 |
| Distinct supporting archive-member sheets | 22 |
| Total | 228 |

All 165 existing manifest assets are included. The 557 child records identify
standee pairs, markers, tokens, drone fronts, reverse faces and bases across
alternate print formats; they are **not** unique gameplay-entity counts.
Paired standee faces form one pawn; a marker face and reverse form one marker.
Print-copy instructions on backing sheets are separate from per-page counts.

Control cards, Chaos, tokens and supporting variants remain review supplements
and do not gain runtime `gameplayRef` identities automatically. Exact release
archive duplicates reuse catalog identities by SHA-256. All 22 pages of the 15
distinct additional archived PDFs were visually inspected.

Spanish editions, Letter duplicates, rulebooks and readmes have raw page text
saved in the source register. Those whole-document extractions are not claimed
as newly proofread verbatim transcripts or independent bilingual verification.

## Record conventions and findings

Every record has identity, source/page/member locator and SHA-256, crop/image
fingerprint, transcription, visual description, category/class, symbols,
actions, specific instructions, sheet parts, unresolved questions and promotion
status. `rulesText` is visually normalized prose: printed grammar is retained,
layout is consolidated and non-text icons use square brackets. `null` means
no standalone prose was recorded; instructions may be entirely symbolic.

`rawExtractedText` preserves extractor fragments, duplicates, branding and
binary labels. Hex crops may contain neighboring text. Raw extraction must not
replace the visually checked prose; decorative microtext is not certified as
an exact verbatim transcription.

The symbol keys were visually checked at `sp-en-rulebook` PDF pp.37-38 and
`sh-en-rulebook` PDF p.43. Empty card rectangles mean card activation; filled
start-of-turn markers mean once-per-turn free activation. Corner ICE dice,
space ICE modifiers, defense dice and Threat fixed-attack dice remain separate.

Recorded findings include Octagon “Dex” removing Search, Simstim Record
removing movement, numeric E-Synapse/Cyborg movement grants being once-per-turn,
and Chaos having four distinct sector defense tracks. Large titles Sprawl and
Copyleft are preserved separately from illustration labels Chiba City and Eiko.
Existing canonical records were not silently renamed or changed.

## Interpretation and promotion boundary

Every record is `visual-reviewed` and `provisional: true`: English visual or
supporting-format inspection, not human approval, bilingual provenance
verification or executable engine coverage. Neither mirror loads these files.

All 48 blocks flag exact h1-h7 space assignment, edge/vertex arrays and complete
bonus-corner geometry as a remaining precision pass. Additional flags cover the
stylized Geo.Framating title, Spammer attachment ordering, Ghost N812's
unnumbered stealth badge, Deviser D's unnumbered Delete badge, small Deviser
block badges and Chaos interpretation. Missing numeric values are not invented.

Promotion requires resolving interpretation, Spanish record cross-checks under
provenance policy, canonical data/schema and both mirror model/loader changes
when needed, followed by rule/domain/provenance/knowledge/parity/backlog updates.
Visual inventory does not close full content implementation.

## Regeneration and verification

Install `tools/ruletext/requirements.txt`. `tar` must support named RAR member
streaming. Original PDFs and artwork remain ignored.

```powershell
python tools/ruletext/review_assets.py verify
python tools/ruletext/review_assets.py verify --require-originals
python tools/ruletext/review_assets.py render
python tools/ruletext/review_assets.py build
```

`render` restores ignored supplemental images; the core images use the existing
artifact pipeline. `build` requires originals and restored images, rebuilds all
derived JSON/CSV/report outputs and verifies actual source/member/image bytes.
`verify` checks schema, complete asset/observation coverage, unique child IDs,
table coverage, source locators/fingerprints and original/archive inventory.
Add `--require-originals` for byte verification. These checks do not certify
rule interpretation. Add new assets and observations together.

## Canonical pilot audit

The implementation source pass rechecked English and Spanish action sheets and Core/starter sheets directly. Spanish cell order differs for several cards, and canonical locators were corrected. The first three block pilots were revoked to provisional after their encoded triggers/ownership/effects failed direct EN/ES page-one checks. Review observations remain supporting evidence; T-RULES-006 owns replacement effects/topology and canonical re-promotion.


The dedicated Toyeku bilingual topology pass supersedes its old pilot and the saved flat-die ICE classification: four gameplay spaces, h1 title/art, six entrances, exact corner ICE3/4/6, bonus fragments V2/V3/V6 and a square white1 defense modifier. Saved observations and generated sidecars now describe that distinction using rulebook p.21. Canonical provenance/coverage, not the generic visual-review header, establishes the block promotion. Idoru's own pawn/card remains provisional, and the next printed block is Hacktivism.
