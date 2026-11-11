import { expect, test } from "bun:test";
import {readFileSync} from "node:fs";
import { loadRegression } from "../src/data/index.ts";
import { advancePhase, applyActionWithEvents, cloneGameState, newGame, snapshot, deployThreats } from "../src/engine/index.ts";

function battle() {
  const gd = structuredClone(loadRegression("speedrunners"));
  const core = gd.blocks.find(b => b.isCentralCore)!;
  core.spaces = [{ id: "a", type: "special", capacity: "unlimited", neighbors: ["b"] }, { id: "b", type: "special", capacity: "unlimited", neighbors: ["a"] }];
  gd.threats = [{ id: "test-token", name: "Test token", type: "token", attackDie: 5, defense: [1,2,3,4,5,6].map(value => ({value, shielded:false})) }];
  const s = newGame({ data: gd, playerNames: ["A", "B"], seed: 101 });
  advancePhase(s, gd);
  const pawn = s.cybernet.pawnById(s.players[0]!.pawnId)!;
  const def = gd.pawns.find(p => p.id === pawn.pawnId)!;
  def.movement = { type:"steps", steps:3, activation:"once-per-turn" };
  def.abilities = [{ ability:"delete", activation:"card", skulls:2 }];
  s.players[0]!.hand = ["move-2", "move-2", "move-1"];
  s.threats = [{ id:"t1", threatId:"test-token", coord:{q:0,r:0}, spaceId:"b", status:"inactive" }];
  return {gd, s, pawnId:pawn.pawnId};
}

test("normal movement stops for a threat response; public dice assign after rolling", () => {
  const {gd,s,pawnId} = battle();
  const before = snapshot(s);
  expect(applyActionWithEvents(s,gd,{type:"move-steps",pawnId,path:[{coord:{q:0,r:0},spaceId:"b"},{coord:{q:0,r:0},spaceId:"a"}]}).accepted).toBe(false);
  expect(snapshot(s)).toBe(before);
  expect(applyActionWithEvents(s,gd,{type:"move-steps",pawnId,path:[{coord:{q:0,r:0},spaceId:"b"}]}).accepted).toBe(true);
  expect(s.pendingThreats?.stage).toBe("response");
  expect(advancePhase(s,gd).accepted).toBe(false);
  expect(applyActionWithEvents(s,gd,{type:"roll-delete",pawnId,cardId:"move-2"}).accepted).toBe(true);
  expect(s.pendingAttack?.roll).toHaveLength(2);
  expect(snapshot(s)).toBe(readFileSync(new URL("../../../golden/threat-combat.snap",import.meta.url),"utf8").trim());
  expect(s.playedCards).toEqual(["move-2"]);
  expect(s.players[0]!.hand).toEqual(["move-2","move-1"]);
  const copy = cloneGameState(s);
  copy.pendingAttack!.roll[0] = 99;
  expect(s.pendingAttack!.roll[0]).not.toBe(99);
  const rolled = snapshot(s);
  expect(applyActionWithEvents(s,gd,{type:"assign-delete",targetIds:["missing", "t1"]}).accepted).toBe(false);
  expect(snapshot(s)).toBe(rolled);
  expect(applyActionWithEvents(s,gd,{type:"assign-delete",targetIds:["t1", "t1"]}).accepted).toBe(true);
  expect(s.threats![0]!.status).toBe("eliminated");
  expect(s.pendingThreats).toBeUndefined();
  expect(applyActionWithEvents(s,gd,{type:"collect-threat",pawnId,targetId:"t1"}).accepted).toBe(true);
  expect(s.players[0]!.bonusCounters).toBe(1);
  expect(s.threats).toEqual([]);
  expect(s.clearedEvents).toEqual(["0,0:b"]);
  gd.blocks.find(b => b.isCentralCore)!.spaces![1]!.type = "event";
  s.threatPile = ["test-token"];
  deployThreats(s,gd,{q:0,r:0});
  expect(s.threats).toEqual([]);
  expect(s.threatPile).toHaveLength(1);
});

test("retaliation uses fixed dice and controlled-pawn priority; defeated threats reset next turn", () => {
  const {gd,s,pawnId} = battle();
  expect(applyActionWithEvents(s,gd,{type:"move-steps",pawnId,path:[{coord:{q:0,r:0},spaceId:"b"}]}).accepted).toBe(true);
  const enemy = s.players[1]!.pawnId;
  const before = snapshot(s);
  expect(applyActionWithEvents(s,gd,{type:"assign-threat-attack",targetIds:[enemy]}).accepted).toBe(false);
  expect(snapshot(s)).toBe(before);
  gd.pawns.find(p => p.id === pawnId)!.defense = [1,2,3,4,5,6].map(value => ({value,shielded:false}));
  const result = applyActionWithEvents(s,gd,{type:"assign-threat-attack",targetIds:[pawnId]});
  expect(result.accepted).toBe(true);
  expect(result.events.find(e => e.type === "roll")?.roll).toEqual([5]);
  expect(s.eliminated).toContain(pawnId);
  s.threats![0]!.status = "eliminated";
  s.phase = "beginning";
  advancePhase(s,gd);
  expect(String(s.threats![0]!.status)).toBe("inactive");
});

test("recycle chooses physical copies, releases played cards before refill and rejects atomic overdraw", () => {
  const {gd,s} = battle();
  s.phase = "recycle"; s.deck = []; s.discard = []; s.playedCards = ["move-3"];
  const before = snapshot(s);
  expect(applyActionWithEvents(s,gd,{type:"recycle",cardIds:["move-2","move-2","move-2"]}).accepted).toBe(false);
  expect(snapshot(s)).toBe(before);
  expect(applyActionWithEvents(s,gd,{type:"recycle",cardIds:["move-2"]}).accepted).toBe(true);
  expect(String(s.phase)).toBe("end");
  expect(s.playedCards).toEqual([]);
  expect(s.players[0]!.hand.sort()).toEqual(["move-1","move-2","move-2","move-3"]);
});

test("a matching Reboot card costs one played card; four-card Reboot is immediate discard", () => {
  const {gd,s} = battle();
  gd.cards.push({id:"test-reboot",name:"Test Reboot",activates:["reboot"]});
  const target = s.players[1]!.pawnId;
  gd.pawns.find(p => p.id === target)!.abilities = [{ability:"reboot",activation:"card"}];
  s.cybernet.removePawn(target); s.eliminated = [target]; s.players[0]!.hand = ["test-reboot"];
  expect(applyActionWithEvents(s,gd,{type:"play-reboot-card",pawnId:target,cardId:"test-reboot"}).accepted).toBe(true);
  expect(s.cybernet.pawnById(target)?.ownerId).toBe("p1");
  expect(s.playedCards).toEqual(["test-reboot"]);
  expect(s.discard).toEqual([]);
});

test("granted stealth crosses threat spaces without awakening them", () => {
  const {gd,s,pawnId} = battle();
  gd.cards.push({id:"stealth",name:"Stealth",attach:{as:"pawn",grantsMovement:[{type:"fixed",amount:3,stealth:true}],abilityUses:[{ability:"move",activation:"once-per-turn"}]}});
  s.cybernet.pawnById(pawnId)!.attachments = [{cardId:"stealth"}];
  expect(applyActionWithEvents(s,gd,{type:"move-steps",pawnId,movementIndex:1,path:[{coord:{q:0,r:0},spaceId:"b"},{coord:{q:0,r:0},spaceId:"a"}]}).accepted).toBe(true);
  expect(s.threats![0]!.status).toBe("inactive");
  expect(s.pendingThreats).toBeUndefined();
});

test("joint attack pays one card and adds sourced space and attachment skulls", () => {
  const {gd,s,pawnId} = battle();
  const second = s.players[1]!.pawnId;
  s.cybernet.pawnById(second)!.ownerId = "p1";
  gd.pawns.find(p => p.id === second)!.abilities = [{ability:"delete",activation:"card",skulls:1}];
  gd.blocks.find(b => b.isCentralCore)!.spaces![0]!.modifier = {kind:"attack",amount:1};
  gd.cards.push({id:"weapon",name:"Weapon",attach:{as:"pawn",attackModifier:2}});
  s.cybernet.pawnById(pawnId)!.attachments = [{cardId:"weapon"}];
  expect(applyActionWithEvents(s,gd,{type:"roll-delete",pawnId,cardId:"move-2",joint:true}).accepted).toBe(true);
  expect(s.pendingAttack!.roll).toHaveLength(7);
  expect(s.pendingAttack!.attackerIds).toEqual([pawnId,second]);
  expect(s.players[0]!.hand).toHaveLength(2);
});

test("event spaces deploy finite seeded tokens once; mode player counts reject odd teams", () => {
  const {gd} = battle();
  gd.threats![0]!.copies = 4;
  for (const space of gd.blocks.find(b => b.isCentralCore)!.spaces!) space.type = "event";
  const s = newGame({data:gd,playerNames:["A","B"],seed:4});
  expect(s.threats).toHaveLength(2);
  expect(s.threatPile).toHaveLength(2);
  deployThreats(s,gd,{q:0,r:0});
  expect(s.threats).toHaveLength(2);
  expect(s.threatPile).toHaveLength(2);
  gd.mode.allowedPlayerCounts = [2,4];
  expect(() => newGame({data:gd,playerNames:["A","B","C"],seed:4})).toThrow("supports player counts");
});
