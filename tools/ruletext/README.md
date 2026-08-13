# ruletext

`tools/ruletext/` builds tracked Markdown transcripts from the ignored local
Zaibatsu source PDFs.

It keeps three layers separate:

1. `DOCS/Original/` - authoritative local source PDFs, ignored by Git.
2. `tmp/ruletext/` - regenerated raw text extraction output, ignored by Git.
3. `DOCS/rules/transcripts/` - tracked, cited transcript artifacts used by docs,
   provenance review, and canonical data transcription.

## Install

```powershell
python -m pip install -r tools/ruletext/requirements.txt
```

`pypdf` is the required extractor. If `pdftotext`, `pdftoppm`, and/or
`tesseract` are available on PATH, the script uses them automatically when they
improve extraction.

## Usage

```powershell
python tools/ruletext/extract.py list
python tools/ruletext/extract.py build
python tools/ruletext/extract.py build --profile speedrunners-rulebook-en
```

## Built-in transcript outputs

- `speedrunners-rulebook-en`
- `speedrunners-rulebook-es`
- `shadowraiders-rulebook-en`
- `shadowraiders-rulebook-es`
- `speedrunners-components-en`
- `speedrunners-components-es`
- `shadowraiders-components-en`
- `shadowraiders-components-es`

## Extraction strategy

Per page, the tool tries:

1. `pdftotext`
2. `pypdf`
3. `pdftoppm` + `tesseract`

If no text is available, the transcript keeps an explicit placeholder for that
page instead of silently dropping it.

## Policy

- English editions remain the primary transcription evidence.
- Spanish editions remain cross-check evidence.
- Rulebook/component transcripts are source aids; record-level verification still
  happens in `spec/provenance/*.json`.
- Raw extraction output is never treated as canonical gameplay data.
