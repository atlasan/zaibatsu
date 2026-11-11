# ADR-0010: Search decisions and source protocol v3

- Status: accepted
- Date: 2026-10-17
- Related: [ADR-0009](0009-player-views-and-trusted-snapshots.md), [Search rule](../rules/speedrunners/board-and-movement.md#sr-board-005-search-activation-draw-and-placement-decision), [domain model](../domain-model.md), [backlog](../../tasks/BACKLOG.md)

## Context

English and Spanish rulebooks p.15 specify reference identification, top-block draw, placement, bonus detection and placement effects, in that order. Page 27 activates Search before this sequence. The combined historical action chose placement against a face-down tile and rolled its cost back on any placement failure. It also let placement previews disclose hidden topology.

## Decision

Source reducers interpret `search` / `play-search` as activation declarations. Public eligibility checks use the actor, hand/use marker, pile count and reference block's open connecting sides; they do not inspect the next tile. A valid declaration commits one physical card or its single supported free activation, draws the top block into `PendingChoice.kind: place-block`, and publishes `block-drawn` before requesting a response. The pending choice owns that physical block outside the pile and board.

Store the searching pawn, controller and reference coordinate with the drawn block. Engine-generated responses identify a legal direction and rotation with `optionId: place:<dir>:<rotation>`. Only the choice owner may respond; other actions and phase advances wait. Placement rejects atomically against the pending state, preserving the committed cost and revealed block. A valid response places that block, creates bonus geometry, dispatches supported placement effects and deploys threats on the newly placed block. It publishes `block-placed` and ordered resulting events. Unsupported effects reject explicitly; strict source construction rejects them before official play.

Expose the drawn block and reference publicly in `playerView.revealedBlock`; expose responses only to its authorized responder. Before declaration, all source action queries omit tile-dependent placement previews. The local sandbox consumes engine responses and previews the revealed block. Replay and undo preserve both windows independently.

Advance source state to `source-v3` and the source checksum stamp to `source-v3/search-choice`. Trace envelopes stay at v1 for ordinary sessions and v2 for fixtures; incompatible source checksums fail clearly. Explicit frozen regression loading retains synchronous Search, historical helpers, snapshots and checksums. Source callers use `BeginSearch` / `beginSearch` and pending responses; the old synchronous Search helpers reject source data. Old direction/rotation fields on a declaration do not place the block or bypass its decision.

## Consequences

Block conservation now includes the pending drawn block. Live source snapshots and their shared goldens change, while frozen bytes remain unchanged. Reviewed source block geometry and complete placement effects remain separate content requirements. A custom tile lacking usable topology rejects explicitly rather than inventing a redraw/refund rule. Source draw-before-choice movement and broader searches/selection effects remain separate work.

## Alternatives considered

Keeping the combined action or merely hiding its controls would retain hidden-topology queries and placement-before-draw behavior. Refunding/replacing a revealed tile after a rejected placement would change the printed top-block sequence. Reusing the phase-effect queue would conflate a normal action's committed physical block with an attached card's timing obligation.
