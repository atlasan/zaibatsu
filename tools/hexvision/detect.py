"""Hex-block vision: extract structured data from Zaibatsu block tiles.

A NEW, standalone tool. It does not import or modify tools/artifacts/ — it only
*consumes* that pipeline's output: the pre-cut, alpha-masked tile PNGs under
`tmp/artifacts/build/<asset>/png/<asset>-pNN-cMM.png`. Each such file is one
isolated pointy-top hexagon whose exact outline is the alpha channel, so geometry
is precise and only the interior features are inferred.

Per tile it detects:
  * passages   — which of the 6 edges expose a connecting space (block.edges[6]);
  * placements — the circular space slots inside;
  * white corners — which of the 6 corners are white (bonus zone = 3 aligned);
  * ICE dice   — the flat die faces printed on the tile (the ICE value), read from
                 their bold dark outline + pips; the decorative 3-D dice are skipped.

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
    suggestedZoneIds: list[str] = field(default_factory=list)
    suggestionConfidence: float = 0.0


@dataclass
class Tile:
    asset: str
    center: tuple[int, int]
    inradius: int
    vertices: list[tuple[int, int]]  # 6, ordered from top clockwise
    edges: list[bool]  # [6] passage per edge
    whiteCorners: list[bool]  # [6] white corner per vertex (bonus zone = 3 aligned)
    spaces: list[Space] = field(default_factory=list)
    # Flat ICE dice read from the tile: [{face:1..6, box:[x,y,w,h], side}]. The
    # ICE value is printed as die faces; which cluster is ICE is left to review.
    iceDiceCandidates: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["center"] = list(self.center)
        d["vertices"] = [list(v) for v in self.vertices]
        return d


# Source-aligned standardized 2-3-2 placement anchors, in tile-inradius units.
# h2/h3 are upper, h7/h1/h4 are middle, h6/h5 are lower.
STANDARD_ZONE_ANCHORS: dict[str, tuple[float, float]] = {
    "h1": (0.0, 0.0), "h2": (-0.337, -0.583), "h3": (0.337, -0.583),
    "h4": (0.674, 0.0), "h5": (0.337, 0.583), "h6": (-0.337, 0.583),
    "h7": (-0.674, 0.0),
}


def suggest_zone_ids(space: Space) -> tuple[list[str], float]:
    """Return a provisional nearest-anchor mapping for a detected source circle."""
    distances = sorted((math.hypot(space.x - x, space.y - y), zone_id)
                       for zone_id, (x, y) in STANDARD_ZONE_ANCHORS.items())
    nearest, nearest_id = distances[0]
    selected = [zone_id for distance, zone_id in distances if distance <= max(0.16, space.r * 0.82)]
    if not selected:
        selected = [nearest_id]
    order = ("h1", "h2", "h3", "h4", "h5", "h6", "h7")
    selected.sort(key=order.index)
    return selected, round(max(0.0, min(1.0, 1.0 - nearest / 0.42)), 4)


def standard_zone_centers(center: tuple[int, int], inradius: int) -> dict[str, tuple[int, int]]:
    cx, cy = center
    return {zone_id: (int(round(cx + x * inradius)), int(round(cy + y * inradius)))
            for zone_id, (x, y) in STANDARD_ZONE_ANCHORS.items()}
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


def detect_edges(bgr: np.ndarray, alpha, center, verts, inr: int) -> list[bool]:
    """An edge is OPEN (a passage) unless a solid dark WALL runs along it. Sample a
    band just inside the hex boundary at the middle of each edge; a high fraction of
    near-black pixels is a wall (closed), otherwise the interior reaches the edge
    (open). This is robust to wall-less blocks (e.g. Central Core, all-teal) that the
    old white-grid-line heuristic wrongly read as closed. Validated against the
    editor ground truth (12/12 on the drafted tiles) and blocks-truth.json."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    cx, cy = center
    out = []
    for i in range(6):
        ax, ay = verts[i]
        bx, by = verts[(i + 1) % 6]
        dark = n = 0
        for t in np.linspace(0.25, 0.75, 25):
            ex, ey = ax + (bx - ax) * t, ay + (by - ay) * t
            for f in (0.82, 0.86, 0.90):  # a band just inside the boundary
                px = int(cx + (ex - cx) * f)
                py = int(cy + (ey - cy) * f)
                if 0 <= px < w and 0 <= py < h:
                    n += 1
                    if gray[py, px] < 55:
                        dark += 1
        frac = dark / n if n else 0.0
        out.append(frac < 0.40)  # open unless a dark wall dominates the band
    return out


def detect_white_corners(bgr: np.ndarray, alpha, center, verts) -> list[bool]:
    """Detect which of the 6 corners are WHITE. This is a factual per-tile signal:
    a bonus zone forms on the board where three white corners meet (the tool does
    not decide bonus by itself). White is measured AMONG IN-TILE pixels — the
    alpha mask excludes the (composited-white) transparent outside, which would
    otherwise make every tip read as white."""
    h, w = bgr.shape[:2]
    cx, cy = center
    inside = cv2.erode(alpha, np.ones((9, 9), np.uint8)) if alpha is not None else None
    out = []
    for vx, vy in verts:
        px, py = int(cx + (vx - cx) * 0.90), int(cy + (vy - cy) * 0.90)
        x0, y0 = max(0, px - 30), max(0, py - 30)
        patch = bgr[y0:min(h, y0 + 60), x0:min(w, x0 + 60)]
        if patch.size == 0:
            out.append(False)
            continue
        white = (patch[:, :, 0] > 215) & (patch[:, :, 1] > 215) & (patch[:, :, 2] > 215)
        if inside is not None:
            tile = inside[y0:y0 + patch.shape[0], x0:x0 + patch.shape[1]] > 0
            if tile.sum() < patch.shape[0] * patch.shape[1] * 0.35:
                out.append(False)  # patch is mostly outside the tile
                continue
            out.append(bool((white & tile).sum() / max(1, tile.sum()) > 0.55))
        else:
            out.append(bool(white.mean() > 0.55))
    return out


def _white_mask(bgr: np.ndarray, alpha: np.ndarray | None = None) -> np.ndarray:
    m = cv2.inRange(bgr, (195, 195, 195), (255, 255, 255))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    if alpha is not None:
        # the transparent OUTSIDE was composited over white; exclude it so the
        # white grid/lines are only counted inside the tile.
        m[cv2.erode(alpha, np.ones((9, 9), np.uint8)) == 0] = 0
    return m


def _ring_whiteness(white: np.ndarray, x: float, y: float, r: float) -> float:
    """Fraction of a circle's circumference that lies on a white line."""
    h, w = white.shape
    hits = tot = 0
    for a in range(0, 360, 12):
        px = int(x + r * math.cos(math.radians(a)))
        py = int(y + r * math.sin(math.radians(a)))
        if 0 <= px < w and 0 <= py < h:
            tot += 1
            hits += 1 if white[py, px] > 0 else 0
    return hits / tot if tot else 0.0


def detect_spaces(bgr: np.ndarray, alpha, center, inr: int) -> list[Space]:
    """Cells are outlined by WHITE lines (a hex grid marks the spaces). Detect
    circles on the white mask, then keep only those whose circumference actually
    lies on a white ring — this rejects decorative art that isn't a cell. Strong
    non-max-suppression avoids overlap; pills are approximated by a circle.
    Assistive; verify via overlay."""
    cx, cy = center
    white = _white_mask(bgr, alpha)
    c = cv2.HoughCircles(
        white, cv2.HOUGH_GRADIENT, dp=1.0, minDist=int(inr * 0.4),
        param1=100, param2=40, minRadius=int(inr * 0.13), maxRadius=int(inr * 0.62),
    )
    scored: list[tuple] = []
    if c is not None:
        for x, y, r in c[0]:
            if (x - cx) ** 2 + (y - cy) ** 2 > (inr * 0.9) ** 2:
                continue
            wr = max(_ring_whiteness(white, x, y, rr) for rr in (r - 7, r, r + 7))
            if wr < 0.30:  # must be backed by a white cell outline
                continue
            scored.append((float(x), float(y), float(r)))
    scored.sort(key=lambda t: -t[2])  # keep the larger of overlapping detections
    kept: list[Space] = []
    picks: list[tuple] = []
    for x, y, r in scored:
        if any(math.hypot(x - px, y - py) < 0.7 * max(r, pr) for px, py, pr in picks):
            continue
        picks.append((x, y, r))
        normalized = Space(
            x=round((x - cx) / inr, 4),
            y=round((y - cy) / inr, 4),
            r=round(r / inr, 4),
            kind="space",
        )
        normalized.suggestedZoneIds, normalized.suggestionConfidence = suggest_zone_ids(normalized)
        kept.append(normalized)
        if len(kept) >= 7:
            break
    # The centre zone (h1) is usually the block name / effect text, not a cell.
    # Only keep an h1-only space when it is backed by a strong, near-complete
    # white ring — this removes the common centre false positive.
    kept = [s for s in kept if s.suggestedZoneIds != ["h1"]
            or _ring_whiteness(white, cx + s.x * inr, cy + s.y * inr, s.r * inr) >= 0.62]
    # Completion pass: an outer ring zone with a clear white cell outline that
    # Hough missed is recovered here (the outer ring is usually a full cell ring).
    covered = {z for s in kept for z in s.suggestedZoneIds}
    for zid in ("h2", "h3", "h4", "h5", "h6", "h7"):
        if zid in covered:
            continue
        nx, ny = STANDARD_ZONE_ANCHORS[zid]
        ax, ay = cx + nx * inr, cy + ny * inr
        best, best_r = 0.0, inr * 0.25
        for ox in (-0.10, 0.0, 0.10):
            for oy in (-0.10, 0.0, 0.10):
                for rr in np.linspace(0.16, 0.38, 6) * inr:
                    wr = _ring_whiteness(white, ax + ox * inr, ay + oy * inr, rr)
                    if wr > best:
                        best, best_r = wr, rr
        if best >= 0.5:
            sp = Space(x=nx, y=ny, r=round(best_r / inr, 4), kind="space")
            sp.suggestedZoneIds, sp.suggestionConfidence = [zid], round(best, 3)
            kept.append(sp)
    return kept


def _die_face(gray: np.ndarray, x: int, y: int, w: int, h: int, side: float) -> int:
    """Count the dark pips on a flat die face; 0 if not a plausible face (1..6)."""
    m = int(side * 0.18)
    roi = gray[y + m:y + h - m, x + m:x + w - m]
    if roi.size == 0 or float(roi.mean()) < 180:  # interior must be a white face
        return 0
    pips_mask = cv2.threshold(roi, 110, 255, cv2.THRESH_BINARY_INV)[1]
    pips_mask = cv2.morphologyEx(pips_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(pips_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    pips = 0
    for c in contours:
        area = cv2.contourArea(c)
        if (side * 0.05) ** 2 <= area <= (side * 0.28) ** 2:
            bw, bh = cv2.boundingRect(c)[2:]
            if 0.5 <= bw / max(1, bh) <= 2.0:  # round-ish pip
                pips += 1
    return pips if 1 <= pips <= 6 else 0


def detect_ice_dice(bgr: np.ndarray, alpha: np.ndarray) -> list[dict]:
    """Read the block's flat ICE dice. Each die prints a bold black rounded-square
    outline over a white face with 1-6 black pips; that outline is a strong,
    isolated signal (unlike the decorative 3-D dice, which show several faces at
    once and are intentionally skipped). Review-required: several dice can appear
    and only some are the ICE value."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    inside = cv2.erode((alpha > 10).astype(np.uint8) * 255, np.ones((5, 5), np.uint8), iterations=2)
    dark = cv2.bitwise_and(cv2.inRange(gray, 0, 80), inside)
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    lo, hi = min(h, w) * 0.07, min(h, w) * 0.22
    dice: list[dict] = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        if not 0.8 <= cw / max(1, ch) <= 1.25:  # square
            continue
        side = (cw + ch) / 2
        if not lo <= side <= hi:
            continue
        # a real die has a continuous dark outline: a thin border band must carry
        # enough dark ink all the way round (rejects white art blobs that merely
        # fit a square bounding box, e.g. the whale illustration - ~0.11 vs the
        # 0.24-0.47 of real dice outlines).
        band = max(2, int(side * 0.045))
        sub = (gray[y:y + ch, x:x + cw] < 90).astype(np.uint8)
        frame = sub.copy()
        frame[band:-band, band:-band] = 0
        frame_area = sub.shape[0] * sub.shape[1] - max(0, sub.shape[0] - 2 * band) * max(0, sub.shape[1] - 2 * band)
        if not frame_area or frame.sum() / frame_area < 0.2:
            continue
        face = _die_face(gray, x, y, cw, ch, side)
        if face:
            dice.append({"face": face, "box": [x, y, cw, ch], "side": round(side)})
    return sorted(dice, key=lambda d: (d["box"][1], d["box"][0]))


def extract_tile(path: str, asset: str) -> Tile:
    bgr, alpha = load_tile(path)
    center, verts, inr = hexagon(alpha)
    return Tile(
        asset=asset,
        center=center,
        inradius=inr,
        vertices=verts,
        edges=detect_edges(bgr, alpha, center, verts, inr),
        whiteCorners=detect_white_corners(bgr, alpha, center, verts),
        spaces=detect_spaces(bgr, alpha, center, inr),
        iceDiceCandidates=detect_ice_dice(bgr, alpha),
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
        if tile.whiteCorners[i]:
            cv2.rectangle(ov, (vx - 20, vy - 20), (vx + 20, vy + 20), (0, 255, 255), 4)
    for i in range(6):
        (mx, my), _ = _edge_mid_normal(tile.center, tile.vertices, i)
        px = int(cx + (mx - cx) * 0.88)
        py = int(cy + (my - cy) * 0.88)
        cv2.circle(ov, (px, py), 16, (0, 200, 0) if tile.edges[i] else (0, 0, 200), -1)
        cv2.putText(ov, f"e{i}", (px - 14, py + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    for zone_id, (zx, zy) in standard_zone_centers(tile.center, tile.inradius).items():
        cv2.circle(ov, (zx, zy), 12, (255, 220, 80), 2)
        cv2.putText(ov, zone_id, (zx - 14, zy + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 220, 80), 2)
    for s in tile.spaces:
        sx, sy = int(cx + s.x * tile.inradius), int(cy + s.y * tile.inradius)
        cv2.circle(ov, (sx, sy), int(s.r * tile.inradius), (255, 120, 0), 3)
        label = "/".join(s.suggestedZoneIds) if s.suggestedZoneIds else "?"
        cv2.putText(ov, label, (sx - 22, sy - int(s.r * tile.inradius) - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 220, 80), 2)
    for die in tile.iceDiceCandidates:
        x, y, w, h = die["box"]
        cv2.rectangle(ov, (x, y), (x + w, y + h), (200, 0, 200), 4)
        cv2.putText(ov, f"ICE?{die['face']}", (x, max(24, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 0, 200), 2)
    return ov
