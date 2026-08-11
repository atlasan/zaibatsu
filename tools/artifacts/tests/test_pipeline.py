from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from tools.artifacts.pipeline import (Crop, DetectedAsset, crop_asset, detect_crops,
                                      detect_page_content, pack_atlas)


class PipelineTests(unittest.TestCase):
    def sheet(self) -> Image.Image:
        image = Image.new("RGB", (500, 300), "white")
        draw = ImageDraw.Draw(image)
        for y in (20, 160):
            for x in (20, 180, 340):
                draw.rectangle((x, y, x + 120, y + 100), fill="#102030")
        return image

    def test_detects_regular_grid(self) -> None:
        crops = detect_crops(self.sheet(), min_size=30)
        self.assertEqual(6, len(crops))
        self.assertTrue(all(crop.confidence >= 0.70 for crop in crops))

    def test_detects_page_content_as_one_sheet(self) -> None:
        image = Image.new("RGB", (500, 300), "white")
        ImageDraw.Draw(image).rectangle((25, 20, 475, 280), fill="#102030")
        crops = detect_page_content(image, min_size=30)
        self.assertEqual(1, len(crops))
        self.assertEqual((25, 20, 451, 261), (crops[0].x, crops[0].y, crops[0].width, crops[0].height))
        self.assertGreaterEqual(crops[0].confidence, 0.70)

    def test_crop_and_atlas(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            image = self.sheet()
            first = Crop(20, 20, 120, 100, 0.9)
            second = Crop(180, 20, 120, 100, 0.9)
            crop_asset(image, first, root / "a.png", root / "a.webp")
            crop_asset(image, second, root / "b.png", root / "b.webp")
            atlas = pack_atlas([("a", root / "a.png"), ("b", root / "b.png")], root / "atlas", 512)
            self.assertEqual({"a", "b"}, set(atlas["sprites"]))
            self.assertTrue((root / "atlas" / "atlas.png").is_file())


if __name__ == "__main__":
    unittest.main()
