import cv2
import numpy as np

from hexvision import cards


def test_card_vision_is_review_only(tmp_path):
    image = np.full((400, 280, 3), (65, 220, 220), np.uint8)
    cv2.rectangle(image, (30, 30), (250, 85), (0, 0, 0), -1)
    path = tmp_path / "card.png"
    cv2.imwrite(str(path), image)
    result = cards.extract_card(str(path), "sp-en-action-cards-p01-c01")
    assert result["kind"] == "action-card"
    assert result["reviewRequired"] is True
    assert len(result["perceptualHash"]) == 256
    assert "local OCR unavailable; manually transcribe printed text" in result["reasons"]


def test_card_overlay_preserves_shape(tmp_path):
    image = np.full((120, 90, 3), (50, 220, 220), np.uint8)
    card = {"iconCandidates": [{"kind": "cyan", "box": [10, 10, 30, 30]}], "textRegions": [{"box": [40, 40, 20, 10]}]}
    assert cards.overlay(image, card).shape == image.shape
