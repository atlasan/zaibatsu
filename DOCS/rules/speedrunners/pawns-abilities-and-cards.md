# Speedrunners rules — pawns, abilities, and cards

## SR-PAWN-001 — Pawn state and control

- **Source:** `sp-en-rulebook` — pp. 4–8, “Pawns” and “Control cards”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** A pawn combines a board piece and control-card attributes: defense,
  movement, abilities, classes, optional ICE, slots, and special text. Gaining
  an uncontrolled pawn takes its card; taking an enemy pawn discards its
  attachments. Rebooted pawns return at the Central Core.

## SR-ABILITY-001 — Ability activation

- **Source:** `sp-en-rulebook` — p.26, “Abilities”; cross-check `sp-es-rulebook`, p.26. Multiple free-badge stacking remains separately unresolved under SR-ABILITY-004.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** An ability is card-activated, once per turn, or unavailable. A
  once-per-turn ability records its use with a start-of-turn marker; card
  activation requires a matching action-card use.

## SR-ABILITY-002 — Search, Delete, Reboot, and Icebreaker

- **Source:** `sp-en-rulebook` — pp.27–29, Search, Delete, Icebreaker and Reboot; combat/control procedure pp.22–23. Source Search sequence is specified by SR-BOARD-005.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Search discards one card to place a block; Delete rolls one d6 per
  skull against unshielded defense, and multi-skull Delete may divide or
  concentrate those dice across co-located targets. Bomb-class area Delete
  applies that same roll to every pawn in the attacker's block, and typed block
  `area-attack` effects now dispatch on placement / control gain with the same
  shared-roll semantics. Reboot plays a matching card or discards four cards to return an eliminated
  pawn; and Icebreaker rolls against target ICE to gain control. A failed
  Black-ICE Icebreaker eliminates the attacker. Exact per-component ICE faces
  remain pending transcription.

## SR-CARD-001 — One chosen action-card use

- **Source:** `sp-en-rulebook` — pp. 8–9, “Action cards”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Each action card supplies one chosen use only: card movement,
  matching ability activation, attachment, Search discard, or participation in
  a four-card Reboot discard, or matching-card Reboot activation. All other
  uses of that physical card are void.

The live card-driven split Delete action pays one matching card and accepts an
ordered target assignment for each die, including repeated targets for
concentration. Card-activated granted movement also pays a movement card;
neither action bypasses active-player pawn ownership. Reboot input refers to
physical hand entries, so duplicate copies may be included in the four-card
cost. Illegal live plays restore the hand, board, counters, and RNG stream.

## SR-CARD-002 — Attachments and costs

- **Source:** `sp-en-rulebook` — pp. 8–9, “Attach”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Cards may attach to a valid own pawn, enemy slot, or ICE-bearing
  block side. Slot and class restrictions apply; costs are paid with bonus
  counters placed on the card and returned to their owner when the attachment is
  discarded, lost, or its target changes control.

## SR-CARD-003 — Counters and open classes

- **Source:** `sp-en-rulebook` — pp. 4–9, counters and card symbology.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Control markers claim blocks and determine victory, bonus counters
  pay card costs, and start-of-turn markers track once-per-turn use. Pawn class
  symbols are data-driven open strings rather than an engine-closed enum.

The [asset review register](../../artifacts/asset-review.md) now preserves
all 54 printed action cards and 18 control cards individually, including
attachment restrictions, symbol-only costs, cancelled abilities and activation
timing. Symbol interpretation uses `sp-en-rulebook` PDF pp.37-38. Canonical
promotion and bilingual provenance checks remain T-SOURCE-REVIEW-002; this
review does not promote the rule maturities above.

Live tabletop attacks use a public roll followed by explicit die assignment.
Printed attack-space modifiers and typed attachment `attackModifier` values
accumulate automatically; live callers cannot inject extra skulls. Legacy
preassigned Split Delete remains a regression/Test Lab utility.

## SR-PAWN-002 — Printed starting Speedrunners

- **Source:** `sp-en-control-cards` — page 1, cards 1, 2, 4 and 5; cross-checked against the same Spanish sheet positions. Symbol definitions: `sp-en-rulebook`, pp.21, 37-38.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Blue, Green, Pink and Orange starters have shielded defense faces 1-2 and unshielded faces 3-6. Movement, Search, Icebreaker and Reboot are card-activated; no innate Delete is printed. Their Icebreaker modifiers add face 1, 2, 4 and 5 respectively to an existing target ICE value. These modifiers are not the starter's own ICE. Their printed slots are add-on, gadget and armor.

Setup assigns the matching color and control card. Unselected starter pieces and control cards are removed from the match (SR-SETUP-004). This verifies the starter slice, not the remaining content or complete official-match readiness.

## SR-PAWN-003 — Reboot retains pawn control

- **Source:** `sp-en-rulebook` — p.23, “Eliminating a pawn”, and p.27, “Reboot”; Spanish cross-check `sp-es-rulebook`, same topics.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** An eliminated pawn with Reboot remains on its controller's control card in that player's control zone. Only that controller may Reboot it. A pawn without Reboot returns its piece to reserve and its control card to the common area.

The verified starter cards retain ownership and enforce Reboot authority. Source-mode elimination now also returns non-Reboot pieces to reserve and releases their physical control cards to the common area; typed placement consumes a reserve piece. Mirrored conservation tests use explicitly synthetic nonstarter control records while the remaining printed control-card corpus is promoted. The handler exists; source-complete nonstarter content and all lifecycle exceptions remain open.

## SR-CARD-004 — Octagon Dex and action strips

- **Source:** `sp-en-action-cards` — page 1, card 1 (Octagon Dex); cross-check `sp-es-action-cards`, page 1, card 2. Movement/activation symbols: `sp-en-rulebook`, pp.30, 37.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Attached Octagon Dex removes Search and lets its pawn ignore direction arrows. Its separate action strip provides one movement step or Icebreaker activation. Only the chosen card use applies. All nine page-one action strips provide one movement step and Icebreaker activation.

The Spanish sheet orders DJ, Octagon and Simstim differently from the English sheet; locators follow the printed card, not an assumed matching cell.

## SR-CARD-005 — Printed accelerator and E-Synapse attachments

- **Source:** `sp-en-action-cards` — page 1, cards 4-8; cross-check `sp-es-action-cards`, page 1, cards 4-8. Symbol definitions: `sp-en-rulebook`, p.37.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Transgenic Therapy, Hyper and Accela each cost one bonus counter and add one movement step. Biochip costs one and grants a separate free three-step move once per turn; Neural Interface costs two and grants a separate free five-step move once per turn. Step modifiers do not increase hex movement. Paid counters return when the attachment is discarded.

## SR-CARD-006 — Simstim movement and unresolved bonus lifetime

- **Source:** `sp-en-action-cards` — page 1, card 2; cross-check `sp-es-action-cards`, page 1, card 3. Counter costs: `sp-en-rulebook`, pp.18, 35.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Attached Simstim Record cancels movement, including movement paid with an action card and movement granted by another attachment.

**Unresolved interpretation — SIMSTIM-COUNTER-LIFETIME:** Both languages say the controller gains one bonus counter while controlling the card. They do not explicitly settle withdrawal on loss, handling a supplied counter committed to another card, or whether losing this card cascades discards through unpaid costs. The proposed reading is a counter available only while controlled, with cost cleanup when withdrawn; it is not accepted or executed. The component remains provisional, supplies no invented bonus behavior, and is partial in the coverage checklist. Continue independent cards under T-RULES-004.


## SR-CARD-007 — Dummy elimination prevention

- **Source:** `sp-en-action-cards` — page 3, card 1; cross-check `sp-es-action-cards`, page 3, card 1. Cleanup: `sp-en-rulebook` and `sp-es-rulebook`, p.23; attachment rules: English pp.33–34.
- **Applies to:** Speedrunners, including settled attack/Black ICE paths in the shared core.
- **Maturity:** partial.
- **Rule:** Dummy is one add-on card costing one bonus counter. Its separate action strip offers two movement steps or Delete activation. When its attached pawn would be eliminated, the controller may detach and discard Dummy to prevent that elimination. Spending it returns its paid counter; other attachments and their continuous benefits stay attached. Declining follows the ordinary elimination cleanup. A later attack is a new elimination attempt and cannot reuse the discarded card.

The specific prevention text defines a replacement decision at elimination, including a defending controller outside the active player's turn. This permission only answers that decision; it does not permit ordinary out-of-turn actions. The public attack roll and its assignments remain paid/resolved once before the defender responds. Cleanup is held until the decision; there is no premature piece removal, card release or refund of other attachments. The same typed handler serves ordinary attacks, area effects, fixed threat attacks and failed Black ICE. Basic abilities' action-phase limits are unchanged.

**Unresolved interpretation — PREVENTION-SACRIFICE:** Page 23 tells players to follow elimination rules for sacrifice, while Dummy prevents elimination. The consulted text does not explicitly settle whether prevention pays a sacrifice requirement or permits a following cost-dependent benefit. Proposed readings are to permit replacement of the resulting elimination, or to require the sacrifice to occur for dependent effects. Neither is adopted. Current sacrifice/prevention combinations reject atomically before drawing or cleanup. Continue independent attack/Black ICE cases under T-RULES-010.

**Unresolved interpretation — PREVENTION-SIMULTANEOUS:** A batch affecting more than one protected pawn would require an ordering of replacement decisions. No normative ordering policy has been adopted. Such a combination rejects atomically, including the attack's RNG/payment, until T-RULES-010 resolves it. One protected pawn among other ordinary casualties executes; the current single-copy Dummy does not create a second Dummy by itself. The typed mechanism can represent later sourced protection cards without parsing prose.

The card stays provisional while these interactions remain open. This does not certify the complete attachment lifecycle: slot providers, grants and loss-of-slot cascades remain T-RULES-012; target eligibility now executes under SR-CARD-010.


## SR-CARD-008 — Printed attachment classes are gained by the pawn

- **Source:** `sp-en-rulebook` — p.34, “Attached card class-type”; cross-check `sp-es-rulebook`, p.34, “Clase de carta anexa”. Component checks: EN/ES action cards page 1, cards 4–8 and page 3, cards 4–5.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** While an attachment has its own printed class, its pawn also has that class. Retain native classes and deduplicate identical grants. Removing the attachment removes that grant without changing the pawn definition. Transgenic Therapy, Hyper and Accela grant Accelerator; Biochip and Neural Interface grant E-Synapse; Selective Disclosure and Insider Trading grant Trade Secret. Their card action strips remain separate uses.

Shared data now records these printed names/classes. Both mirrors fold `ActionCard.class` into effective pawn classes, and takeover/ordinary attachment loss removes the benefit. Shared query evidence is `golden/attachment-classes.json`; sandbox inspector classes come from the engine helper. This entry covers own-class grants; SR-CARD-010 now covers target-class eligibility. Provider-dependent slot cleanup now executes under SR-CARD-011; broader component exceptions remain T-RULES-012. Only explicit frozen-regression data retains placeholder `attach.class` grants.

## SR-CARD-009 — Gentleman Loser belongs to the attachment use

- **Source:** `sp-en-action-cards` — page 1, card 9; cross-check `sp-es-action-cards`, page 1, card 9. Block attachment rules: English rulebook p.32.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** The printed card is Gentleman Loser, a Block attachment. Its instruction places Cracker in that block under the controller's control when resolving the attachment. Its separate action strip supplies one movement step or Icebreaker activation; playing that strip does not activate the attachment's placement text.

The canonical record retains historical id `cracker` as an alias but restores its printed title/type and encodes placement as `on-attach`. The earlier successful-Icebreaker placement interpretation and verified provenance were revoked. Canonical attachment attempts reject before payment with an explicit unsupported-placement/choice error. Official constructors also reject unsupported attachment-time content even if a caller clears provisional flags. Exact block-extension geometry, attachment edge/placement and destination decisions remain T-RULES-013. Do not substitute the old regression effect for this rule.

## SR-CARD-010 — Malware target exclusions and continuous penalties

- **Source:** `sp-en-action-cards` — page 2, cells 3 (Worm), 6 (Under Clocker), 9 (Hijacker); cross-check `sp-es-action-cards` page 2, cells 2, 3, 1 respectively. Slot and gained-class rules: both rulebooks p.34; takeover cleanup p.33.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** These three one-copy Malware cards attach to an enemy pawn's empty Add-on slot and cannot attach to an Operative. No bonus-counter cost is printed. Worm reduces its controller's maximum hand size by one. Under Clocker cancels Delete. Hijacker cancels movement, including movement paid with an action card or granted by another attachment. Each separate action strip supplies one movement step or Icebreaker activation. Ordinary takeover discards the card and removes its class and continuous penalty.

Eligibility uses the target's effective classes before adding the candidate card, including classes gained from existing attachments. A required-class list accepts any existing matching class; a forbidden class always excludes the target. A target restriction does not grant a class. The distinct printed own class remains `ActionCard.class`; source data uses `attach.class` for required targets and `attach.forbiddenClasses` for exclusions. Only the explicit frozen-regression loader retains historical `attach.class` grants. The source corpus's three synthetic class-bearing placeholders have been migrated to top-level own classes without promoting their printed identities.

The Spanish sheet reorders the cards: do not reuse English cell numbers as bilingual evidence. This entry covers the three settled continuous cards, with shared full-state snapshots and ordered events in `golden/attachment-restrictions.json`, rejected-command/RNG tests and sandbox target filtering. Virus takeover and Lima Flag entry restrictions now execute under SR-CARD-014/015. Spammer's discard/ban and Trojan's reveal remain independent dependencies; this entry does not certify them. Provider-dependent slots and cascades now execute under SR-CARD-011; remaining component exceptions stay T-RULES-012.

## SR-CARD-011 — Physical slots and dependent attachment cleanup

- **Source:** `sp-en-rulebook` — pp.33–34, attachment discard/move restrictions, additional slots and Gunhed/AK-12kM illustration; cross-check `sp-es-rulebook`, pp.33–34.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Each native or attachment-supplied physical slot holds one card. An attachment's additional slot is distinct from a native slot of the same type. Attach only into an available corresponding slot. An attached card cannot be moved between slots. If its provider disappears, discard the cards in the provider's slots, including nested dependents, and refund their paid counters once. Removing a whole pawn or taking it over still discards all its attachments.

The p.34 diagram shows Gunhed occupying the native Add-on slot while exposing its own Add-on slot and a separate occupied Weapon slot. The p.33 prohibition on moving attached cards means another free slot does not rescue a card whose provider is removed. Both engines represent this using explicit rooted slot locations, distinguish repeated physical copies, require a player choice when several matching slots are free, and reject stale/occupied/unreachable references before payment. Grants must connect to a native slot; disconnected or self-supporting providers cannot create usable slots.

Phase self-discard and the prevention handler share dependent cleanup. This grants no general voluntary discard permission and defines no new simultaneous triggered-effect order. The structural cleanup sequence is parent before descendant, then attachment order at equal depth (ADR-0008); broader phase order remains T-RULES-005. Shared snapshots/events, card/counter conservation and synthetic sandbox controls prove the generic slot rule. Gunhed and AK-12kM now have their own accepted component evidence under SR-CARD-012. Servocanon remains partial under SR-CARD-013/T-RULES-014; the generic slot fixtures alone do not promote it.

## SR-ABILITY-003 — Printed Delete strength and separate activations

- **Source:** `sp-en-rulebook` — pp.22, 26–27, 34, attack skulls and cumulative attributes; cross-check `sp-es-rulebook`, same pages. Component symbols: both action sheets p.3, cells 6–8.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Roll one die per printed skull in the attack. Add skulls from the pawn and its attachments once each. Strength and activation badges are separate: a skull without an activation adds strength but does not allow the pawn to initiate Delete. Matching-card and single once-per-turn activation badges can coexist. Choose the activation through payment: a matching hand card pays only the card route; an unpaid attack requires the free badge and spends its marker. Spending the free activation leaves card-paid attacks available. Cancellation suppresses every activation type.

`Attach.delete` stores the printed skull contribution and optional activation. It never invents a second base die when granting Delete to a pawn lacking it. Generic historical grants without printed strength retain a compatibility one-die fallback. `deleteProfile` / `PawnDeleteProfile` describes strength and badges; `deleteActivationOptions` / `DeleteActivationOptions` lists supported routes. Direct, split, area and public-roll handlers select the same route. Public dice are paid and rolled before assignments, and rejected commands preserve state and RNG. The normal beginning reset restores the free activation. Full physical marker transfer accounting remains T-RULES-011.

This entry covers the shared single-free/card cases; multiple free badges are specifically excluded by SR-ABILITY-004. Frozen regression loading retains the prior single-priority behavior and original golden/checksum evidence.

## SR-ABILITY-004 — Conflicting once-per-turn activation stacking

- **Source:** `sp-en-rulebook` — p.26, last sentence under once-per-turn abilities; cross-check `sp-es-rulebook`, p.26, corresponding sentence. Both p.34 ability-attribute descriptions are also relevant; both p.25 movement sections agree that movement types accumulate.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Multiple once-per-turn Delete activation badges remain an unresolved source conflict. English p.26 says these symbols are cumulative; Spanish p.26 says they are not. Do not silently choose either reading.

Evidence and proposed readings: the English reading permits separate free activations with independently tracked badges; the Spanish reading imposes one free activation for the ability despite multiple badges. This difference affects a native free Delete combined with Servocanon or multiple module-granted free badges, including use/reset and marker accounting. Current source queries withhold the ambiguous free route and commands reject it atomically with the bilingual-conflict error. A separate printed matching-card route remains usable, with all settled skull contributions, without consuming a free marker. Cancellation still blocks everything. Servocanon stays provisional under T-RULES-014 until authoritative clarification accepts an interpretation and mirrored marker tests cover it. This conflict does not invalidate the separately agreed movement rules on p.25.

## SR-CARD-012 — Gunhed and AK-12kM

- **Source:** `sp-en-action-cards` — p.3, cells 6 (Gunhed) and 7 (AK-12kM); cross-check `sp-es-action-cards`, p.3, same cells. Slot illustration and attributes: both rulebooks p.34; attack skulls: p.22.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Gunhed is one Brainchip Add-on card costing two bonus counters. It supplies an additional Add-on slot and a Weapon slot, one skull and matching-card Delete activation. AK-12kM is one Weapon card costing one counter; it supplies one skull without an activation badge. Together on an otherwise non-attacking starter they produce two dice with card-paid Delete. Each separate action strip supplies two movement steps or Delete activation. Normal slot/ownership rules, attachment class grants and paid-counter refunds apply.

The Gunhed alias `weapon-gunhed` remains stable, but the previous two-copy Weapon placeholder was replaced with these printed facts. It is not a second physical Gunhed definition. Both records are bilingual-verified. Source fixtures/goldens now use the corrected live deck; frozen historical data is unchanged.

## SR-CARD-013 — Servocanon

- **Source:** `sp-en-action-cards` — p.3, cell 8; cross-check `sp-es-action-cards`, p.3, cell 8. Activation and marker rules: both rulebooks p.26; printed contributions p.34.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Servocanon is one Module card costing one bonus counter. It supplies one skull and one once-per-turn free Delete activation. Its separate strip supplies two movement steps or Delete activation. A single free badge can coexist with a matching-card badge; the paid route does not consume the free use.

Single-free behavior, combined skulls, costs, cancellation, turn reset, takeover cleanup and sandbox controls execute in both mirrors. Combining more than one free badge remains provisional under SR-ABILITY-004/T-RULES-014 and rejects explicitly. The source data records the verified printed attributes without promoting the unresolved component to full runtime completion.

## SR-CARD-014 — Virus attachment-time control

- **Source:** `sp-en-action-cards` — page 2, cell 1; cross-check `sp-es-action-cards`, page 2, cell 4. Enemy attachment eligibility: both rulebooks p.32. Taking an opposing pawn: both rulebooks p.22; attachment cleanup p.33.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Virus is one Malware Add-on, with no bonus cost. Attach it to an opposing player's Cleaner pawn using a controlled co-located pawn and an empty Add-on slot. Once attached, immediately gain control of the target. Discard every attached card, including Virus itself, return paid counters to the previous controller, then move the physical control card to the new controller. This does not spend Icebreaker or a control marker, require target ICE, or make an attack roll. Its separate strip supplies one movement step or Icebreaker activation.

Cleaner eligibility uses existing effective classes before attaching Virus, including grants from other attachments. The resulting takeover removes those grants. Neutral pawns are not Enemy targets under p.32; source attachment reducers now reject a target without another registered controlling player. The common takeover instruction on p.22 applies after the attachment exists, so Virus is included in the discarded cards; do not retain it as a persistent control attachment. The typed `gain-target-control` operation runs only at `on-attach`, and its event journal preserves discards before transfer. Movement/ability-strip use never runs it.

Both mirrors assert physical-card conservation, costs/refunds, legal gained classes and illegal class/owner/neutral/range/slot cases, replay and ordered events. Sandbox target classes remain explicitly synthetic until the Cleaner pawn corpus is independently promoted. This rule does not promote that pawn definition or certify a complete ordinary match.

## SR-CARD-015 — Lima Flag movement entry restriction

- **Source:** `sp-en-action-cards` — page 2, cell 4; cross-check `sp-es-action-cards`, page 2, cell 5. General movement: both rulebooks pp.24–25; Enemy attachment rules p.32.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Lima Flag is one no-cost Malware Add-on attached to an opposing player's pawn. That pawn cannot move onto Central Core. The restriction applies to each entered block in a step path, card movement, rolled movement, granted movement and whole-block movement. It does not prevent an already-present pawn from moving within or leaving the Core. Its separate strip supplies one movement step or Icebreaker activation, without imposing the attachment restriction.

Entry restrictions are typed categories (`forbiddenDestinations: [central-core]`), not prose or hardcoded block ids. Engine target/path/hex queries and execution share the same check. Capacity/occupancy and explicit placement remain separate. Relocation with an explicit normal-movement policy observes the restriction; explicit placement bypasses it. If the source has not settled move versus placement (Jetpack, T-RULES-008), a restricted Core destination is withheld and rejects as an unresolved interpretation. Evaluate restrictions after a relocation's required attachment discard, including dependent cleanup, before deciding whether its subsequent move is legal. Query previews use independent copies and preserve live state/RNG.

## SR-CARD-016 — Spammer discard and continuing ban remain unresolved

- **Source:** `sp-en-action-cards` — page 2, cell 7; cross-check `sp-es-action-cards`, page 2, cell 6. Attachment lifecycle: both rulebooks pp.33–34.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Spammer instructs the pawn to discard all attached cards and says it can no longer attach Add-on cards. Its persistence and exact self-discard treatment are not yet accepted for execution.

Evidence: both languages say all attached cards without excluding Spammer, while the continuing prohibition has no stated end/reset condition. Proposed readings are (1) discard Spammer with the other cards and keep a pawn-level ban, whose lifetime still needs evidence, or (2) treat Spammer as remaining attached to carry a continuous ban, which would require an exception to the printed all-cards wording. A partial interpretation that discards Spammer and immediately forgets the ban is unsupported. T-RULES-015 owns this dependency, including provider-slot cascades, refunds, takeover/elimination and later reserve/re-entry. No canonical Spammer runtime record is promoted. Continue independent Trojan visibility work and other settled content.

## SR-CARD-017 — Trojan controller hand reveal

- **Source:** `sp-en-action-cards` — page 2, cell 8; cross-check `sp-es-action-cards`, page 2, cell 7. Hidden hand/pile baseline: both rulebooks p.10. Enemy attachment: both rulebooks p.32; lifecycle pp.22–23, 33–34.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Trojan is one no-cost Malware Add-on with an Enemy attachment and a one-step/Icebreaker strip. While attached, the pawn's current controller plays with their entire current hand face up to the other players. It reveals the target controller's hand, not the attaching player's hand, and does not grant opponents permission to act for that controller.

The typed continuous attribute `controllerHand: face-up` is evaluated in player views, including new draws. There is no target-class exclusion printed on Trojan. Its movement/ability strip does not attach it or reveal a hand. Removal, dependent-slot cleanup, takeover and elimination end its contribution immediately. Another remaining reveal attachment continues to reveal the hand. Taking a pawn normally discards its attachments before control changes, so Trojan does not transfer a reveal to the capturing player.

Both mirrors test those lifecycles, legal and illegal attachment/strip uses, zero cost, physical-card conservation, authorized views/options and unchanged state/RNG. Shared `golden/player-view.json` records concealed, revealed and concealed-again views plus ordered attachment/discard events. Current reveal does not retroactively expose the private identities/order of historical draws; journal projection conservatively redacts those for opponents. Trusted operator snapshots/replays remain a distinct local debugging surface under ADR-0009. The sandbox has a Trojan fixture and read-only per-player/spectator preview; this does not declare the wider Search decision or authenticated network contract complete.


## SR-DEFENSE-001 — Printed space dice change face shielding

- **Source:** `sp-en-rulebook` — pp.13/21, defense spaces and illustrated before/after profiles; p.38, square defense versus rhombus pawn ICE symbols; p.36, armor replaces normal defense. Cross-check `sp-es-rulebook`, the same pages.
- **Applies to:** Speedrunners and inherited combat against pawns.
- **Maturity:** implemented.
- **Rule:** A black or white flat square die printed in a space sets shielding of that numbered defense face for a pawn occupying the space. A black3 space shields face3; a white1/white2 space makes faces1/2 unshielded. Other faces retain their pawn/armor state. Recompute from the pawn's current space, so leaving removes the space contribution. These symbols are defense changes, not ICE values or counts.

Shared `modifier.dice: [{value,shielded}]` data encodes the printed faces. Apply it after the existing pawn/armor profile. It cannot mutate printed definitions or cached armor state, and it uses no RNG. The bilingual p.21 examples yield shielded faces [1,2], then [1,2,3] on black3, or none on white1/white2. Targeted, split, area, public assigned and fixed threat attacks all use the same `DefenseProfile` / `defenseProfile` query. The existing two-argument effective-defense helper remains compatible for the pawn/armor-only summary.

Duplicate/out-of-range faces, dice on another modifier kind, and unresolved numeric defense placeholders reject. Strict official construction rejects unsupported numeric defense spaces; experimental combat does too when that profile is needed, preserving full state/RNG or the already committed public roll. Frozen regression retains its old behavior explicitly. Exact numeric count-based ICE experiments are not reinterpreted as defense and remain separate provisional data. Shared profiles, rejection tests and browser inspector/authoring controls cover this rule; complete armor and printed pawn content remain their own acceptance work.

## SR-PAWN-004 — Idoru attributes and counted control-card marker

- **Source:** `sp-en-control-cards` — p.2, card 2 (Idoru); `sp-es-control-cards` — p.2, third card in the top row. Both rulebooks pp.18 (markers), 20–23 (attributes, control and elimination), 24–25 (movement), 36 (Armor), 38 (symbols).
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Idoru has no printed class badge, defense1 shielded and defense2–6 unshielded, card-activated movement, no Search/Delete/Reboot/Icebreaker ability, ICE faces1 and6, and Add-on/Armor slots. There is one physical pawn and one control card. The six-dot ICE rhombus was misread as five in the earlier observation; it is not a three-dimensional block die or an acting Icebreaker modifier. The instruction places one control marker on this card and counts it as being in Cybernet.

The normal acquisition path immediately places one of the new controller's available markers on the physical card. It can win immediately. Taking a card bearing another player's marker returns that marker to its owner before the new marker is placed (p.18). Gaining pawn control through Icebreaker or an attachment uses the same typed operation. Merely controlling Toyeku, moving Idoru, synchronizing a card zone or refreshing a turn does not repeat that instruction. No printed class is represented by `class: []`; the old Lovedoll/Search/free-step pilot is revoked. Printed facts are verified, while the full pawn/card remains provisional.

**Unresolved interpretation (T-RULES-023/025):** neither reviewed text gives this untagged instruction an explicit repeat/reset rule after a marker-removal effect. Page18 EN says another player's markers are returned on takeover; ES omits the equivalent of another. Page23 returns a non-Reboot card to common without instructing the removal of control markers. The experimental literal reading preserves a counted marker on a released common-area card until another player gains that element; it does not silently return or regenerate it. Same-owner reacquisition of a common card still bearing that owner's marker rejects with a source-ruling error, preserving the entire state and RNG. Repeat placement after a marker is sacrificed remains unaccepted; Hacktivism must not be promoted on a guessed refill policy. A different controller's takeover, ordinary acquisition and immediate victory are covered, but these unresolved lifecycle cases prevent full Idoru or mode acceptance.

## SR-CARD-018 — Phase-Loop acting Icebreaker benefits

- **Source:** `sp-en-action-cards` — page 4, cell 1; cross-check `sp-es-action-cards`, page 4, cell 1. Both rulebooks pp.29 (extra acting dice), 32–33 (attachment/cost/cleanup), 37 (Gadgets), 38 (symbols).
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** One Cyberdeck Gadget, attached to a controlled pawn for one bonus counter. Its controller's hand limit decreases by two. The attached pawn rolls one additional Icebreaker die and is unaffected by Black ICE. Its separate action strip provides two movement steps or Icebreaker activation. Attaching it grants no new activation.

The typed `attach.icebreakerModifier` combines with the acting pawn's printed modifier. It is distinct from target ICE: it neither changes an equipped target's ICE nor creates ICE on Central Core or another ICE-less target. Both block and pawn Icebreaker use it. Discarding, takeover, elimination and provider cleanup remove the benefits and hand penalty and return the paid counter through existing attachment cleanup. Tests in both mirrors exercise the printed attributes, both acting routes, Black ICE failure before/after removal, target ICE absence, and Antro's optional Gadget removal. Antro's scope remains provisional under T-RULES-027; Phase-Loop's printed attributes do not depend on that interpretation.

## SR-PAWN-005 — Gynoid beginning-of-turn theft

- **Source:** `sp-en-control-cards` — p.2 cell3; `sp-es-control-cards` p.2 cell2; bilingual rulebooks pp.8, 10, 20–25, 38.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Gynoid is Lovedoll, has card-activated movement, no printed core abilities, Add-on/Armor slots, shielded defense1 and unshielded2–6, and exact ICE2/3/4/5. At the beginning of her controller's turn, that player may target another pawn and steal one random physical card from its controller's hand. The card enters the thief's hand; this is not a draw from the action deck or a discard.

The typed native pawn effect offers decline or another live controlled pawn whose controller has a nonempty hand. It excludes Gynoid herself and neutral pieces. The bilingual text says another pawn rather than enemy or same-block pawn; no range qualifier is printed, so the data uses Cybernet scope and allows another friendly pawn. The same-block requirements on pp.16/17/27/28 apply to the named Search/attack/Icebreaker rules, not this unqualified special text. A friendly target transfers a randomly selected card within the same physical hand, preserving multiplicity. Empty hands offer no executable theft; decline is always available.

Only an accepted target advances seeded RNG, once, over physical hand positions; duplicates retain their physical weight. Target/skip previews do not advance RNG or reveal identities. The trusted event identifies the transferred card; the thief and losing controller can see it, while other player histories mask it. An existing source-defined face-up hand (Trojan) records public card visibility on the transfer event itself, so later attachment removal or reveal cannot rewrite that history. Current hand projections continue to follow present attachments. The phase waits for the decision, then performs beginning-marker cleanup. No action-phase or out-of-turn theft is granted. T-RULES-005 still owns simultaneous beginning-effect order; Gynoid remains provisional until that composition is accepted.

## SR-PAWN-006 — Drone MK-2 native movement, Delete and Module slot

- **Source:** `sp-en-control-cards` — p.2 cell4; cross-check `sp-es-control-cards` p.2 cell4; `sp-en-pawns` p.2 folded unit2. Bilingual rulebooks pp.18, 20–26, 30, 33, 35, 38.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Drone class, one Module slot, shielded defense1/2/3 and vulnerable4/5/6, exact pawn ICE2/6, native once-per-turn five-step movement and one-skull card-activated Delete. No Search, Icebreaker, Reboot or out-of-turn exception is printed. Opposed standee panels and alternate language/paper formats represent the same one pawn and one control card.

The free movement permits up to five steps, including zero; unused steps are lost. Occupied spaces may be traversed but finite occupied destinations cannot be stopped on. Mark the physical native ability after use. P.25 separately permits action-card movement in addition to native movement; paying a movement card does not spend/refresh that native free source. Normal arrows, destinations and modifiers remain enforced.

Delete requires a matching played card and contributes one die before target assignment. The paid card/accepted public roll survive invalid assignments; no reroll occurs during assignment. The Module slot uses normal eligibility and costs. A single attached Servocanon free activator coexists with native paid Delete and adds its skull; its broader multiple-free and discarded-card reuse issues remain under T-RULES-014/021, not promoted by this pawn.

The native movement marker follows the physical control card during takeover or common-area release; relocation, reacquisition and old-controller turns do not refresh it. P.18 removes markers from cards currently controlled at that controller's beginning. No-Reboot elimination returns the pawn to reserve and its card to common, discards/refunds modules, and preserves that native card marker until a controlled beginning clears it. Immediate final-marker victory on Engineering War precedes placement, leaving the pawn/card in reserve/common. Mirrored source-sequence tests cover costs, rejection/RNG, cleanup, current ownership and marker timing.

## SR-PAWN-007 — Drone Probe free Search and movement

- **Source:** `sp-en-control-cards` — p.2 cell7; cross-check `sp-es-control-cards` p.2 cell7; `sp-en-pawns` p.2 folded unit3. Bilingual rulebooks pp.15, 18, 20–27, 30, 33, 35, 38.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** One Drone pawn/card, Module-only slot, shielded defense1/2 and vulnerable3/4/5/6, exact rhombus ICE1/3/6, native once-per-turn five-step movement and native once-per-turn free Search. No native Delete/Icebreaker/Reboot, stealth or out-of-turn exception is printed; the skull motif in the pawn artwork is not a Delete attribute.

Free Search uses no hand card and commits its own native Search marker when it reveals a tile. Placement is a later authorized decision; invalid placements preserve that reveal/use. Public eligibility/options cannot expose hidden tile identity/topology. The pawn need not occupy a boundary space to Search; its block must have an open unoccupied connecting side. No hand is required, and there is no extra paid-Search fallback without a printed card activation. Empty pile or sealed reference rejects before spending a use.

The native movement marker is independent of Search. Up to five free steps, including zero, and additional paid card movement follow p.24/25 without refreshing Search. Physical native markers follow their card through takeover/common release and clear at its current controller's beginning, not on relocation/reacquisition or the old controller's turn. Modules use ordinary eligibility/cost/cleanup; a single Servocanon may grant free Delete but does not invent paid Delete activation. Its wider T-RULES-014/021 gaps remain separate. Thirteen equivalent tests in each mirror and shared byte snapshots/events/options verify these native records, physical costs/cleanup, rejection/RNG and timing. Sandbox/editor replay, undo, recovery and save/load integrate the existing engine options under T-RULES-043/044. Full corpus and modes remain unaccepted.

## SR-PAWN-008 — Drone Turret and permitted turns

- **Source:** `sp-en-control-cards` — p.2 cell8; cross-check `sp-es-control-cards` p.2 cell8; bilingual rulebooks pp.18, 20, 24, 26, 28, 30, 33, 35, 38; EN pawn p2 separate folded unit8.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** One Drone pawn/control card, one Module slot, shielded defense1–4 and vulnerable5/6, exact pawn ICE1/4, one-skull card-activated Delete and crossed-out movement. It may activate abilities during any player's turn. This changes ability timing, not controller, costs, range, activation sources or other pawns' permissions. Crossed-out movement prohibits every movement activation, including cards and granted movement; an explicit effect relocation is distinct.

**Timing interpretation:** The special permission applies during a turn's phases, overriding the ordinary action-phase/controller-turn limit for this pawn's abilities. The controller explicitly submits the action and pays from their hand. Public Delete rolls belong to that controller through assignment, without switching the active player or phase. The permission does not say to interrupt an ability already resolving. Pending movement paths, Search placements, combat dice assignments, replacement decisions and phase effects therefore remain indivisible until resolved; p.24 expressly forbids actions between movement steps. Multiple table declarations are accepted one complete declaration at a time, with no invented simultaneous-priority rule. Ordinary costs, targets, cleanup, marker reset and victory remain unchanged. Shadowraiders joint threat responses need their own source composition; this Speedrunners permission does not transfer an active threat window.

Thirteen equivalent tests in each mirror and golden/drone-turret.json assert source sequence, snapshots, ordered events, public/private options, physical accounting, rejection/RNG and cleanup. Sandbox handoff/public assignment/replay/recovery/undo/reset and editor source-target save/load cover T-RULES-045/046; full corpus/setup and modes remain open.
