from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

from .pipeline import (contact_sheet, crop_asset, detected_assets, detected_sheet_asset,
                       detect_block_hex_assets, detect_crops, detect_page_content, manifest_entry, pdftoppm_path,
                       render_pdf, source_catalog, verified_source, write_json)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def output_root(repo: Path) -> Path:
    return repo / "tmp" / "artifacts"


def kind_for(role: str) -> str:
    return {
        "blocks-a4": "block", "blocks-letter": "block", "action-cards": "action-card",
        "control-cards": "control-card", "pawns": "pawn", "markers": "marker",
        "chaos-card": "chaos-card", "block-backs": "block-back", "card-backs": "card-back",
        "token-and-minihex-backs": "token-back",
    }.get(role, role)


def detector_for(role: str, requested: str) -> str:
    if requested != "auto":
        return requested
    if role in {"blocks-a4", "blocks-letter"}:
        return "block-hex"
    if role in {"pawns", "markers"}:
        return "page-content"
    return "grid"


def sheet_kind_for(role: str) -> str:
    return {
        "blocks-a4": "block-sheet", "blocks-letter": "block-sheet",
        "pawns": "pawn-sheet", "markers": "marker-sheet",
    }.get(role, f"{kind_for(role)}-sheet")


CORE_ARTIFACTS = (
    "sp-en-blocks-a4", "sp-en-pawns", "sp-en-markers",
    "sp-en-action-cards", "sh-en-action-cards",
    "sh-en-blocks-a4", "sh-en-pawns", "sh-en-markers",
)


def artifact(args: argparse.Namespace) -> tuple[Path, dict]:
    repo = repo_root()
    item = verified_source(repo, args.artifact)
    return repo, item


def render(args: argparse.Namespace) -> int:
    repo, item = artifact(args)
    if not item["path"].lower().endswith(".pdf"):
        raise ValueError("render only accepts cataloged PDF artifacts")
    prefix = output_root(repo) / "rendered" / args.artifact / f"{args.artifact}-{args.dpi}dpi"
    pages = render_pdf(repo / item["path"], prefix, args.dpi, pdftoppm_path(args.pdftoppm))
    print(f"rendered {len(pages)} pages to {prefix.parent}")
    return 0


def page_path(repo: Path, artifact_id: str, dpi: int, page: int) -> Path:
    return output_root(repo) / "rendered" / artifact_id / f"{artifact_id}-{dpi}dpi-{page}.png"


def detect(args: argparse.Namespace) -> int:
    repo, item = artifact(args)
    path = page_path(repo, args.artifact, args.dpi, args.page)
    if not path.exists():
        raise FileNotFoundError(f"render page first: {path}")
    image = Image.open(path)
    detector = detector_for(item["role"], args.detector)
    if detector == "grid":
        assets = detected_assets(args.artifact, args.page, kind_for(item["role"]), detect_crops(image))
    elif detector == "block-hex":
        assets = detect_block_hex_assets(args.artifact, args.page, image)
    elif detector == "page-content":
        assets = detected_sheet_asset(args.artifact, args.page, sheet_kind_for(item["role"]), detect_page_content(image))
    else:
        raise ValueError(f"unsupported detector: {detector}")
    detections = {"version": 1, "artifactId": args.artifact, "page": args.page, "renderDpi": args.dpi,
                  "detector": detector,
                  "assets": [{"assetId": a.asset_id, "kind": a.kind, "ordinal": a.ordinal,
                              "crop": a.crop.__dict__,
                              **({"mask": [[x, y] for x, y in a.mask]} if a.mask is not None else {})} for a in assets]}
    base = output_root(repo) / "detections" / args.artifact
    write_json(base / f"page-{args.page}.json", detections)
    contact_sheet(image, assets, base / f"page-{args.page}.png")
    if not assets:
        raise ValueError("no reliable component grid detected; do not promote a guessed crop")
    print(f"detected {len(assets)} components; preview: {base / f'page-{args.page}.png'}")
    return 0


def extract(args: argparse.Namespace) -> int:
    repo, item = artifact(args)
    detection_path = output_root(repo) / "detections" / args.artifact / f"page-{args.page}.json"
    if not detection_path.exists():
        raise FileNotFoundError(f"detect page first: {detection_path}")
    rendered = page_path(repo, args.artifact, args.dpi, args.page)
    image = Image.open(rendered)
    detected = json.loads(detection_path.read_text(encoding="utf-8"))["assets"]
    records: list[dict] = []
    from .pipeline import Crop, DetectedAsset
    for raw in detected:
        crop = Crop(**raw["crop"])
        if crop.confidence < args.minimum_confidence:
            raise ValueError(f"low-confidence crop {raw['assetId']} ({crop.confidence})")
        mask = tuple(tuple(point) for point in raw["mask"]) if "mask" in raw else None
        asset = DetectedAsset(raw["assetId"], args.artifact, args.page, raw["ordinal"], raw["kind"], crop, mask)
        out = output_root(repo) / "build" / args.artifact
        png = out / "png" / f"{asset.asset_id}.png"
        webp = out / "webp" / f"{asset.asset_id}.webp"
        digest, size = crop_asset(image, crop, png, webp, asset.mask)
        records.append(manifest_entry(asset, args.dpi, item["sha256"], digest, size, Path("tmp/artifacts/build") / args.artifact))
    manifest_path = output_root(repo) / "build" / args.artifact / "manifest.json"
    existing = json.loads(manifest_path.read_text(encoding="utf-8"))["assets"] if manifest_path.exists() else []
    retained = [entry for entry in existing if entry["page"] != args.page]
    generated = {"manifestVersion": 1, "generated": True,
                 "assets": sorted([*retained, *records], key=lambda entry: (entry["page"], entry["assetId"]))}
    write_json(manifest_path, generated)
    print(f"extracted {len(records)} assets")
    return 0


def atlas(args: argparse.Namespace) -> int:
    repo, _ = artifact(args)
    from .pipeline import pack_atlas
    base = output_root(repo) / "build" / args.artifact
    manifest = json.loads((base / "manifest.json").read_text(encoding="utf-8"))
    pages: dict[int, list[dict]] = {}
    for item in manifest["assets"]:
        pages.setdefault(item["page"], []).append(item)
    atlas_records = []
    for page, items in sorted(pages.items()):
        images = [(item["assetId"], base / "webp" / f"{item['assetId']}.webp") for item in items]
        output = base / "atlas" / f"page-{page:02d}"
        result = pack_atlas(images, output, args.atlas_size)
        atlas_records.append({"page": page, "path": str(output.relative_to(repo)).replace("\\", "/"), **result})
    write_json(base / "atlas" / "atlas.json", {"version": 1, "atlasSize": args.atlas_size, "atlases": atlas_records})
    print(f"packed {sum(len(item['sprites']) for item in atlas_records)} sprites into {len(atlas_records)} atlases")
    return 0


def build(args: argparse.Namespace) -> int:
    render(args)
    repo, _ = artifact(args)
    rendered_dir = output_root(repo) / "rendered" / args.artifact
    pages = sorted(rendered_dir.glob(f"{args.artifact}-{args.dpi}dpi-*.png"))
    if not pages:
        raise ValueError("render produced no pages")
    for page_file in pages:
        args.page = int(page_file.stem.rsplit("-", 1)[1])
        detect(args)
        extract(args)
    atlas(args)
    return 0


def promote(args: argparse.Namespace) -> int:
    repo, _ = artifact(args)
    generated_path = output_root(repo) / "build" / args.artifact / "manifest.json"
    if not generated_path.exists():
        raise FileNotFoundError(f"build artifact first: {generated_path}")
    tracked_path = repo / "spec" / "assets" / "manifest.json"
    tracked = json.loads(tracked_path.read_text(encoding="utf-8"))
    generated = json.loads(generated_path.read_text(encoding="utf-8"))
    if getattr(args, "replace_artifact", False):
        tracked["assets"] = [entry for entry in tracked["assets"] if entry["artifactId"] != args.artifact]
    existing = {entry["assetId"] for entry in tracked["assets"]}
    duplicates = existing.intersection(entry["assetId"] for entry in generated["assets"])
    if duplicates:
        raise ValueError(f"asset ids already promoted: {', '.join(sorted(duplicates))}")
    tracked["assets"] = sorted([*tracked["assets"], *generated["assets"]], key=lambda entry: entry["assetId"])
    write_json(tracked_path, tracked)
    print(f"promoted {len(generated['assets'])} source-linked asset records")
    return 0

def refresh_core(args: argparse.Namespace) -> int:
    """Rebuild and replace the tracked core English asset contracts."""
    for artifact_id in CORE_ARTIFACTS:
        args.artifact = artifact_id
        build(args)
        args.replace_artifact = True
        promote(args)
    verify(argparse.Namespace(require_outputs=True))
    print(f"refreshed {len(CORE_ARTIFACTS)} core printable artifacts")
    return 0


def verify(args: argparse.Namespace) -> int:
    repo = repo_root()
    manifest = json.loads((repo / "spec" / "assets" / "manifest.json").read_text(encoding="utf-8"))
    seen: set[str] = set()
    catalog = source_catalog(repo)
    for entry in manifest["assets"]:
        asset_id = entry.get("assetId")
        if not isinstance(asset_id, str) or asset_id in seen:
            raise ValueError(f"invalid or duplicate assetId: {asset_id}")
        seen.add(asset_id)
        item = catalog.get(entry.get("artifactId"))
        if item is None:
            raise ValueError(f"{asset_id} references unknown source artifact")
        verified_source(repo, entry["artifactId"])
        crop = entry.get("crop", {})
        if not all(isinstance(crop.get(key), int) and crop[key] >= 0 for key in ("x", "y", "width", "height")):
            raise ValueError(f"{asset_id} has invalid crop")
        if crop["width"] == 0 or crop["height"] == 0:
            raise ValueError(f"{asset_id} has empty crop")
        if args.require_outputs:
            output = repo / entry["outputs"]["png"]
            if not output.is_file():
                raise FileNotFoundError(f"missing output for {asset_id}: {output}")
            if hashlib.sha256(output.read_bytes()).hexdigest() != entry["pngSha256"]:
                raise ValueError(f"output checksum mismatch for {asset_id}")
    print(f"asset manifest valid: {len(seen)} assets")
    return 0


def fetch_web(args: argparse.Namespace) -> int:
    repo = repo_root()
    external = json.loads((repo / "DOCS" / "artifacts" / "external-sources.json").read_text(encoding="utf-8"))
    source = next((item for item in external["sources"] if item["id"] == args.source), None)
    if source is None or source["authority"] != "primary":
        raise ValueError("fetch-web accepts only a declared primary official source")
    url = source["url"]
    if urllib.parse.urlparse(url).scheme != "https":
        raise ValueError("official source URL must use HTTPS")
    target = output_root(repo) / "web" / f"{args.source}.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=30) as response:
        target.write_bytes(response.read())
    print(f"fetched {url} to {target}")
    return 0


def parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--artifact", required=True)
    common.add_argument("--dpi", type=int, default=300)
    common.add_argument("--pdftoppm")
    common.add_argument("--page", type=int, default=1)
    common.add_argument("--minimum-confidence", type=float, default=0.70)
    common.add_argument("--atlas-size", type=int, default=2048)
    common.add_argument("--detector", choices=("auto", "grid", "block-hex", "page-content"), default="auto")
    root = argparse.ArgumentParser(description="Zaibatsu printable-artifact pipeline")
    commands = root.add_subparsers(dest="command", required=True)
    for name, func in (("render", render), ("detect", detect), ("extract", extract), ("atlas", atlas), ("build", build)):
        sub = commands.add_parser(name, parents=[common])
        sub.set_defaults(func=func)
    promote_parser = commands.add_parser("promote", parents=[common])
    promote_parser.add_argument("--replace-artifact", action="store_true")
    promote_parser.set_defaults(func=promote)
    refresh_common = argparse.ArgumentParser(add_help=False)
    refresh_common.add_argument("--dpi", type=int, default=300)
    refresh_common.add_argument("--pdftoppm")
    refresh_common.add_argument("--minimum-confidence", type=float, default=0.70)
    refresh_common.add_argument("--atlas-size", type=int, default=2048)
    refresh_common.add_argument("--detector", choices=("auto", "grid", "block-hex", "page-content"), default="auto")
    refresh_parser = commands.add_parser("refresh-core", parents=[refresh_common])
    refresh_parser.set_defaults(func=refresh_core)
    verify_parser = commands.add_parser("verify")
    verify_parser.add_argument("--require-outputs", action="store_true")
    verify_parser.set_defaults(func=verify)
    fetch = commands.add_parser("fetch-web")
    fetch.add_argument("--source", required=True)
    fetch.set_defaults(func=fetch_web)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        return args.func(args)
    except (FileNotFoundError, ValueError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
