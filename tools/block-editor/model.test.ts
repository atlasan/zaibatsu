import { describe, expect, test } from "bun:test";
import { buildPatch, draftForAsset, validateDocument, type AssetRecord } from "./model";

const asset: AssetRecord = { assetId: "sp-en-blocks-a4-p01-c01", artifactId: "sp-en-blocks-a4", page: 1, kind: "block" };

describe("block editor model", () => {
  test("creates a source-linked provisional draft", () => {
    const draft = draftForAsset(asset);
    expect(draft.source.assetId).toBe(asset.assetId);
    expect(draft.block.assetRefs).toEqual([asset.assetId]);
    expect(validateDocument(draft, [asset])).toEqual([]);
  });

  test("rejects broken edge references", () => {
    const draft = draftForAsset(asset);
    draft.block.boundarySpaces[0] = ["missing"];
    expect(validateDocument(draft, [asset]).join(" ")).toContain("unknown space");
  });

  test("validates bonus-corner count and visual space placement", () => {
    const draft = draftForAsset(asset);
    draft.block.bonusCorners[0] = true;
    draft.block.bonusFragments = 0;
    draft.block.spaces.push({ id: "space-a", type: "normal", location: { x: 101, y: 50 }, footprint: { shape: "hex", cells: [{ q: 0, r: 0 }] } });
    const errors = validateDocument(draft, [asset]).join(" ");
    expect(errors).toContain("Bonus fragment count");
    expect(errors).toContain("within 0..100");
  });

  test("requires a double pill and a connected large footprint", () => {
    const draft = draftForAsset(asset);
    draft.block.spaces.push({ id: "double-a", type: "double", footprint: { shape: "pill", cells: [{ q: 0, r: 0 }, { q: 2, r: 0 }] } });
    draft.block.spaces.push({ id: "large-a", type: "special", footprint: { shape: "large", cells: [{ q: -2, r: 0 }, { q: 2, r: 0 }] } });
    const errors = validateDocument(draft, [asset]).join(" ");
    expect(errors).toContain("two adjacent hexes");
    expect(errors).toContain("connected large footprint");
  });

  test("exports an optimistic-concurrency patch", () => {
    const patch = buildPatch(draftForAsset(asset), "abc123");
    expect(patch.targetPath).toBe("spec/data/speedrunners/blocks.json");
    expect(patch.baseDataSha256).toBe("abc123");
    expect(patch.operations[0].sourceAssetId).toBe(asset.assetId);
  });
});