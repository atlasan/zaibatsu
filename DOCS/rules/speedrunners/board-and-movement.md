# Speedrunners rules — board and movement

## SR-BOARD-001 — Information blocks and spaces

- **Source:** `sp-en-rulebook` — pp. 4–5, “Information blocks”.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Information blocks form the Cybernet and may have placement/control
  effects, ICE, spaces, movement arrows, modifiers, and bonus fragments. Space
  capacity controls where pawns may end; special and pawn spaces are unlimited.

## SR-BOARD-002 — Historical combined Search placement

- **Source:** `sp-en-rulebook` — p.15, placement procedure; p.27, Search ability. The former pp.7–8 locator and combined-action consumption reading were incorrect.
- **Applies to:** Speedrunners regression fixtures only.
- **Maturity:** partial.
- **Rule:** Historical fixtures keep their combined Search command and consume the block only after a legal placement. Source play follows SR-BOARD-005, which commits activation and draws the block before requesting placement. Do not treat the frozen helper's retry/refund behavior as the official rule.

## SR-BOARD-003 — Bonus icons

- **Source:** `sp-en-rulebook` — pp. 4–5, “Bonus counters”.
- **Applies to:** Speedrunners.
- **Maturity:** planned.
- **Rule:** Three matching bonus fragments at a shared block corner form a bonus
  icon. Its counter is collected by the player controlling all three blocks.

## SR-MOVE-001 — Movement activation and budget

- **Source:** `sp-en-rulebook` — pp.24–25, movement activation, steps and modifiers; cross-check `sp-es-rulebook`, pp.24–25.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Movement is card-activated or once per turn, uses fixed steps, one
  die, two dice, or one whole hex, and combines applicable modifiers. Card
  movement uses the printed card budget and consumes the selected card use;
  once-per-turn movement uses a spent marker.

## SR-MOVE-002 — Movement execution

- **Source:** `sp-en-rulebook` — pp.24–25, movement activation, steps and modifiers; cross-check `sp-es-rulebook`, pp.24–25.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** A pawn may pass occupied spaces but may end only where capacity
  permits; unused steps are lost and no other action interleaves with a move.
  Hex movement moves one whole block and ignores space modifiers. The engine
  executes `steps`/`d6`/`2d6` paths through encoded intra-block links and
  rotation-aware boundary-space hops; each provisional adjacency record remains
  subject to source review. Source fixed/card zero-step activation now executes under SR-MOVE-006/T-RULES-020. Source die movement now follows the committed roll and subsequent path decision in SR-MOVE-003; frozen regression retains its historical combined command.

All 24 physical blocks have individual observations in the
[asset review register](../../artifacts/asset-review.md), with printed effect
text, corner ICE faces and space modifiers kept separate. Exact h1-h7 topology
and complete bonus-corner geometry still require their dedicated promotion
pass under T-SOURCE-REVIEW-002.

## SR-BOARD-004 — Printed Central Core

- **Source:** `sp-en-blocks-a4` — page 3, tile 2; Spanish cross-check `sp-es-blocks-a4`, page 3, tile 2.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Central Core is one unlimited-capacity special space, connected to all six entrances, with no ICE and no bonus fragments. An attacking pawn's Icebreaker modifier cannot make a target without ICE controllable.

The canonical Core is verified. Synthetic arrow boards in the Test Lab test rule semantics and are not transcriptions of another printed block.

## Page-one pilot correction

Direct bilingual review of `sp-en-blocks-a4` and `sp-es-blocks-a4`, page 1, tiles 1-3, revokes the earlier pilot interpretations: Toyeku Company places Idoru on placement without granting control; Hacktivism sacrifices one Cybernet control marker per player; Sprawl discards one hand card per controlled pawn for every player. The old under-control effects were incorrect and removed from canonical data. Printed titles are restored; `idoru` and `chiba-city` remain legacy record ids pending final source promotion. Toyeku topology and its real neutral-placement effect now execute under SR-BOARD-006/007; Hacktivism and Sprawl remain provisional under T-RULES-006. Idoru pawn/control-card behavior is a separate provisional dependency under T-RULES-023. Earlier behavior remains only in the explicit frozen regression corpus.

## SR-BOARD-005 — Search activation, draw and placement decision

- **Source:** `sp-en-rulebook` — p.15, steps 1–5 and valid placement/orientation; p.27, Search activation; p.26, activation methods; p.10, top-of-pile draw. Cross-check `sp-es-rulebook`, the same pages.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Activate a controlled pawn's Search, identify its occupied block as the reference, then draw the top information block before choosing where and how to orient it. Card activation discards one physical hand card; a supported free activation spends its turn marker at declaration. The revealed block remains pending outside the pile and board until the controlling player chooses a legal empty adjacent location connected to a space on the reference block and a facing space on the rotated new block. Then detect bonus completion and resolve the block's placement effect.

The searching pawn need not occupy an entrance space. Multiple paid Searches may follow without moving, with a new cost and top-block draw for each. An invalid response is a rejected command against the pending state: it does not return the block to the face-down pile, reverse the already accepted activation, pay again or expose another block. No other ordinary action or phase advance interleaves. An exhausted pile or reference without an open connecting side has no legal declaration; eligibility uses public information only. Engine responses, snapshots, conservation tests and player views include the pending physical block.

This supersedes SR-BOARD-002's historical combined-action consumption summary. Frozen regression fixtures retain that behavior explicitly. The source handler does not invent redraw/refund rules for unsupported custom topology or silently ignore unimplemented placement effects. Strict official construction rejects unsupported placement effects; experimental fixtures retain an explicit pending failure for review. Complete printed block topology/effect promotion remains T-RULES-006 and the wider source-review backlog. Current bonus geometry and threat deployment execute only after legal placement; this does not promote incomplete bonus/block data or full Shadowraiders setup.

## SR-MOVE-003 — Committed movement roll before path choice

- **Source:** `sp-en-rulebook` — pp.24–25, steps, die-based once-per-turn movement, activation and modifiers; p.18, start-of-turn markers. Cross-check `sp-es-rulebook`, the same pages.
- **Applies to:** Speedrunners; generic typed movement inherited by expansion fixtures.
- **Maturity:** implemented.
- **Rule:** Activate the selected die-based movement and commit its card or supported free use, then roll one or two dice and calculate the allowance, applying step modifiers once. Choose the path after seeing the result. The path may use fewer steps, including stopping without moving; unused steps are lost. No other ordinary action or phase advance interleaves. A rejected path retains the accepted activation and roll.

The authorized controller chooses adjacent steps obeying arrows and entry restrictions. Occupied spaces may be passed; stopping requires capacity. Engine prefix queries expose the actual allowance, legal next steps and whether stopping is permitted without changing state/RNG. A normal path stops at its first unresolved threatening block; selected stealth follows the existing threat exception. Resolve the movement choice before opening combat. Native/granted free routes remain separate, and ordinary fixed card movement remains independently available before or after a free activation.

The shared golden asserts byte-identical committed snapshots, public observer dice, response options, an occupied-space prefix, completion and ordered events. Tests cover one/two dice, costs, zero budget, repeated paid grants, ordinary marker reset, cancellation/restrictions, rejected/stale/unauthorized paths, threat stops and stealth. Fixtures modify native/granted movement explicitly; they do not promote unreviewed printed movers or board topology. Physical marker continuity across ownership and attachment changes now executes under SR-MOVE-005; discarded-card lifetime remains T-RULES-021. Legacy random-use-count encodings remain only in frozen regression; source constructors reject them rather than interpreting a steps die as a number of activations.

## SR-MOVE-004 — Cannot-move cancellation applies to every movement route

- **Source:** `sp-en-rulebook` — p.25, “Cannot activate movement”; cross-check `sp-es-rulebook`, p.25, crossed movement symbol. Movement versus placement remains separate under SR-TURN-007.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** A native cannot-move symbol or an attached movement cancellation prevents native, granted and card movement, including movement within the current block. A grant does not override cancellation. Explicit placement is distinct from movement.

Source action queries, step targets, paths and whole-block movement enforce cancellation. An explicitly normal relocation checks the post-discard state; an explicit placement may bypass movement restrictions. Where a source relocation's move-versus-place reading remains unresolved, the engine does not assume cancellation can be bypassed. Synthetic normal-relocation and placement fixtures test this distinction. Frozen regression keeps its earlier native-none/grant behavior explicitly.

## SR-MOVE-005 — Physical ability-marker identity and unresolved discard lifetime

- **Source:** `sp-en-rulebook` — p.18, markers placed on the used ability and removed from cards under control at turn beginning; p.25, marker duration; pp.22–23 and 33, control changes/elimination/discard. Cross-check `sp-es-rulebook`, the same pages.
- **Applies to:** Speedrunners and inherited abilities.
- **Maturity:** partial.
- **Rule:** A use marker identifies its physical ability/card. A player change or unrelated attachment-list reorder must not silently refresh a spent physical ability. Its removal follows the sourced turn/card-zone lifecycle.

Native markers now stay with their pawn control card through takeover, retained elimination and common/reserve release. Only the current controller's beginning removes them; unowned cards keep their markers. Equipped cards have independent physical ids and use counts, so duplicate definitions and attachment-list changes cannot refresh a used surviving card. Supported free activation gates, previews, snapshots, player views and events use these references. Mirrored tests and shared evidence cover the lifecycle and conservation, and the sandbox exposes capture/reset/replay.

The reviewed sources do not explicitly settle a marked attachment's discard/redraw lifetime. Proposed reading: the marker remains associated with its physical card until a source-defined removal, rather than resetting on discard; this is not adopted as a completed gameplay rule. Marked discards therefore retain unresolved metadata and affected reattachments reject before payment/RNG. Definition-only hands cannot distinguish recycled copies, so the rejection conservatively covers that definition. Metadata is not an extra card zone or paid-counter allocation. Strict official bundles containing limited-use attachments reject; experimental fixtures can exercise settled paths. T-RULES-021 must resolve marker removal and physical deck/hand copy identity, including discard, takeover, elimination, provider cleanup and re-entry. SR-MOVE-005/T-RULES-019 remains partial until that dependency closes. Both mirrors share this accepted gap.


## SR-MOVE-006 — Zero-step fixed and card movement activation

- **Source:** `sp-en-rulebook` — pp.24–25, unused steps, up-to fixed-step movement and separate card/free activation; p.18, spent markers. Cross-check `sp-es-rulebook`, the same pages.
- **Applies to:** Speedrunners and inherited step-based movement.
- **Maturity:** implemented.
- **Rule:** Activate supported fixed-step or action-card movement and choose zero steps, losing the unused allowance. This still spends its free-use marker or one physical action card. Apply movement modifiers once and clamp an allowance below zero to zero; a zero allowance still permits the zero-step activation. The independent card route does not spend or refresh a native free-use marker.

Interpretation: the bilingual up-to-step and unused-step-loss wording has no minimum-step requirement, so the same zero-step stop used after a die roll also applies to fixed/card allowances. The pawn remains in its existing legal space. Staying put does not trigger entry or awaken a threat. Movement cancellation, ownership, phase/pending-work authority and card/use limits still apply. A free activation carrying an extraneous payment card rejects rather than silently ignoring it. No other action interleaves, and a spent free use cannot later use its lost steps.

Both mirrors expose executable zero-step responses in action queries, including isolated pawns and zero allowances without legal neighbors. Queries and sandbox previews preserve full state/RNG. Shared snapshots/events cover free/card costs and duplicate physical payments; tests cover limited grants, negative modifiers, rejection, next-beginning reset and threat non-entry. The sandbox permits finishing at the current space and offers an isolated-Core Test Lab scenario with replay/undo. Frozen regression explicitly retains empty-path rejection. This completes the generic zero-step rule, not unverified printed mover/topology content, whole-block movement variants or SR-MOVE-005's discarded-card lifetime.


## SR-BOARD-006 — Matching pawn spaces and neutral placement

- **Source:** `sp-en-rulebook` — pp.13/16, pawn spaces and placing a pawn as a block-in-Cybernet effect; pp.12/17 distinguish placement from control triggers. Cross-check `sp-es-rulebook`, the same pages.
- **Applies to:** Speedrunners ordinary placement effects.
- **Maturity:** implemented.
- **Rule:** A placement-triggered named pawn enters on its matching printed pawn space, free of player control; its physical control card remains in the common area. Pawn spaces have unlimited capacity. This placement grants no marker, ownership or control-card ability to the searching player or to a future controller of the block.

The typed handler `place-neutral-pawn` consumes the physical reserve piece and requires exactly one matching `pawnId` space and one common-area card. It does not use the old controlled `place-pawn` helper or choose the first open space. Block control has no placement trigger and cannot silently capture this pawn. Missing, retained, excluded, already-boarded or controlled-card fixtures reject the placement atomically while preserving the earlier accepted Search payment and revealed tile. This is an explicit unsupported-state guard, not an invented relocation/revival rule; mode recipes that predeploy a named piece need their own sourced handling. Ordinary Speedrunners setup supplies the unique reserve piece for its first placement.

Mirrored snapshots, events, common/reserve/board accounting, cloning and player views prove the sequence. Source neutral `pawn-placed` events include the location and omit an owner; the sandbox describes free control truthfully. No player destination decision is needed because the source names the pawn space.

## SR-BOARD-007 — Toyeku Company, first printed block

- **Source:** `sp-en-blocks-a4` — page 1, tile 1; cross-check `sp-es-blocks-a4`, page 1, tile 1. Inherited rules: both rulebooks pp.12/13/16/21/38.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Toyeku Company has exact corner ICE faces 3, 4 and 6, six connected sides, bonus fragments at V2/V3/V6 and no arrows. Its upper normal double space occupies h2/h3 (capacity two); left h7 and right h4 are single normal spaces. The lower h5/h6 space is the unlimited Idoru pawn space. The center h1 is title/art, not a gameplay space. Placement puts neutral Idoru on its matching space. The right space sets defense face1 unshielded under SR-DEFENSE-001; it does not modify ICE.

The graph is a four-space ring: upper–left–Idoru–right–upper. There is no upper-to-Idoru shortcut across the title. Boundary spaces E1–E6 are upper/right/Idoru/Idoru/left/upper. The ICE corner V5 is not a bonus fragment; its white background was incorrectly counted in the old pilot. The flat white square die was also misclassified as ICE in saved observations; those observations and the component guide now distinguish it using p.21's illustrated defense examples. `nonPlayableZoneIds: [h1]` accounts for the unoccupied source zone without inventing a space.

The verified live block retains legacy id `idoru`; historical fixtures keep their old bytes explicitly. Its shared golden covers Search declaration, revealed placement options, neutral piece/card zones and ordered events. Tests cover capacity/topology, real movement, control changes, rejected invalid placements and unchanged RNG. The sandbox offers the real block and current defense profile. Idoru's own pawn attributes and marker-on-card ability remain provisional under T-RULES-023; this block delivery does not promote that pawn/card or a full mode.

## SR-MOVE-007 — Printed arrows between spaces

- **Source:** `sp-en-rulebook` — p.14, Direction arrow; cross-check `sp-es-rulebook`, p.14. Printed examples: EN/ES block sheets A4 p.1 tiles2/3; EN rulebook p.11 labels Sprawl's arrow. Octagon Dex: both action sheets p.1 cell1.
- **Applies to:** Speedrunners ordinary space movement.
- **Maturity:** implemented.
- **Rule:** A printed arrow between two adjacent gameplay spaces permits that link in the indicated direction and forbids the reverse traversal. Other adjacent links and cross-block exits remain available. Octagon Dex's typed arrow exception bypasses this restriction while attached. Turning a block rotates its art/edge mapping, not the from/to space identities.

Use `spaceArrows: [{from, to}]` over the physical symmetric neighbor graph. This separates a one-way internal link from the legacy `Space.direction` cross-edge restriction. Do not encode an internal printed arrow as that edge number or forbid every other exit from the source space. Validate adjacent known distinct endpoints, no duplicate/reversed pair and exact retained source links. All fixed, paid and rolled path previews/execution share the graph filter. Whole-block movement does not traverse an internal space link; explicit placement remains distinct.

## SR-BOARD-008 — Hacktivism printed topology and marker-effect gap

- **Source:** `sp-en-blocks-a4` — p.1 tile2; cross-check `sp-es-blocks-a4`, p.1 tile2. Both rulebooks pp.12–14/18/21.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Hacktivism has ICE2/5/6, six connected sides, bonus fragments V2–V6, and a five-space ring around non-playable h1 title art. The left double space h2/h7 shields defense2/3; h3, h4, h5 and h6 are single normal spaces. An arrow permits h3 to h4, forbidding that link in reverse. Placement tells every player to return one Cybernet control marker.

The geometry/attributes replace the revoked seven-circle pilot. Typed `return-control-marker` records the actual placement instruction. It must reject as unsupported while T-RULES-025 leaves Idoru's counted-card removal/refill and related lost-control lifecycle unaccepted. Keeping a typed unsupported effect prevents experimental Search from silently ignoring the printed rule. This tile remains provisional and is not accepted as complete.

## SR-BOARD-009 — Sprawl printed topology and global discard

- **Source:** `sp-en-blocks-a4` — p.1 tile3; cross-check `sp-es-blocks-a4`, p.1 tile3; EN rulebook p.11 illustrates and labels the same tile. Both rulebooks pp.12–14/21/23.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Sprawl (retained alias chiba-city) has ICE2/4/6, six connected sides and bonus fragments V1/V2/V3/V6. Its bottom double space spans h5/h6; h2, h3, h4 and h7 are single normal spaces, with h1 non-playable title/effect art. The arrow permits h2 to h3; h3 shields defense3. On placement, every player discards one hand card for each pawn under that player's control. A retained pawn's control card still belongs to its controller; neutral/reserve/excluded pawns without that control do not count.

Typed `discard-per-controlled-pawn` records this instruction. The experimental decision design collects each player's own physical-card selection privately, then publishes/applies all discards together in stable seat/hand order. This avoids silently assigning another player's discard or revealing an earlier submission. Counts are fixed on triggering the effect, and ordinary actions/phase changes stay blocked. This is an explicitly provisional resolution interpretation: the reviewed text does not prescribe global commitment order, and it does not settle a hand with fewer cards than required. Shortfalls reject placement against the already committed Search draw instead of guessing a discard-as-many policy. T-RULES-026 owns these acceptance gaps. Independent normal-hand behavior may be exercised without promoting the full block/mode.

## SR-SPACE-001 — Optional attachment discard on stopping

- **Source:** `sp-en-rulebook` — p.13, Effect space; pp.24–25, completing movement; pp.33/35, attachment discard and refunds. Cross-check `sp-es-rulebook`, the same pages. Printed instructions: both A4 block sheets p.2 tile1 (Antro).
- **Applies to:** Speedrunners; broader mode timing remains unaccepted.
- **Maturity:** partial.
- **Rule:** When a pawn stops on an effect space, its controller may use the printed effect or treat the space as normal. Antro's left effect space permits discarding one attached Add-on; its right permits one attached Gadget. This is a sourced discard permission, not general voluntary attachment removal. Printed defense6 shielding applies continuously whether the optional effect is used or declined.

The experimental literal target reading permits a matching printed card type on any pawn currently in Cybernet because the text supplies no owner/range restriction. It targets the card directly, rather than activating a pawn ability. EN/ES p.13 and the tile do not expressly resolve a narrower own-pawn/co-located interpretation; T-RULES-027 keeps this scope provisional. Use typed card-type/scope/optional fields and physical equipped attachment ids, never parse the printed text. Discard through normal slot-provider cleanup, returning paid counters and preserving unresolved discarded use-marker evidence.

A supported actual movement completion offers a controller-owned decision, with a decline response even if no eligible attachment exists. Pass-through does not stop. The provisional stop boundary excludes zero-step activation and explicit placement/Reboot; a positive path returning to its origin is a new completed movement. Explicit normal relocation can suspend phase bookkeeping for the decision and resume afterward. Unspecified relocation policy and overlapping threat/stop resolution reject rather than guessing priority. Counts/costs/committed movement rolls survive rejected responses. All these unresolved boundary/priority cases remain T-RULES-027 (and inherited T-RULES-008); strict official construction must reject this unaccepted effect-space family even if a caller clears record provisional flags.

## SR-BOARD-010 — Antro printed spaces and optional discard effects

- **Source:** `sp-en-blocks-a4` — p.2 tile1; cross-check `sp-es-blocks-a4`, p.2 tile1. Both rulebooks pp.12–14/21 and SR-SPACE-001.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Antro is one physical tile with four spaces around non-playable h1 artwork. Upper h2/h3 and lower h5/h6 are normal double spaces (capacity2). Left h7 and right h4 are capacity1 effect spaces. Upper shields defense3/4/5; each effect space shields6. The left permits Add-on discard, the right Gadget discard. There is no block placement/control effect and no arrow. Exact block ICE is3/5/6, six sides connect, and bonus fragments are at V3/V5/V6; the ICE corner V2 is not a bonus fragment.

The graph is upper–left–lower–right–upper, with no artwork shortcut. Boundaries E1–E6 are upper/right/lower/lower/left/upper. The printed dashed decorative borders do not create extra spaces or remove the two-pawn capsule capacities. Geometry and continuous shielding are verified; the full block stays provisional for SR-SPACE-001/T-RULES-027 target and stop interpretation acceptance.

## SR-BOARD-011 — Electromagnetic Pulse and required pawn sacrifice

- **Source:** `sp-en-blocks-a4` — p.2 tile2; cross-check `sp-es-blocks-a4`, p.2 tile2. Both rulebooks pp.12–14 (spaces/geometry), 16–17 (placement trigger), 21 (defense), 22–23 (control, elimination and sacrifice), 35 (paid counters).
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Electromagnetic Pulse is one physical tile. It has six single normal ring spaces h2–h7 around non-playable title/effect art h1, six connected edges, ICE4/5/6, bonus fragments V1/V2/V3/V4/V6, a one-way h3→h2 link, and an unshielded square defense2 modifier in h5. The flat square2 is not ICE. On placement in Cybernet, each player controlling more than one pawn must sacrifice one of their controlled pawns. Sacrifice follows elimination rules, including attachments/refunds and Reboot retention versus reserve/common release.

Each affected controller owns the decision, including outside the active player's turn; there is no optional decline or hand-card cost. Count distinct controlled pawn cards/pieces, including retained controlled pawns, rather than only pawns in this block. Experimental candidates are live controlled pawns anywhere in Cybernet. Neutral, another player's, reserve and excluded pawns cannot be chosen.

**Unresolved interpretation (T-RULES-029, inherited T-RULES-010/025):** the sources do not prescribe resolution order across players or explicitly state whether an already eliminated retained pawn can itself be sacrificed. The experimental batch fixes affected players on placement, accepts public selections in either response order, then revalidates and eliminates in stable seat order. It does not hide public selections. A retained-only affected controller rejects placement against the already paid/revealed Search rather than silently skipping that player. Retained pawns are excluded as selectable targets until that interpretation is sourced. Sacrifice with an elimination-prevention attachment remains an explicit unresolved combination; queries identify those targets separately and do not present them as executable responses. Invalid selections preserve the full pending state/RNG. Strict official loading rejects this effect family even if record provisional flags are cleared. These delivery choices do not accept the full component or mode.

## SR-BOARD-012 — Copyleft and the global bonus award

- **Source:** `sp-en-blocks-a4` — p.2 tile3; cross-check `sp-es-blocks-a4`, p.2 tile3. Both rulebooks pp.4/19 (complete pawn/control-card inventory), 12–16 (spaces, bonus fragments and ordered placement); EN/ES control sheets pp.1–2.
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Copyleft has four normal ring spaces around non-playable h1 title/effect art: left h2/h7 double (capacity2, shielded defense4), upper-right h3 single, right h4 single, lower h5/h6 double (capacity2). The arrow permits h3→h4. All six sides connect. Exact ICE2/3/6 is at V3; V1/V2/V5 are bonus fragments. The ICE visible outside the tile near V2 belongs to adjacent Electromagnetic Pulse and is not a second Copyleft ICE group. On placement every player takes one bonus counter from reserve, independently of pawn or block control.

The lower portrait's label is EKO artwork, not an additional pawn prerequisite: the complete 16-pawn/18-control-card set contains no such pawn, the tile has no pawn-placement instruction, and its space is a normal double space. The previous Eiko/pawn-prerequisite planning note is revoked. Do not invent a pawn, common control card or unlimited pawn space from that image.

Placement first allocates counters to newly completed bonus icons, then activates this effect (both rulebooks p.15 steps4/5). The physical pool is finite under SR-BONUS-001. **T-RULES-030/031:** reserve exhaustion does not specify a smaller award, priority or substitute counter. The experimental engine rejects an underfunded entire placement against the already accepted Search reveal; pure placement options withhold those destinations. This preserves resources/RNG and all players' full intended awards rather than inventing a partial payment. Copyleft remains provisional and strict official loading rejects this unaccepted shortage family even if flags are cleared.

## SR-BOARD-013 — Clandestine Broadcast and optional Core use

- **Source:** `sp-en-blocks-a4` — p.3 tile1; cross-check `sp-es-blocks-a4` p.3 tile1; `sp-en-rulebook` and `sp-es-rulebook` — pp.12–14 (spaces, defense, ICE), p.18 (control), p.27 (Reboot).
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** The controller may use Clandestine Broadcast as a Central Core. Its large broadcast space (h1/h2/h3/h4/h7) is special/unlimited and adds shielded defense faces4 and3. The two lower h5/right and h6/left spaces are normal single spaces. Each touches the other two spaces. All six entrances connect; there are no arrows or bonus fragments. Exact white ICE2/6 is at V6. The two lower no-entry-like logos are artwork, with no printed movement restriction.

This is an optional, continuing permission while the block is controlled, not a second setup Core or automatic relocation on capture. Reboot may explicitly select the original Core or this controller's broadcast space. Reboot costs, retained-pawn ownership and activation still apply; the permission grants neither Reboot itself nor an out-of-turn action. Other players may enter its ordinary spaces but cannot Reboot there. Losing control removes the destination immediately without moving pawns already present. The physical block keeps its ICE and control marker. With no destination supplied, existing calls retain the original Core behavior.

The landing space is the large broadcast circle: it visually matches the Core's special-space role; the two smaller circles retain normal capacity. The printed wording permits the controller to use the block as a Core; it does not relabel its identity for setup or force all Core-related restrictions on movement. Future mode recipes that add actual Core tiles or additional Core functions must validate their own sourced rules against this permission.

## SR-BOARD-014 — Pink District controlled pawn placement

- **Source:** `sp-en-blocks-a4` — p.3 tile3; `sp-es-blocks-a4` p.3 tile3; bilingual rulebooks pp.12–18, 23, 33.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Pink District has two normal double spaces (h2/h7 left and h3/h4 right), Gynoid's unlimited matching pawn space (h5/h6), excluded h1 title/art, six open entrances, exact white ICE2/6 at V3, and bonus fragments V1/V5. All three spaces touch. Its internal arrow permits Gynoid-space to left-space travel. On obtaining block control, place the physical Gynoid on her matching space under that player's control; placement of the tile alone grants no pawn or control.

The under-control effect repeats when another player takes the block (p.12). It places the same physical pawn from reserve or its current location; there is no second copy. If the pawn was already controlled elsewhere, relocate it to its matching home and transfer its control card. A change of pawn controller discards attachments and refunds their counters to the old controller under p.33; same-owner relocation preserves attachments and use markers. Declining or selecting another landing space is not printed. Explicit pool/card inconsistencies reject atomically. Immediate last-marker victory ends further block-effect resolution under p.18. Gynoid's own beginning ability and its composition maturity remain separate under SR-PAWN-005.

## SR-BOARD-015 — Yakuza optional adjacent-block attack

- **Source:** `sp-en-blocks-a4` — p.4 tile1; `sp-es-blocks-a4` p.4 tile1; bilingual rulebooks pp.12–14, 18, 21–23, 38.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Yakuza has an upper normal double h2/h3, single left h7 and right h4, lower dragon double h5/h6 and excluded h1 title/art. Arrows permit right to upper and left to dragon. All six entrances connect; own white ICE4/6 is at V6 and bonus fragments are V2/V3/V5. The upper flat white dice make defense faces3/2/1 vulnerable; they do not modify ICE.

On gaining block control, its controller may choose one pawn on an adjacent block to be attacked with one skull, or decline. Another player's takeover triggers this again under p.12. Adjacent means one of the six physically touching blocks; no open entrance, arrow path or matching rotation is required for this attack. The source says pawn, without enemy-only wording: friendly and uncontrolled pawns are eligible; pawns on Yakuza itself or farther away are not. This is a block effect, so no acting pawn Delete activation, extra action card, use marker or pawn attack modifier is added.

The printed sequence chooses the pawn before attacking it, then resolves the one-die roll against that pawn's effective defense/space profile. It does not change the separate public-roll-then-assignment Delete interface. Previews and declining consume no RNG. A hit uses ordinary elimination cleanup and a source-permitted single-defender prevention response (including another player's authorized response); the roll is not repeated for that response. Immediate final-marker victory ends before opening this optional effect. Decline remains possible with no eligible targets; stale, wrong-owner, wrong-range and extra-cost commands reject without changing state/RNG.

## SR-BOARD-016 — Corporate Scandal marker threshold and hand discard

- **Source:** `sp-en-blocks-a4` — p.4 tile2; `sp-es-blocks-a4` p.4 tile2; bilingual rulebooks pp.8–10, 12–14, 18, 28, 38; Idoru EN control-card p.2 c2 / ES p.2 third top-row card.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Corporate Scandal has six normal single spaces in the outer h2–h7 ring, excluded h1 title/effect art, all entrances, no arrows and no center shortcut. Its own corner dice are white ICE5/6 at V1; bonus fragments occupy V2/V3/V5/V6. The flat black die3 on h5 is shielded defense3. Other drawings grant no pawn, hand-size modifier or special action.

On gaining control, every player with more than five control markers in Cybernet discards their entire remaining hand. The threshold is strictly greater than five, after the successful capture places its marker and returns any old owner's marker. Idoru's printed card marker explicitly counts as in Cybernet; ordinary pawn ownership and markers still in reserve do not. Repeated capture repeats the effect under p.12.

The matching Icebreaker card is already face up among played cards before the roll/effect, under p.8; it is no longer in the hand being discarded. Only remaining hand cards move to discard, one physical copy/event each, including duplicates. Previously played cards and attachments stay in their zones. A qualifying empty hand resolves without payment, choice, extra draw or RNG. Discards are public. The effect is mandatory with no selected target or ordering decision because all qualifying hands discard independently. Immediate final-marker victory ends before further block effects. Unsupported thresholds/triggers/extra costs or targets reject at construction; illegal commands preserve state and RNG.

## SR-BOARD-017 — Black Clinic mandatory pawn detachment

- **Source:** `sp-en-blocks-a4` — p.4 tile3; `sp-es-blocks-a4` p.4 tile3; bilingual rulebooks pp.8, 12–14, 18, 31–33, 35, 38.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Black Clinic has normal h2 stream, h3 helmet, h4 hand and h7 left single spaces plus the large h5/h6 unlimited special Clinic circle. H1 is title/effect artwork. The five spaces form a ring, with no center shortcut; helmet-to-hand is directed. All six entrances connect. Own white ICE3/6 is at V6; bonus fragments are V1/V2/V3/V5. Lower flat white dice make defense1/2 vulnerable; the h4 hand icon changes the controller's hand limit by minus1 under SR-TURN-008. Bottle and other artwork deploy no pawn.

On obtaining control, choose a pawn in Cybernet and discard all cards attached to it. The block controller chooses; there is no printed decline, ownership/range restriction or requirement that the pawn carry cards. Own, enemy, neutral, distant and empty live pawns therefore qualify. Eliminated/retained off-board pawns do not. A choice of an empty pawn resolves zero physical discards. Takeover repeats the effect under p.12; immediate last-marker victory stops before it.

Discard every physical attachment once, including cards occupying provider-granted slots. Return invested counters to the target's current controller (p.35), remove continuous benefits and reveal effects, and preserve pawn/control-card ownership and board position. Dummy is not invoked because this discards a card rather than eliminating its pawn. Used-card marker evidence follows the existing T-RULES-021 guard: discard works, but unresolved redraw/reattachment remains unsupported; this component does not settle that broader lifecycle. Commands and pure target previews consume no RNG; wrong/stale responders, unavailable targets, decline and extra costs/selections reject atomically.

## SR-BOARD-018 — Engineering War and controlled Drone MK-2 placement

- **Source:** `sp-en-blocks-a4` — p.5 tile1; cross-check `sp-es-blocks-a4` p.5 tile1. Bilingual rulebooks pp.12–18, 21, 23, 33, 38; Drone MK-2 card under SR-PAWN-006.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Engineering War is a three-space line: normal h7 left defense and h4 right singles touch the central h1 unlimited Drone MK-2 pawn home. H2/h3 title and h5/h6 effect artwork are excluded. Only E2/right and E5/left expose entrances; placement must rotate a side entrance toward the reference. Own white ICE3/6 is at V6; bonus fragments are V1–V5. The left flat white die makes defense1 vulnerable, without changing ICE.

**Artwork reading:** The teal arrow-like glyph lies wholly inside the right circle and does not connect spaces. It differs from the white, black-outlined direction arrows illustrated on p.14 and connecting spaces on reviewed tiles. It is treated as artwork, with no `spaceArrows` or cross-edge direction inferred. The source data retains ordinary bidirectional left–home–right links; it creates no title/effect shortcuts or extra entrances.

On obtaining control, place the Drone MK-2 on this block under that player's control. Use its matching pawn home and one physical pawn/card; tile placement alone grants nothing. Repeated takeover relocates/acquires the same piece, discarding/refunding modules only when the pawn controller changes; same-controller placement preserves its module and native use marker. Native use is not refreshed by relocation/control change/common release. Source immediate final-marker victory stops before deployment. Existing pool/card inconsistency guards reject atomically, including after an accepted attempt's payment/roll inside the unaccepted command. This is the same typed controlled-placement handler as Pink District, using different shared content.

## SR-BOARD-019 — Combat Prototypes controlled Drone Probe placement

- **Source:** `sp-en-blocks-a4` — p.5 tile2; cross-check `sp-es-blocks-a4` p.5 tile2. Bilingual rulebooks pp.12–18, 21, 23, 33, 38; matching Drone Probe under SR-PAWN-007.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Combat Prototypes has normal h2 upper-left, h4 right, h5 lower-right and h7 left single spaces around the central h1 unlimited Drone Probe pawn home. H3 title and h6 effect art are excluded. The center connects to all four; upper-left also connects left, and right also connects lower-right. Only E2/E3/E5/E6 are entrances. Exact white ICE4/6 is at V2; bonus fragments are V1/V3/V4/V5/V6. Circuit/globe/triangle artwork creates no modifiers, pawns or direction arrows.

On obtaining control, place Drone Probe on its matching home under that player's control, using its one physical pawn/card. Tile placement alone does not deploy/control it. Repeated capture relocates/acquires the same piece, with module cleanup/refunds on a change of pawn controller; same-controller placement retains attachments and native markers. Immediate last-marker victory stops before deployment. Physical pool/card inconsistencies reject atomically. Thirteen equivalent tests in each mirror and shared byte snapshots/events/options verify these native records, physical costs/cleanup, rejection/RNG and timing. Sandbox/editor replay, undo, recovery and save/load integrate the existing engine options under T-RULES-043/044. Full corpus and modes remain unaccepted.

## SR-BOARD-020 — Military Development and controlled Drone Turret

- **Source:** `sp-en-blocks-a4` — p.5 tile3; cross-check `sp-es-blocks-a4` p.5 tile3; bilingual rulebooks pp.12–18, 20, 24, 33, 35, 38; Drone Turret under SR-PAWN-008.
- **Applies to:** Speedrunners.
- **Maturity:** implemented.
- **Rule:** Military Development has an unlimited matching Drone Turret pawn home at h1 between two single normal spaces h7 left hand+1 and h4 right. H2/h3 effect artwork and h5/h6 title artwork are excluded. Links form left–home–right, with only E2/right and E5/left entrances. Exact white ICE4/6 is at V5. The printed tile has five bonus fragments at V1/V2/V3/V4/V6. Teal inner-circle lettering and STOP artwork add no arrows/modifiers or movement permission.

On obtaining control, place the one Drone Turret on its matching home under that player's control. Placement alone grants nothing. Repeated takeover relocates/acquires the physical pawn/card, applying ownership-sensitive Module cleanup/refunds and preserving marked uses; immediate final-marker victory stops before deployment. The left hand+1 follows SR-TURN-008/current-controller stopped-pawn aggregation, independent of who controls the block.

Thirteen equivalent tests in each mirror and golden/drone-turret.json assert source sequence, snapshots, ordered events, public/private options, physical accounting, rejection/RNG and cleanup. Sandbox handoff/public assignment/replay/recovery/undo/reset and editor source-target save/load cover T-RULES-045/046; full corpus/setup and modes remain open.

## SR-BOARD-021 — Arms Industry and its physical block counter

- **Source:** `sp-en-blocks-a4` — p.6 tile1; cross-check `sp-es-blocks-a4` p.6 tile1; bilingual rulebooks pp.12–18, 28, 31, 35, 38 (spaces, counters, Black ICE, hand symbols and costs).
- **Applies to:** Speedrunners.
- **Maturity:** partial.
- **Rule:** Arms Industry has four single normal spaces h2 upper-left, h3 upper-right, h7 left and h6 lower-left hand−1. Links form upper-right–upper-left–left–hand. H1 holds a Bonus counter and is not a movement space; h4/h5 contain effect artwork and are excluded. Entrances are E1/E4/E5/E6. Own Black ICE6 is at V5; bonus fragments are V2/V3/V4/V6, with no fragment at V1. Teal lettering and inner-circle artwork create no arrows or pawn abilities.

On placement, put one physical Bonus counter from the reserve on this block. On obtaining control, transfer that counter to the new controller. Keep its allocation distinct from three-block bonus icons. A collected receipt prevents repeated capture from creating another counter; the printed placement instruction does not recur on takeover. Collection transfers an existing piece and works at empty reserve. Final-marker victory stops before the under-control effect. Wrong timing, corrupt allocation or a duplicated placement rejects atomically. Funded behavior is implemented under T-RULES-047; placement with insufficient reserve remains the explicit T-RULES-031 gap. Strict official construction must keep this gate even if a provisional flag is removed.
