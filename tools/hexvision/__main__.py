"""hexvision CLI: generate / check / verify block-tile data from cut tiles.

Consumes the artifacts pipeline's pre-cut tiles and emits provisional, verifiable
block geometry + feature candidates. Run from the repo root:

    python -m hexvision generate            # extract + write overlays + JSON
    python -m hexvision check               # structural validation of the JSON
    python -m hexvision verify              # re-extract, confirm determinism

Outputs go under the pipeline's build tree â€” tmp/artifacts/build/<asset>/hexvision/
(git-ignored, unified with the artifacts tool). The JSON is PROVISIONAL: the
overlays are the human review surface before promoting anything into spec/data.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import cv2

from . import detect
from . import cards

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_BUILD = os.path.join("tmp", "artifacts", "build")


def _out_dir(args: argparse.Namespace) -> str:
    """Outputs live alongside the pipeline's build tree for a unified process:
    tmp/artifacts/build/<asset>/hexvision/ (override with --out)."""
    return args.out or os.path.join(args.build_dir, args.asset, "hexvision")


def _tile_paths(build_dir: str, asset: str) -> list[str]:
    pat = os.path.join(build_dir, asset, "png", f"{asset}-p*-c*.png")
    return sorted(p for p in glob.glob(pat) if "-sheet" not in os.path.basename(p))


def _asset_id(path: str) -> str:
    return os.path.splitext(os.path.basename(path))[0]


def cmd_generate(args: argparse.Namespace) -> int:
    paths = _tile_paths(args.build_dir, args.asset)
    if not paths:
        print(f"error: no cut tiles found for asset '{args.asset}' under {args.build_dir}", file=sys.stderr)
        print("hint: run the artifacts pipeline first so its cut tiles exist.", file=sys.stderr)
        return 2
    out = _out_dir(args)
    ov_dir = os.path.join(out, "overlays")
    os.makedirs(ov_dir, exist_ok=True)
    tiles = []
    kind = "action-card" if "action-cards" in args.asset else "block"
    for p in paths:
        aid = _asset_id(p)
        if kind == "block":
            tile = detect.extract_tile(p, aid)
            bgr, _ = detect.load_tile(p)
            cv2.imwrite(os.path.join(ov_dir, f"{aid}.overlay.png"), detect.draw_overlay(bgr, tile))
            tiles.append(tile.to_dict())
        else:
            card = cards.extract_card(p, aid)
            image = cv2.imread(p, cv2.IMREAD_COLOR)
            cv2.imwrite(os.path.join(ov_dir, f"{aid}.overlay.png"), cards.overlay(image, card))
            tiles.append(card)
    duplicate_groups: dict[str, list[str]] = {}
    if kind == "action-card":
        for item in tiles:
            duplicate_groups.setdefault(item["perceptualHash"], []).append(item["asset"])
    doc = {
        "tool": "hexvision",
        "schemaVersion": 2,
        "asset": args.asset,
        "kind": kind,
        "provisional": True,
        "note": "Geometry (center/vertices/inradius) is reliable; edges/spaces/"
                "whiteCorners are assistive candidates - verify via the overlays "
                "before promoting into spec/data.",
        "tiles": tiles,
        **({"duplicateGroups": [group for group in duplicate_groups.values() if len(group) > 1]} if kind == "action-card" else {}),
    }
    os.makedirs(out, exist_ok=True)
    out_json = os.path.join(out, f"{args.asset}.vision.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"generate: {len(tiles)} tiles -> {out_json}")
    print(f"          overlays -> {ov_dir}")
    return 0


def _load_doc(args: argparse.Namespace) -> dict:
    with open(os.path.join(_out_dir(args), f"{args.asset}.vision.json"), encoding="utf-8") as f:
        return json.load(f)


def cmd_check(args: argparse.Namespace) -> int:
    try:
        doc = _load_doc(args)
    except FileNotFoundError:
        print("error: no vision JSON - run `generate` first.", file=sys.stderr)
        return 2
    errors: list[str] = []
    warns: list[str] = []
    seen = set()
    if doc.get("kind") == "action-card":
        for card in doc.get("tiles", []):
            aid = card.get("asset", "?")
            if aid in seen:
                errors.append(f"{aid}: duplicate card asset id")
            seen.add(aid)
            if card.get("kind") != "action-card":
                errors.append(f"{aid}: wrong component kind")
            if not isinstance(card.get("perceptualHash"), str) or len(card["perceptualHash"]) != 256:
                errors.append(f"{aid}: missing perceptual hash")
            if not 0 <= card.get("confidence", -1) <= 1:
                errors.append(f"{aid}: invalid OCR confidence")
            if not card.get("reviewRequired"):
                errors.append(f"{aid}: action cards must remain review-required")
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        if errors:
            return 1
        print(f"check: {len(seen)} action cards OK (all require review)")
        return 0
    for t in doc.get("tiles", []):
        aid = t.get("asset", "?")
        if aid in seen:
            errors.append(f"{aid}: duplicate tile id")
        seen.add(aid)
        if len(t.get("vertices", [])) != 6:
            errors.append(f"{aid}: expected 6 vertices, got {len(t.get('vertices', []))}")
        if len(t.get("edges", [])) != 6:
            errors.append(f"{aid}: expected 6 edges")
        if len(t.get("whiteCorners", [])) != 6:
            errors.append(f"{aid}: expected 6 whiteCorners")
        if t.get("inradius", 0) <= 0:
            errors.append(f"{aid}: non-positive inradius")
        for s in t.get("spaces", []):
            if not (-1.2 <= s["x"] <= 1.2 and -1.2 <= s["y"] <= 1.2):
                errors.append(f"{aid}: space out of range {s}")
        # low-confidence heuristics worth a human look
        if all(t.get("edges", [])) or not any(t.get("edges", [])):
            warns.append(f"{aid}: all edges {'open' if all(t['edges']) else 'walls'} - verify passages")
        if not t.get("spaces"):
            warns.append(f"{aid}: no spaces detected - verify placements")
    for w in warns:
        print(f"warning: {w}")
    for e in errors:
        print(f"error: {e}", file=sys.stderr)
    if errors:
        return 1
    print(f"check: {len(doc.get('tiles', []))} tiles OK ({len(warns)} verify-me warnings)")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    try:
        doc = _load_doc(args)
    except FileNotFoundError:
        print("error: no vision JSON - run `generate` first.", file=sys.stderr)
        return 2
    stored = {t["asset"]: t for t in doc.get("tiles", [])}
    paths = _tile_paths(args.build_dir, args.asset)
    mismatches = 0
    for p in paths:
        aid = _asset_id(p)
        fresh = (cards.extract_card(p, aid) if doc.get("kind") == "action-card" else detect.extract_tile(p, aid).to_dict())
        if stored.get(aid) != fresh:
            mismatches += 1
            print(f"verify: {aid} differs from stored JSON (re-run generate)", file=sys.stderr)
    if len(paths) != len(stored):
        print(f"verify: tile count differs (build={len(paths)} stored={len(stored)})", file=sys.stderr)
        mismatches += 1
    if mismatches:
        return 1
    print(f"verify: extraction is deterministic and matches stored JSON ({len(paths)} tiles)")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="hexvision", description=__doc__)
    ap.add_argument("--asset", default="sp-en-blocks-a4", help="asset id (default: sp-en-blocks-a4)")
    ap.add_argument("--build-dir", default=DEFAULT_BUILD, help="artifacts build dir with cut tiles")
    ap.add_argument("--out", default=None, help="output dir (default: <build>/<asset>/hexvision)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("generate", cmd_generate), ("check", cmd_check), ("verify", cmd_verify)):
        sp = sub.add_parser(name)
        sp.set_defaults(func=fn)
    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
