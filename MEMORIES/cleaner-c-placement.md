---
title: Cleaner C reuses controlled placement
type: decision
---
Cleaner (C) places its one pawn and takes its one control card through the existing place-controlled-pawn handler. H2 and h4 are normal spaces. H3 is hand-size −1. H7 is unshielded defense face 2. Arrows run only from face 2 into the upper-left space and from the hand into the right space. Own ICE is a white 6 at V6, category high, with one bonus fragment at V1. The pawn is classless, with card-activated movement, two-skull card Delete, Add-on/Weapon/Armor slots, and defense shielded 1–2 / unshielded 3–6. See SR-BOARD-025 and SR-PAWN-012.

**Why:** The printed instruction and the Spanish control-card line are the same capture handler already used by Cleaner A. The in-space white die is defense, and the corner die is high ICE, so no new mechanic is required.

**How to apply:** Keep the record non-provisional. Review the next crop with `python -m hexvision brief --tile <asset-id>` before promoting geometry. Its delivery protocol was v24/cleaner-c. Current source protocol/checksum is v25/cleaner-d. The next printed tile is Freeside. No official mode is accepted.
