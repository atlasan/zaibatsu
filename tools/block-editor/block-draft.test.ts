import cases from "../hexvision/fixtures/block-draft-cases.json";
import { describe, expect, test } from "bun:test";
import { compileBlockDraft, scoreBlockDraft } from "./block-draft";
import { applyVisionPrefill, draftForAsset, type AssetRecord, type BlockLayout } from "./model";

const asset: AssetRecord = { assetId: "sp-en-blocks-a4-p07-c02", artifactId: "sp-en-blocks-a4", page: 7, kind: "block" };
const layout = { id: "standard-seven-zone-2-3-2-pointy", edges: [{ zoneId: "h3" }, { zoneId: "h4" }, { zoneId: "h5" }, { zoneId: "h6" }, { zoneId: "h7" }, { zoneId: "h2" }], zones: [] } as unknown as BlockLayout;

describe("block draft compiler", () => {
  test("matches the shared HexVision fixture and does not invent effects or pawn ids", () => {
    for (const item of cases.cases) {
      const draft = compileBlockDraft(item.tile, item.samples);
      for (const [key, value] of Object.entries(item.draft)) expect(draft[key as keyof typeof draft]).toEqual(value);
      expect(draft.promoted).toBe(false);
      expect(draft.spaces.every((space) => !("pawnId" in space))).toBe(true);
    }
  });

  test("scores agreement and a hand-size miss without promoting", () => {
    const item = cases.cases.find((entry) => entry.name === cases.score.case)!;
    const draft = compileBlockDraft(item.tile, item.samples);
    expect(scoreBlockDraft(draft, cases.score.block)).toEqual(cases.score.expect);
    const missed = structuredClone(cases.score.block);
    missed.spaces[1]!.modifier!.amount = 1;
    expect(scoreBlockDraft(draft, missed).fields.handSize).toBe("miss");
    expect(scoreBlockDraft(draft, missed).promoted).toBe(false);
  });

  test("editor apply keeps the review draft and leaves effects unset", () => {
    const item = cases.cases[0]!;
    const applied = applyVisionPrefill(draftForAsset(asset), layout, { ...item.tile, zoneSamples: item.samples, center: [0, 0], inradius: 1, vertices: [] });
    expect(applied.block.spaces.find((space) => space.id === "h7")?.modifier).toEqual({ kind: "defense", dice: [{ value: 2, shielded: false }] });
    expect(applied.block.spaces.find((space) => space.id === "h5-h6")).toMatchObject({ type: "pawn", capacity: "unlimited" });
    expect(applied.block.spaceArrows).toEqual([{ from: "h7", to: "h2" }, { from: "h3", to: "h4" }]);
    expect(applied.block.nonPlayableZoneIds).toEqual(["h1"]);
    expect(applied.block.iceFaces).toEqual([]);
    expect(applied.block.effects).toBeUndefined();
    expect(applied.block.provisional).toBe(true);
    expect(applied.annotations[0]).toContain("does not promote");
  });
});
