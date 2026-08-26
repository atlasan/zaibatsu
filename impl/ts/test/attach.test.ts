import { describe, expect, test } from "bun:test";
import { loadDefault } from "../src/data/index.ts";
import { type GameData, type GameState } from "../src/domain/types.ts";
import { slotFilled } from "../src/domain/pawn_board.ts";
import { neighbor, opposite, type Coord } from "../src/domain/hex.ts";
import { blockById } from "../src/domain/types.ts";
import {
  attachToBlock,
  attachToEnemy,
  attachToPawn,
  effectivePawnClasses,
  eliminatePawn,
  icebreakPawn,
  newGame,
  placeBlock,
} from "../src/engine/index.ts";

const ORIGIN: Coord = { q: 0, r: 0 };

function freshData(): GameData {
  return loadDefault("speedrunners");
}

function game(data: GameData, seed = 1): GameState {
  const s = newGame({ data, playerNames: ["A", "B"], seed });
  s.cybernet.pawns = [];
  return s;
}

function rotFacing(data: GameData, blockId: string, dir: number): number {
  const b = blockById(data, blockId)!;
  for (let rot = 0; rot < 6; rot++) {
    const local = (((opposite(dir) - rot) % 6) + 6) % 6;
    if (b.edges![local]) return rot;
  }
  throw new Error("no facing rotation");
}

describe("attachToPawn", () => {
  test("attaches, removes the card, grants the class", () => {
    const data = freshData();
    const s = game(data);
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    const p1 = s.players.find((p) => p.id === "p1")!;
    p1.hand = ["add-on-accelerator", "move-1"];
    attachToPawn(s, data, "p1", "add-on-accelerator", "speedrunner-red");
    const pob = s.cybernet.pawnById("speedrunner-red")!;
    expect(slotFilled(pob, "add-on")).toBe(true);
    expect(p1.hand.includes("add-on-accelerator")).toBe(false);
    expect(effectivePawnClasses(data, pob)).toContain("accelerator");
  });

  test("rejects a filled slot", () => {
    const data = freshData();
    const s = game(data);
    s.cybernet.placePawn({
      pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core",
      attachments: [{ cardId: "x", slot: "add-on" }],
    });
    s.players.find((p) => p.id === "p1")!.hand = ["add-on-accelerator"];
    expect(() => attachToPawn(s, data, "p1", "add-on-accelerator", "speedrunner-red")).toThrow();
  });

  test("rejects a missing slot", () => {
    const data = freshData();
    const s = game(data);
    s.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.players.find((p) => p.id === "p1")!.hand = ["armor-brainchip"];
    expect(() => attachToPawn(s, data, "p1", "armor-brainchip", "drone-turret")).toThrow();
  });

  test("granted slots allow a follow-up attachment", () => {
    const data = freshData();
    data.cards.push(
      { id: "grant-gadget-slot", name: "Grant Gadget Slot", attach: { as: "pawn", slot: "module", grantsSlot: ["gadget"] } },
      { id: "follow-up-gadget", name: "Follow Up Gadget", attach: { as: "pawn", slot: "gadget" } },
    );
    const s = game(data);
    s.cybernet.placePawn({ pawnId: "drone-turret", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    const p1 = s.players.find((p) => p.id === "p1")!;
    p1.hand = ["grant-gadget-slot", "follow-up-gadget"];
    attachToPawn(s, data, "p1", "grant-gadget-slot", "drone-turret");
    attachToPawn(s, data, "p1", "follow-up-gadget", "drone-turret");
    expect(slotFilled(s.cybernet.pawnById("drone-turret")!, "gadget")).toBe(true);
  });
});

describe("attachToEnemy", () => {
  test("attaches to an opponent's pawn; rejects own", () => {
    const data = freshData();
    const s = game(data);
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    s.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core" });
    const p1 = s.players.find((p) => p.id === "p1")!;
    p1.hand = ["enemy-malware"];
    attachToEnemy(s, data, "p1", "enemy-malware", "speedrunner-red", "speedrunner-blue");
    expect(slotFilled(s.cybernet.pawnById("speedrunner-blue")!, "add-on")).toBe(true);
    p1.hand = ["enemy-malware"];
    expect(() => attachToEnemy(s, data, "p1", "enemy-malware", "speedrunner-red", "speedrunner-red")).toThrow();
  });
});

describe("attachToBlock", () => {
  test("attaches to an ICE block; rejects the Central Core", () => {
    const data = freshData();
    data.cards.push({ id: "blk-card", name: "Block Patch", attach: { as: "block" } });
    const s = game(data);
    placeBlock(s, ORIGIN, 0, data, "data-haven", rotFacing(data, "data-haven", 0));
    const coord = neighbor(ORIGIN, 0);
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord, spaceId: "a" });
    const p1 = s.players.find((p) => p.id === "p1")!;
    p1.hand = ["blk-card"];
    attachToBlock(s, data, "p1", "blk-card", "speedrunner-red", coord);
    expect(s.cybernet.at(coord)!.attachments!.length).toBe(1);

    s.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    p1.hand = ["blk-card"];
    expect(() => attachToBlock(s, data, "p1", "blk-card", "speedrunner-blue", ORIGIN)).toThrow();
  });
});

describe("cost + cleanup", () => {
  test("cost is paid and returned on elimination", () => {
    const data = freshData();
    data.cards.push({ id: "cost-card", name: "Pricey", attach: { as: "pawn", slot: "gadget", cost: 2 } });
    const s = game(data);
    s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
    const p1 = s.players.find((p) => p.id === "p1")!;
    p1.hand = ["cost-card"];

    p1.bonusCounters = 1;
    expect(() => attachToPawn(s, data, "p1", "cost-card", "speedrunner-red")).toThrow();
    expect(p1.bonusCounters).toBe(1);
    expect(p1.hand.includes("cost-card")).toBe(true);

    p1.bonusCounters = 3;
    attachToPawn(s, data, "p1", "cost-card", "speedrunner-red");
    expect(p1.bonusCounters).toBe(1);

    eliminatePawn(s, "speedrunner-red");
    expect(p1.bonusCounters).toBe(3);
    expect(s.discard).toContain("cost-card");
  });

  test("takeover discards attachments and returns bonus to previous owner", () => {
    let found = false;
    for (let seed = 1; seed <= 80 && !found; seed++) {
      const data = freshData();
      const s = game(data, seed);
      s.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: "p1", coord: { ...ORIGIN }, spaceId: "core" });
      const p2 = s.players.find((p) => p.id === "p2")!;
      p2.bonusCounters = 0;
      s.cybernet.placePawn({
        pawnId: "drone-turret", ownerId: "p2", coord: { ...ORIGIN }, spaceId: "core",
        attachments: [{ cardId: "some-card", slot: "module", bonusPaid: 1 }],
      });
      const res = icebreakPawn(s, data, "speedrunner-red", "drone-turret", 0);
      if (res.success) {
        found = true;
        const dt = s.cybernet.pawnById("drone-turret")!;
        expect(dt.ownerId).toBe("p1");
        expect(dt.attachments ?? []).toEqual([]);
        expect(p2.bonusCounters).toBe(1);
        expect(s.discard).toContain("some-card");
      }
    }
    expect(found).toBe(true);
  });
});
