# Standalone game-data editor plan

## Outcome

Build a local-first editor for Zaibatsu source-derived game data. The implemented
surfaces are a **block editor** and an **action-card editor**: each opens a
selected source crop beside a structured draft, validates it, and exports an
explicit review patch. They run without either engine and never mutate canonical
game data without an explicit export action.

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

Use a small TypeScript/Bun web application under `tools/block-editor/`. The
authoring surfaces have no engine imports and read files only through a
deliberately narrow local bridge: asset manifest, session document, source
catalog, and chosen data bundle. The same host also serves the separate
`/play/` rules sandbox; only its in-memory server module imports the TypeScript
engine, and it never writes canonical data. Editor writes remain limited to the
user-selected session/export path. This keeps the tools desktop-local and
portable to a browser-hosted shell later.

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
| 2 - block geometry | Hex canvas, six entrances, bonus corners, and source-positioned spaces | **Implemented for print layout:** a source-aligned, scrollable pointy-hex canvas renders the standardized 2-3-2 internal placement hexes, entrance/corner order, 1-N space-to-zone assignments, source-facing display shapes, and inferred candidate space adjacency. Runtime step movement remains a source-transcription and engine follow-up. |
| 3 - source workflow | Provenance locator forms, review report, draft/verified gating | Reviewer can trace every exported field to source evidence |
| 4 - generic resources | **Action-card MVP implemented**; add pawn/marker schemas and shared plug-ins | One shared editor shell manages all core resource types |
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
- The action-card surface browses both English decks, creates source-linked card
  drafts, validates them independently of blocks, and exports review-only
  patches/reports.

## Delivery order

The block and action-card MVPs are complete. Next, finish source-review gates,
add pawn/marker resource plug-ins, and keep exported patches review-only. Do
not add records to the Go/TypeScript engines until exported data has passed the
existing source/provenance review.
