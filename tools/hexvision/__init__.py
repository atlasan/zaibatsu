"""hexvision — extract structured hex-block data from Zaibatsu block tiles.

A standalone, parallel tool. It does not import or modify tools/artifacts/ — it
only consumes that pipeline's pre-cut tile PNGs. See README.md and detect.py.
"""

from .detect import (
    Space,
    Tile,
    detect_bonus_corners,
    detect_edges,
    detect_spaces,
    draw_overlay,
    extract_tile,
    hexagon,
    load_tile,
)

__all__ = [
    "Tile",
    "Space",
    "load_tile",
    "hexagon",
    "extract_tile",
    "draw_overlay",
    "detect_edges",
    "detect_spaces",
    "detect_bonus_corners",
]
