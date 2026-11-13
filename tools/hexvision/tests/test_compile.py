"""Block draft compiler: review records only, never canonical promotion."""

import json
import os

from hexvision.compile import compile_block_draft, draft_text, score_draft
from hexvision.__main__ import main

CASES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures", "block-draft-cases.json")


def _load():
    with open(CASES, encoding="utf-8") as handle:
        return json.load(handle)


def test_compile_cases_match_the_shared_fixture():
    for case in _load()["cases"]:
        draft = compile_block_draft(case["tile"], case.get("samples"))
        for key, value in case["draft"].items():
            assert draft[key] == value, case["name"]
        assert "effects" not in draft
        assert all("pawnId" not in space for space in draft["spaces"])
        assert draft_text(draft).startswith("review draft; this does not promote block data")


def test_score_reports_agreement_and_a_miss_without_promoting():
    document = _load()
    case = next(item for item in document["cases"] if item["name"] == document["score"]["case"])
    draft = compile_block_draft(case["tile"], case.get("samples"))
    report = score_draft(draft, document["score"]["block"])
    assert report == document["score"]["expect"]
    missed = json.loads(json.dumps(document["score"]["block"]))
    missed["spaces"][1]["modifier"]["amount"] = 1
    assert score_draft(draft, missed)["fields"]["handSize"] == "miss"
    assert score_draft(draft, missed)["promoted"] is False


def test_compile_command_does_not_invent_a_missing_tile():
    assert main(["compile", "--tile", "missing-tile"]) == 2
