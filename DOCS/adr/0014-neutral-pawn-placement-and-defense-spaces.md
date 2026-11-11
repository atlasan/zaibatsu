# ADR-0014: Neutral placement, exact defense spaces and source protocol v7

- Status: accepted
- Date: 2026-10-17
- Related: [ADR-0013](0013-zero-step-movement.md), [block rules](../rules/speedrunners/board-and-movement.md#sr-board-006-matching-pawn-spaces-and-neutral-placement), [defense rules](../rules/speedrunners/pawns-abilities-and-cards.md#sr-defense-001-printed-space-dice-change-face-shielding), [backlog](../../tasks/BACKLOG.md)

## Context

The first printed block's old pilot had wrong topology, bonus corners, control timing and pawn ownership. Direct EN/ES review identifies a four-space ring around title art, ICE faces 3/4/6, fragments V2/V3/V6 and a flat square white1. Illustrated rulebook pp.13/21/38 identify that square as defense shielding, contradicting the saved ICE-modifier observation. Pages 13/16 require matching pawn-space placement with the card in common and no player control.

## Decision

Use explicit non-playable source zones rather than manufacturing a center space. Extend block data/schema and both domain models with `nonPlayableZoneIds`; verified content accounts for all seven zones via gameplay spaces or explicit title/art zones. Validate exact boundaries, geometric/reciprocal neighbors, ICE arrays, corner counts and neutral pawn/card references. The editor authors and retains exclusions; computer suggestions cannot overwrite them. Explicit seven-zone prefill or Clear all resets them.

Represent source square dice through exact `modifier.dice` face/shield pairs. The shared defense-profile query combines the current pawn/armor profile with current space shielding. All targeted/split/area/public-assignment/fixed-threat paths use it. Profile output is detached and RNG-free; leaving the space removes its contribution. Malformed or unresolved numeric defense data rejects rather than adopting an ICE/count interpretation. Retain the two-argument pawn/armor summary for compatibility.

Use a distinct typed `place-neutral-pawn` placement effect. Require a unique reserve pawn, matching pawn space and common-area card. Place with empty ownership, preserve the common card and allocate no control marker. Invalid physical states reject against the committed Search state; no arbitrary relocation/revival or player destination choice is introduced. Neutral events include destination and no controller. The sandbox shows neutral ownership and current defense from engine queries.

Source state/checksum advances to `source-v7` / `source-v7/neutral-pawn-defense-spaces`; older source checksums reject. Frozen regression keeps its original data/shape/behavior/checksum. The verified block retains the `idoru` alias. The Idoru pawn and new card-zone record remain provisional pending their full marker-on-card behavior.

## Consequences

Shared Toyeku snapshots/events and p.21 defense profiles are asserted by both mirrors. Tests include physical zones, movement, changing block ownership, malformed/repeated placement, every pawn attack route, committed-roll rejection, pure previews and RNG. Browser acceptance covers real tile placement, neutral/current-defense inspection, replay/undo, exact-face authoring and title-zone save/load. This completes one block and its generic prerequisites; it does not complete Idoru, subsequent blocks or any full mode.

## Alternatives considered

Using the old controlled placement helper would grant unsourced ownership and choose the wrong space. Mapping title art as a seventh space creates a movement shortcut. Counting the ICE corner as a bonus creates a nonexistent resource. Treating square1 as ICE changes the wrong defense system. Leaving numeric defense placeholders active would silently claim unsupported rules. These alternatives are rejected.
