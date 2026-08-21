"""Hex-block vision: extract structured data from Zaibatsu block tiles.

A NEW, standalone tool. It does not import or modify tools/artifacts/ — it only
*consumes* that pipeline's output: the pre-cut, alpha-masked tile PNGs under
`tmp/artifacts/build/<asset>/png/<asset>-pNN-cMM.png`. Each such file is one
isolated pointy-top hexagon whose exact outline is the alpha channel, so geometry
is precise and only the interior features are inferred.

Per tile it detects:
  * passages   — which of the 6 edges expose a connecting space (block.edges[6]);
  * placements — the gameplay spaces, by partitioning the standard 7-hex grid on
                 the printed white grid lines (merged zones = pills/large areas);
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
    whiteCorners: list[bool]  # [6] white corner per vertex (raw white signal)
    # [6] bonus corners = white corners MINUS the ICE-difficulty corner (which is
    # also white but is not a bonus corner). Set in extract_tile once ICE is known.
    bonusCorners: list[bool] = field(default_factory=list)
    spaces: list[Space] = field(default_factory=list)
    # Flat ICE dice read from the tile: [{face:1..6, box:[x,y,w,h], side}]. The
    # ICE value is printed as die faces; which cluster is ICE is left to review.
    iceDiceCandidates: list[dict] = field(default_factory=list)
    # The ICE-difficulty corner: {corner:0-5, dice:1-3, black:bool} or None. The
    # printed ICE is an isometric-dice cluster at a hex corner (dice count ->
    # low/medium/high; a black die -> Black ICE). Review-required.
    iceCorner: dict | None = None

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


_RING = ("h2", "h3", "h4", "h5", "h6", "h7")
_RING_ADJ = (("h2", "h3"), ("h3", "h4"), ("h4", "h5"), ("h5", "h6"), ("h6", "h7"), ("h7", "h2"))
_ZONE_ORDER = ("h1", "h2", "h3", "h4", "h5", "h6", "h7")


def _boundary_line_white(white: np.ndarray, center, inr: int, a: str, b: str) -> float:
    """Fraction of the shared edge between zones a and b that carries a WHITE grid
    line. High => a printed line separates the two cells; low => no line, so the
    two zones are one merged space (a pill / large area)."""
    h, w = white.shape
    cx, cy = center
    ax, ay = STANDARD_ZONE_ANCHORS[a]
    bx, by = STANDARD_ZONE_ANCHORS[b]
    mx, my = (ax + bx) / 2, (ay + by) / 2
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy) or 1.0
    px, py = -dy / length, dx / length  # unit perpendicular = along the shared edge
    hit = n = 0
    for s in np.linspace(-0.28, 0.28, 29):
        gx = int(cx + (mx + px * s) * inr)
        gy = int(cy + (my + py * s) * inr)
        if 0 <= gx < w and 0 <= gy < h:
            n += 1
            if white[gy, gx] > 0:
                hit += 1
    return hit / n if n else 0.0


def detect_spaces(bgr: np.ndarray, alpha, center, inr: int) -> list[Space]:
    """Partition the standard 7-hex grid into spaces using the printed WHITE grid
    lines, rather than hunting free-form circles (which over-segmented big areas).
    Two adjacent ring zones with NO white line on their shared edge merge into one
    space; a line keeps them separate. The centre h1 is folded into the largest
    space (it is the art/name hub, rarely its own cell). `kind` carries the
    displayShape: circle (1 zone) / capsule (2) / compound (3+). Assistive —
    verify via overlay; irregular art (e.g. Freeside) can still over-split."""
    cx, cy = center
    white = _white_mask(bgr, alpha)
    parent = {z: z for z in _RING}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in _RING_ADJ:
        if _boundary_line_white(white, center, inr, a, b) < 0.45:
            parent[find(a)] = find(b)  # no grid line on the shared edge -> merged
    groups: dict[str, list[str]] = {}
    for z in _RING:
        groups.setdefault(find(z), []).append(z)
    ordered = sorted((sorted(g, key=_ZONE_ORDER.index) for g in groups.values()), key=len, reverse=True)
    ordered[0].append("h1")  # the centre joins the biggest space
    spaces: list[Space] = []
    for g in ordered:
        g = sorted(g, key=_ZONE_ORDER.index)
        xs = [STANDARD_ZONE_ANCHORS[z][0] for z in g]
        ys = [STANDARD_ZONE_ANCHORS[z][1] for z in g]
        mx, my = sum(xs) / len(g), sum(ys) / len(g)
        reach = max((math.hypot(STANDARD_ZONE_ANCHORS[z][0] - mx, STANDARD_ZONE_ANCHORS[z][1] - my) for z in g), default=0.0)
        shape = "circle" if len(g) == 1 else ("capsule" if len(g) == 2 else "compound")
        sp = Space(x=round(mx, 4), y=round(my, 4), r=round(reach + 0.34, 4), kind=shape)
        sp.suggestedZoneIds = g
        sp.suggestionConfidence = 1.0
        spaces.append(sp)
    return spaces


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


def classify_ice_dice(dice: list[dict], center, verts, inr: int) -> list[dict]:
    """Tag each flat die with its role: 'difficulty' when it sits near a hex CORNER
    (it is the block's ICE value) or 'modifier' when it sits INSIDE a zone (a
    space.modifier.kind=ice on that space, with the nearest zone recorded). This
    separates the two printed ICE forms the source uses."""
    cx, cy = center
    for d in dice:
        x, y, w, h = d["box"]
        nx, ny = (x + w / 2 - cx) / inr, (y + h / 2 - cy) / inr
        dist_corner = min(math.hypot((vx - cx) / inr - nx, (vy - cy) / inr - ny) for vx, vy in verts)
        if dist_corner < 0.55:
            d["role"] = "difficulty"
        else:
            _, zone = min((math.hypot(ax - nx, ay - ny), z) for z, (ax, ay) in STANDARD_ZONE_ANCHORS.items())
            d["role"] = "modifier"
            d["zone"] = zone
    return dice


def detect_ice_corner(bgr: np.ndarray, alpha, center, verts, inr: int) -> dict | None:
    """Locate the ICE-difficulty corner: the printed ICE is an isometric-dice
    cluster at a hex corner (1-3 dice -> high/medium/low; a black die -> Black ICE).
    A die is drawn as a small cube whose pips are the distinctive mark - dark pips
    on white dice, light pips on a black die. Score each corner by the largest
    COMPACT cluster of pip-sized round blobs (dice pips cluster tightly; scattered
    text dots do not), and report the best corner with its dominant polarity and a
    rough die count. Review-required: exact corner can miss on busy art."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    cx, cy = center
    inside = cv2.erode((alpha > 10).astype(np.uint8) * 255, np.ones((5, 5), np.uint8), iterations=2)
    best = None
    for i, (vx, vy) in enumerate(verts):
        rx = int(vx + (cx - vx) * 0.26)
        ry = int(vy + (cy - vy) * 0.26)
        s = int(inr * 0.32)
        y0, y1 = max(0, ry - s), min(h, ry + s)
        x0, x1 = max(0, rx - s), min(w, rx + s)
        region_gray = gray[y0:y1, x0:x1]
        region_in = inside[y0:y1, x0:x1]
        if region_gray.size == 0:
            continue
        for kind, mask in (("white", cv2.inRange(region_gray, 0, 70)), ("black", cv2.inRange(region_gray, 190, 255))):
            mask = cv2.morphologyEx(cv2.bitwise_and(mask, region_in), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            pts = []
            for c in contours:
                area = cv2.contourArea(c)
                if (inr * 0.012) ** 2 * math.pi <= area <= (inr * 0.055) ** 2 * math.pi:
                    bx, by, bw, bh = cv2.boundingRect(c)
                    if bw and bh and 0.5 <= bw / bh <= 2.0 and area / (bw * bh) >= 0.5:
                        pts.append((bx + bw / 2, by + bh / 2))
            if len(pts) < 3:
                continue
            arr = np.array(pts)
            radius = inr * 0.24
            tightest = max(int(np.sum(np.hypot(arr[:, 0] - p[0], arr[:, 1] - p[1]) <= radius)) for p in arr)
            if best is None or tightest > best[0]:
                # rough die count: ~1 die per 3.5 pips (avg face ~3.5), clamped 1..3
                dice = max(1, min(3, round(tightest / 3.5)))
                best = (tightest, {"corner": i, "dice": dice, "black": kind == "black"})
    if best and best[0] >= 3:  # a real cluster; keeps ICE-less tiles (e.g. Central Core) empty
        return best[1]
    return None


def extract_tile(path: str, asset: str) -> Tile:
    bgr, alpha = load_tile(path)
    center, verts, inr = hexagon(alpha)
    white_corners = detect_white_corners(bgr, alpha, center, verts)
    ice_corner = detect_ice_corner(bgr, alpha, center, verts, inr)
    ice_idx = ice_corner["corner"] if ice_corner else None
    bonus = [w and i != ice_idx for i, w in enumerate(white_corners)]
    return Tile(
        asset=asset,
        center=center,
        inradius=inr,
        vertices=verts,
        edges=detect_edges(bgr, alpha, center, verts, inr),
        whiteCorners=white_corners,
        bonusCorners=bonus,
        spaces=detect_spaces(bgr, alpha, center, inr),
        iceDiceCandidates=classify_ice_dice(detect_ice_dice(bgr, alpha), center, verts, inr),
        iceCorner=ice_corner,
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
        modifier = die.get("role") == "modifier"
        color = (0, 165, 255) if modifier else (200, 0, 200)  # orange modifier / magenta difficulty
        label = f"ICEmod {die.get('zone', '?')}?{die['face']}" if modifier else f"ICE?{die['face']}"
        cv2.rectangle(ov, (x, y), (x + w, y + h), color, 4)
        cv2.putText(ov, label, (x, max(24, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
    if tile.iceCorner is not None:
        vx, vy = tile.vertices[tile.iceCorner["corner"]]
        label = f"ICE x{tile.iceCorner['dice']}" + (" BLACK" if tile.iceCorner["black"] else "")
        cv2.circle(ov, (vx, vy), 34, (0, 0, 255), 4)
        cv2.putText(ov, label, (vx - 40, vy + 54), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    return ov
