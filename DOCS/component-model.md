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
| `id`, `name`, `expansion` | ✅ | name is the printed title (OCR-able). |
| `layoutId` | ✅ | always the standard 7-zone layout. |
| `isCentralCore` | ✅ | the core tile; all pawns start here. |
| `assetRefs` | ✅ | physical asset ids (`spec/assets/manifest.json`). |
| `provisional` | ✅ | true until source-verified. |

### ICE (defense vs Icebreaker) — SR-BOARD "ICE value"
| Field | Status | Notes |
|---|---|---|
| `iceValue` (`none`/`low`/`medium`/`high`/`black`) | ✅ | category: low=3 dice, medium=2, high=1, black=1 black die. |
| **`iceFaces`** (the specific 1–6 die faces) | ⛔ **gap** | the Icebreak roll matches these exact faces; today `IceFaces` is *derived* from the category (top-N). Needed for exact ICE-value-modifier redundancy. |
| **`blackIce`** (bool) | ⛔ **gap** | failing an Icebreak vs Black ICE eliminates the attacker; currently folded into the `black` category only. |

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
| **`modifier.kind = ice`** (space modifies a target's ICE) | ⛔ **gap** | user-flagged: some spaces modify ICE. |
| **direction restriction** (a space/edge allows movement only one way) | ⛔ **gap** | the printed direction arrow; restricts pawn exit direction. |

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
| `effects.inCybernet` (fires on placement) | ✅(id) | today a bare effect-id string. |
| `effects.underControl` (fires on a successful Icebreaker / change of control) | ⛔ **gap (typing)** | user-flagged: needs a typed effect — e.g. `gain-control-card`, `place-pawn`, `area-attack`, `all-players-…`. The printed text is the source (`inCybernet`/`underControl` bodies). |

---

## Action card

A multi-use card; one use is chosen per play. Content is largely printed text +
symbols, so **OCR + icon detection** drive the prefill (see
`tools/hexvision/cards.py`).

| Field | Status | Notes |
|---|---|---|
| `id`, `name` | ✅ | printed title. |
| `copies` | ✅ | identical copies in the 54-card deck (dedup via perceptual hash). |
| `summary` | ✅ | source-reviewed gameplay paraphrase. |
| `movement` (steps granted) | ✅(schema) / ⛔(detect) | printed as step/dice glyphs. |
| `activates[]` (`search`/`delete`/`reboot`/`icebreaker`) | ✅(schema) / ⛔(detect) | printed as **ability icons**; detection should read these. |
| `attach.as` (`pawn`/`enemy`/`block`) | ✅(schema) / ⛔(detect) | printed as the attach-target symbol. |
| `attach.slot` (`add-on`/`gadget`/`weapon`/`armor`/`module`/`mission`) | ✅ / ⛔(detect) | printed slot icon. |
| `attach.class[]` (operative, drone, …) | ✅ / ⛔(detect) | printed class tags. |
| `attach.cost` (bonus counters) | ✅ / ⛔(detect) | printed cost glyph. |
| `assetRefs` | ✅ | physical asset ids. |
| transcription (`printedText`, `reviewerConfirmed`, `duplicateGroupConfirmed`, `vision.confidence`) | ✏️ editor | review workflow. |

**Card detection targets** (user-requested "zone/icons/effects/actions"):
1. **OCR** the title + body (needs Tesseract installed locally — currently
   disabled). 2. **Icons**: ability icons (activates), attach-slot icon, cost,
   class tags. 3. **Zones/regions**: title / art / rules-text / cost bands.
4. **Effects/actions**: map icons+text → `activates`/`attach`/`movement`.
Everything stays `reviewRequired` for human confirmation.

---

## Gap summary (what to add so the model covers all Zaibatsu data)

- **ICE**: `iceFaces` (specific die faces) + `blackIce` bool — block schema + Go/TS
  domain + loaders; engine `IceFaces` reads real faces when present.
- **Space modifiers**: add `ice` to `modifier.kind`; add a **direction**
  restriction (per space or per edge).
- **Block under-control effects**: type `effects.underControl` (gain-control-card
  / place-pawn / area-attack / …) rather than a bare id.
- **Card detection**: OCR (Tesseract) + ability/attach/cost/class icon reading.

These are the items behind the paused engine's data-gated work
(`DOCS/engine-resume-plan.md`) and the editor's remaining fields. Schema/engine
changes are coordinated with the parallel workstream; keep both mirrors and
`DOCS/parity.md` in step.
