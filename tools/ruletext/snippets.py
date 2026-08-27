#!/usr/bin/env python
"""Crop and compose local ruletext image artifacts for transcript review."""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = ROOT / "tmp" / "ruletext" / "snippets"


def parse_rect(raw: str) -> tuple[int, int, int, int]:
    parts = [part.strip() for part in raw.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("rect must be left,top,right,bottom")
    try:
        left, top, right, bottom = (int(part) for part in parts)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("rect values must be integers") from exc
    if right <= left or bottom <= top:
        raise argparse.ArgumentTypeError("rect must satisfy right>left and bottom>top")
    return left, top, right, bottom


def load_image(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGB")


def ensure_output(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def output_path(name: str | None, output: str | None) -> Path:
    if output:
        return ensure_output(Path(output))
    stem = name or "snippet"
    return ensure_output(DEFAULT_OUTPUT_DIR / f"{stem}.png")


def crop_image(input_path: Path, rect: tuple[int, int, int, int], out_path: Path) -> None:
    image = load_image(input_path)
    snippet = image.crop(rect)
    snippet.save(out_path)


def compose_images(
    input_paths: list[Path],
    out_path: Path,
    layout: str,
    gap: int,
    columns: int,
    fit_width: int | None,
) -> None:
    images = [load_image(path) for path in input_paths]
    if fit_width:
        resized: list[Image.Image] = []
        for image in images:
            width, height = image.size
            scaled_height = max(1, round(height * (fit_width / width)))
            resized.append(image.resize((fit_width, scaled_height)))
        images = resized
    if layout == "vertical":
        width = max(image.width for image in images)
        height = sum(image.height for image in images) + gap * (len(images) - 1)
        canvas = Image.new("RGB", (width, height), "white")
        y = 0
        for image in images:
            canvas.paste(image, ((width - image.width) // 2, y))
            y += image.height + gap
    elif layout == "horizontal":
        width = sum(image.width for image in images) + gap * (len(images) - 1)
        height = max(image.height for image in images)
        canvas = Image.new("RGB", (width, height), "white")
        x = 0
        for image in images:
            canvas.paste(image, (x, (height - image.height) // 2))
            x += image.width + gap
    else:
        columns = max(1, columns)
        rows = math.ceil(len(images) / columns)
        cell_width = max(image.width for image in images)
        cell_height = max(image.height for image in images)
        width = columns * cell_width + gap * (columns - 1)
        height = rows * cell_height + gap * (rows - 1)
        canvas = Image.new("RGB", (width, height), "white")
        for index, image in enumerate(images):
            row = index // columns
            column = index % columns
            x = column * (cell_width + gap) + (cell_width - image.width) // 2
            y = row * (cell_height + gap) + (cell_height - image.height) // 2
            canvas.paste(image, (x, y))
    ImageOps.expand(canvas, border=12, fill="white").save(out_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    crop = subparsers.add_parser("crop", help="Crop a local image artifact")
    crop.add_argument("--input", required=True, help="Input image path")
    crop.add_argument("--rect", required=True, type=parse_rect, help="left,top,right,bottom")
    crop.add_argument("--name", help="Output file stem under tmp/ruletext/snippets/")
    crop.add_argument("--output", help="Explicit output path")

    compose = subparsers.add_parser("compose", help="Compose multiple images into one artifact")
    compose.add_argument("--input", action="append", required=True, help="Input image path (repeatable)")
    compose.add_argument("--layout", choices=("vertical", "horizontal", "grid"), default="vertical")
    compose.add_argument("--columns", type=int, default=2, help="Grid column count")
    compose.add_argument("--gap", type=int, default=24, help="Gap between images")
    compose.add_argument("--fit-width", type=int, help="Resize each input to this width before composing")
    compose.add_argument("--name", help="Output file stem under tmp/ruletext/snippets/")
    compose.add_argument("--output", help="Explicit output path")

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "crop":
        crop_image(Path(args.input), args.rect, output_path(args.name, args.output))
        return 0
    if args.command == "compose":
        compose_images(
            [Path(path) for path in args.input],
            output_path(args.name, args.output),
            args.layout,
            args.gap,
            args.columns,
            args.fit_width,
        )
        return 0
    raise ValueError(f"unsupported command {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
