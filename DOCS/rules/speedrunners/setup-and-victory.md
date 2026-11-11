# Speedrunners rules — setup and victory

## SR-SETUP-001 — Player identity and victory

- **Source:** `sp-en-rulebook` — pp. 3–4, “Objective” and “Setup”.
- **Applies to:** Speedrunners, 2–4 players.
- **Maturity:** implemented.
- **Rule:** Each player controls a Zaibatsu and wins immediately by placing all
  of that player's control markers in the Cybernet.

## SR-SETUP-002 — Components and control-marker count

- **Source:** `sp-en-rulebook` — pp. 2–4, “Components” and “Setup”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** The base game uses the Central Core, information blocks, action and
  control cards, pawns, control/bonus/start-of-turn markers, and dice. Each
  player receives 10 markers at two players, 8 at three, and 6 at four.

## SR-SETUP-003 — Setup and opening hand

- **Source:** `sp-en-rulebook` — pp.5–7, “Game Setup” and opening-hand table.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Randomly assign Speedrunner control cards and matching pawns, place
  the Central Core, seed every active pawn there, shuffle the action deck and
  block pile through the seeded RNG, choose a starting player, then play left.
  The one-time opening hand is 3/4/5/5 cards for players one through four;
  later recycle draws use the normal maximum hand size.

Runtime boundary: the caller currently supplies names in starting-seat order; the printed starting-player die procedure is not executed by the engine yet (T-RULES-011). This entry does not certify complete official setup.

## Local experimental profile

The `/play/` quick match uses four markers and the current seven-block corpus,
as adopted in [ADR-0005](../../adr/0005-local-quick-match.md). This is a
provisional local delivery profile, not a replacement for `SR-SETUP-002`.
Both mirrors load the same profile from `spec/data/speedrunners/modes.json`.
Full official match readiness still requires component and mechanic completion.


## SR-SETUP-004 — Unused starters leave the match

- **Source:** `sp-en-rulebook` — p.5, “Starting components for each player”; cross-check `sp-es-rulebook`, p.5.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Shuffle the four starting Speedrunner control cards and assign one to each active player. The matching pieces enter play. Unselected starting cards and pieces are removed from the match; they are not common-area cards or reserve pawns.

The engine tracks excluded pawn ids in `outOfGame` and excluded control cards with `zone: out-of-game`. Tests cover two, three and four players, distinguish reserve from excluded starters, and retain the full definition catalog for physical accounting. This corrects the earlier source-foundation explanation that placed unused starting cards in the common area. Historical frozen scenarios retain their original experimental setup.

The same printed setup also removes unused physical control markers. That separate inventory/allocation requirement remains partial under SR-SETUP-002/T-RULES-011; SR-SETUP-004 certifies the starting pawn/card exclusion only.

## SR-ZONE-001 — Public zones and hidden hands and piles

- **Source:** `sp-en-rulebook` — p.10, Cybernet, control/common/reserve zones, hand, block pile, action deck and discard pile; cross-check `sp-es-rulebook`, p.10.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Cybernet elements and control/common/reserve zones are public. A player sees their own hand; other players do not, except when a sourced reveal effect applies. Block and action piles are face down and draw from the top; public visibility of the physical pile does not expose its identities or order. Discarded and played cards are public.

Mirrored player-view queries expose public board/resources, per-hand counts and authorized identities, with counts only for hidden piles. Spectators see no private hands; Trojan adds its explicit exception. Trusted full snapshots and seeded traces are operator/test artifacts. Search declaration views omit hidden-tile placement previews; after declaration, SR-BOARD-005 exposes the drawn block and authorized placement responses. The current query contract is a foundation for future mode visibility, not evidence that those modes or authenticated hosting are complete.

## SR-BONUS-001 — Finite physical bonus counters

- **Source:** `sp-en-rulebook` — p.4 (24 counters), p.6 (reserve setup), p.15 steps4/5 and p.16 (one counter per completed icon), pp.17–18 (collection), p.35 (attachment investment/refunds). Cross-check `sp-es-rulebook`, the same pages.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** The base game has 24 physical bonus counters. They are either free in a player's control area, invested on an attachment, placed on an uncollected bonus icon, or in reserve. Creating an icon takes one reserve counter before block placement effects. Controlling all three incident blocks transfers that existing board counter to its controller once; it does not create another. Paying and refunding attachments transfers counters between free and invested allocations without changing reserve. Direct awards take reserve counters.

Shared mode data supplies the total. Source state retains the supply and each icon's physical-counter placement. A pure mirrored pool query derives reserve from current allocations; unresolved discarded use metadata is not a second physical attachment allocation. Randomness is unchanged. Unsupported shortage/partial-fulfillment policy remains T-RULES-031: positive reserve allocations reject atomically when insufficient, preserving accepted prior Search or combat windows. Frozen historical fixtures retain their explicit old unlimited semantics; those tests cannot certify this sourced resource rule.

## SR-BONUS-002 — Bonus counters held on information blocks

- **Source:** `sp-en-blocks-a4` — p.6 tile1, placement and under-control instructions; cross-check `sp-es-blocks-a4` p.6 tile1; bilingual rulebooks pp.6, 16–18, 35 (physical reserve, placement, collection and invested costs).
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** A sourced placement effect can allocate one physical reserve counter to a block. That allocation is public and remains distinct from an uncollected three-block icon. Collection moves the existing counter into the controlling player's free counters exactly once, retaining a public collected-by receipt. Do not mint or draw a new counter on capture, repeat capture or elimination. Reserve+free+invested+all uncollected board counters remains the configured supply. Placement and new icon allocation require their combined reserve funding before either is committed.

PlacedBlock bonusCounter metadata represents the allocation: presence without collectedBy means the physical counter is held; collectedBy records its first recipient after transfer. Snapshots, clones, pure options and player views preserve that public state. Rejections preserve state and RNG. Collection at empty reserve is legal because it transfers a board piece, while placement shortage stays unresolved under T-RULES-031/T-RULES-047 and gates strict official bundles. The record does not adopt partial fulfillment or replacement counters.
