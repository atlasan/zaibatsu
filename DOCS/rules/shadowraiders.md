# Rules digest — Zaibatsu Shadowraiders (expansion)

Distilled from `ShadowRaiders/…/Sh 09 Rulebook (2017-06-28) (en).pdf` (v2.0).
Shadowraiders is an **expansion to Speedrunners** — all base rules apply; this
digest covers only what's new. Read `speedrunners.md` first.

Tracked page-level transcripts live in:

- `DOCS/rules/transcripts/shadowraiders-rulebook.en.md`
- `DOCS/rules/transcripts/shadowraiders-rulebook.es.md`
- `DOCS/rules/transcripts/shadowraiders-components.en.md`
- `DOCS/rules/transcripts/shadowraiders-components.es.md`

## What the expansion adds
- **Threats** — anything with an *attack die*: drone threats, threat tokens,
  mark threats (from missions), and Chaos. Attack dice are *fixed* values
  (4, 5, or 6). If an attack die matches a pawn's **unshielded** defense die,
  the pawn is defeated.
- **Threat tokens** replace bonus counters in Shadowraiders (interchangeable in
  Total War). Drawn face-up onto **event spaces**; a token is inert until
  activated; once eliminated it may be collected and used as a bonus counter.
- **Event spaces** & **drone threat spaces** — new block space types.
- **Central Core 02** — a second core with a **direction die** for random
  directions.
- **Medals** — mission rewards; each medal lets you assign one control marker.
- **Mission cards** — attach to a **mission slot**; track state via tags.
- **Stealth movement** — move through a block without waking its threats.
- **Black ICE on pawns**, **mercenary pawns** (bonus-counter cost to recruit).

## Components (added)
24 information blocks (23 + Central Core 02) · 24 threat tokens · 18 control
cards · 54 action cards · 16 pawns · 32 control markers · 16 start-of-turn
markers. Plus dice.

## New pawn attributes
- **Mission slot** — lets a pawn attach a mission card.
- **Hand-size modifier** — ± max hand size.
- **Black ICE value** — Icebreaking such a pawn: failure eliminates the attacker.
- **Stealth movement ability** — card-activated or once-per-turn; step counts
  like normal movement (`steps`/`1d6`/`2d6`) but ignores threats. Modifiers add
  stealth steps. A "cannot stealth" symbol blocks all stealth (normal move OK).
- **Defense-dice modifiers / ICE double-modifiers** on cards/spaces.

## Threats & combat
- **Activating a threat**: when a pawn moves into/within the threat's block, or a
  pawn uses Delete there.
- **Attack die**: fixed 4/5/6. Match unshielded defense die ⇒ pawn defeated.
- **Combat vs a threat**: pawn assigns Delete → roll d6 per skull. Match the
  drone's *unshielded* defense die ⇒ threat deactivated before it strikes; match
  a *shielded* die ⇒ attack fails and the threat activates its attack die.
- **Multiple threats**: a pawn with several skulls makes one roll and splits dice
  across targets; surviving active threats strike back. Multiple co-located pawns
  with skulls can combine.
- **Eliminating a drone threat / threat token**: place a start-of-turn marker on
  the space; at each player's beginning phase all such markers are removed and
  those threats return to inactive. A cleared threat token (no other threats in
  the block) may be **collected** as a bonus counter.
- **Stealth example**: a stealth step enters a threat block without activating;
  taking a *normal* step there activates the threat's attack die and ends
  movement (remaining steps lost).

## Mission cards
Attach to a pawn's mission slot during your action phase. Types & tags:
- **Mark tag** — a hostile target (a *Mark* threat with attack/defense dice and
  maybe a class). Activate by moving to the specified block; eliminate the Mark
  (and possibly all other threats there) to complete.
- **Cargo tag** — escort a companion/object: activate at the source block, then
  end movement at the destination block. Cargo grants the pawn attributes/class
  while active.
- **Counter tags** (e.g. "Terminator") — track turns / eliminations; slide the
  card so the current tag aligns with the mission slot; choose to collect the
  reward or continue for a bigger one.
- **Missions with cost** — pay bonus counters to attach; returned when completed
  or discarded.
- **Location-based** — assignable anywhere but only activate on the named block.
- **Rewards**: **medals** (place that many control markers on the mission card)
  or **control of a pawn** (also place the pawn on its pawn space).
- If the carrier pawn is deleted, attached mission cards are discarded (no
  reward); returned costs go back to owner.

## Game modes
Each mode declares: player count, play time, required components, and win/lose
conditions. Model a mode as *config + setup recipe + end-condition set* over the
shared core.

### Shadowraiders mode (2–4p, 60–120m)
Uses only Shadowraiders components. Each player is a **Shadowraider** (has a
mission slot) with 8 control markers. Threat tokens seeded onto event spaces.
**New beginning-of-turn step:** remove all start-of-turn markers from the
Cybernet. Each assigned control marker earns a medal. **Win:** first to assign
all control markers to blocks and/or mission cards.

### Chaos mode (solo)
Player vs the **Chaos** AI (a special pawn + *megacard*). Player has **6** control
markers; win by placing all 6 on blocks/missions. Chaos:
- **Moves** to a random block each of 5 card-flips (direction die), ignoring
  spaces, even onto face-down blocks; off-Cybernet ⇒ Central Core.
- Has 3 abilities fired one per card flip: **Icebreaker** (takes the block it
  occupies except Central Core; place an **outbreak marker**; outbreak markers
  count as control markers), **Delete** (attacks all player pawns in its block
  with 4 skulls — blocked while a token sits in its "C" Black-ICE space),
  **Reboot** (re-seed the block's event spaces with new threat tokens and re-fire
  its in-Cybernet effect).
- **Megacard**: 4 defense-dice sections, each a separate target tied to a Black
  ICE space (A/B attack die, C skull, D movement). Eliminating a section draws a
  **Black ICE token** onto that space — disabling that attribute and opening a
  random ICE vulnerability. With ≥1 Black ICE token, a pawn may Icebreak Chaos
  (fail ⇒ eliminated). Gaining control of Chaos = **6 medals** instantly.
- Recycle: deal Chaos 5 face-down cards; remove one Black ICE token (A→B→C→D).

### Outbreak mode (solo, 60m)
Uses Speedrunners components + Central Core 02, 6 Black ICE tokens, 6 outbreak
markers (23 blocks; original Central Core unused). One Speedrunner, **6** control
markers. Outbreak markers start at the 6 Cybernet edges. Player turn plays like
Chaos mode. **Outbreak turn:** reveal its 5-card hand; for each **Icebreaker**
card roll a die; per die result advance one outbreak marker one block toward
Central Core 02 (ignores face-up/down & spaces; Delete/Reboot cards ignored). An
outbreak marker landing on a controlled block removes your control there;
reaching **Central Core 02 ⇒ you lose**. Push back by controlling a block with an
outbreak marker and returning that marker to its starting edge. **Win:** place
all your control markers.

### Total War mode (2–8p)
Uses **both** games' components together (blocks/cards separable later by the
expansion symbol). Threat tokens and bonus counters are **interchangeable**.
Control markers by player count: **2–4p → 8**, **5–8p → 6**. Each player draws
from the shuffled 4 Speedrunner + 4 Shadowraider control cards. Two cores
(Central Core + Central Core 02) placed on opposite sides; Speedrunners start on
Central Core, Shadowraiders on Central Core 02. **Table-space rule:** Search may
only place a block if it physically fits (no running off the table / into
components). **Win:** first to assign all control markers to blocks and/or
missions.

**Alternate rule sets:**
- *Strategic Alliance* (2–4p): 8 markers/player; each player uses a Speedrunner
  **and** a Shadowraider.
- *Cyber-Revolution* (2/4/6/8): two equal teams, 8 markers/team; one team runs
  Speedrunners, the other Shadowraiders.
- *Total War – Chaos* (1–8p): normal Total War plus Chaos takes a turn after each
  player (extra face-down blocks in the starting layout).

## Symbology added
Attack dice (fixed 4/5/6), defense-dice modifiers, ICE double-modifiers,
direction dice, event-space indicator, pawn Black ICE value, stealth movement
symbols, medal rewards (1/2/3/6), "gain control of Deviser A–D".
