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
| Field | Status | Notes |
|---|---|---|
| `iceValue` (`none`/`low`/`medium`/`high`/`black`) | ✅ | category: low=3 dice, medium=2, high=1, black=1 black die. |
| **`iceFaces`** (the specific 1–6 die faces) | ✅(schema) / ✅(detect) / ⛔(engine) | schema field added (`block.schema.json`). `tools/hexvision/detect.py` **reads the flat die faces** from the tile (bold dark outline + pips; the decorative 3-D dice are skipped) → `iceDiceCandidates`, review-required. Engine still *derives* `IceFaces` from the category — reading the real field is the paused-engine follow-up. |
| **`blackIce`** (bool) | ✅(schema) / ⛔(engine) | schema field added; failing an Icebreak vs Black ICE eliminates the attacker. Engine still folds it into the `black` category. |

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
| **`modifier.kind = ice`** (space modifies a target's ICE) | ✅(schema) / ⛔(engine) | user-flagged; `ice` added to `space.modifier.kind`. Engine consumption is the paused follow-up. |
| **`space.direction`** (a space allows movement only one way) | ✅(schema) / ⛔(engine, detect) | the printed direction arrow → `space.direction` (edge index 0–5) added to schema. No arrows on the base tiles, so detection is deferred; engine restriction is the paused follow-up. |

### Board topology
| Field | Status | Notes |
|---|---|---|
| `edges[6]` (which sides expose a connecting space) | ✅ | drives legal placement + passages. |
| `boundarySpaces[6]` (edge → boundary zone: E1→h3 … E6→h2) | ✅ | which space each open edge connects through. |

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
| `id`, `name` | ✅ | printed title. |
| **`class` / type** (the card's *own* class, e.g. Malware/Virus) | ⛔ **gap** | the card's own class-tag, printed by the title. **Distinct** from the attach *class restriction* below — flat class matching conflates them. |
| `copies` | ✅ | identical copies in the 54-card deck (dedup via perceptual hash). |
| `summary` | ✅ | source-reviewed gameplay paraphrase. |
| `assetRefs` | ✅ | physical asset ids. |
| transcription (`printedText`, `reviewerConfirmed`, `duplicateGroupConfirmed`, `vision.confidence`) | ✏️ editor | review workflow. |

### Action part (bottom reversed strip — every card)
| Field | Status | Notes |
|---|---|---|
| `movement` (steps) | ✅(schema) / ⛔(detect) | printed as step/dice glyphs in the action strip. |
| `activates[]` (`search`/`delete`/`reboot`/`icebreaker`) | ✅(schema) / ⛔(detect) | the action(s) this card can be spent on. Independent of the card use; OCR keyword-matched today (from the bottom-strip badges/labels). |

### Card part — attachment use (`attach{}`), what it confers on the target
| Field | Status | Notes |
|---|---|---|
| `attach.as` (`pawn`/`enemy`/`block`) | ✅(schema) / ⛔(detect) | printed attach-target symbol (bottom badge: PAWN / ENEMY ADD-ON / …). |
| `attach.slot` (`add-on`/`gadget`/`weapon`/`armor`/`module`/`mission`) | ✅ / ⛔(detect) | printed slot banner (yellow, top/bottom edge). Its presence is what marks the card as an attachment. |
| **`attach.grants[]`** (abilities the attachment **gives** the target) | ✅(schema) / ⛔(detect) | user-flagged; added to `action-card.schema.json`. An add-on/weapon/… confers abilities on its target when attached. These live on the **main face** (not the action strip), so they are **not** the same as `activates`. Detection: main-face badges/rules text — human-filled today. |
| **`attach.removes[]`** (abilities the attachment **strips**) | ✅(schema) / ⛔(detect) | added to schema; a main-face ability badge marked with an **✕** is *removed* from the target (e.g. an add-on that removes SEARCH). Distinct from `grants`. Detection: a main-face badge bearing a cross (pending). |
| `attach.class[]` (**target** class restriction) | ✅ / ⛔(detect) | the classes this card may attach to (e.g. "only **Cleaner** pawns"); clarified in schema. Distinct from the card's own `class` (identity, still a gap). |
| `attach.cost` (bonus counters) | ✅ / ⛔(detect) | printed cost glyph. |
| **`attach.effectText`** (special on-attach effect) | ✅(schema) / ⛔(detect) | added to schema; e.g. "Gain control of this pawn." / "This pawn ignores direction arrows." — free-text effect, from the main rules box. |

**Detection partition.** The two parts are read from different **regions**, not
by an either/or rule: the bottom **reversed strip** → the action part
(`activates`/`movement`); the **main face** → the card use (slot, target, and the
grant/remove/effect the attachment confers). `tools/hexvision/cards.py` reads the
action `activates` from OCR keywords and the `slot`/`as` from the banners, and
flags the main-face grants/removes/effect for the human (curved main-badge text
and the ✕ marker are not yet read).

**Card detection targets** (user-requested "zone/icons/effects/actions"):
1. **OCR** the title + body — ✅ working (local Tesseract). 2. **Icons**: ability
badges, slot banner, attach badge — ✅ region-classified; specific ability glyph +
✕-marker pending. 3. **Zones/regions**: title / art / rules-text / cost bands —
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
icon regions.

**Remaining (paused-engine follow-up, `DOCS/engine-resume-plan.md`):**
- Engine mirrors (Go `internal/domain` + TS `src/domain`) + loaders read the new
  fields; `IceFaces` reads real faces; typed effect dispatch; keep `DOCS/parity.md`
  and both golden snapshots in step. Deferred while the engine is paused.
- Detection still open: card `class` (own identity), grant/remove ✕-marker glyph,
  card cost/movement glyphs; block name (stylised diagonal — manual) and direction
  arrows (absent on base tiles).
