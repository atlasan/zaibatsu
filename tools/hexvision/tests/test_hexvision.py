"""Tests for hexvision. The synthetic tests are self-contained (no build outputs);
the tile test runs only if the artifacts pipeline's cut tiles are present."""

import glob
import math
import os

import cv2
import numpy as np

from hexvision import detect

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def _synthetic_tile(inr=300, size=900):
    """RGBA image with a filled pointy-top hexagon (alpha outline)."""
    circum = inr / math.cos(math.radians(30))
    c = size // 2
    pts = np.array([
        (c + circum * math.cos(math.radians(a)), c - circum * math.sin(math.radians(a)))
        for a in (90, 30, -30, -90, -150, 150)
    ], np.int32)
    img = np.zeros((size, size, 4), np.uint8)
    cv2.fillPoly(img, [pts], (40, 120, 120, 255))
    cv2.polylines(img, [pts], True, (0, 0, 0, 255), 20)
    return img, pts, c


def test_hexagon_recovers_geometry(tmp_path):
    img, pts, c = _synthetic_tile()
    p = tmp_path / "syn.png"
    cv2.imwrite(str(p), img)
    bgr, alpha = detect.load_tile(str(p))
    center, verts, inr = detect.hexagon(alpha)
    assert len(verts) == 6
    assert abs(center[0] - c) < 15 and abs(center[1] - c) < 15
    assert abs(inr - 300) < 25
    # vertex 0 is the top-most
    assert verts[0][1] == min(v[1] for v in verts)


def test_extract_tile_shapes(tmp_path):
    img, _, _ = _synthetic_tile()
    p = tmp_path / "syn.png"
    cv2.imwrite(str(p), img)
    tile = detect.extract_tile(str(p), "syn")
    assert len(tile.edges) == 6
    assert len(tile.whiteCorners) == 6
    assert len(tile.vertices) == 6
    d = tile.to_dict()
    assert d["asset"] == "syn"
    assert isinstance(d["center"], list) and len(d["center"]) == 2


def test_overlay_runs(tmp_path):
    img, _, _ = _synthetic_tile()
    p = tmp_path / "syn.png"
    cv2.imwrite(str(p), img)
    bgr, _ = detect.load_tile(str(p))
    tile = detect.extract_tile(str(p), "syn")
    ov = detect.draw_overlay(bgr, tile)
    assert ov.shape == bgr.shape


def test_real_cut_tiles_if_present():
    tiles = glob.glob(os.path.join(REPO, "tmp", "artifacts", "build", "sp-en-blocks-a4", "png", "*-c*.png"))
    tiles = [t for t in tiles if "-sheet" not in os.path.basename(t)]
    if not tiles:
        return  # pipeline outputs not present; skip silently
    for t in tiles[:3]:
        tile = detect.extract_tile(t, os.path.basename(t))
        assert len(tile.vertices) == 6
        assert tile.inradius > 0
