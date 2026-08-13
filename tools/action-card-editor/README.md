# Zaibatsu Action Card Editor

The dedicated action-card authoring surface is served by the shared local editor
server so that it uses the same source manifest, session store, validation, and
patch exporter as the block editor.

```powershell
bun tools/block-editor/server.ts
```

Open `http://localhost:4173/action-cards/`.

It intentionally has no block grid, entrances, corners, or placement controls.
Each card record is linked to one or more physical `action-card` asset IDs;
that list is the authoritative copy count. Printed text remains review evidence
in the local session. Exported game data contains normalized effects and an
optional concise, source-reviewed `summary`, not a duplicate card layout.