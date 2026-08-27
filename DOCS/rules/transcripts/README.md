# Rule Transcripts

This directory stores tracked, reviewable Markdown transcripts derived from the
ignored local source PDFs in `DOCS/Original/`.

## Purpose

These files make the rulebooks and component sheets:

- searchable in-repo;
- linkable from docs, provenance, and knowledge entries;
- reusable during canonical data transcription;
- separate from the concise implementer digests in `DOCS/rules/*.md`.

## Source Policy

- The PDFs in `DOCS/Original/` remain authoritative.
- English editions are the primary transcript source.
- Spanish editions are cross-check references.
- Record-level verification still belongs in `spec/provenance/*.json`.

## Generation

```powershell
python -m pip install -r tools/ruletext/requirements.txt
python tools/ruletext/extract.py build
```

The script regenerates:

- tracked transcript Markdown here;
- ignored raw extraction output in `tmp/ruletext/`;
- ignored single-page PNG renders in `tmp/ruletext/pages/<artifact-id>/`.

Per page, the extractor prefers `pdftotext` when it is available, then
PyMuPDF block extraction with duplicate-block cleanup, then `pypdf`, then OCR
fallbacks for image-only pages.

## Interpretation Boundary

These transcripts preserve extracted text and page-level source identity. They
are not the canonical gameplay digest and they are not executable data. When a
page is layout-heavy or extraction is lossy, use the transcript together with
the original PDF and the curated digests in `DOCS/rules/`.
