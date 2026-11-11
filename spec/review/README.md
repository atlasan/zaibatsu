# Component review sidecars

These saved transcription and visual-review records are not executable game
content. Both mirror engines continue loading canonical files from `spec/data/`.

Start with the [review guide](../../DOCS/artifacts/asset-review.md) or
[asset-by-asset report](../../DOCS/rules/transcripts/asset-review.md). Edit
`observations.json` for reviewed prose/symbols and `supplemental-assets.json`
for review crops. Rebuild JSON, CSV tables and the report with
`python tools/ruletext/review_assets.py build`.

English control-card ids now come from the core asset manifest and repeatable
artifact pipeline. Keep them out of the supplemental list to preserve one
review record per physical crop; reviewed observations retain their same ids.

`source-transcriptions.json` saves raw text for every cataloged PDF page and
distinct supporting-member PDF. `archive-members.json` preserves all archive
member identities and hashes. English visual observations and Spanish raw
extraction are separate evidence layers.

Validate with `python tools/ruletext/review_assets.py verify`; add
`--require-originals` for source/member/image byte checks.
