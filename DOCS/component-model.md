# Component data model — what's inside a block and a card

The complete inventory of every piece of information a Zaibatsu **information
block** and **action card** carry, so the editor, the detection prefill, and the
engine all target the same shape. Each field notes its **status**: ✅ modeled
(schema + engine) · ✏️ editor-only · ⛔ gap (needs schema/model work). Rule
references point at `DOCS/rules/speedrunners/*` and the transcripts.

Source of truth for the shape: `spec/schema/block.schema.json`,
`spec/schema/action-card.schema.json`, and `tools/block-editor/model.ts`.

---

## Information block

Blocks use a fixed internal layout, `standard-seven-zone-2-3-2-pointy`: **7
placement hexes** `h1`(centre) and `h2`–`h7` (the outer ring, clockwise from
upper-left). A gameplay **space** owns one or more zones; entrances/corners are
indexed on the 6 outer edges/vertices.

### Identity & classification
| Field | Status | Notes |
|---|---|---|
| `id`, `name`, `expansion` | ✅ | name is the printed title; it is large stylised **diagonal** art text, which local OCR does *not* read reliably (it returns body text, not the title), so `name` stays a manual/review field. |
| `layoutId` | ✅ | always the standard 7-zone layout. |
| `isCentralCore` | ✅ | the core tile; all pawns start here. |
| `assetRefs` | ✅ | physical asset ids (`spec/assets/manifest.json`). |
| `provisional` | ✅ | true until source-verified. |

### ICE (defense vs Icebreaker) — SR-BOARD "ICE value"

**Printed form (source-confirmed):** the block's ICE **difficulty** sits at a hex
**corner** — a die or 3-D dice showing the value; a **black die** = Black ICE
(e.g. Freeside). This is separate from an **ICE modifier** printed as a flat die
*inside a space* (`space.modifier.kind = ice`). Detection must key ICE difficulty
to a corner and not confuse it with an in-zone modifier die. Human ground truth
for four blocks (Central Core, Pink District, Cleaner, Freeside) is captured in
`tools/hexvision/blocks-truth.json`.

| Field | Status | Notes |
|---|---|---|
| `iceValue` (`none`/`low`/`medium`/`high`/`black`) | ✅ | category: low=3 dice, medium=2, high=1, black=1 black die. |
| **`iceFaces`** (the specific 1–6 die faces) | ✅(schema) / ✅(detect) / ✅(engine) | schema + both engine mirrors: `iceFacesFor` prefers the authored faces over the category derivation (Go + TS, tested). `tools/hexvision/detect.py` **reads the flat die faces** from the tile → `iceDiceCandidates`, review-required. |
| **`blackIce`** (bool) | ✅(schema) / ✅(engine) | schema + both mirrors: a failed Icebreak against a `blackIce` block eliminates the attacker (independent of the `black` category; tested). |

### Spaces (per gameplay cell) — SR-BOARD "Spaces"
Each space: `id`, `type` (`normal`/`special`/`pawn`/`effect`), `zoneIds` (1+ of
h1–h7), `capacity` (int | `unlimited`; default = zone count), `neighbors`
(intra-block links — data present, step traversal deferred), `displayShape`
(`auto`/`circle`/`capsule`/`compound`; render-only), `pawnId` (for pawn spaces),
`effectId` (for effect spaces). ✅ modeled. Plus per-space **modifiers**:
| Modifier | Status | Notes |
|---|---|---|
| `modifier.kind = defense` (± shielded/unshielded defense dice) | ✅ | |
| `modifier.kind = hand-size` (± max hand size) | ✅ | |
| `modifier.kind = attack` (modify a Delete attack) | ✅ | |
| **`modifier.kind = ice`** (space modifies a target's ICE) | ✅(schema) / ⛔(engine) | source-confirmed: printed as a **flat die on a zone** (e.g. Cleaner). Distinct from the block's ICE *difficulty*, which sits at a **corner** (see ICE section). `ice` added to `space.modifier.kind`; engine consumption pending. |
| **`space.direction`** (a space allows movement only one way) | ✅(schema) / ✅(engine) / ⛔(detect) | schema + both mirrors: `StepTargets` restricts a space's **cross-edge** exit to the single local edge named by `direction` (tested). No arrows on the base tiles, so detection stays manual. |

### Board topology
| Field | Status | Notes |
|---|---|---|
| `edges[6]` (which sides expose a connecting space) | ✅ | drives legal placement + passages. |
| `boundarySpaces[6]` (edge → boundary zone: E1→h3 … E6→h2) | ✅(derived) | **derived on load** (`DeriveBoundarySpaces` / `deriveBoundarySpaces`) from open `edges` + each space's `zoneIds`; drives cross-edge step movement on real block data (tested). Kept runtime — the data file stays edges+zoneIds as the single source. |

### Bonus zone — SR-BOARD "Bonus fragments/icons"
| Field | Status | Notes |
|---|---|---|
| `bonusCorners[6]` (which of 6 corners are **white**) | ✅(data) / ⛔(economy) | a bonus zone forms where **three white corners** meet on the board; the bonus-icon economy is not yet resolved by the engine. |
| `bonusFragments` (count) | ✅ | derived from `bonusCorners`. |

### Effects — SR-BOARD "Block effects"
| Field | Status | Notes |
|---|---|---|
| `effects.inCybernet` (fires on placement) | ✅ | accepts a bare effect-id string **or** a typed effect (below). |
| `effects.underControl` (fires on a successful Icebreaker / change of control) | ✅(schema) / ⛔(engine) | user-flagged; now typed: each effect is a legacy string **or** `{kind, amount?, target?, text?}` with `kind ∈ {gain-control-card, place-pawn, area-attack, all-players, modify-ice, custom}`. Existing string data stays valid. Engine dispatch is the paused follow-up. |

---

## Action card

A **multi-use** card with **two independent parts** (user-flagged); **one use is
chosen per play** (SR-CARD-001), the rest void:

1. **Action part** — a small, **reversed** strip (usually the bottom edge): the
   generic action *any* card can be spent on — **move / icebreaker / delete /
   search / reboot**. This is `movement` + `activates[]`. Present on every card.
2. **Card part** — the whole main (upright) face: the card's *actual* use, e.g.
   **attach** as an add-on/weapon/armor/… to a pawn/enemy/block, conferring
   `attach.grants[]` / `attach.removes[]` and an `attach.effectText` on the target.

Both coexist — the action strip and the card use are **not** alternatives to
discriminate by slot; they are two regions of the same card. Detection must
therefore partition by region (bottom reversed strip vs. main face). Content is
largely printed text + symbols, so **OCR + icon detection** drive the prefill
(see `tools/hexvision/cards.py`).

### Identity
| Field | Status | Notes |
|---|---|---|
| `id`, `name` (title) | ✅ | printed title. |
| **`type`** (`add-on`/`gadget`/`weapon`/`armor`/`module`/`mission`/`action`/`movement`/`event`) | ✅(schema) / ⛔(detect) | the card's printed type/category; for an attachment card it matches `attach.slot`. |
| **`class[]`** (the card's *own* class, e.g. Accelerator / E-Synapse / Cyborg / Brainchip / Malware) | ✅(schema) / ⛔(detect) | the card's own class-tag(s), printed by the title (confirmed by the human drafts). **Distinct** from the attach *class restriction* below — flat class matching conflates them. |
| `copies` | ✅ | identical copies in the 54-card deck (dedup via perceptual hash). |
| `summary` | ✅ | source-reviewed gameplay paraphrase. |
| `assetRefs` | ✅ | physical asset ids. |
| transcription (`printedText`, `reviewerConfirmed`, `duplicateGroupConfirmed`, `vision.confidence`) | ✏️ editor | review workflow. |

### Action part (bottom reversed strip — every card)
The card can be spent on **0+ movements** and **0+ (normally one) action** — one
use is chosen per play (SR-CARD-001).
| Field | Status | Notes |
|---|---|---|
| **`movements[]`** (`{type: fixed\|d6\|2d6\|hex, amount?, stealth?}`) | ✅(schema) / ⛔(detect) | 0+ movement options: **fixed steps / one die / two dice / one whole hex** (SR-MOVE-001), optionally **stealth** (Shadowraiders: normal budget, no threat wake — SH-PAWN-001). Legacy `movement:int` = one `{fixed}`. |
| `activates[]` (`search`/`delete`/`reboot`/`icebreaker`) | ✅(schema) / ⛔(detect) | the action(s) this card can be spent on. Independent of the card use; OCR keyword-matched today (from the bottom-strip badges/labels). |
| **`effects[]`** (typed **operations** the card performs when **played**) | ✅(schema) / ⛔(engine, detect) | `{kind ∈ gain-control-card\|place-pawn\|area-attack\|all-players\|modify-ice\|draw-cards\|gain-bonus\|sacrifice-pawn\|custom, amount?, target?, text?, trigger?}`. For a directly-played one-time effect (not an attach-time effect). Card analogue of the block `effects`. |

### Card part — attachment use (`attach{}`), what it confers on the target
| Field | Status | Notes |
|---|---|---|
| `attach.as` (`pawn`/`enemy`/`block`) | ✅(schema) / ⛔(detect) | printed attach-target symbol (bottom badge: PAWN / ENEMY ADD-ON / …). |
| `attach.slot` (`add-on`/`gadget`/`weapon`/`armor`/`module`/`mission`) | ✅ / ⛔(detect) | printed slot banner (yellow, top/bottom edge). Its presence is what marks the card as an attachment. |
| **`attach.grants[]`** (abilities the attachment **gives** the target) | ✅(schema) / ✅(engine) / ⛔(detect) | schema + both mirrors: applied via `effectiveAbility` (a granted ability is card-activated on the target; Icebreaker tested). These live on the **main face** (not the action strip), so they are **not** the same as `activates`. Detection: main-face badges/rules text — human-filled today. |
| **`attach.removes[]`** (abilities the attachment **strips**) | ✅(schema) / ✅(engine) / ✅(detect-marker) | schema + both mirrors: `effectiveAbility` strips the ability even when innate (tested). Detection: `cards.py` now flags the **✕ remove-marker** on main-face ability badges (`icon.removed`, `proposals.attach.removesCount`); the human still names *which* ability (the badge glyph isn't read). |
| `attach.class[]` (**target** class restriction) | ✅ / ⛔(detect) | the classes this card may attach to (e.g. "only **Cleaner** pawns"); clarified in schema. Distinct from the card's own `class` (identity, still a gap). |
| **`attach.grantsMovement[]`** (`movementValue`) | ✅(schema) / ⛔(engine, detect) | movement options the attachment **gives** its target (fixed/d6/2d6/hex, optionally stealth). E.g. STEALTH CAMO "+3 stealth" / CYBER WINGS "+1d6 stealth". |
| **`attach.grantsStealth`** (bool) | ✅(schema) / ⛔(engine, detect) | grants the **stealth capability** (the target's own movement becomes stealth-capable) without a specific count. E.g. INVISIBLE SERUM "+Stealth". Revealed by the human drafts. |
| **`attach.grantsSlot[]`** (slot types) | ✅(schema) / ⛔(engine, detect) | gives the target an additional attachment **slot**. E.g. FLATLINE "allow gadget attachment". Revealed by the human drafts. |
| **`attach.abilityUses[]`** (how a granted ability/move is used) | ✅(schema) / ⛔(engine, detect) | source-flagged: a granted ability (incl. **move**) is used a fixed **`perTurn`** count, a **`d6`** roll, or **card / once-per-turn** activation. `grants`/`removes` now also include `move`. |
| **`attach.iceModifier`** (`{faces?, deltaDice?, black?}`) | ✅(schema) / ⛔(engine, detect) | source-flagged: an attachment can grant specific ICE **die faces**, add/remove **dice**, and/or a **black** die (a failed Icebreak vs a black die eliminates the pawn). The card analogue of `space.modifier.kind=ice`. |
| **`attach.drawModifier`** / **`attach.handModifier`** (int ±) | ✅(schema) / ⛔(engine, detect) | source-flagged: change the **cards drawn per turn** / max hand size while attached. Card analogue of the space `hand-size` modifier. |
| **`attach.blockSpace`** (`{shape: circle\|hex}`) | ✅(schema) / ⛔(engine, detect) | source-flagged: a few cards attach **as a block** (`as=block`) — a single-space mini-block placed on a block side. |
| `attach.cost` (bonus counters, 1+) | ✅ / ⛔(detect) | printed cost glyph (bonus icons). |
| **`attach.effectText`** + **`attach.effectTrigger`** (special effect + timing) | ✅(schema) / ⛔(engine, detect) | free-text effect (e.g. "Gain control of this pawn.") and **when** it fires: `on-attach` (default) / `begin-turn` / `end-turn` / `on-control` / `on-icebreak` / `continuous`. |

**Detection partition.** The two parts are read from different **regions**, not
by an either/or rule: the bottom **reversed strip** → the action part
(`activates`/`movement`); the **main face** → the card use (slot, target, and the
grant/remove/effect the attachment confers). `tools/hexvision/cards.py` reads the
action `activates` from OCR keywords and the `slot`/`as` from the banners, and
flags the main-face grants/removes/effect for the human (curved main-badge text
and the ✕ marker are not yet read).

**Card detection targets** (user-requested "zone/icons/effects/actions"):
1. **OCR** the title + body — ✅ working (local Tesseract). 2. **Icons**: ability
badges, slot banner, attach badge — ✅ region-classified; **✕ remove-marker ✅
detected** (`icon.removed`); the specific ability *glyph* is still unread. 3.
**Zones/regions**: title / art / rules-text / cost bands —
pending. 4. **Effects/actions**: map icons+text → the discriminated buckets above.
Everything stays `reviewRequired` for human confirmation.

---

## Gap summary — status

**Schema landed** (`spec/schema/*`, additive & backward-compatible — all 8 blocks
+ 16 cards still validate; `bun tools/validate-spec.ts` green):
- **ICE**: `block.iceFaces` (specific 1–6 die faces) + `block.blackIce` bool.
- **Space**: `ice` added to `modifier.kind`; `space.direction` (edge 0–5) restriction.
- **Block effects**: `effects.inCybernet`/`underControl` now typed — a legacy
  string **or** `{kind ∈ gain-control-card|place-pawn|area-attack|all-players|
  modify-ice|custom, amount?, target?, text?}`.
- **Card**: `attach.grants[]` / `attach.removes[]` (abilities conferred/stripped),
  `attach.effectText`, and clarified `attach.class[]` = target-class restriction.

**Detection landed** (`tools/hexvision/*`): block ICE die faces
(`iceDiceCandidates`); card OCR + two-part proposals (`activates` vs `attach`) +
icon regions. The block editor can optionally apply existing per-tile HexVision
results to one draft or create missing drafts in bulk; geometry is used to align
the source overlay, while inferred gameplay content remains review-required.

**Engine mirrors — landed (Go + TS, `go test`/`bun test` green, parity held):**
- All new fields are in both domain models + loaders. `iceFaces` (authored faces
  override the category) and `blackIce` are **consumed** by the Icebreaker (tested
  in both mirrors). Golden fixtures regenerated (they were stale from the content
  expansion, not from these changes); Go and TS produce byte-identical snapshots.

**Ability grant/remove — landed (Go + TS, tested):** `attach.grants` / `attach.removes`
are applied by `effectiveAbility(gd, pawn, attachments, name)` (combat.go / combat.ts):
an add-on/weapon that grants an ability makes it card-activated on its target, and
one that removes an ability strips it even when innate. **Icebreaker, Delete, and
Search** all resolve through it (tested each way in both mirrors), so a granted
ability enables a pawn that lacks it and a removed one disables an innate ability.
Reboot stays innate-only by design — its actor is eliminated, so its attachments
are already discarded.

**Intra-block step movement — landed (Go + TS, tested):** `StepTargets` builds the
space-adjacency graph (intra-block `space.neighbors` + cross-edge `boundarySpaces`,
honouring open `edges`, block `rotation`, and a space's `direction`); `MoveStep`
executes one validated, capacity-checked hop. This is the foundation that lets a
pawn be *on* a space — the prerequisite for space modifiers. (Cross-edge hops
activate once blocks encode `boundarySpaces`; intra-block stepping works today.)

Step-budget movement now **executes** on the board: `MoveSteps` (action
`move-steps`) walks a declared path under the resolved `steps`/`d6`/`2d6` budget,
passing occupied spaces and ending only where capacity permits (unused steps lost,
SR-MOVE-002). Previously only whole-block `hex` movement executed.

**Remaining engine logic (not yet wired):**
- `space.modifier.kind = ice` (now *unblocked* — a pawn can be on a space — but its
  ICE-adjust rule isn't applied yet), typed `effects.underControl` dispatch, and
  `attach.effectText`.
- Detection still open: card `class` (own identity), grant/remove ✕-marker glyph,
  card cost/movement glyphs; block name (stylised diagonal — manual) and direction
  arrows (absent on base tiles).
