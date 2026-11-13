"""Compile a HexVision tile into a review block draft.

The draft uses the same fields the engines load: edges, bonus corners, spaces,
defense dice, hand size, arrows, excluded art, and a pawn home. Flat square
dice are defense faces, not block ICE. Exact ICE faces stay unread. Nothing
here writes spec/data or clears provisional review.
"""

from __future__ import annotations

ZONES = ("h1", "h2", "h3", "h4", "h5", "h6", "h7")
EXCLUDED_WHITE_MAX = 0.15


def _zones(values) -> list[str]:
    if not isinstance(values, list):
        return []
    seen: list[str] = []
    for item in values:
        if item in ZONES and item not in seen:
            seen.append(item)
    seen.sort(key=ZONES.index)
    return seen


def _bool6(values) -> list[bool] | None:
    if isinstance(values, list) and len(values) == 6 and all(isinstance(item, bool) for item in values):
        return list(values)
    return None


def _die(value, shielded) -> dict | None:
    if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 6:
        return {"value": value, "shielded": bool(shielded)}
    return None


def compile_block_draft(tile: dict, samples: list[dict] | None = None) -> dict:
    """Return a provisional block-shaped draft. promoted is always false."""
    unresolved: list[str] = []
    edges = _bool6(tile.get("edges"))
    if edges is None:
        edges = [False, False, False, False, False, False]
        unresolved.append("edges were not read")

    ice = tile.get("iceCorner") if isinstance(tile.get("iceCorner"), dict) else None
    bonus = _bool6(tile.get("bonusCorners"))
    if bonus is None:
        bonus = _bool6(tile.get("whiteCorners"))
        if bonus is not None and ice and isinstance(ice.get("corner"), int) and 0 <= ice["corner"] <= 5:
            bonus = list(bonus)
            bonus[ice["corner"]] = False
    if bonus is None:
        bonus = [False, False, False, False, False, False]
        unresolved.append("bonus corners were not read")

    black = bool(ice and ice.get("black"))
    dice_count = ice.get("dice") if ice else None
    if black:
        ice_value = "black"
    elif dice_count == 1:
        ice_value = "high"
    elif dice_count == 2:
        ice_value = "medium"
    elif dice_count == 3:
        ice_value = "low"
    else:
        ice_value = "none"
        if ice:
            unresolved.append("ICE corner die count was not 1, 2, or 3")
    if ice and ice_value != "none":
        unresolved.append("ICE corner count is a category hint; exact faces stay unread")

    claimed: set[str] = set()
    spaces: list[dict] = []
    for candidate in tile.get("spaces") or []:
        if not isinstance(candidate, dict):
            unresolved.append("incomplete zone proposal left unresolved")
            continue
        zones = _zones(candidate.get("suggestedZoneIds"))
        if not zones:
            unresolved.append("incomplete zone proposal left unresolved")
            continue
        if any(zone in claimed for zone in zones):
            unresolved.append("overlapping zone proposal left unresolved")
            continue
        claimed.update(zones)
        kind = candidate.get("kind")
        pawn = bool(candidate.get("pawnHome"))
        spaces.append({
            "id": "-".join(zones),
            "type": "pawn" if pawn else "normal",
            "zoneIds": zones,
            "capacity": "unlimited" if pawn else len(zones),
            "displayShape": kind if kind in ("circle", "capsule", "compound") else "auto",
            "neighbors": [],
        })

    symbols = tile.get("symbols") if isinstance(tile.get("symbols"), dict) else {}
    for home in symbols.get("pawnHomes") or []:
        zones = _zones(home if isinstance(home, list) else [])
        match = next((space for space in spaces if space["zoneIds"] == zones), None)
        if match is None:
            unresolved.append(f"pawn home {'-'.join(zones) if zones else '(empty)'} is not one detected space")
            continue
        match["type"] = "pawn"
        match["capacity"] = "unlimited"

    defense: dict[str, list[dict]] = {}
    unclassified = False
    for die in tile.get("iceDiceCandidates") or []:
        if not isinstance(die, dict):
            unclassified = True
            continue
        parsed = _die(die.get("face"), die.get("shielded"))
        if die.get("role") == "modifier" and die.get("zone") in ZONES and parsed:
            defense.setdefault(die["zone"], []).append(parsed)
        elif die.get("role") == "difficulty":
            continue
        else:
            unclassified = True
    for mark in symbols.get("defense") or []:
        if not isinstance(mark, dict):
            unresolved.append("defense mark was not a face on a placement zone")
            continue
        parsed = _die(mark.get("value"), mark.get("shielded"))
        if mark.get("zone") in ZONES and parsed:
            defense.setdefault(mark["zone"], [])
            defense[mark["zone"]] = [item for item in defense[mark["zone"]] if item["value"] != parsed["value"]]
            defense[mark["zone"]].append(parsed)
        else:
            unresolved.append("defense mark was not a face on a placement zone")

    hand: dict[str, int] = {}
    for mark in symbols.get("handSize") or []:
        if not isinstance(mark, dict):
            unresolved.append("hand-size mark was not a nonzero integer on a placement zone")
            continue
        amount = mark.get("amount")
        if mark.get("zone") in ZONES and isinstance(amount, int) and not isinstance(amount, bool) and amount != 0:
            hand[mark["zone"]] = amount
        else:
            unresolved.append("hand-size mark was not a nonzero integer on a placement zone")

    for space in spaces:
        defense_zones = [zone for zone in space["zoneIds"] if zone in defense]
        hand_zones = [zone for zone in space["zoneIds"] if zone in hand]
        if defense_zones and hand_zones:
            unresolved.append(f"{space['id']} has both a defense die and a hand-size mark; neither was applied")
            continue
        if defense_zones:
            dice = [item for zone in defense_zones for item in defense[zone]]
            dice.sort(key=lambda item: (item["value"], item["shielded"]))
            space["modifier"] = {"kind": "defense", "dice": dice}
        elif hand_zones:
            amounts = {hand[zone] for zone in hand_zones}
            if len(amounts) > 1:
                unresolved.append(f"{space['id']} has conflicting hand-size marks; neither was applied")
            else:
                space["modifier"] = {"kind": "hand-size", "amount": hand[hand_zones[0]]}
    if unclassified:
        unresolved.append("unclassified flat dice were not copied into ICE faces")

    sample_list = samples if samples is not None else tile.get("zoneSamples") or []
    excluded: list[str] = []
    for sample in sample_list:
        if not isinstance(sample, dict):
            continue
        zone = sample.get("zone")
        fraction = sample.get("whiteFraction")
        if zone in ZONES and zone not in claimed and isinstance(fraction, (int, float)) and not isinstance(fraction, bool) and fraction <= EXCLUDED_WHITE_MAX and zone not in excluded:
            excluded.append(zone)
    excluded.sort(key=ZONES.index)

    by_zone = {zone: space["id"] for space in spaces for zone in space["zoneIds"]}
    arrows: list[dict] = []
    for mark in symbols.get("arrows") or []:
        if not isinstance(mark, dict):
            unresolved.append("arrow from None to None references a zone with no space")
            continue
        source, dest = mark.get("from"), mark.get("to")
        if source not in by_zone or dest not in by_zone:
            unresolved.append(f"arrow from {source} to {dest} references a zone with no space")
            continue
        if by_zone[source] == by_zone[dest]:
            unresolved.append(f"arrow from {source} to {dest} stays inside one space")
            continue
        item = {"from": by_zone[source], "to": by_zone[dest]}
        if item not in arrows:
            arrows.append(item)

    return {
        "asset": tile.get("asset"),
        "reviewRequired": True,
        "promoted": False,
        "edges": edges,
        "bonusCorners": bonus,
        "bonusFragments": sum(1 for flag in bonus if flag),
        "iceValue": ice_value,
        "blackIce": black,
        "iceFaces": [],
        "nonPlayableZoneIds": excluded,
        "spaces": spaces,
        "spaceArrows": arrows,
        "unresolved": unresolved,
    }


def draft_text(draft: dict) -> str:
    """One-screen summary of a review draft."""
    spaces = "; ".join(
        f"{space['id']} {space['type']}" + (f" {space['modifier']['kind']}" if space.get("modifier") else "")
        for space in draft["spaces"]
    ) or "none"
    notes = "; ".join(draft["unresolved"]) or "none"
    excluded = " ".join(draft["nonPlayableZoneIds"]) or "none"
    return "\n".join([
        "review draft; this does not promote block data",
        f"ice {draft['iceValue']} black {draft['blackIce']} faces unread",
        f"bonus {draft['bonusFragments']}",
        f"excluded {excluded}",
        f"spaces {spaces}",
        f"arrows {len(draft['spaceArrows'])}",
        f"unresolved {notes}",
    ])


def _modifier_rows(spaces: list[dict], kind: str) -> list[dict]:
    rows = []
    for space in spaces:
        modifier = space.get("modifier") or {}
        if modifier.get("kind") != kind:
            continue
        if kind == "defense":
            dice = sorted(modifier.get("dice") or [], key=lambda item: (item["value"], item["shielded"]))
            rows.append({"zones": list(space.get("zoneIds") or []), "dice": dice})
        else:
            rows.append({"zones": list(space.get("zoneIds") or []), "amount": modifier.get("amount")})
    rows.sort(key=lambda row: tuple(row["zones"]))
    return rows


def _arrow_pairs(arrows: list[dict], spaces: list[dict]) -> list[dict]:
    zones = {space.get("id"): list(space.get("zoneIds") or []) for space in spaces}
    pairs = []
    for arrow in arrows or []:
        source, dest = zones.get(arrow.get("from")), zones.get(arrow.get("to"))
        if source and dest:
            pairs.append({"from": source, "to": dest})
    pairs.sort(key=lambda pair: (tuple(pair["from"]), tuple(pair["to"])))
    return pairs


def _status(got, expected) -> str:
    return "match" if got == expected else "miss"


def score_draft(draft: dict, block: dict) -> dict:
    """Compare a review draft with one canonical block. This never writes."""
    block_spaces = block.get("spaces") or []
    draft_spaces = draft.get("spaces") or []
    faces = draft.get("iceFaces") or []
    expected_faces = block.get("iceFaces") or []
    return {
        "blockId": block.get("id"),
        "asset": draft.get("asset"),
        "promoted": False,
        "fields": {
            "edges": _status(list(draft.get("edges") or []), list(block.get("edges") or [])),
            "bonusCorners": _status(list(draft.get("bonusCorners") or []), list(block.get("bonusCorners") or [])),
            "blackIce": _status(bool(draft.get("blackIce")), bool(block.get("blackIce"))),
            "iceValue": _status(draft.get("iceValue") or "none", block.get("iceValue") or "none"),
            "iceFaces": "unread" if not faces else _status(faces, expected_faces),
            "nonPlayable": _status(sorted(draft.get("nonPlayableZoneIds") or [], key=ZONES.index), sorted(block.get("nonPlayableZoneIds") or [], key=ZONES.index)),
            "defense": _status(_modifier_rows(draft_spaces, "defense"), _modifier_rows(block_spaces, "defense")),
            "handSize": _status(_modifier_rows(draft_spaces, "hand-size"), _modifier_rows(block_spaces, "hand-size")),
            "arrows": _status(_arrow_pairs(draft.get("spaceArrows") or [], draft_spaces), _arrow_pairs(block.get("spaceArrows") or [], block_spaces)),
            "pawnZones": _status(
                sorted([list(space.get("zoneIds") or []) for space in draft_spaces if space.get("type") == "pawn"], key=tuple),
                sorted([list(space.get("zoneIds") or []) for space in block_spaces if space.get("type") == "pawn"], key=tuple),
            ),
            "effects": "unread",
        },
    }
