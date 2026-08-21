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
    assert result["reasons"]  # OCR availability is environment-specific.


def test_card_overlay_preserves_shape(tmp_path):
    image = np.full((120, 90, 3), (50, 220, 220), np.uint8)
    card = {"iconCandidates": [{"kind": "cyan", "box": [10, 10, 30, 30]}], "textRegions": [{"box": [40, 40, 20, 10]}]}
    assert cards.overlay(image, card).shape == image.shape


def test_card_proposals_keep_zone_candidates_reviewable():
    regions = [
        {"text": "ACCELA", "confidence": .9, "zone": "title"},
        {"text": "Accelerator", "confidence": .9, "zone": "title"},
        {"text": "ADD-ON", "confidence": .9, "zone": "attachment"},
        {"text": "pawn", "confidence": .9, "zone": "attachment"},
        {"text": "cost 3", "confidence": .9, "zone": "attachment"},
        {"text": "2d6 stealth", "confidence": .9, "zone": "action-strip"},
        {"text": "delete", "confidence": .9, "zone": "action-strip"},
        {"text": "Custom printed effect", "confidence": .9, "zone": "main-text"},
    ]
    proposal = cards.card_proposals(regions, [{"kind": "ability-badge", "removed": False}])
    assert proposal["titleCandidate"] == "ACCELA Accelerator"
    assert proposal["attach"]["type"] == "add-on"
    assert proposal["attach"]["grantsCount"] == 1
    assert proposal["costCandidate"] == 3
    assert proposal["movements"] == [{"type": "2d6", "stealth": True}]
    assert proposal["activates"] == ["delete"]
    candidates = {candidate["field"]: candidate for candidate in proposal["candidates"]}
    assert candidates["name"]["zone"] == "title"
    assert candidates["movements"]["zone"] == "rule-text"
    assert candidates["attach"]["reason"]
