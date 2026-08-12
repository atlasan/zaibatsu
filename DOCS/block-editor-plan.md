# Standalone game-data editor plan

## Outcome

Build a local-first editor for Zaibatsu source-derived game data. The first
usable slice is a **block editor**: it opens a selected cut block sprite beside
its structured record, supports guided transcription and geometry annotation,
validates the draft, and exports an explicit JSON patch for review. It must run
without either engine and never mutate canonical game data without an explicit
export action.

The same workspace later manages action/control cards, pawns, markers, threats,
missions, Chaos material, and modes.

## Product boundary

| In scope for the first release | Explicitly not in scope |
|---|---|
| Browse checksum-pinned block assets | Running game effects or turns |
| Create/edit structured block drafts | Replacing Go/TS data loaders |
| Edit spaces, edges, boundary spaces, ICE, effects and provenance | Automatic OCR treated as authoritative |
| Validate records and references before export | Writing original PDFs/artwork into Git |
| Export reviewable patches and a validation report | Directly publishing a verified record |

The editor is a **content-authoring tool**. It can produce a draft or a
source-linked proposed update; the existing spec validator and source-review
process decide whether a record becomes verified.

## Standalone architecture

```text
local source PDFs / ignored extracted images
                    |
        spec/assets/manifest.json (read-only input)
                    |
       editor session (*.editor.json, draft working state)
                    |
  +-----------------+------------------+
  | asset browser / canvas              | inspector / form |
  | crop + source locator + annotations | block fields     |
  +-----------------+------------------+
                    |
       validation report + explicit export patch
                    |
       spec/data/** + provenance (human-reviewed commit)
```

Use a small TypeScript/Bun web application under `tools/block-editor/` with no
engine imports. The app reads files through a deliberately narrow local bridge:
asset manifest, session document, source catalog, and chosen data bundle. The
bridge writes only the user-selected session/export path. This keeps it usable
as a desktop-local tool now and portable to a browser-hosted shell later.

## First-screen layout

```text
+----------------------+--------------------------------+---------------------------+
| Assets               | Block canvas                   | Inspector                 |
| filter: Speedrunners | [ rendered block image ]       | identity / ICE / effects  |
| [thumb] p01-c01      | [ hex-boundary overlay ]       | spaces / edges / bonuses  |
| [thumb] p01-c02      | [ source crop + mask toggle ]  | provenance / validation   |
| [thumb] p01-c03      |                                |                           |
+----------------------+--------------------------------+---------------------------+
| Drafts | diagnostics | undo/redo | Save session | Export patch |              |
+---------------------------------------------------------------------------+
```

Core interactions: select a cut asset; create/reopen its draft; enter the
block identifier and data; click a hex edge or space overlay to edit its
relationship; attach a source locator/note; validate continuously; save the
session; export a JSON patch only after validation.

## Editor data lifecycle

1. **Import** validates `spec/assets/manifest.json` and source checksums.
2. **Draft** is stored in a separate `*.editor.json` session document.
3. **Validate** checks the draft against the block schema, asset references,
   duplicate IDs, six-edge completeness, boundary-space references, and
   provenance completeness.
4. **Export** creates a deterministic patch/report; it does not alter
   `spec/data` silently.
5. **Review and merge** transcribes the patch into canonical data, runs
   repository validators, and changes provisional/verified status only with
   source evidence.

## Capability ladder

| Phase | Deliverable | Exit condition |
|---|---|---|
| 0 - contracts | Session schema, example draft, UX/design record | Data lifecycle and acceptance tests agreed |
| 1 - block MVP | Standalone local UI, asset browser, form editor, session save | **Implemented:** a block draft can be created, reopened, validated and exported |
| 2 - block geometry | Hex canvas, six entrances, bonus corners, and typed source-positioned spaces | **Implemented for print layout:** a source-aligned, scrollable pointy-hex canvas validates entrance/corner order, two-hex double pills, and connected large/special footprints. Space-adjacency remains a source-transcription follow-up. |
| 3 - source workflow | Provenance locator forms, review report, draft/verified gating | Reviewer can trace every exported field to source evidence |
| 4 - generic resources | Card/pawn/marker schemas and list/canvas plug-ins | One shared editor shell manages all core resource types |
| 5 - import helpers | Optional OCR/image-assisted suggestions | Suggestions remain draft-only and require confirmation |

## Export contract

An export has three deterministic files:

- `*.patch.json` - requested `add` / `replace` operations against a named
  canonical data bundle;
- `*.report.json` - validator results, asset IDs, source checksums, and field
  provenance;
- `*.editor.json` - the retained editable draft/session.

Export operations must include `baseDataSha256` and reject a changed target
bundle. This prevents a stale editor session from overwriting a newer
transcription.

## Acceptance criteria for the block MVP

- Loads the 48 individually cut English block assets: 24 Speedrunners and 24
  Shadowraiders.
- Shows source artifact, page, crop, and polygon mask for the selected block.
- Creates an unsaved draft without touching `spec/data`.
- Rejects invalid IDs, missing expansion, more/fewer than six edges, invalid
  boundary-space IDs, missing asset IDs, and missing primary provenance.
- Persists/reopens a session without loss of values or undo history.
- Exports a stable patch/report and detects changed target data.
- Has keyboard-first save/validate/export controls and clear validation
  messages; image-only editing is never the sole source of game data.

## Delivery order

Start with Phase 0, then implement Phase 1 as a self-contained tool branch.
Do not add block records to the Go/TypeScript engines until the exported data
has passed the existing source/provenance review.