"""Local, review-only vision helpers for printed action-card cuts."""
from __future__ import annotations

import difflib
import os
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path

# Zaibatsu action-card vocabulary — OCR is noisy on the stylised fonts, so
# structured fields are recovered by (fuzzy) keyword matching, not literal text.
_ACTIVATES = ["search", "delete", "reboot", "icebreaker"]
_ATTACH_AS = ["pawn", "enemy", "block"]
_ATTACH_SLOTS = ["add-on", "gadget", "weapon", "armor", "module", "mission"]
_CLASSES = [
    "operative", "drone", "bot", "lovedoll", "cyborg", "cyberdeck", "malware",
    "trade secret", "explosive", "brainchip", "hazard", "accelerator",
    "e-synapse", "bomb", "mercenary", "shadowraider",
]

import cv2
import numpy as np


@dataclass
class TextRegion:
    text: str
    confidence: float
    box: list[int]
    rotation: int


def _orientations(image: np.ndarray):
    yield 0, image
    yield 90, cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    yield 180, cv2.rotate(image, cv2.ROTATE_180)
    yield 270, cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)


def orientation(image: np.ndarray) -> tuple[int, np.ndarray]:
    """Choose an upright orientation using sparse horizontal-text evidence."""
    best = (0, image, -1.0)
    for degrees, candidate in _orientations(image):
        gray = cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY)
        ink = (gray < 100).astype(np.uint8)
        rows = ink.sum(axis=1)
        score = float(np.percentile(rows, 90) - np.percentile(ink.sum(axis=0), 90) * 0.35)
        if score > best[2]:
            best = (degrees, candidate, score)
    return best[0], best[1]


def _ocr_available() -> str | None:
    """Locate the tesseract binary: PATH, then TESSERACT_CMD, then the standard
    install locations (Windows/Homebrew/Linux). Absence is not an error."""
    found = shutil.which("tesseract") or os.environ.get("TESSERACT_CMD")
    if found and os.path.exists(found):
        return found
    for candidate in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/usr/bin/tesseract",
    ):
        if os.path.exists(candidate):
            return candidate
    return None


def ocr_regions(image: np.ndarray) -> list[TextRegion]:
    """Use Tesseract only when it is locally installed; absence is not an error."""
    executable = _ocr_available()
    if not executable:
        return []
    regions: list[TextRegion] = []
    for rotation, candidate in _orientations(image):
        gray = cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY)
        for processed in (gray, cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]):
            # Use a temp DIRECTORY: an open NamedTemporaryFile is exclusively
            # locked on Windows, so cv2 can't write it and tesseract can't read it.
            with tempfile.TemporaryDirectory() as work:
                source = os.path.join(work, "src.png")
                out_base = os.path.join(work, "out")
                # 2x upscale helps tesseract on the small stylised card fonts.
                scaled = cv2.resize(processed, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
                cv2.imwrite(source, scaled)
                result = subprocess.run([executable, source, out_base, "--psm", "11", "tsv"], capture_output=True, text=True)
                tsv = out_base + ".tsv"
                if result.returncode or not os.path.exists(tsv):
                    continue
                for line in Path(tsv).read_text(encoding="utf-8", errors="replace").splitlines()[1:]:
                    columns = line.split("\t")
                    if len(columns) != 12:
                        continue
                    try:
                        confidence = float(columns[10]) / 100
                        box = [int(columns[6]) // 2, int(columns[7]) // 2, int(columns[8]) // 2, int(columns[9]) // 2]
                    except ValueError:
                        continue
                    text = columns[11].strip()
                    if text and confidence >= 0:
                        regions.append(TextRegion(text, round(confidence, 3), box, rotation))
    seen: set[tuple[str, int, tuple[int, ...]]] = set()
    unique = []
    for region in sorted(regions, key=lambda item: (-item.confidence, item.rotation, item.box)):
        key = (region.text.lower(), region.rotation, tuple(region.box))
        if key not in seen:
            seen.add(key)
            unique.append(region)
    return unique


def _icon_candidates(image: np.ndarray) -> list[dict]:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    masks = {"yellow": cv2.inRange(hsv, (20, 100, 120), (40, 255, 255)), "cyan": cv2.inRange(hsv, (75, 80, 80), (105, 255, 255))}
    found = []
    for label, mask in masks.items():
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            if area >= image.shape[0] * image.shape[1] * 0.006:
                found.append({"kind": label, "box": [x, y, w, h], "confidence": round(min(0.9, area / (image.shape[0] * image.shape[1]) * 15), 3)})
    return sorted(found, key=lambda item: (item["kind"], item["box"]))


def _match_vocab(words: list[str], vocab: list[str]) -> list[str]:
    """Which vocab terms appear in the OCR words (substring or close fuzzy match)."""
    normalized = [w.lower().strip(".,:;()[]\"'") for w in words]
    joined = " ".join(normalized)
    found: list[str] = []
    for term in vocab:
        if term in joined or term.replace("-", " ") in joined or term.replace(" ", "") in joined.replace(" ", ""):
            found.append(term)
            continue
        key = term.replace("-", "").replace(" ", "")
        for w in normalized:
            if len(w) >= 4 and difflib.get_close_matches(w, [key], n=1, cutoff=0.8):
                found.append(term)
                break
    return sorted(dict.fromkeys(found))


def _looks_like_name(word: str) -> bool:
    """A plausible card name token: alphabetic, ≥3 chars, with enough distinct
    letters to exclude decorative patterns (LOLOLO), binary strings, and the
    gameplay vocabulary itself."""
    w = word.strip()
    if len(w) < 3 or not w.isalpha():
        return False
    if len(set(w.lower())) < max(3, len(w) * 0.4):  # rejects LOLOLO / repeats
        return False
    return w.lower() not in _ATTACH_SLOTS + _ATTACH_AS + _ACTIVATES + _CLASSES


def card_proposals(text_regions: list[dict]) -> dict:
    """Derive structured action-card fields from OCR text (review-required)."""
    words = [r["text"] for r in text_regions]
    # name candidate (review-required hint): the longest confident word that
    # looks like a name. Sparse-OCR box geometry is too noisy to rank titles by
    # font size, so length is the most robust signal we have here.
    strong = [r["text"] for r in text_regions if r.get("confidence", 0) >= 0.6]
    name = max((w for w in strong if _looks_like_name(w)), key=len, default="")
    return {
        "nameCandidate": name,
        "activates": _match_vocab(words, _ACTIVATES),
        "attachAs": _match_vocab(words, _ATTACH_AS),
        "attachSlot": _match_vocab(words, _ATTACH_SLOTS),
        "classes": _match_vocab(words, _CLASSES),
    }


def perceptual_hash(image: np.ndarray) -> str:
    gray = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (16, 16), interpolation=cv2.INTER_AREA)
    return "".join("1" if value > float(gray.mean()) else "0" for value in gray.flatten())


def extract_card(path: str, asset: str) -> dict:
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(path)
    rotation, upright = orientation(image)
    text = ocr_regions(upright)
    regions = [asdict(item) for item in text]
    words = " ".join(item.text for item in text if item.confidence >= 0.55)
    confidence = round(float(np.mean([item.confidence for item in text])) if text else 0.0, 3)
    reasons = []
    if not _ocr_available():
        reasons.append("local OCR unavailable; manually transcribe printed text")
    if confidence < 0.75:
        reasons.append("OCR confidence below review threshold")
    return {"asset": asset, "kind": "action-card", "orientation": rotation, "printedTextCandidate": words, "textRegions": regions, "iconCandidates": _icon_candidates(upright), "proposals": card_proposals(regions), "perceptualHash": perceptual_hash(upright), "confidence": confidence, "reviewRequired": True, "reasons": reasons}


def overlay(image: np.ndarray, card: dict) -> np.ndarray:
    result = image.copy()
    for icon in card.get("iconCandidates", []):
        x, y, w, h = icon["box"]
        cv2.rectangle(result, (x, y), (x + w, y + h), (255, 0, 255), 3)
        cv2.putText(result, icon["kind"], (x, max(20, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 255), 2)
    for region in card.get("textRegions", []):
        x, y, w, h = region["box"]
        cv2.rectangle(result, (x, y), (x + w, y + h), (0, 180, 0), 2)
    return result
