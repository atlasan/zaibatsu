from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw


PNG_ROLE = "face"


@dataclass(frozen=True)
class Crop:
    x: int
    y: int
    width: int
    height: int
    confidence: float


@dataclass(frozen=True)
class DetectedAsset:
    asset_id: str
    artifact_id: str
    page: int
    ordinal: int
    kind: str
    crop: Crop
    mask: tuple[tuple[int, int], ...] | None = None


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_catalog(repo: Path) -> dict[str, dict]:
    catalog = read_json(repo / "DOCS" / "artifacts" / "source-catalog.json")
    return {item["id"]: item for item in catalog["assets"]}


def verified_source(repo: Path, artifact_id: str) -> dict:
    item = source_catalog(repo).get(artifact_id)
    if item is None:
        raise ValueError(f"unknown source artifact: {artifact_id}")
    path = repo / item["path"]
    if not path.is_file():
        raise FileNotFoundError(f"source artifact is unavailable: {path}")
    if sha256(path) != item["sha256"]:
        raise ValueError(f"source checksum mismatch: {artifact_id}")
    return item


def pdftoppm_path(explicit: str | None) -> str:
    if explicit:
        return explicit
    candidate = shutil.which("pdftoppm")
    if candidate:
        return candidate
    raise FileNotFoundError("pdftoppm was not found; pass --pdftoppm or add Poppler to PATH")


def render_pdf(source: Path, target_prefix: Path, dpi: int, pdftoppm: str) -> list[Path]:
    target_prefix.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([pdftoppm, "-png", "-r", str(dpi), str(source), str(target_prefix)], check=True)
    return sorted(target_prefix.parent.glob(f"{target_prefix.name}-*.png"))


def _runs(values: np.ndarray, minimum: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for i, active in enumerate(values.tolist() + [False]):
        if active and start is None:
            start = i
        elif not active and start is not None:
            if i - start >= minimum:
                runs.append((start, i))
            start = None
    return runs


def detect_crops(image: Image.Image, *, threshold: int = 242, min_size: int = 48) -> list[Crop]:
    """Detect regular print-sheet cells from near-white gutters.

    The detector is intentionally conservative. A page without a reliable row
    and column grid yields no crops, which keeps callers from treating a guess
    as a canonical component boundary.
    """
    gray = np.asarray(image.convert("L"), dtype=np.uint8)
    ink = gray < threshold
    height, width = ink.shape
    # A gutter column/row is almost entirely white. Joining small gaps makes
    # text and icon holes incapable of splitting a real component cell.
    vertical = ink.sum(axis=0) > max(3, int(height * 0.04))
    horizontal = ink.sum(axis=1) > max(3, int(width * 0.04))
    xs = _runs(vertical, min_size)
    ys = _runs(horizontal, min_size)
    if len(xs) < 1 or len(ys) < 1:
        return []
    boxes: list[Crop] = []
    median_area = np.median([(x1 - x0) * (y1 - y0) for x0, x1 in xs for y0, y1 in ys])
    for y0, y1 in ys:
        for x0, x1 in xs:
            area = (x1 - x0) * (y1 - y0)
            fill = float(ink[y0:y1, x0:x1].mean())
            if area < min_size * min_size or fill < 0.012:
                continue
            regularity = min(1.0, area / max(1.0, median_area))
            confidence = round(min(0.99, 0.60 + min(0.25, fill * 2.5) + regularity * 0.14), 3)
            boxes.append(Crop(x0, y0, x1 - x0, y1 - y0, confidence))
    return boxes


def detect_page_content(image: Image.Image, *, threshold: int = 242, min_size: int = 48) -> list[Crop]:
    """Return one conservative crop for an edge-to-edge printable sheet.

    Blocks, pawn sheets, and marker sheets deliberately pack irregular shapes
    together. They do not have trustworthy rectangular gutters between every
    gameplay piece, so applying the card-grid detector would invent strips
    from interior artwork. Until a source-verified piece recipe exists, their
    reproducible physical asset is the page's printed content.
    """
    gray = np.asarray(image.convert("L"), dtype=np.uint8)
    ink = gray < threshold
    ys, xs = np.where(ink)
    if len(xs) == 0 or len(ys) == 0:
        return []
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    width, height = x1 - x0, y1 - y0
    if width < min_size or height < min_size:
        return []
    page_coverage = (width * height) / float(image.width * image.height)
    if page_coverage < 0.20 or x0 == 0 or y0 == 0 or x1 == image.width or y1 == image.height:
        return []
    confidence = round(min(0.99, 0.80 + min(0.19, page_coverage * 0.20)), 3)
    return [Crop(x0, y0, width, height, confidence)]


def detected_assets(artifact_id: str, page: int, kind: str, crops: Iterable[Crop]) -> list[DetectedAsset]:
    ordered = sorted(crops, key=lambda crop: (crop.y, crop.x, crop.width, crop.height))
    return [DetectedAsset(f"{artifact_id}-p{page:02d}-c{i:02d}", artifact_id, page, i, kind, crop)
            for i, crop in enumerate(ordered, start=1)]


def detect_block_hex_assets(artifact_id: str, page: int, image: Image.Image) -> list[DetectedAsset]:
    """Extract the three cut-line hex blocks printed on an A4/Letter block page.

    Both English editions use this documented repeating print layout. The crop
    geometry is derived from the source page coordinate system instead of
    fragile artwork density, while the polygon mask follows the cut line so
    overlapping hex bounding rectangles never retain their neighbours.
    """
    page_width, page_height = 595.2756, 841.8898
    x_scale, y_scale = image.width / page_width, image.height / page_height
    slots = ((17.0923, 21.5153), (252.7648, 242.3488), (17.0923, 463.2049))
    block_width, block_height = 309.1150, 356.9349
    right_top, right_bottom = 89.2338, 267.7012
    padding = max(2, round(min(x_scale, y_scale) * 1.5))
    assets: list[DetectedAsset] = []
    for ordinal, (x, y) in enumerate(slots, start=1):
        x0, y0 = round(x * x_scale), round(y * y_scale)
        width, height = round(block_width * x_scale), round(block_height * y_scale)
        crop = Crop(x0 - padding, y0 - padding, width + padding * 2, height + padding * 2, 0.99)
        mask = (
            (round(width / 2) + padding, padding),
            (width + padding, round(right_top * y_scale) + padding),
            (width + padding, round(right_bottom * y_scale) + padding),
            (round(width / 2) + padding, height + padding),
            (padding, round(right_bottom * y_scale) + padding),
            (padding, round(right_top * y_scale) + padding),
        )
        assets.append(DetectedAsset(f"{artifact_id}-p{page:02d}-c{ordinal:02d}", artifact_id,
                                    page, ordinal, "block", crop, mask))
    return assets


def detected_sheet_asset(artifact_id: str, page: int, kind: str, crops: Iterable[Crop]) -> list[DetectedAsset]:
    """Name a page-content crop as a stable, non-gameplay sheet asset."""
    ordered = list(crops)
    if len(ordered) != 1:
        raise ValueError("page-content detection must produce exactly one crop")
    return [DetectedAsset(f"{artifact_id}-p{page:02d}-sheet", artifact_id, page, 1, kind, ordered[0])]


def contact_sheet(image: Image.Image, assets: Iterable[DetectedAsset], target: Path) -> None:
    preview = image.convert("RGB").copy()
    draw = ImageDraw.Draw(preview)
    for asset in assets:
        crop = asset.crop
        draw.rectangle((crop.x, crop.y, crop.x + crop.width, crop.y + crop.height), outline="red", width=3)
        draw.text((crop.x + 4, crop.y + 4), asset.asset_id, fill="red", stroke_width=1, stroke_fill="white")
    target.parent.mkdir(parents=True, exist_ok=True)
    preview.save(target, "PNG")


def crop_asset(image: Image.Image, crop: Crop, png_path: Path, webp_path: Path,
               mask: tuple[tuple[int, int], ...] | None = None) -> tuple[str, tuple[int, int]]:
    if crop.x < 0 or crop.y < 0 or crop.x + crop.width > image.width or crop.y + crop.height > image.height:
        raise ValueError("crop is outside rendered page bounds")
    extracted = image.crop((crop.x, crop.y, crop.x + crop.width, crop.y + crop.height)).convert("RGBA")
    if mask is not None:
        alpha = Image.new("L", extracted.size, 0)
        ImageDraw.Draw(alpha).polygon(mask, fill=255)
        extracted.putalpha(alpha)
    png_path.parent.mkdir(parents=True, exist_ok=True)
    webp_path.parent.mkdir(parents=True, exist_ok=True)
    extracted.save(png_path, "PNG", optimize=True)
    runtime = extracted.copy()
    runtime.thumbnail((512, 512), Image.Resampling.LANCZOS)
    runtime.save(webp_path, "WEBP", lossless=True, method=6)
    return sha256(png_path), extracted.size


def pack_atlas(images: list[tuple[str, Path]], target_dir: Path, max_size: int = 2048, padding: int = 4) -> dict:
    opened = [(asset_id, Image.open(path).convert("RGBA")) for asset_id, path in images]
    opened.sort(key=lambda value: (-value[1].height, value[0]))
    atlas = Image.new("RGBA", (max_size, max_size), (0, 0, 0, 0))
    x = y = padding
    row_height = 0
    sprites: dict[str, dict[str, int]] = {}
    for asset_id, image in opened:
        if image.width + padding * 2 > max_size or image.height + padding * 2 > max_size:
            raise ValueError(f"asset {asset_id} exceeds atlas size {max_size}")
        if x + image.width + padding > max_size:
            x = padding
            y += row_height + padding
            row_height = 0
        if y + image.height + padding > max_size:
            raise ValueError(f"atlas overflow at {asset_id}; split the build or raise --atlas-size")
        atlas.alpha_composite(image, (x, y))
        sprites[asset_id] = {"x": x, "y": y, "width": image.width, "height": image.height}
        x += image.width + padding
        row_height = max(row_height, image.height)
    used_height = max(1, y + row_height + padding)
    final = atlas.crop((0, 0, max_size, used_height))
    target_dir.mkdir(parents=True, exist_ok=True)
    final.save(target_dir / "atlas.png", "PNG", optimize=True)
    final.save(target_dir / "atlas.webp", "WEBP", lossless=True, method=6)
    metadata = {"version": 1, "padding": padding, "width": max_size, "height": used_height, "sprites": sprites}
    write_json(target_dir / "atlas.json", metadata)
    return metadata


def manifest_entry(asset: DetectedAsset, dpi: int, source_sha256: str, png_hash: str, size: tuple[int, int], output_root: Path) -> dict:
    entry = {
        "assetId": asset.asset_id,
        "artifactId": asset.artifact_id,
        "page": asset.page,
        "kind": asset.kind,
        "role": PNG_ROLE,
        "renderDpi": dpi,
        "sourceSha256": source_sha256,
        "crop": asdict(asset.crop),
        "dimensions": {"width": size[0], "height": size[1]},
        "pngSha256": png_hash,
        "outputs": {
            "png": str(output_root / "png" / f"{asset.asset_id}.png").replace("\\", "/"),
            "webp": str(output_root / "webp" / f"{asset.asset_id}.webp").replace("\\", "/"),
        },
    }
    if asset.mask is not None:
        entry["mask"] = {"kind": "polygon", "points": [{"x": x, "y": y} for x, y in asset.mask]}
    return entry
