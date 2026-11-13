/** Review-only block draft compiled from a HexVision tile. Mirrors tools/hexvision/compile.py. */

export const DRAFT_ZONES = ["h1", "h2", "h3", "h4", "h5", "h6", "h7"] as const;
export type DraftZone = (typeof DRAFT_ZONES)[number];
const EXCLUDED_WHITE_MAX = 0.15;

export interface DraftDie { value: number; shielded: boolean }
export interface DraftSpace {
  id: string;
  type: "normal" | "pawn";
  zoneIds: DraftZone[];
  capacity: number | "unlimited";
  displayShape: "auto" | "circle" | "capsule" | "compound";
  neighbors: string[];
  modifier?: { kind: "defense"; dice: DraftDie[] } | { kind: "hand-size"; amount: number };
}
export interface BlockDraft {
  asset?: string;
  reviewRequired: true;
  promoted: false;
  edges: boolean[];
  bonusCorners: boolean[];
  bonusFragments: number;
  iceValue: "none" | "low" | "medium" | "high" | "black";
  blackIce: boolean;
  iceFaces: number[];
  nonPlayableZoneIds: DraftZone[];
  spaces: DraftSpace[];
  spaceArrows: Array<{ from: string; to: string }>;
  unresolved: string[];
}
export interface DraftScore {
  blockId?: string;
  asset?: string;
  promoted: false;
  fields: Record<string, "match" | "miss" | "unread">;
}

type Tile = {
  asset?: string;
  edges?: boolean[];
  whiteCorners?: boolean[];
  bonusCorners?: boolean[];
  iceCorner?: { corner?: number; dice?: number; black?: boolean } | null;
  iceDiceCandidates?: Array<{ face?: number; role?: string; zone?: string; shielded?: boolean }>;
  spaces?: Array<{ kind?: string; suggestedZoneIds?: string[]; pawnHome?: boolean }>;
  symbols?: {
    defense?: Array<{ zone?: string; value?: number; shielded?: boolean }>;
    handSize?: Array<{ zone?: string; amount?: number }>;
    arrows?: Array<{ from?: string; to?: string }>;
    pawnHomes?: string[][];
  };
  zoneSamples?: Array<{ zone?: string; whiteFraction?: number }>;
};

function zonesOf(values: unknown): DraftZone[] {
  if (!Array.isArray(values)) return [];
  const seen: DraftZone[] = [];
  for (const item of values) if ((DRAFT_ZONES as readonly string[]).includes(item) && !seen.includes(item as DraftZone)) seen.push(item as DraftZone);
  return seen.sort((left, right) => DRAFT_ZONES.indexOf(left) - DRAFT_ZONES.indexOf(right));
}
function bool6(values: unknown): boolean[] | null {
  return Array.isArray(values) && values.length === 6 && values.every((item) => typeof item === "boolean") ? [...values] : null;
}
function die(value: unknown, shielded: unknown): DraftDie | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6 ? { value, shielded: Boolean(shielded) } : null;
}

export function compileBlockDraft(tile: Tile, samples?: Array<{ zone?: string; whiteFraction?: number }>): BlockDraft {
  const unresolved: string[] = [];
  let edges = bool6(tile.edges);
  if (!edges) {
    edges = [false, false, false, false, false, false];
    unresolved.push("edges were not read");
  }
  const ice = tile.iceCorner && typeof tile.iceCorner === "object" ? tile.iceCorner : null;
  let bonus = bool6(tile.bonusCorners);
  if (!bonus) {
    bonus = bool6(tile.whiteCorners);
    if (bonus && ice && Number.isInteger(ice.corner) && ice.corner! >= 0 && ice.corner! <= 5) bonus = bonus.map((flag, index) => index === ice.corner ? false : flag);
  }
  if (!bonus) {
    bonus = [false, false, false, false, false, false];
    unresolved.push("bonus corners were not read");
  }
  const black = Boolean(ice?.black);
  const diceCount = ice?.dice;
  let iceValue: BlockDraft["iceValue"];
  if (black) iceValue = "black";
  else if (diceCount === 1) iceValue = "high";
  else if (diceCount === 2) iceValue = "medium";
  else if (diceCount === 3) iceValue = "low";
  else {
    iceValue = "none";
    if (ice) unresolved.push("ICE corner die count was not 1, 2, or 3");
  }
  if (ice && iceValue !== "none") unresolved.push("ICE corner count is a category hint; exact faces stay unread");

  const claimed = new Set<DraftZone>();
  const spaces: DraftSpace[] = [];
  for (const candidate of tile.spaces ?? []) {
    const zoneIds = zonesOf(candidate?.suggestedZoneIds);
    if (!zoneIds.length) { unresolved.push("incomplete zone proposal left unresolved"); continue; }
    if (zoneIds.some((zone) => claimed.has(zone))) { unresolved.push("overlapping zone proposal left unresolved"); continue; }
    zoneIds.forEach((zone) => claimed.add(zone));
    const pawn = Boolean(candidate.pawnHome);
    spaces.push({
      id: zoneIds.join("-"), type: pawn ? "pawn" : "normal", zoneIds, capacity: pawn ? "unlimited" : zoneIds.length,
      displayShape: candidate.kind === "circle" || candidate.kind === "capsule" || candidate.kind === "compound" ? candidate.kind : "auto", neighbors: [],
    });
  }
  for (const home of tile.symbols?.pawnHomes ?? []) {
    const zoneIds = zonesOf(home);
    const match = spaces.find((space) => space.zoneIds.join() === zoneIds.join());
    if (!match) { unresolved.push(`pawn home ${zoneIds.join("-") || "(empty)"} is not one detected space`); continue; }
    match.type = "pawn"; match.capacity = "unlimited";
  }
  const defense = new Map<string, DraftDie[]>();
  let unclassified = false;
  for (const candidate of tile.iceDiceCandidates ?? []) {
    const parsed = die(candidate?.face, candidate?.shielded);
    if (candidate?.role === "modifier" && candidate.zone && (DRAFT_ZONES as readonly string[]).includes(candidate.zone) && parsed) {
      defense.set(candidate.zone, [...(defense.get(candidate.zone) ?? []), parsed]);
    } else if (candidate?.role !== "difficulty") unclassified = true;
  }
  for (const mark of tile.symbols?.defense ?? []) {
    const parsed = die(mark?.value, mark?.shielded);
    if (mark?.zone && (DRAFT_ZONES as readonly string[]).includes(mark.zone) && parsed) {
      defense.set(mark.zone, [...(defense.get(mark.zone) ?? []).filter((item) => item.value !== parsed.value), parsed]);
    } else unresolved.push("defense mark was not a face on a placement zone");
  }
  const hand = new Map<string, number>();
  for (const mark of tile.symbols?.handSize ?? []) {
    if (mark?.zone && (DRAFT_ZONES as readonly string[]).includes(mark.zone) && Number.isInteger(mark.amount) && mark.amount !== 0) hand.set(mark.zone, mark.amount!);
    else unresolved.push("hand-size mark was not a nonzero integer on a placement zone");
  }
  for (const space of spaces) {
    const defenseZones = space.zoneIds.filter((zone) => defense.has(zone));
    const handZones = space.zoneIds.filter((zone) => hand.has(zone));
    if (defenseZones.length && handZones.length) { unresolved.push(`${space.id} has both a defense die and a hand-size mark; neither was applied`); continue; }
    if (defenseZones.length) {
      const dice = defenseZones.flatMap((zone) => defense.get(zone) ?? []).sort((left, right) => left.value - right.value || Number(left.shielded) - Number(right.shielded));
      space.modifier = { kind: "defense", dice };
    } else if (handZones.length) {
      const amounts = new Set(handZones.map((zone) => hand.get(zone)));
      if (amounts.size > 1) unresolved.push(`${space.id} has conflicting hand-size marks; neither was applied`);
      else space.modifier = { kind: "hand-size", amount: hand.get(handZones[0]!)! };
    }
  }
  if (unclassified) unresolved.push("unclassified flat dice were not copied into ICE faces");
  const excluded: DraftZone[] = [];
  for (const sample of samples ?? tile.zoneSamples ?? []) {
    const fraction = sample?.whiteFraction;
    if (sample?.zone && (DRAFT_ZONES as readonly string[]).includes(sample.zone) && !claimed.has(sample.zone as DraftZone) && typeof fraction === "number" && fraction <= EXCLUDED_WHITE_MAX && !excluded.includes(sample.zone as DraftZone)) excluded.push(sample.zone as DraftZone);
  }
  excluded.sort((left, right) => DRAFT_ZONES.indexOf(left) - DRAFT_ZONES.indexOf(right));
  const byZone = new Map(spaces.flatMap((space) => space.zoneIds.map((zone) => [zone, space.id] as const)));
  const arrows: Array<{ from: string; to: string }> = [];
  for (const mark of tile.symbols?.arrows ?? []) {
    const source = byZone.get(mark?.from as DraftZone), dest = byZone.get(mark?.to as DraftZone);
    if (!source || !dest) { unresolved.push(`arrow from ${mark?.from} to ${mark?.to} references a zone with no space`); continue; }
    if (source === dest) { unresolved.push(`arrow from ${mark?.from} to ${mark?.to} stays inside one space`); continue; }
    if (!arrows.some((arrow) => arrow.from === source && arrow.to === dest)) arrows.push({ from: source, to: dest });
  }
  return {
    asset: tile.asset, reviewRequired: true, promoted: false, edges, bonusCorners: bonus, bonusFragments: bonus.filter(Boolean).length,
    iceValue, blackIce: black, iceFaces: [], nonPlayableZoneIds: excluded, spaces, spaceArrows: arrows, unresolved,
  };
}

function modifierRows(spaces: Array<{ zoneIds?: string[]; modifier?: { kind?: string; dice?: DraftDie[]; amount?: number } }>, kind: string) {
  return spaces.flatMap((space) => {
    if (space.modifier?.kind !== kind) return [];
    if (kind === "defense") return [{ zones: [...(space.zoneIds ?? [])], dice: [...(space.modifier.dice ?? [])].sort((left, right) => left.value - right.value || Number(left.shielded) - Number(right.shielded)) }];
    return [{ zones: [...(space.zoneIds ?? [])], amount: space.modifier.amount }];
  }).sort((left, right) => left.zones.join().localeCompare(right.zones.join()));
}
function arrowPairs(arrows: Array<{ from?: string; to?: string }>, spaces: Array<{ id?: string; zoneIds?: string[] }>) {
  const zones = new Map(spaces.map((space) => [space.id, space.zoneIds ?? []]));
  return arrows.flatMap((arrow) => {
    const source = zones.get(arrow.from), dest = zones.get(arrow.to);
    return source?.length && dest?.length ? [{ from: source, to: dest }] : [];
  }).sort((left, right) => left.from.join().localeCompare(right.from.join()) || left.to.join().localeCompare(right.to.join()));
}
function status(got: unknown, expected: unknown): "match" | "miss" {
  return JSON.stringify(got) === JSON.stringify(expected) ? "match" : "miss";
}

export function scoreBlockDraft(draft: BlockDraft, block: { id?: string; edges?: boolean[]; bonusCorners?: boolean[]; blackIce?: boolean; iceValue?: string; iceFaces?: number[]; nonPlayableZoneIds?: string[]; spaces?: Array<{ id?: string; type?: string; zoneIds?: string[]; modifier?: { kind?: string; dice?: DraftDie[]; amount?: number } }>; spaceArrows?: Array<{ from?: string; to?: string }> }): DraftScore {
  const faces = draft.iceFaces ?? [];
  const sortZones = (values: string[] = []) => [...values].sort((left, right) => DRAFT_ZONES.indexOf(left as DraftZone) - DRAFT_ZONES.indexOf(right as DraftZone));
  return {
    blockId: block.id, asset: draft.asset, promoted: false,
    fields: {
      edges: status(draft.edges, block.edges ?? []),
      bonusCorners: status(draft.bonusCorners, block.bonusCorners ?? []),
      blackIce: status(draft.blackIce, Boolean(block.blackIce)),
      iceValue: status(draft.iceValue, block.iceValue ?? "none"),
      iceFaces: faces.length ? status(faces, block.iceFaces ?? []) : "unread",
      nonPlayable: status(sortZones(draft.nonPlayableZoneIds), sortZones(block.nonPlayableZoneIds)),
      defense: status(modifierRows(draft.spaces, "defense"), modifierRows(block.spaces ?? [], "defense")),
      handSize: status(modifierRows(draft.spaces, "hand-size"), modifierRows(block.spaces ?? [], "hand-size")),
      arrows: status(arrowPairs(draft.spaceArrows, draft.spaces), arrowPairs(block.spaceArrows ?? [], block.spaces ?? [])),
      pawnZones: status(
        draft.spaces.filter((space) => space.type === "pawn").map((space) => space.zoneIds).sort((left, right) => left.join().localeCompare(right.join())),
        (block.spaces ?? []).filter((space) => space.type === "pawn").map((space) => space.zoneIds ?? []).sort((left, right) => left.join().localeCompare(right.join())),
      ),
      effects: "unread",
    },
  };
}
