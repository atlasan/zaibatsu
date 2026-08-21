"""Local, review-only vision helpers for printed action-card cuts."""
from __future__ import annotations

import difflib
import os
import re
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


def _has_cross_marker(gray: np.ndarray, box: list[int]) -> bool:
    """Detect the small black ✕ that marks an ability an attachment REMOVES from
    its target (vs. grants). The ✕ sits just off a badge on the light main face, so
    it reads as a small, square, low-fill (thin-stroke) dark mark with ink on both
    diagonals — unlike a solid glyph or an action-strip badge on the dark strip."""
    h_img, w_img = gray.shape
    x, y, w, h = box
    side = (w + h) / 2.0
    pad = int(side * 0.45)
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(w_img, x + w + pad), min(h_img, y + h + pad)
    if x1 <= x0 or y1 <= y0:
        return False
    dark = cv2.morphologyEx((gray[y0:y1, x0:x1] < 80).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in contours:
        bx, by, bw, bh = cv2.boundingRect(c)
        area = bw * bh
        if not area or not 0.10 * side <= (bw + bh) / 2.0 <= 0.34 * side:
            continue
        if not 0.55 <= bw / max(1, bh) <= 1.8 or not 0.22 <= cv2.contourArea(c) / area <= 0.58:
            continue
        sub = dark[by:by + bh, bx:bx + bw]
        n = min(bw, bh)
        if n <= 0:
            continue
        d1 = sum(int(sub[int(i * bh / n), int(i * bw / n)]) for i in range(n)) / n
        d2 = sum(int(sub[int(i * bh / n), int(bw - 1 - i * bw / n)]) for i in range(n)) / n
        if d1 >= 0.4 and d2 >= 0.4:  # ink on both diagonals -> an X
            return True
    return False


def _icon_candidates(image: np.ndarray) -> list[dict]:
    """Locate the printed accent markers. Zaibatsu action cards use a small,
    consistent visual vocabulary: a wide **yellow banner** at the top/bottom edge
    is the attach *slot* (ADD-ON/GADGET/…); compact **yellow badges** in the
    corners are the *ability* icons (ICEBREAKER/SEARCH/…) with their name printed
    curving around them (which OCR often misses); a small **white circular badge**
    is the attach-*as* target (PAWN/ENEMY/BLOCK). Region kinds only — the specific
    ability is left to OCR + human review. The card background is teal, so cyan is
    deliberately not treated as signal."""
    h, w = image.shape[:2]
    page = float(h * w)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray_full = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    found: list[dict] = []
    yellow = cv2.inRange(hsv, (20, 100, 120), (40, 255, 255))
    contours, _ = cv2.findContours(yellow, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        area = cw * ch
        if area < page * 0.004:
            continue
        aspect = cw / max(1, ch)
        near_edge = y < h * 0.12 or (y + ch) > h * 0.88
        kind = "slot-banner" if aspect >= 2.2 and near_edge else "ability-badge"
        icon = {"kind": kind, "box": [x, y, cw, ch], "confidence": round(min(0.9, area / page * 15), 3)}
        if kind == "ability-badge":
            # a ✕ next to the badge means the ability is REMOVED, not granted
            icon["removed"] = _has_cross_marker(gray_full, [x, y, cw, ch])
        found.append(icon)
    # white circular attach-target badge (bright, near-round, corner-sized)
    white = cv2.inRange(gray_full, 200, 255)
    contours, _ = cv2.findContours(white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        area = cw * ch
        if not (page * 0.004 <= area <= page * 0.05):
            continue
        if 0.7 <= cw / max(1, ch) <= 1.4 and cv2.contourArea(contour) / area >= 0.7:
            found.append({"kind": "attach-badge", "box": [x, y, cw, ch], "confidence": round(min(0.8, area / page * 12), 3)})
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


def _card_zone(box: list[int], width: int, height: int) -> str:
    """Stable normalized card zones. They are deliberately broad: OCR is still
    noisy, but a zone tells the reviewer *where* a candidate came from."""
    x, y, w, h = box
    cx, cy = (x + w / 2) / width, (y + h / 2) / height
    if cy < .20 and cx < .58:
        return "title"
    if cy > .80:
        return "action-strip"
    if cx > .56:
        return "attachment"
    return "main-text"


# These normalized regions are a stable *review vocabulary*, not a claim that
# every card uses every zone.  They let the editor show why a candidate exists
# even on a rotated or unusually composed source.
CARD_ZONES = {
    "title": [0.00, 0.00, 0.58, 0.20],
    "slot-type-banner": [0.56, 0.00, 0.44, 0.22],
    "action-strip": [0.00, 0.80, 1.00, 0.20],
    "attachment": [0.56, 0.20, 0.44, 0.60],
    "main-face": [0.00, 0.20, 0.56, 0.60],
    "rule-text": [0.00, 0.20, 1.00, 0.60],
}


def _zone_confidence(regions: list[dict], zone: str) -> float:
    values = [float(region.get("confidence", 0)) for region in regions if region.get("zone") == zone]
    return round(float(np.mean(values)) if values else 0.0, 3)


def _candidate(field: str, value: object, zone: str, confidence: float, reason: str) -> dict | None:
    if value in (None, "", [], {}):
        return None
    return {"field": field, "value": value, "zone": zone, "confidence": confidence, "reason": reason}


def _movement_candidates(regions: list[dict]) -> list[dict]:
    """Conservative OCR-only movement proposals. Dice pips are not converted to
    values: decorative dice are common, so only printed movement text is used."""
    found: list[dict] = []
    for region in regions:
        for match in re.finditer(r"(?:\+\s*)?(?:(\d+)\s+)?(2d6|d6|hex|move(?:ment)?s?)\s*(stealth)?", region["text"].lower()):
            value, kind, stealth = match.groups()
            if kind in ("d6", "2d6", "hex"):
                item = {"type": kind}
                if value:
                    item["amount"] = int(value)
            elif value:
                item = {"type": "fixed", "amount": int(value)}
            else:
                continue
            if stealth:
                item["stealth"] = True
            found.append(item)
    return [item for index, item in enumerate(found) if item not in found[:index]]


def _cost_candidate(regions: list[dict]) -> int | None:
    text = " ".join(r["text"] for r in regions).lower()
    match = re.search(r"(?:cost|bonus(?:es| tokens?)?)\s*[:+-]?\s*(\d+)", text)
    return int(match.group(1)) if match else None


def card_proposals(text_regions: list[dict], icons: list[dict] | None = None) -> dict:
    """Derive structured action-card fields from OCR text (review-required).

    Every card has **two independent parts**:
    - the **action** part (a small, reversed strip, usually along the bottom): the
      generic action any card can be spent on - move / icebreaker / delete /
      search / reboot -> `activates` (+ `movement`);
    - the **card** part (the whole main face): its actual use, e.g. attach as an
      add-on/weapon/armor with a slot, target, class restriction, and abilities it
      **grants** / **removes** on the target (a ✕-marked badge is removed).

    Both coexist. OCR keywords feed the action `activates`; the detected slot marks
    the card's attach use; the main-face grants/removes need the human (curved
    badge text / the ✕ marker are not read reliably yet). All hints, review-only."""
    words = [r["text"] for r in text_regions]
    # name candidate (review-required hint): the longest confident word that
    # looks like a name. Sparse-OCR box geometry is too noisy to rank titles by
    # font size, so length is the most robust signal we have here.
    strong = [r["text"] for r in text_regions if r.get("confidence", 0) >= 0.6]
    title_words = [r["text"] for r in text_regions if r.get("zone") == "title" and r.get("confidence", 0) >= .45]
    name = max((w for w in strong if _looks_like_name(w)), key=len, default="")
    slot = _match_vocab(words, _ATTACH_SLOTS)
    ability_badges = [i for i in (icons or []) if i["kind"] == "ability-badge"]
    crossed = sum(1 for i in ability_badges if i.get("removed"))
    notes: list[str] = []
    proposal = {
        "nameCandidate": " ".join(title_words) or name,
        "titleCandidate": " ".join(title_words),
        "subtitleCandidate": " ".join(title_words[1:]),
        # class tokens seen; may be the card's OWN class or a target-class
        # restriction ("only attach to Cleaner pawns") - the human separates them.
        "classes": _match_vocab(words, _CLASSES),
        # the action part - available on every card, independent of the card use.
        "activates": _match_vocab(words, _ACTIVATES),
        "movements": _movement_candidates(text_regions),
        "costCandidate": _cost_candidate(text_regions),
        "customTextCandidate": " ".join(r["text"] for r in text_regions if r.get("zone") == "main-text" and r.get("confidence", 0) >= .45),
        "attach": {},
    }
    if slot:  # the card's main use is an attachment
        proposal["attach"] = {
            "slot": slot,
            "type": slot[0],
            "as": _match_vocab(words, _ATTACH_AS),
            "grants": [],   # ability text remains review-only until classified
            "grantsCount": max(0, len(ability_badges) - crossed),
            # count of ✕-marked badges detected; the human names which ability
            "removesCount": crossed,
            "removes": [],
        }
        if crossed:
            notes.append(f"{crossed} ability badge(s) bear a REMOVE (cross) marker - the marked ability is stripped from the target, not granted; name it in removes.")
        elif len(ability_badges) > len(proposal["activates"]):
            notes.append(f"{len(ability_badges)} ability badge(s) detected; the main face may GRANT abilities on the target beyond the action abilities - classify these.")
    proposal["reviewNotes"] = notes
    title_confidence = _zone_confidence(text_regions, "title")
    main_confidence = _zone_confidence(text_regions, "main-text")
    attachment_confidence = max(_zone_confidence(text_regions, "attachment"), max((float(icon.get("confidence", 0)) for icon in icons or []), default=0.0))
    candidates = [
        _candidate("name", proposal["titleCandidate"] or proposal["nameCandidate"], "title", title_confidence, "OCR text from the title zone"),
        _candidate("class", proposal["classes"], "main-face", main_confidence, "OCR vocabulary in the main-face zone"),
        _candidate("activates", proposal["activates"], "action-strip", _zone_confidence(text_regions, "action-strip"), "OCR action vocabulary on the action strip"),
        _candidate("movements", proposal["movements"], "rule-text", main_confidence, "Printed movement expression; dice pips are intentionally not inferred"),
        _candidate("cost", proposal["costCandidate"], "attachment", attachment_confidence, "Printed cost/bonus expression near the attachment zone"),
        _candidate("attach", proposal["attach"], "slot-type-banner", attachment_confidence, "Slot banner and adjacent target/icon evidence"),
        _candidate("custom-text", proposal["customTextCandidate"], "rule-text", main_confidence, "OCR rule text retained as review evidence"),
    ]
    proposal["candidates"] = [candidate for candidate in candidates if candidate]
    return proposal


def perceptual_hash(image: np.ndarray) -> str:
    gray = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (16, 16), interpolation=cv2.INTER_AREA)
    return "".join("1" if value > float(gray.mean()) else "0" for value in gray.flatten())


def extract_card(path: str, asset: str) -> dict:
    """Extract review-required card data. NOTE: detection runs on the *upright*
    frame, so every box in `textRegions` and `iconCandidates` is in coordinates
    rotated by `orientation` from the source PNG. Consumers that crop the original
    image must rotate by `orientation` first (or crop the upright frame)."""
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(path)
    rotation, upright = orientation(image)
    text = ocr_regions(upright)
    regions = [{**asdict(item), "zone": _card_zone(item.box, upright.shape[1], upright.shape[0])} for item in text]
    words = " ".join(item.text for item in text if item.confidence >= 0.55)
    confidence = round(float(np.mean([item.confidence for item in text])) if text else 0.0, 3)
    reasons = []
    if not _ocr_available():
        reasons.append("local OCR unavailable; manually transcribe printed text")
    if confidence < 0.75:
        reasons.append("OCR confidence below review threshold")
    icons = [{**icon, "zone": _card_zone(icon["box"], upright.shape[1], upright.shape[0])} for icon in _icon_candidates(upright)]
    return {"asset": asset, "kind": "action-card", "orientation": rotation, "zones": CARD_ZONES, "printedTextCandidate": words, "textRegions": regions, "iconCandidates": icons, "proposals": card_proposals(regions, icons), "perceptualHash": perceptual_hash(upright), "confidence": confidence, "reviewRequired": True, "reasons": reasons}


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
