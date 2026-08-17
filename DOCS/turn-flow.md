# Turn flow

Each turn belongs to one player and runs four phases in order. The engine models
this as an explicit phase machine; players interact only during the action
phase, by submitting actions.

```
        ┌──────────────┐
        │  BEGINNING   │  • resolve "at beginning of turn" effects (planned)
        │              │  • remove all of this player's start-of-turn markers
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │   ACTION      │  • move pawns you control
        │              │  • activate pawn abilities (search/delete/reboot/icebreaker)
        │              │  • attach action cards (to pawn/enemy/block)
        │              │  • place control markers (via Icebreaker / mission rewards)
        │              │  played cards stay face-up until recycle
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │   RECYCLE     │  • optionally keep unused cards
        │              │  • discard cards used this turn
        │              │  • draw up to max hand size (default 5)
        │              │  • discard one action card per pawn you control
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │     END       │  • check win (all control markers placed?)
        │              │  • pass to next player (to the left)
        └──────────────┘
```

## Win check

Evaluated at end of turn (and defensively after any control-marker placement): a
player who has placed all their control markers wins immediately.

## Abilities (how they activate)

- **Search** — discard 1 action card → place a new block in the Cybernet.
- **Delete** — play a Delete card → attack roll (1 d6 per skull) vs a co-located
  pawn/threat; match an unshielded defense die → eliminate.
- **Reboot** — discard 4 action cards → return an eliminated pawn to the Central
  Core.
- **Icebreaker** — play an Icebreaker card → roll d6; match the target's ICE
  value → gain control of that block/pawn (and place a control marker on a
  block). Failing against **Black ICE** eliminates your pawn.

Abilities may instead be `once-per-turn` free actions (marked spent with a
start-of-turn marker) or `none` (cannot be activated). Modifiers (extra skulls,
ICE/roll modifiers, movement steps) are cumulative.

## Movement

Activated by cards (`card`) or once per turn free (`once-per-turn`). Types:
fixed `steps`, `d6`, `2d6`, or `hex` (a whole block, ignoring space modifiers).
A pawn may pass through occupied spaces but may only *end* on a space with free
capacity (double/special/pawn spaces allow sharing). Steps not used are lost;
no other action may interleave between steps of one movement.

## Current implementation boundary

Both mirrors implement the phase machine, marker clearing, hand refill,
control-marker placement and win detection, along with legal block placement,
Search/Delete/Reboot/Icebreaker resolution, attachment targets, and the unified
action reducer. Step budgets and whole-hex movement also resolve
deterministically.

Space-to-space step traversal, bonus-icon economy, applied attachment effects,
exact per-component ICE faces, and the Shadowraiders rules remain incomplete.
Their live status and dependencies belong in `tasks/BACKLOG.md` and
`DOCS/parity.md`.
