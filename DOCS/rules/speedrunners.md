# Rules digest — Zaibatsu Speedrunners (base game)

Distilled from `SpeedRunners/…/Sp 09 Rulebook (2017-06-26) (en).pdf` (v2.0,
Froylan Rutiaga; EN translation Nick Hayes). This is a working digest for
implementation, not a replacement for the rulebook. Where the PDF is ambiguous
or its text extraction is lossy, the chosen interpretation is called out with
**⚠ interpretation**.

## Overview
2–4 players, 60–120 min. Each player is a Zaibatsu racing to dominate the
Cybernet. **Win:** be first to place *all* your control markers in the Cybernet.

## Components
- 24 information blocks (23 + Central Core), hexagonal tiles.
- 54 action cards (shared deck).
- 18 control cards (control of specific pawns or blocks).
- 16 pawn pieces.
- 40 control markers (10 per color × 4 colors).
- 24 bonus counters.
- 16 start-of-turn markers.
- Players supply six-sided dice.

## Setup
1. Each player draws one of the 4 Speedrunner control cards at random; takes the
   matching pawn and its control markers. Unused ones leave the game.
2. Control markers by player count: **2p→10, 3p→8, 4p→6**.
3. Central Core face-up center; each Speedrunner pawn starts on it.
4. Shuffle remaining blocks face-down (the block pile). Shuffle action cards
   (the deck). Place bonus counters, pawns, control cards, start-of-turn markers
   in reach.
5. Roll to pick the starting player; play proceeds left.
6. Opening deal (asymmetric, one-time): starting player fewest cards. **⚠
   interpretation:** transcribed as p1→3, p2→4, p3→5, p4→6 (the PDF's table text
   is lossy: it shows "3 / 4 / 5 …"). After turn 1, everyone draws to max (5).

## Turn phases
1. **Beginning** — resolve "at beginning of turn" card skills; remove all your
   start-of-turn markers.
2. **Action** — move pawns, activate abilities, attach cards. Played cards stay
   face-up in front of you until recycle.
3. **Recycle** — keep or discard unused cards; discard used cards; draw to max
   hand size (default 5); **discard one action card per pawn you control**.
4. **End** — play passes left. (Win is checked as soon as the last marker lands.)

## Zones
Cybernet · player control zones · shared action deck · discard pile · block pile
· common area (uncontrolled control cards) · reserve (unused pieces) · each
player's hidden hand.

## Information blocks
- **Effects**: *block-in-Cybernet* (fires on placement) and *block-under-control*
  (fires when a player gains control; re-fires on each change of control).
- **Spaces**: normal (1 pawn) · double (2) · special/large & pawn spaces (∞) ·
  effect spaces (controller chooses to activate or treat as normal) · modifier
  spaces (defense-dice / hand-size / attack).
- **ICE value**: low (3 dice) · medium (2) · high (1) · Black ICE (1 black die).
- **Direction arrows**: restrict movement direction across the block.
- **Bonus fragments**: corner thirds; three matching across adjacent blocks form
  a **bonus icon**, placing a bonus counter; collected by whoever controls all
  three blocks.

### Placing a block (Search)
Identify the reference block (the one the searching pawn occupies) → draw a block
→ place adjacent, in an empty hex slot, oriented so a spaced side connects to a
spaced side of the reference block. Completing a bonus icon places a bonus
counter. Fire the block-in-Cybernet effect.

## Pawns
Piece (position) + control card (attributes): defense dice (shielded/unshielded),
movement attribute, abilities, class-type(s), optional ICE value, attachment
slots (add-on/gadget/weapon/armor/module), optional special ability text.
- **Placing:** operative-class pawns enter via block effects; non-operative on
  their matching pawn space; rebooted pawns at the Central Core.
- **Gaining control:** free pawn → take its control card; enemy pawn → discard
  its attachments, take its card.
- **Eliminated:** with Reboot → piece to your control area on its card, discard
  attachments; without → piece to reserve, card to common area.

## Abilities
Activation symbols: **card** (play a matching action card) · **once-per-turn**
(free; mark spent with a start-of-turn marker) · **none** (cannot).
- **Search** — discard 1 action card → place a block. (Card-activated Search can
  repeat while you have cards to discard, without moving.)
- **Delete** — attack roll = 1 d6 per skull icon; match target's *unshielded*
  defense die → eliminate. Multiple skulls can split across targets in the block.
- **Reboot** — discard 4 action cards (any mix) → re-enter at Central Core.
- **Icebreaker** — roll d6; match a die in the target's ICE value → gain control
  (place a control marker on a controlled block). **Fail vs Black ICE →
  attacking pawn eliminated.** Modifiers add fixed ICE numbers or extra dice.

## Movement
Types: fixed steps · `1d6` · `2d6` · `HEX` (one whole block, ignoring spaces &
modifiers). Card-activated adds one card's steps per card; once-per-turn is a
free action. Modifiers add/subtract a step per activation; movement types stack.
Pass through occupied spaces but only end where capacity allows. Unused steps
lost; no interleaving actions mid-move.

## Action cards (multi-use)
One card, one chosen use per play, others void:
1. activate a **card-activated movement** (1–3 steps),
2. activate a **card-activated ability** (Reboot / Delete / Icebreaker),
3. **attach** to a game element (pawn / enemy / block),
4. discard to activate **Search**,
5. discard together with others to activate **Reboot**.

## Attaching cards
Targets: **block** (needs ICE value + a valid side) · **enemy** (needs matching
slot on the target) · **pawn** you control. Slots: add-on (top) · gadget (left,
Icebreaker) · weapon (right, Delete) · armor (bottom, replaces defense dice &
nullifies ICE) · module (drone-class). Some cards cost bonus counters (placed on
the card; returned to owner if discarded/lost). Attached cards can't be moved;
they discard when the slot is lost, the pawn changes control, or the pawn dies.

## Counters
- **Control markers** — claim tokens; placing all wins.
- **Bonus counters** — pay card costs; always returned to owner, never lost.
- **Start-of-turn markers** — mark once-per-turn abilities spent; cleared each
  beginning phase.

## Classes seen in base symbology
operative, drone, bot, lovedoll, cyborg, cyberdeck, malware, trade-secret,
explosive, brainchip, hazard, accelerator, e-synapse, bomb. (Data-driven — the
engine treats class as an open string set.)
