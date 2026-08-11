"""Hex-block vision: extract structured data from Zaibatsu block tiles.

A NEW, standalone tool. It does not import or modify tools/artifacts/ — it only
*consumes* that pipeline's output: the pre-cut, alpha-masked tile PNGs under
`tmp/artifacts/build/<asset>/png/<asset>-pNN-cMM.png`. Each such file is one
isolated pointy-top hexagon whose exact outline is the alpha channel, so geometry
is precise and only the interior features are inferred.

Per tile it detects:
  * passages   — which of the 6 edges expose a connecting space (block.edges[6]);
  * placements — the circular space slots inside;
  * bonus slots — bonus fragments at the 6 corners.

The art is stylised, so passage/placement/bonus detection is DELIBERATELY
provisional and assistive: every run also writes a verification overlay so a
human confirms before the data is promoted into spec/data. Hexagon geometry
(from the alpha outline) is reliable; interior inference is a starting point.

Edge/vertex convention (pointy-top): vertex 0 = top, then clockwise
(1=upper-right, 2=lower-right, 3=bottom, 4=lower-left, 5=upper-left). Edge i lies
between vertex i and vertex (i+1) mod 6.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict

import cv2
import numpy as np


@dataclass
class Space:
    x: float  # center, normalized -1..1 within the hex (0 = center)
    y: float
    r: float  # radius as a fraction of the inradius
    kind: str  # heuristic label; refine by hand


@dataclass
class Tile:
    asset: str
    center: tuple[int, int]
    inradius: int
    vertices: list[tuple[int, int]]  # 6, ordered from top clockwise
    edges: list[bool]  # [6] passage per edge
    bonusCorners: list[bool]  # [6] bonus fragment per corner
    spaces: list[Space] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["center"] = list(self.center)
        d["vertices"] = [list(v) for v in self.vertices]
        return d


def load_tile(path: str) -> tuple[np.ndarray, np.ndarray]:
    """Load a cut tile; returns (BGR composited over white, alpha mask uint8)."""
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(path)
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 4:
        alpha = img[:, :, 3]
        bgr = img[:, :, :3].astype(np.float32)
        a = (alpha.astype(np.float32) / 255.0)[:, :, None]
        bgr = (bgr * a + 255.0 * (1 - a)).astype(np.uint8)  # over white
        return bgr, alpha
    bgr = img[:, :, :3]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return bgr, (gray < 250).astype(np.uint8) * 255


def hexagon(alpha: np.ndarray) -> tuple[tuple[int, int], list[tuple[int, int]], int]:
    """Fit the tile's hexagon from its alpha outline. Returns (center, 6 vertices
    ordered from top clockwise, inradius)."""
    m = (alpha > 10).astype(np.uint8)
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cnts, key=cv2.contourArea)
    peri = cv2.arcLength(cnt, True)
    approx = cv2.approxPolyDP(cnt, 0.02 * peri, True).reshape(-1, 2)
    # If not exactly 6, fall back to min-area hexagon from enclosing circle.
    if len(approx) != 6:
        (cx, cy), r = cv2.minEnclosingCircle(cnt)
        approx = np.array([
            (cx + r * math.cos(math.radians(a)), cy - r * math.sin(math.radians(a)))
            for a in (90, 30, -30, -90, -150, 150)
        ])
    cx, cy = approx[:, 0].mean(), approx[:, 1].mean()
    # order: start at the top-most vertex, go clockwise (image y-down)
    ang = np.array([math.atan2(v[1] - cy, v[0] - cx) for v in approx])  # -pi..pi, cw+
    order = np.argsort(ang)
    verts = approx[order]
    top = int(np.argmin(verts[:, 1]))
    verts = np.roll(verts, -top, axis=0)
    verts = [(int(x), int(y)) for x, y in verts]
    # inradius = mean distance from center to edge midpoints
    inr = np.mean([
        math.hypot((verts[i][0] + verts[(i + 1) % 6][0]) / 2 - cx,
                   (verts[i][1] + verts[(i + 1) % 6][1]) / 2 - cy)
        for i in range(6)
    ])
    return (int(cx), int(cy)), verts, int(inr)


def _edge_mid_normal(center, verts, i):
    """Edge i midpoint and unit outward normal."""
    cx, cy = center
    (ax, ay), (bx, by) = verts[i], verts[(i + 1) % 6]
    mx, my = (ax + bx) / 2, (ay + by) / 2
    d = math.hypot(mx - cx, my - cy) or 1.0
    return (mx, my), ((mx - cx) / d, (my - cy) / d)


def detect_edges(bgr: np.ndarray, center, verts, inr: int) -> list[bool]:
    """A passage is present where the tile is NOT a solid dark frame at the edge
    midpoint — i.e. a lighter space reaches the edge."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    out = []
    for i in range(6):
        (mx, my), (nx, ny) = _edge_mid_normal(center, verts, i)
        vals = []
        for f in (0.80, 0.86, 0.92):
            px = int(center[0] + (mx - center[0]) * f)
            py = int(center[1] + (my - center[1]) * f)
            if 0 <= px < w and 0 <= py < h:
                vals.append(int(gray[py, px]))
        out.append(bool(vals and np.mean([v > 90 for v in vals]) >= 0.5))
    return out


def detect_bonus_corners(bgr: np.ndarray, center, verts) -> list[bool]:
    """Bonus fragment at a corner ~ strong yellow near that vertex."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, w = hsv.shape[:2]
    cx, cy = center
    out = []
    for vx, vy in verts:
        # sample a patch pulled slightly inward from the vertex
        px, py = int(cx + (vx - cx) * 0.85), int(cy + (vy - cy) * 0.85)
        x0, y0 = px - 45, py - 45
        patch = hsv[max(0, y0):min(h, y0 + 90), max(0, x0):min(w, x0 + 90)]
        if patch.size == 0:
            out.append(False)
            continue
        yellow = ((patch[:, :, 0] >= 20) & (patch[:, :, 0] <= 40)
                  & (patch[:, :, 1] > 120) & (patch[:, :, 2] > 120))
        out.append(bool(yellow.mean() > 0.15))
    return out


def detect_spaces(bgr: np.ndarray, center, inr: int) -> list[Space]:
    """Detect prominent circular space slots via Hough circles (assistive)."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    circles = cv2.HoughCircles(
        gray, cv2.HOUGH_GRADIENT, dp=1.0, minDist=int(inr * 0.55),
        param1=140, param2=95, minRadius=int(inr * 0.20), maxRadius=int(inr * 0.62),
    )
    out: list[Space] = []
    if circles is None:
        return out
    cx, cy = center
    for x, y, r in np.round(circles[0]).astype(int):
        if len(out) >= 6:
            break
        if (x - cx) ** 2 + (y - cy) ** 2 > (inr * 0.95) ** 2:
            continue
        out.append(Space(
            x=round((x - cx) / inr, 4),
            y=round((y - cy) / inr, 4),
            r=round(r / inr, 4),
            kind="space",
        ))
    return out


def extract_tile(path: str, asset: str) -> Tile:
    bgr, alpha = load_tile(path)
    center, verts, inr = hexagon(alpha)
    return Tile(
        asset=asset,
        center=center,
        inradius=inr,
        vertices=verts,
        edges=detect_edges(bgr, center, verts, inr),
        bonusCorners=detect_bonus_corners(bgr, center, verts),
        spaces=detect_spaces(bgr, center, inr),
    )


def draw_overlay(bgr: np.ndarray, tile: Tile) -> np.ndarray:
    """Render detected geometry/features for human verification."""
    ov = bgr.copy()
    verts = np.array(tile.vertices, np.int32)
    cx, cy = tile.center
    cv2.polylines(ov, [verts], True, (0, 0, 255), 4)
    cv2.circle(ov, (cx, cy), 10, (0, 255, 0), -1)
    for i, (vx, vy) in enumerate(tile.vertices):
        cv2.putText(ov, str(i), (vx, vy), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 140, 255), 3)
        if tile.bonusCorners[i]:
            cv2.rectangle(ov, (vx - 20, vy - 20), (vx + 20, vy + 20), (0, 255, 255), 4)
    for i in range(6):
        (mx, my), _ = _edge_mid_normal(tile.center, tile.vertices, i)
        px = int(cx + (mx - cx) * 0.88)
        py = int(cy + (my - cy) * 0.88)
        cv2.circle(ov, (px, py), 16, (0, 200, 0) if tile.edges[i] else (0, 0, 200), -1)
        cv2.putText(ov, f"e{i}", (px - 14, py + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    for s in tile.spaces:
        sx, sy = int(cx + s.x * tile.inradius), int(cy + s.y * tile.inradius)
        cv2.circle(ov, (sx, sy), int(s.r * tile.inradius), (255, 120, 0), 3)
    return ov
