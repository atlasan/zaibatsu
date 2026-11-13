---
title: Cleaner D reuses controlled placement
type: decision
---
Cleaner (D) places its one pawn and takes its one control card through the existing place-controlled-pawn handler. H2 and h4 are normal spaces. H3 adds one attack skull. H7 is unshielded defense face 1. Arrows run only from the skull space into the upper-left space and from the home into the right space. Own ICE is a white 6 at V2, category high. Bonus fragments are at V1, V3, V5 and V6; the corner die is not a fragment. The pawn is classless, with card-activated movement, one-skull card Delete, Add-on/Weapon/Armor slots, and defense shielded 1–3 / unshielded 4–6. See SR-BOARD-026 and SR-PAWN-013.

**Why:** The printed instruction and the Spanish control-card line are the same capture handler already used by Cleaner C. The in-space white die is defense, and the skull icon is the existing attack-space modifier, so no new mechanic is required.

**How to apply:** Keep the record non-provisional. Review the next crop with `python -m hexvision brief --tile <asset-id>`. Current source protocol/checksum is v25/cleaner-d. The next printed tile is Freeside. No official mode is accepted.
