export type CoverageStatus = "implemented" | "partial" | "planned";

export interface CoverageItem {
  label: string;
  status: CoverageStatus;
  detail: string;
}

export interface CoverageSurface {
  id: "block-editor" | "action-card-editor" | "play-workbench";
  title: string;
  route: string;
  status: CoverageStatus;
  summary: string;
  items: CoverageItem[];
}

export interface CoverageCatalog {
  version: 1;
  summary: string;
  surfaces: CoverageSurface[];
  sharedGaps: CoverageItem[];
}

const catalog: CoverageCatalog = {
  version: 1,
  summary: "Shared coverage map for the local block editor, action-card editor, and Speedrunners play workbench.",
  surfaces: [
    {
      id: "block-editor",
      title: "Block editor",
      route: "/",
      status: "implemented",
      summary: "Structured authoring covers the current block data contract and keeps derived geometry, boundary, and review data explicit.",
      items: [
        {
          label: "Identity, expansion, provenance, and provisional state",
          status: "implemented",
          detail: "Authors block ids, names, expansion, source locator/notes, and review gating without touching canonical spec data.",
        },
        {
          label: "ICE, entrances, bonus corners, and central-core state",
          status: "implemented",
          detail: "Covers exact ICE faces, Black ICE, derived ICE category, open entrances, bonus fragments, and central-core tagging.",
        },
        {
          label: "Typed block effects",
          status: "implemented",
          detail: "Authors both placement and under-control effects through the current typed effect structure.",
        },
        {
          label: "Gameplay-space structure",
          status: "implemented",
          detail: "Covers 1-N zone mapping, display shape, capacity override notes, derived neighbors, direction, modifiers, pawn ids, and effect ids.",
        },
        {
          label: "Review workflow and helper evidence",
          status: "implemented",
          detail: "Supports HexVision review prefill, validation, session save/load, and review-only export patches/reports.",
        },
      ],
    },
    {
      id: "action-card-editor",
      title: "Action-card editor",
      route: "/action-cards/",
      status: "implemented",
      summary: "Structured authoring covers the current ActionCardRecord contract, including direct effects, attachment modifiers, and review-only source evidence.",
      items: [
        {
          label: "Identity, copy groups, and review metadata",
          status: "implemented",
          detail: "Authors card ids, name, type, classes, summary, physical-copy groups, transcription, provenance, and review confirmations.",
        },
        {
          label: "Action-part movement and activates",
          status: "implemented",
          detail: "Covers legacy fixed movement, structured movement rows, and action-strip activates for Search/Delete/Reboot/Icebreaker.",
        },
        {
          label: "Direct card effects",
          status: "implemented",
          detail: "Authors current typed direct-play effects with trigger, amount, target, and custom text.",
        },
        {
          label: "Attachment structure and modifiers",
          status: "implemented",
          detail: "Covers attach target/slot/class, grants/removes, granted movement/slots/stealth, ability uses, ICE modifiers, draw/hand modifiers, block-space shape, effect timing/text, and cost.",
        },
        {
          label: "Review workflow and helper evidence",
          status: "implemented",
          detail: "Supports per-field HexVision review, deck validation, local sessions, and review-only patch/report export.",
        },
      ],
    },
    {
      id: "play-workbench",
      title: "Play workbench",
      route: "/play/",
      status: "partial",
      summary: "The sandbox covers the current implemented Speedrunners runtime subset with reducer-backed sessions, guided actions, fixtures, and replay tooling.",
      items: [
        {
          label: "Local session orchestration",
          status: "implemented",
          detail: "Supports seeded sessions, deterministic Test Lab fixtures, undo/reset, trace import/export, event logs, and canonical snapshots.",
        },
        {
          label: "Current implemented action families",
          status: "implemented",
          detail: "Surfaces basics, movement, search, combat, icebreaker/control, attachments, and reboot when the reducer says they are legal.",
        },
        {
          label: "Attachment runtime exercised in the sandbox",
          status: "implemented",
          detail: "Exercises slot/class checks, granted/removes ability resolution, granted slots, recycle draw/hand modifiers, ICE-face/Black-ICE modifiers, and discard/refund on elimination or takeover.",
        },
        {
          label: "Coverage transparency",
          status: "implemented",
          detail: "Shows which runtime slices are implemented today so authored data coverage and runnable rules coverage are not conflated.",
        },
        {
          label: "Modeled or planned-but-not-runnable slices",
          status: "planned",
          detail: "Bonus-counter economy, space ICE modifiers, typed effect dispatch, armor/nullify semantics, attachment-granted movement, attachment ability-use execution, and full source-complete content remain outside the current runnable subset.",
        },
      ],
    },
  ],
  sharedGaps: [
    {
      label: "Bonus-counter economy",
      status: "planned",
      detail: "Bonus fragments/icons are authored, but the engine still needs the full counter economy and card-cost spend flow.",
    },
    {
      label: "Typed effect execution",
      status: "planned",
      detail: "Typed block/card effects are authored today, but the shared effect registry and runtime dispatch are still pending.",
    },
    {
      label: "Attachment completion",
      status: "partial",
      detail: "Granted slots, recycle modifiers, and ICE modifiers resolve now; armor semantics, granted movement, and ability-use execution still need engine work.",
    },
    {
      label: "Source-complete Speedrunners content",
      status: "planned",
      detail: "The editors can author the current record shapes, while the sandbox remains limited to the accepted and implemented subset of transcribed content.",
    },
  ],
};

function cloneItem(item: CoverageItem): CoverageItem {
  return { ...item };
}

function cloneSurface(surface: CoverageSurface): CoverageSurface {
  return { ...surface, items: surface.items.map(cloneItem) };
}

export function editorCoverageCatalog(): CoverageCatalog {
  return {
    version: catalog.version,
    summary: catalog.summary,
    surfaces: catalog.surfaces.map(cloneSurface),
    sharedGaps: catalog.sharedGaps.map(cloneItem),
  };
}

export function coverageSurface(id: CoverageSurface["id"]): CoverageSurface {
  const surface = catalog.surfaces.find((entry) => entry.id === id);
  if (!surface) throw new Error(`Unknown coverage surface "${id}"`);
  return cloneSurface(surface);
}
