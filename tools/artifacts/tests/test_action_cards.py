from PIL import Image, ImageDraw

from tools.artifacts.__main__ import CORE_ARTIFACTS
from tools.artifacts.pipeline import detect_crops, detected_assets


def test_core_refresh_contains_both_english_action_card_decks():
    assert "sp-en-action-cards" in CORE_ARTIFACTS
    assert "sh-en-action-cards" in CORE_ARTIFACTS


def test_regular_action_card_sheet_yields_nine_named_assets():
    image = Image.new("RGB", (600, 900), "white")
    draw = ImageDraw.Draw(image)
    for y in (25, 320, 615):
        for x in (25, 220, 415):
            draw.rectangle((x, y, x + 150, y + 230), fill="#102030")
    assets = detected_assets("sp-en-action-cards", 1, "action-card", detect_crops(image, min_size=30))
    assert len(assets) == 9
    assert assets[0].asset_id == "sp-en-action-cards-p01-c01"
    assert assets[-1].asset_id == "sp-en-action-cards-p01-c09"
