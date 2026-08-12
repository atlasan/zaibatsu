import { describe, expect, test } from "bun:test";
import { actionCardDraftForAsset, buildActionCardPatch, buildPatch, draftForAsset, validateDocument, type AssetRecord } from "./model";

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
describe("action-card editor model", () => {
  const cardAsset: AssetRecord = { assetId: "sp-en-action-cards-p01-c01", artifactId: "sp-en-action-cards", page: 1, kind: "action-card" };
  test("keeps vision candidates provisional until confirmed", () => {
    const draft = actionCardDraftForAsset(cardAsset, { confidence: 0.2, reviewRequired: true, reasons: ["OCR unavailable"] });
    expect(validateDocument(draft, [cardAsset]).join(" ")).toContain("reviewer confirmation");
    draft.transcription.reviewerConfirmed = true;
    draft.transcription.duplicateGroupConfirmed = true;
    draft.transcription.printedText = "Discard this card.";
    expect(validateDocument(draft, [cardAsset])).toEqual([]);
  });
  test("marks a missing Shadowraiders target as absent", () => {
    const patch = buildActionCardPatch(actionCardDraftForAsset({ ...cardAsset, assetId: "sh-en-action-cards-p01-c01", artifactId: "sh-en-action-cards" }), null);
    expect(patch.targetAbsent).toBe(true);
    expect(patch.targetPath).toBe("spec/data/shadowraiders/action-cards.json");
  });
});
