"""Ground-truth evaluation for hexvision block detection.

Scores detection against human-authored block records (the editor session drafts)
so detection quality is measurable, not eyeballed. Ground truth is keyed by asset
id; each detected tile is compared per field: zone occupancy (precision / recall /
F1), edges, and white/bonus corners. Run:

    python -m hexvision.eval            # scorecard vs the checked-in ground truth
"""

from __future__ import annotations

import json
import os
import sys

from . import detect

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_BUILD = os.path.join(REPO, "tmp", "artifacts", "build")
GROUND_TRUTH = os.path.join(
    REPO, "tools", "block-editor", ".sessions", "block-zone-drafts.editor.json"
)


def load_ground_truth(session_path: str) -> dict[str, dict]:
    """Read block records from an editor session into {assetId: expected fields}."""
    with open(session_path, encoding="utf-8") as f:
        doc = json.load(f)
    gt: dict[str, dict] = {}
    for entry in doc.get("documents", []):
        if entry.get("resourceType") != "block":
            continue
        block = entry.get("block", {})
        asset = entry.get("source", {}).get("assetId")
        if not asset:
            continue
        zones = {z for s in block.get("spaces", []) for z in s.get("zoneIds", [])}
        gt[asset] = {
            "zones": zones,
            "spaceCount": len(block.get("spaces", [])),
            "edges": block.get("edges"),
            "bonusCorners": block.get("bonusCorners"),
            "iceValue": block.get("iceValue"),
            "status": entry.get("status"),
        }
    return gt


def _asset_group(asset: str) -> str:
    """`sp-en-blocks-a4-p01-c01` -> `sp-en-blocks-a4` (the pipeline asset dir)."""
    return asset.rsplit("-p", 1)[0]


def _tile_png(build_dir: str, asset: str) -> str | None:
    p = os.path.join(build_dir, _asset_group(asset), "png", f"{asset}.png")
    return p if os.path.exists(p) else None


def detected_zones(tile) -> set[str]:
    zones: set[str] = set()
    for s in tile.spaces:
        zones.update(getattr(s, "suggestedZoneIds", []) or [])
    return zones


def prf(expected: set[str], got: set[str]) -> tuple[float, float, float]:
    tp = len(expected & got)
    precision = tp / len(got) if got else (1.0 if not expected else 0.0)
    recall = tp / len(expected) if expected else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1


def bool_accuracy(expected, got) -> float | None:
    if not expected or not got or len(expected) != len(got):
        return None
    return sum(1 for a, b in zip(expected, got) if bool(a) == bool(b)) / len(expected)


def evaluate(build_dir: str = DEFAULT_BUILD, session_path: str = GROUND_TRUTH) -> dict:
    """Return per-tile rows plus aggregate scores. Skips assets with no cut tile."""
    gt = load_ground_truth(session_path)
    rows: list[dict] = []
    for asset, expected in sorted(gt.items()):
        png = _tile_png(build_dir, asset)
        if not png:
            continue
        tile = detect.extract_tile(png, asset)
        _, _, zone_f1 = prf(expected["zones"], detected_zones(tile))
        rows.append({
            "asset": asset,
            "zoneF1": round(zone_f1, 3),
            "zonesExpected": sorted(expected["zones"]),
            "zonesDetected": sorted(detected_zones(tile)),
            "edgeAcc": bool_accuracy(expected["edges"], tile.edges),
            "cornerAcc": bool_accuracy(expected["bonusCorners"], tile.whiteCorners),
            "spaceCountExpected": expected["spaceCount"],
            "spaceCountDetected": len(tile.spaces),
        })
    def _avg(key):
        vals = [r[key] for r in rows if r.get(key) is not None]
        return round(sum(vals) / len(vals), 3) if vals else None
    return {
        "rows": rows,
        "tiles": len(rows),
        "zoneF1": _avg("zoneF1"),
        "edgeAcc": _avg("edgeAcc"),
        "cornerAcc": _avg("cornerAcc"),
    }


def main(argv: list[str] | None = None) -> int:
    build = argv[0] if argv else DEFAULT_BUILD
    report = evaluate(build)
    if not report["rows"]:
        print("eval: no ground-truth tiles found (run the artifacts pipeline first)", file=sys.stderr)
        return 0
    for r in report["rows"]:
        print(f"{r['asset']}: zoneF1={r['zoneF1']} edges={r['edgeAcc']} corners={r['cornerAcc']} "
              f"spaces={r['spaceCountDetected']}/{r['spaceCountExpected']}")
        print(f"    zones exp={r['zonesExpected']} det={r['zonesDetected']}")
    print(f"AGGREGATE ({report['tiles']} tiles): zoneF1={report['zoneF1']} "
          f"edgeAcc={report['edgeAcc']} cornerAcc={report['cornerAcc']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
