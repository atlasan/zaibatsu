# Transcript Review Findings

Saved review findings for transcript cleanup passes that compare extracted text
against the regenerated page-image artifacts under `tmp/ruletext/pages/`.

## Purpose

- keep discovered extraction issues from getting lost between cleanup passes;
- attach the current review state to specific artifact pages;
- guide future transcript consolidation from the page-image evidence.

## Current Findings

### `sp-en-rulebook`

- p.29:
  The page image confirms the intended ICE-value example order and wording.
  The corrected worked examples are:
  - "With a modifier of 5 and ICE values 6, 4, and 3, you have four chances
    to succeed at an Icebreak attempt: 6, 5, 4, and 3."
  - "But with the same modifier of 5 and ICE values of 6, 5, and 4, you only
    have three chances to succeed at an Icebreak attempt: 6, 5, and 4 because
    the 5 modifier is redundant."

### `sh-en-rulebook`

- p.09:
  The extracted text is partially out of visual order. Use the page image as
  the source of truth for "Drone Threat Spaces", "Event space", "Placing Threat
  Tokens in Event space", "Information block with threat tokens", "Controlling
  a Block", and "Direction dice".
- p.10:
  The extracted text loses the card-diagram structure. The visible order is:
  "New Pawn Attributes", the card callouts, then "Pawn Black ICE value",
  "Hand size modifiers", and "Mission Slots".
- p.11:
  The second mercenary-control sequence on the page image begins with
  "1. Move a pawn under your control...", but the extracted text currently
  starts that sequence at step 2. The bottom icon glossary is visually clear.
- p.12:
  The extraction flattens the activation tables and symbol groupings. Use the
  page image to distinguish the activation modes and the blocked-stealth symbol.
- p.16:
  The page image clearly shows the three-state mission-tag example. It is
  suitable for later manual consolidation into cleaner prose.

## Workflow Note

The transcript generator now links every page section to its corresponding page
image and injects any saved review notes from `tools/ruletext/review_notes.json`
directly into the generated Markdown.
