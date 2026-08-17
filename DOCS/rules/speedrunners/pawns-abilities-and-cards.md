# Speedrunners rules — pawns, abilities, and cards

## SR-PAWN-001 — Pawn state and control

- **Source:** `sp-en-rulebook` — pp. 4–8, “Pawns” and “Control cards”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** A pawn combines a board piece and control-card attributes: defense,
  movement, abilities, classes, optional ICE, slots, and special text. Gaining
  an uncontrolled pawn takes its card; taking an enemy pawn discards its
  attachments. Rebooted pawns return at the Central Core.

## SR-ABILITY-001 — Ability activation

- **Source:** `sp-en-rulebook` — pp. 7–9, “Abilities”.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** An ability is card-activated, once per turn, or unavailable. A
  once-per-turn ability records its use with a start-of-turn marker; card
  activation requires a matching action-card use.

## SR-ABILITY-002 — Search, Delete, Reboot, and Icebreaker

- **Source:** `sp-en-rulebook` — pp. 7–9, “Search”, “Delete”, “Reboot”, and “Icebreaker”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Search discards one card to place a block; Delete rolls one d6 per
  skull against unshielded defense; Reboot discards four cards to return an
  eliminated pawn; and Icebreaker rolls against target ICE to gain control.
  A failed Black-ICE Icebreaker eliminates the attacker. Area effects and exact
  per-component ICE faces remain pending transcription.

## SR-CARD-001 — One chosen action-card use

- **Source:** `sp-en-rulebook` — pp. 8–9, “Action cards”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Each action card supplies one chosen use only: card movement,
  matching ability activation, attachment, Search discard, or participation in
  a four-card Reboot discard. All other uses of that played card are void.

## SR-CARD-002 — Attachments and costs

- **Source:** `sp-en-rulebook` — pp. 8–9, “Attach”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Cards may attach to a valid own pawn, enemy slot, or ICE-bearing
  block side. Slot and class restrictions apply; costs are paid with bonus
  counters placed on the card and returned to their owner when the attachment is
  discarded, lost, or its target changes control.

## SR-CARD-003 — Counters and open classes

- **Source:** `sp-en-rulebook` — pp. 4–9, counters and card symbology.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Control markers claim blocks and determine victory, bonus counters
  pay card costs, and start-of-turn markers track once-per-turn use. Pawn class
  symbols are data-driven open strings rather than an engine-closed enum.
