from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from tools.artifacts.pipeline import (Crop, DetectedAsset, crop_asset, detect_crops,
                                      detect_block_hex_assets, detect_page_content, pack_atlas)


class PipelineTests(unittest.TestCase):
    def test_core_refresh_includes_control_cards_with_the_grid_detector(self):
        from tools.artifacts.__main__ import CORE_ARTIFACTS, detector_for, kind_for
        for artifact_id in ("sp-en-control-cards", "sh-en-control-cards"):
            self.assertIn(artifact_id, CORE_ARTIFACTS)
        self.assertEqual(detector_for("control-cards", "auto"), "grid")
        self.assertEqual(kind_for("control-cards"), "control-card")

    def test_control_card_grid_preserves_page_and_cell_identity(self):
        from tools.artifacts.pipeline import detected_assets
        image = Image.new("RGB", (600, 900), "white")
        draw = ImageDraw.Draw(image)
        for y in (25, 320, 615):
            for x in (25, 220, 415):
                draw.rectangle((x, y, x + 150, y + 230), fill="#102030")
        assets = detected_assets("sp-en-control-cards", 2, "control-card", detect_crops(image, min_size=30))
        self.assertEqual(len(assets), 9)
        self.assertEqual(assets[2].asset_id, "sp-en-control-cards-p02-c03")
        self.assertTrue(all(asset.kind == "control-card" for asset in assets))

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

    def test_detects_three_masked_block_hexes(self) -> None:
        image = Image.new("RGB", (2481, 3508), "white")
        assets = detect_block_hex_assets("sp-en-blocks-a4", 1, image)
        self.assertEqual(3, len(assets))
        self.assertEqual("sp-en-blocks-a4-p01-c01", assets[0].asset_id)
        self.assertTrue(all(asset.mask is not None and len(asset.mask) == 6 for asset in assets))

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
