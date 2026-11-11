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
- **Reboot** — play one matching Reboot card, or discard four cards, to return
  an eliminated pawn to the Central Core.
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

Space-to-space traversal, bonus economy, and the current attachment effect
subset execute in both mirrors. Live clients require active-player pawn
ownership and paid card activation, roll back rejected actions including RNG,
and freeze after immediate victory. Live recycling chooses unused physical
copies, flushes the played zone, and refills the hand. Broader beginning/ending
effects, exact source-complete ICE faces, missions and full expansion modes
remain incomplete. Local quick matches use the explicit provisional profile
in [ADR-0005](adr/0005-local-quick-match.md).
Their live status and dependencies belong in `tasks/BACKLOG.md` and
`DOCS/parity.md`.

Combat may span actions: `roll-delete` pays and reveals dice, `assign-delete`
selects targets after seeing those dice, and awakened threats offer a response
before `assign-threat-attack` distributes their fixed faces. Unresolved combat
blocks phase advances. Threats recover at the beginning of every player turn.


A beginning-effect choice retains the beginning phase until the response completes. If an explicitly normal-movement effect opens threat combat, only response/assignment commands run before the phase resumes. Its paid cards remain face up through ordinary recycling; marker/threat reset waits until all supported pending work finishes. Canonical Jetpack's threat reading remains unresolved under SR-TURN-007.


An elimination-replacement decision may name a defending controller as responder during another player's turn. Only that typed response bypasses active-player authority. Public dice/assignments are already paid; resolving protection never repeats them. Beginning-phase combat waits through the replacement choice before marker/threat reset. The first handler is Dummy; broader reactions and unresolved sacrifice/simultaneous cases remain partial.

Source Search is a normal action with an explicit pending placement window. It discards one selected physical card or spends its supported free-use marker, draws/reveals the top block, and waits for its controller's `resolve-choice` response. Other actions and phase changes reject until placement finishes. A rejected placement preserves the already accepted activation and the same drawn block. Legal placement creates bonus geometry before running supported placement effects and deploying threats. Repeated paid Search needs a new cost and draws a new block; no pawn movement is required. The old synchronous helper remains limited to explicit frozen regression fixtures. See SR-BOARD-005 and ADR-0010.

Source die movement now uses `roll-movement` followed by an authorized `move-path` choice. Commit the selected free use/card and reveal dice first; then choose a path under that fixed allowance or stop without moving. Rejected responses cannot undo or reroll the accepted activation. Occupancy, arrows, entry/cancellation restrictions and threat stopping remain enforced. Resolve the choice before threat combat or any ordinary action/phase advance. Source v4 and shared pending snapshots/events implement this; frozen regression keeps combined movement. See SR-MOVE-003 and ADR-0011. Physical marker transfer/attachment identity is implemented under T-RULES-019; discarded-card lifetime/copy reuse remains T-RULES-021.

SR-TURN-008 now supplies a pure current hand-size profile at recycling: base plus active attachment and stopped controlled-pawn space amounts, with a nonnegative maximum. Moving onto a hand space changes the current limit, not the hand immediately; leaving or changing controller recomputes it. Source views/sandbox expose the breakdown. Black Clinic's pending block-detach choice must finish before ordinary actions/phases; its cleanup may remove continuous hand benefits or reveal without changing pawn control. Source protocol v16 keeps frozen regression explicit.
