# Speedrunners rules — turns and actions

## SR-TURN-001 — Turn phases

- **Source:** `sp-en-rulebook` — p. 8, “Turn sequence”.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** A turn proceeds in order through beginning, action, recycle, and
  end. The active player is the only player who takes ordinary actions, and
  play then passes left.

Live clients enforce the active player's ownership of acting pawns and the
activation cost. A rejected action restores all state and the seeded RNG.

## SR-TURN-002 — Beginning and recycle obligations

- **Source:** `sp-en-rulebook` — p. 8, “Beginning phase” and “Recycle phase”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Superseded by SR-TURN-005. The earlier digest incorrectly added a
  block-specific discard-per-pawn effect to general recycling. Do not apply
  that upkeep rule.


## SR-TURN-003 — Game zones

- **Source:** `sp-en-rulebook` — pp. 3–4, “Game areas”.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** The Cybernet, player control zones, action deck/discard, block pile,
  common area, reserve, and hidden hands are distinct game zones; effects move
  pieces only through rules that name their destination.

## SR-TURN-004 — Immediate victory check

- **Source:** `sp-en-rulebook` — p. 3, “Objective”.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Check victory immediately whenever control-marker placement makes a
  player's placed total equal that player's allocated total, and defensively at
  turn end.

Live actions and phase transitions stop once a winner is declared. Standalone
marker placement remains a low-level debug utility and is rejected by the live
action API; playable matches earn markers through Icebreaker block control.

The live `recycle` action selects physical unused cards, including duplicate
copies. Played movement and matching-ability cards stay face up in `playedCards`
until recycling. Search and discard-four Reboot pay immediate discard costs
(p.31). Beginning-of-turn attachment effects remain only partially implemented.

## SR-TURN-005 — Printed recycle choice and discard timing

- **Source:** `sp-en-rulebook` — p. 8, “Recycle phase”; p. 31, action-card costs.
- **Applies to:** Speedrunners and inherited Shadowraiders turn flow.
- **Maturity:** implemented.
- **Rule:** Keep or discard unused cards, discard cards played during the turn,
  then refill to the maximum hand size. Movement and matching-ability cards
  stay face up until recycling. Explicit discard costs, including Search and
  the four-card Reboot alternative, are paid immediately. There is no general
  discard-per-controlled-pawn upkeep.

Broader beginning/ending card and block effects remain tracked separately under
T-PLAY-002; this entry covers ordinary recycling and explicit card-cost timing.

## SR-TURN-006 — Typed phase obligations and player decisions

- **Source:** `sp-en-rulebook` — p.8, “Beginning of turn” and phase order; `sp-en-action-cards` page 2, cards 2 and 5, and page 3, card 4.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Resolve beginning-of-turn card effects before clearing start-of-turn markers. Toxin requires its controller to discard one physical hand card or sacrifice its pawn; an empty hand cannot pay the discard alternative. Rootkit discards its controller's hand at the end of the action phase, before ordinary recycling. Selective Disclosure discards itself at turn beginning, removing its hand-size benefit and returning any paid counters.

Spanish cross-checks: Toxin is `sp-es-action-cards` page 2, card 9; Rootkit is page 2, card 8; Selective Disclosure is page 3, card 4. English and Spanish first/second/third-page ordering must not be assumed identical.

Pending decisions retain their responding player, physical-card multiset and originating effect. Ordinary actions and phase advancement cannot bypass them. Invalid, unauthorized or stale responses preserve state and RNG. The compatibility full-turn helper stops when a decision is required; resume through the live API.

**Unresolved interpretation — PHASE-EFFECT-ORDER:** The consulted beginning-phase text requires resolving all abilities before marker removal but does not prescribe conflicting same-timing effect order. No canonical player-choice or fixed-order policy has been adopted. The initial scheduler accepts one triggered obligation and rejects a multiple-effect combination atomically with an explicit unsupported-ordering error. These three cards remain provisional until this interaction and the broader phase scheduler are resolved under T-RULES-003/T-RULES-005.


## SR-TURN-007 — Sacrifice/draw, relocation and required hand choices

- **Source:** `sp-en-action-cards` — page 3, cards 2, 3 and 5; `sp-en-rulebook` — p.8, beginning phase and marker removal.
- **Applies to:** Speedrunners; combined threat interactions remain provisional.
- **Maturity:** partial.
- **Rule:** Electric Sheep is a one-copy add-on costing two counters. At turn beginning, sacrifice its pawn, discard attachments/refund paid counters, then draw three action cards, recycling the discard when the deck is empty. Jetpack is a one-copy add-on costing one counter. At turn beginning, discard it and relocate its pawn to a chosen available space, respecting capacity; this is a destination decision, not a path-budget decision. Insider Trading is a one-copy Trade Secret add-on costing one counter and increasing maximum hand size by two while attached; at turn beginning, its controller chooses two physical hand cards to discard. Each card has a two-step movement strip and Delete activation. Source costs are placement costs, not repeated beginning-effect charges.

Spanish cross-check: `sp-es-action-cards` page 3 has Jetpack in card 2 and Electric Sheep in card 3; Insider Trading stays in card 5. All printed costs, strips and timing match. Canonical data preserves these locators and one-copy identities. These records stay provisional because the following interactions remain open.

**Unresolved interpretation — FORCED-DISCARD-SHORTFALL:** Insider Trading names two cards but the consulted sheets/beginning rules do not specify a hand with fewer than two. Proposed reading: discard all available cards. This has not been adopted. The current experimental engine rejects starting this underfilled obligation atomically; it must not silently pay fewer, eliminate the pawn, or skip the effect. T-RULES-007 owns the source clarification.

**Unresolved interpretation — JETPACK-THREAT-ACTIVATION:** English Jetpack says to move the pawn; Spanish uses placement wording. Ordinary movement awakens threats, while placement may have different consequences. Proposed readings are normal movement or placement; neither is selected in canonical Jetpack data. Its destination query excludes blocks with non-eliminated threats and direct attempts reject without losing the attachment/counter. T-RULES-008 owns this combined-mode interaction.

The generic relocation handler can explicitly opt into normal-movement or placement threat semantics for definitions with settled authority. Synthetic tests exercise a beginning-phase normal-movement effect interrupted by public combat, with paid cards remaining face up until recycling. Phase bookkeeping resumes only after the combat window closes. This capability does not resolve Jetpack's source gap. PHASE-EFFECT-ORDER also applies to these cards; no multi-obligation order is inferred.


Execution evidence preserves individual discard, elimination and draw events in order, including an attachment returned through an exhausted deck's discard shuffle. Public combat during an explicitly typed beginning movement permits either a matching paid Delete response or accepting fixed retaliation. Source-review tests cover both, while canonical Jetpack still leaves threat activation unresolved.

Native pawn phase effects now join the same checked queue under SR-PAWN-005. Gynoid creates an authorized optional target/decline decision before a single physical random transfer; no RNG is consumed while previewing or declining. Native and attached obligations still share PHASE-EFFECT-ORDER, and a collision rejects atomically before phase bookkeeping. Strict native official construction gates the unaccepted composition even if provisional flags are cleared.

For Corporate Scandal SR-BOARD-016, source Icebreaker payment leaves the hand before the attempt and under-control resolution (EN/ES p.8, p.28). Validation precedes that payment; rejection restores full state/RNG. Its capture can therefore discard all remaining hand cards without discarding or double-spending the already played card. Ordered public receipts record the roll, control change, each affected hand and its physical cards. This source timing correction retains frozen regression behavior explicitly.

## SR-TURN-008 — Current space hand limits at recycling

- **Source:** `sp-en-rulebook` — pp.8 (recycling), 13 (stopping on a hand-size space), 31 (cards/spaces alter the recycling maximum), 38 (signed hand symbols); cross-check `sp-es-rulebook` same pages; `sp-en-blocks-a4` and `sp-es-blocks-a4` — p.4 tile3 (Black Clinic).
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Hand-size modifiers change the maximum cards kept/refilled during recycling. Black Clinic's hand space contributes minus1 to the controller of the pawn stopped there. Add current controlled-pawn space amounts to current attachment hand modifiers and the mode/player base. The physical maximum is nonnegative. Ordinary pawn ownership, unrelated block control and off-board retained pieces add no space amount.

**Interpretation and rationale:** Apply a space modifier while a controlled pawn is stopped on that space, rather than permanently changing the base at every visit. P.13 assigns the modifier to the stopping pawn's controller and p.31 evaluates cards/spaces at recycling; the source provides no permanent counter or repeated-stop accumulation rule. Passing through creates no continuing contribution. Leaving, elimination, relocation or controller changes immediately recompute the current profile; multiple currently stopped controlled pawns contribute their own amounts. This is the same continuous-source model as attachment hand modifiers.

Moving onto the space does not immediately discard cards or draw. Recycling uses the current maximum through the existing discard/keep/refill flow. Pure public profiles expose base, attachment amount, space amount and maximum without hand identities, state changes or RNG. Frozen regression retains its historical attachment-only behavior. Unsupported hand-space values/dice reject at construction; invalid later resolution restores the command state and RNG.

## SR-TURN-009 — Played cards remain with their controller until recycling

- **Source:** `sp-en-rulebook` — p.8, action phase and recycling (played cards stay face up until the recycling phase of your turn); pp.20/24/30 and `sp-en-control-cards` p.2 cell8 (Turret permission, indivisible movement, card uses); cross-check Spanish rulebook same pages and control card p.2 cell8.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** A physical card played for movement or ability activation remains face up in front of the player who paid it until that player's recycling. An explicitly instructed discard (Search or the four-card Reboot alternative) goes directly to the shared discard. A card played for Turret during another player's turn or a non-action phase remains the paying controller's played card. Other players' recycling, elimination of the activating pawn and changes to its control do not discard or transfer that paid card.

`playedCards` remains the one physical zone; parallel `playedCardOwners` is public allocation metadata, never extra card copies. Preserve order and duplicate physical definition entries; discard only the recycling player's allocation before their refill. Snapshots, clones and views carry both arrays. New engine-generated source plays always allocate an owner; existing programmatic fixtures without allocation retain their historical active-player interpretation. Present but misaligned or unknown-owner metadata rejects commands before payment/RNG. Frozen corpus keeps historical shared-pile recycling.

SR-PAWN-008 owns the source timing permission and noninterleaving reading. A public off-turn attack records its paying controller and keeps that controller's assignment authority even though the active turn/phase stays unchanged. Replacement choices keep their own permitted responders. Pure queries and player views return only that viewer's currently permitted actions, without leaking other hands. Broader discarded attached-card identity/use-marker lifetime remains T-RULES-021.
