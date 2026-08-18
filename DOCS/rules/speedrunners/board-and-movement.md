# Speedrunners rules — board and movement

## SR-BOARD-001 — Information blocks and spaces

- **Source:** `sp-en-rulebook` — pp. 4–5, “Information blocks”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Information blocks form the Cybernet and may have placement/control
  effects, ICE, spaces, movement arrows, modifiers, and bonus fragments. Space
  capacity controls where pawns may end; special and pawn spaces are unlimited.

## SR-BOARD-002 — Search placement

- **Source:** `sp-en-rulebook` — pp. 7–8, “Search”.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Search draws the next block and places it in an empty adjacent hex
  to the searching pawn's reference block, rotated so the two joining edges both
  expose a space. The block is consumed only after a legal placement.

## SR-BOARD-003 — Bonus icons

- **Source:** `sp-en-rulebook` — pp. 4–5, “Bonus counters”.
- **Applies to:** Speedrunners.
- **Maturity:** planned.
- **Rule:** Three matching bonus fragments at a shared block corner form a bonus
  icon. Its counter is collected by the player controlling all three blocks.

## SR-MOVE-001 — Movement activation and budget

- **Source:** `sp-en-rulebook` — pp. 7–8, “Movement”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Movement is card-activated or once per turn, uses fixed steps, one
  die, two dice, or one whole hex, and combines applicable modifiers. Card
  movement uses the printed card budget and consumes the selected card use;
  once-per-turn movement uses a spent marker.

## SR-MOVE-002 — Movement execution

- **Source:** `sp-en-rulebook` — pp. 7–8, “Movement”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** A pawn may pass occupied spaces but may end only where capacity
  permits; unused steps are lost and no other action interleaves with a move.
  Hex movement moves one whole block and ignores space modifiers. The engine
  executes `steps`/`d6`/`2d6` paths through encoded intra-block links and
  rotation-aware boundary-space hops; each provisional adjacency record remains
  subject to source review.
