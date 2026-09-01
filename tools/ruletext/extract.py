#!/usr/bin/env python
"""Extract cited Markdown transcripts from cataloged Zaibatsu source PDFs.

This tool keeps a strict split between:
- ignored raw extraction output under tmp/ruletext/
- tracked curated transcript files under DOCS/rules/transcripts/

Extraction order per page:
1. pdftotext (if available)
2. PyMuPDF block extraction
3. pypdf text extraction
4. pdftoppm + tesseract OCR (if both available and earlier methods are empty)
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import fitz
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "DOCS" / "artifacts" / "source-catalog.json"
REVIEW_NOTES_PATH = ROOT / "tools" / "ruletext" / "review_notes.json"
RAW_DIR = ROOT / "tmp" / "ruletext"
RAW_PAGES_DIR = RAW_DIR / "pages"
TRANSCRIPTS_DIR = ROOT / "DOCS" / "rules" / "transcripts"


@dataclass(frozen=True)
class Profile:
    name: str
    title: str
    summary: str
    output: Path
    artifacts: tuple[str, ...]


PROFILES: dict[str, Profile] = {
    "speedrunners-rulebook-en": Profile(
        name="speedrunners-rulebook-en",
        title="Zaibatsu Speedrunners Rulebook Transcript (English, 2017-06-26)",
        summary="Primary English rulebook transcript for Speedrunners.",
        output=TRANSCRIPTS_DIR / "speedrunners-rulebook.en.md",
        artifacts=("sp-en-rulebook",),
    ),
    "speedrunners-rulebook-es": Profile(
        name="speedrunners-rulebook-es",
        title="Zaibatsu Speedrunners Rulebook Transcript (Spanish, 2017-06-20)",
        summary="Spanish cross-check transcript for the Speedrunners rulebook.",
        output=TRANSCRIPTS_DIR / "speedrunners-rulebook.es.md",
        artifacts=("sp-es-rulebook",),
    ),
    "shadowraiders-rulebook-en": Profile(
        name="shadowraiders-rulebook-en",
        title="Zaibatsu Shadowraiders Rulebook Transcript (English, 2017-06-28)",
        summary="Primary English rulebook transcript for Shadowraiders.",
        output=TRANSCRIPTS_DIR / "shadowraiders-rulebook.en.md",
        artifacts=("sh-en-rulebook",),
    ),
    "shadowraiders-rulebook-es": Profile(
        name="shadowraiders-rulebook-es",
        title="Zaibatsu Shadowraiders Rulebook Transcript (Spanish, 2017-06-28)",
        summary="Spanish cross-check transcript for the Shadowraiders rulebook.",
        output=TRANSCRIPTS_DIR / "shadowraiders-rulebook.es.md",
        artifacts=("sh-es-rulebook",),
    ),
    "speedrunners-components-en": Profile(
        name="speedrunners-components-en",
        title="Zaibatsu Speedrunners Component Sheet Transcript (English)",
        summary="Grouped transcript of the English component sheets used to verify Speedrunners records.",
        output=TRANSCRIPTS_DIR / "speedrunners-components.en.md",
        artifacts=("sp-en-blocks-a4", "sp-en-control-cards", "sp-en-action-cards", "sp-en-pawns", "sp-en-markers"),
    ),
    "speedrunners-components-es": Profile(
        name="speedrunners-components-es",
        title="Zaibatsu Speedrunners Component Sheet Transcript (Spanish)",
        summary="Grouped Spanish cross-check transcript of the Speedrunners component sheets.",
        output=TRANSCRIPTS_DIR / "speedrunners-components.es.md",
        artifacts=("sp-es-blocks-a4", "sp-es-control-cards", "sp-es-action-cards", "sp-es-pawns", "sp-es-markers"),
    ),
    "shadowraiders-components-en": Profile(
        name="shadowraiders-components-en",
        title="Zaibatsu Shadowraiders Component Sheet Transcript (English)",
        summary="Grouped transcript of the English component sheets used to verify Shadowraiders records.",
        output=TRANSCRIPTS_DIR / "shadowraiders-components.en.md",
        artifacts=("sh-en-blocks-a4", "sh-en-control-cards", "sh-en-action-cards", "sh-en-pawns", "sh-en-markers", "sh-en-chaos-card"),
    ),
    "shadowraiders-components-es": Profile(
        name="shadowraiders-components-es",
        title="Zaibatsu Shadowraiders Component Sheet Transcript (Spanish)",
        summary="Grouped Spanish cross-check transcript of the Shadowraiders component sheets.",
        output=TRANSCRIPTS_DIR / "shadowraiders-components.es.md",
        artifacts=("sh-es-blocks-a4", "sh-es-control-cards", "sh-es-action-cards", "sh-es-pawns", "sh-es-markers", "sh-es-chaos-card"),
    ),
}


def load_catalog() -> dict[str, dict]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return {asset["id"]: asset for asset in payload["assets"]}


def load_review_notes() -> dict[str, dict[str, dict[str, object]]]:
    if not REVIEW_NOTES_PATH.exists():
        return {}
    payload = json.loads(REVIEW_NOTES_PATH.read_text(encoding="utf-8"))
    normalized: dict[str, dict[str, dict[str, object]]] = {}
    for artifact_id, pages in payload.items():
        normalized[str(artifact_id)] = {}
        for page, entry in pages.items():
            if isinstance(entry, list):
                normalized[str(artifact_id)][str(page)] = {"notes": list(entry)}
                continue
            if isinstance(entry, dict):
                normalized[str(artifact_id)][str(page)] = {
                    "notes": list(entry.get("notes", [])),
                    "reviewedText": str(entry.get("reviewedText", "")).strip(),
                }
                continue
            raise ValueError(f"unsupported review note entry for {artifact_id} page {page}")
    return normalized


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    lines = [line.rstrip() for line in text.split("\n")]
    normalized: list[str] = []
    previous = None
    for line in lines:
        line = re.sub(r"([A-Za-z0-9 .,:;()'\-]{3,})\1$", r"\1", line)
        line = re.sub(r"\s{2,}", " ", line).strip()
        if previous is not None and line == previous:
            continue
        normalized.append(line)
        previous = line
    text = "\n".join(normalized)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def dedupe_block_lines(text: str) -> str:
    lines = [line.strip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    out: list[str] = []
    previous = None
    for line in lines:
        if not line:
            if previous != "":
                out.append("")
            previous = ""
            continue
        if line == previous:
            continue
        out.append(line)
        previous = line
    return "\n".join(out)


def pdftotext_page(pdf_path: Path, page: int, executable: str | None) -> str:
    if not executable:
        return ""
    command = [
        executable,
        "-f",
        str(page),
        "-l",
        str(page),
        "-enc",
        "UTF-8",
        "-layout",
        str(pdf_path),
        "-",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        return ""
    return normalize_text(completed.stdout)


def pymupdf_page(doc: fitz.Document, page: int) -> str:
    page_obj = doc[page - 1]
    blocks = page_obj.get_text("blocks")
    if not blocks:
        return ""
    seen: set[tuple[str, str]] = set()
    parts: list[str] = []
    for block in blocks:
        raw = str(block[4] or "")
        text = normalize_text(dedupe_block_lines(raw))
        if not text:
            continue
        bbox = ",".join(str(int(round(value / 4) * 4)) for value in block[:4])
        dedupe_scope = text if len(text) >= 80 else f"{bbox}|{text}"
        key = (dedupe_scope, text)
        if key in seen:
            continue
        seen.add(key)
        parts.append(text)
    return normalize_text("\n\n".join(parts))


def pypdf_page(reader: PdfReader, page: int) -> str:
    try:
        text = reader.pages[page - 1].extract_text() or ""
    except Exception:
        return ""
    return normalize_text(text)


def ocr_page(pdf_path: Path, page: int, pdftoppm: str | None, tesseract: str | None) -> str:
    if not pdftoppm or not tesseract:
        return ""
    with tempfile.TemporaryDirectory(prefix="zaibatsu-ruletext-") as temp_dir:
        stem = Path(temp_dir) / f"page-{page:03d}"
        render = [
            pdftoppm,
            "-f",
            str(page),
            "-l",
            str(page),
            "-png",
            str(pdf_path),
            str(stem),
        ]
        rendered = subprocess.run(render, capture_output=True, text=True, check=False)
        if rendered.returncode != 0:
            return ""
        image = stem.with_name(f"{stem.name}-1.png")
        if not image.exists():
            return ""
        ocr = subprocess.run([tesseract, str(image), "stdout"], capture_output=True, text=True, check=False)
        if ocr.returncode != 0:
            return ""
        return normalize_text(ocr.stdout)


def extract_pages(pdf_path: Path) -> list[dict[str, str | int]]:
    reader = PdfReader(str(pdf_path))
    fitz_doc = fitz.open(pdf_path)
    pdftotext = shutil.which("pdftotext")
    pdftoppm = shutil.which("pdftoppm")
    tesseract = shutil.which("tesseract")
    pages: list[dict[str, str | int]] = []
    for page in range(1, len(reader.pages) + 1):
        text = pdftotext_page(pdf_path, page, pdftotext)
        method = "pdftotext"
        if not text:
            text = pymupdf_page(fitz_doc, page)
            method = "pymupdf"
        if not text:
            text = pypdf_page(reader, page)
            method = "pypdf"
        if not text:
            text = ocr_page(pdf_path, page, pdftoppm, tesseract)
            method = "ocr"
        if not text:
            text = "[no extractable text on this page]"
            method = "none"
        pages.append({"page": page, "method": method, "text": text})
    return pages


def write_raw_text(artifact_id: str, pages: Iterable[dict[str, str | int]]) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    target = RAW_DIR / f"{artifact_id}.txt"
    chunks: list[str] = []
    for page in pages:
        chunks.append(f"===== {artifact_id} page {page['page']} ({page['method']}) =====\n{page['text']}\n")
    target.write_text("\n".join(chunks), encoding="utf-8")


def write_page_images(artifact_id: str, pdf_path: Path) -> None:
    target_dir = RAW_PAGES_DIR / artifact_id
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    with fitz.open(pdf_path) as doc:
        matrix = fitz.Matrix(2, 2)
        for page_number, page in enumerate(doc, start=1):
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            pixmap.save(target_dir / f"page-{page_number:03d}.png")


def build_markdown(profile: Profile, catalog: dict[str, dict], review_notes: dict[str, dict[str, dict[str, object]]]) -> str:
    lines = [
        f"# {profile.title}",
        "",
        profile.summary,
        "",
        "## Source Set",
        "",
    ]
    for artifact_id in profile.artifacts:
        asset = catalog[artifact_id]
        lines.append(
            f"- `{artifact_id}` - `{asset['path']}` ({asset['language']}, role `{asset['role']}`, SHA-256 `{asset['sha256']}`)"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- This is a tracked, reviewable transcript derived from the ignored local source PDFs.",
            "- Raw extraction output is regenerated under `tmp/ruletext/` by `python tools/ruletext/extract.py build`.",
            "- English editions are primary; Spanish editions are cross-check references.",
            "- Layout-heavy component sheets may still need manual interpretation for exact record-level transcription.",
            "",
        ]
    )
    for artifact_id in profile.artifacts:
        asset = catalog[artifact_id]
        pdf_path = ROOT / Path(asset["path"])
        pages = extract_pages(pdf_path)
        write_raw_text(artifact_id, pages)
        write_page_images(artifact_id, pdf_path)
        artifact_notes = review_notes.get(artifact_id, {})
        artifact_page_dir = Path("../../../tmp/ruletext/pages") / artifact_id
        lines.extend(
            [
                f"## Artifact `{artifact_id}`",
                "",
                f"- Source path: `{asset['path']}`",
                f"- Language: `{asset['language']}`",
                f"- Role: `{asset['role']}`",
                f"- Authority: `{asset['authority']}`",
                f"- Page images: [{artifact_page_dir.as_posix()}]({artifact_page_dir.as_posix()})",
                "",
            ]
        )
        for page in pages:
            page_number = str(page["page"])
            page_image = artifact_page_dir / f"page-{int(page['page']):03d}.png"
            page_review = artifact_notes.get(page_number, {})
            page_notes = [str(note) for note in page_review.get("notes", [])]
            reviewed_text = str(page_review.get("reviewedText", "")).strip()
            lines.extend(
                [
                    f"### `{artifact_id}` p. {page['page']}",
                    "",
                    f"_Extraction method: `{page['method']}`_",
                    *(
                        [f"_Reviewed transcript override applied from saved findings._"]
                        if reviewed_text
                        else []
                    ),
                    "",
                    f"- Page image: [{page_image.name}]({page_image.as_posix()})",
                    "",
                ]
            )
            if page_notes:
                lines.extend(["", "#### Review Notes", ""])
                for note in page_notes:
                    lines.append(f"- {note}")
                lines.append("")
            rendered_text = reviewed_text or str(page["text"])
            lines.extend(
                [
                    "```text",
                    rendered_text,
                    "```",
                    "",
                ]
            )
    return "\n".join(lines).rstrip() + "\n"


def build_profiles(selected: list[str]) -> None:
    catalog = load_catalog()
    review_notes = load_review_notes()
    for name in selected:
        profile = PROFILES[name]
        profile.output.parent.mkdir(parents=True, exist_ok=True)
        profile.output.write_text(build_markdown(profile, catalog, review_notes), encoding="utf-8")
        print(f"wrote {profile.output.relative_to(ROOT)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List built-in transcript profiles")

    build = subparsers.add_parser("build", help="Build tracked transcript markdown")
    build.add_argument(
        "--profile",
        action="append",
        choices=sorted(PROFILES.keys()),
        help="Specific profile(s) to build. Defaults to all profiles.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "list":
        for profile in sorted(PROFILES.values(), key=lambda item: item.name):
            print(f"{profile.name}: {profile.output.relative_to(ROOT)}")
        return 0
    if args.command == "build":
        selected = args.profile or sorted(PROFILES.keys())
        build_profiles(selected)
        return 0
    raise ValueError(f"unsupported command {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
