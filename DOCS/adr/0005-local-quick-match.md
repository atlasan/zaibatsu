# ADR-0005: Playable local quick match over the current content

- Status: accepted
- Date: 2026-10-14
- Related: [sandbox workstream](../web-sandbox-plan.md), [parity](../parity.md), [backlog](../../tasks/BACKLOG.md), [mode data](../../spec/data/speedrunners/modes.json)

## Context

The current executable corpus contains seven non-core blocks. Official
Speedrunners allocates ten control markers at two players and eight at three,
so those matches cannot reach victory. A free marker-placement debug action
previously bypassed board control. The requested delivery is a local playable
match with movement, actions, cards, and an earned victory.

## Decision

Provide an explicitly experimental four-marker quick-match profile in shared
mode data, marked `provisional: true`. Both mirrors load it through mode
selection; the official default keeps its sourced 10/8/6 allotment. The local
play interface starts quick matches and retains separate labeled Test Lab
fixtures. It must explain that component transcription and some printed
effects/recycle obligations remain incomplete.

Live actions require active-player pawn ownership and the appropriate free or
card activation. Free marker placement and client-supplied combat modifiers
are rejected. Rejections restore all state including the RNG stream, and a
declared winner freezes live actions and phase transitions. Low-level reducer
utilities retain compatibility for existing fixtures and demos.

## Consequences

The current corpus supports complete local matches without inventing physical
components or changing official Speedrunners. Browser handoff, card and board
selection, replay saves, and real-control golden matches can be tested now.
Four markers is a local balance choice, not a primary-source rule. Full
Speedrunners acceptance remains gated on complete source content and mechanics.

## Alternatives considered

Waiting for the entire component corpus postpones playable match validation.
Duplicating provisional blocks invents physical inventory. Changing the
official marker allotment misrepresents the source. Keeping the free marker
shortcut allows wins unrelated to gameplay.
