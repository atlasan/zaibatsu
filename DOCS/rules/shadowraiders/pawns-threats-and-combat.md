# Shadowraiders rules — pawns, threats, and combat

## SH-PAWN-001 — Stealth and pawn modifiers

- **Source:** `sh-en-rulebook` — pp. 10–11 and 20–22, “Stealth movement” and threat activation.
- **Applies to:** Shadowraiders.
- **Maturity:** partial.
- **Rule:** Stealth movement uses normal step budgets but does not wake threats;
  a cannot-stealth symbol forbids it. Normal movement into a threat block wakes
  threats and stops the movement for a combat response window.

## SH-THREAT-001 — Threat activation and attack dice

- **Source:** `sh-en-rulebook` — pp. 20–25, “Threats” and attack allocation.
- **Applies to:** Shadowraiders.
- **Maturity:** partial.
- **Rule:** Normal movement into or within a block, or activating Delete there,
  wakes its surviving threats. Its fixed attack die defeats a pawn when it matches an
  unshielded defense die.

## SH-THREAT-002 — Delete against threats and recovery

- **Source:** `sh-en-rulebook` — pp. 21–24, threat recovery, collection and combat.
- **Applies to:** Shadowraiders.
- **Maturity:** partial.
- **Rule:** Delete dice may be assigned across threats; unshielded matches
  deactivate a target before it attacks, while shielded matches fail and permit
  its strike. Defeated threats recover after the specified marker-clearing step;
  an eliminated token may become a bonus counter during the action phase
  when every other threat in its block has been defeated.

Both mirrors now implement a response window, public rolls before assignments,
concentrated dice, joint attacks, fixed retaliation, priority to controlled
pawns and then attackers, beginning-of-every-turn recovery, and defeated-token
collection. The Guard profile is directly transcribed from p.21. Full drone/token
content, cannot-stealth modifiers, mission Marks and Chaos remain open.

Interpretation: “no other threats” for collection excludes other temporarily
eliminated threats; it requires every surviving threat in the block to be cleared.
Assignments resolve simultaneously from pre-elimination defenses. Dice targeting
other players are allowed only after every eligible own pawn receives a die.

## SH-THREAT-003 — Joint attacks activate one initiator

- **Source:** `sh-en-rulebook` — p.24, joint-attack illustration; cross-check `sh-es-rulebook`, p.24.
- **Applies to:** Shadowraiders.
- **Maturity:** implemented.
- **Rule:** In a block with threats, activate Delete on one controlled pawn to initiate the joint attack. Controlled pawns in that block contribute their printed skulls to the single roll, including strength-only contributors. Payment and a free-use marker belong only to the initiator's selected activation. Then assign the public die faces as in ordinary threat combat.

Source-mode joint attack queries now account for typed attachment contributions. A participating pawn need not acquire an activation merely to contribute skulls: it is not independently initiating Delete. Cancelling an initiator's ability prevents initiation, without erasing printed skull values on other contributors. This implements the p.24 instruction to activate one pawn, rather than paying or marking every participant. Frozen fixtures retain their old execution explicitly. Full Shadowraiders composition/setup, missions and victory remain open; this rule does not certify a complete mode replay.
