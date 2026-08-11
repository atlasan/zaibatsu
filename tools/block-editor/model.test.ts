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

  test("exports an optimistic-concurrency patch", () => {
    const patch = buildPatch(draftForAsset(asset), "abc123");
    expect(patch.targetPath).toBe("spec/data/speedrunners/blocks.json");
    expect(patch.baseDataSha256).toBe("abc123");
    expect(patch.operations[0].sourceAssetId).toBe(asset.assetId);
  });
});