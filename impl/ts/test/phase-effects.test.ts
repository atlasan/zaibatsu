import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findSpecDir, loadDefault } from "../src/data/index.ts";
import { advancePhase, applyActionWithEvents, availableActions, cloneGameState, newGame, snapshot } from "../src/engine/index.ts";

function toxin() {
  const gd=loadDefault("speedrunners"),s=newGame({allowProvisional:true,data:gd,playerNames:["A","B"],seed:42});
  const pawn=s.cybernet.pawns.find(p=>p.ownerId==="p1")!;
  pawn.attachments=[{cardId:"toxin",slot:"add-on"}];
  s.players[0]!.hand=["dj","dj"];
  s.players[0]!.oncePerTurnUsed={old:true};
  return {gd,s,pawnId:pawn.pawnId};
}

test("phase effects: Toxin pauses before marker reset and accepts one physical discard", () => {
  const {gd,s}=toxin();const rng=s.rng.clone();
  const started=advancePhase(s,gd);
  expect(started.accepted).toBe(true);expect(started.events.map(e=>e.type)).toEqual(["choice-required"]);
  expect(s.phase).toBe("beginning");expect(s.players[0]!.oncePerTurnUsed.old).toBe(true);
  expect(availableActions(s,gd)).toEqual([{action:{type:"resolve-choice",choiceId:s.pendingChoice!.id}}]);
  const before=snapshot(s);
  for (const action of [{type:"pass"},{type:"resolve-choice",choiceId:"stale",optionId:"sacrifice"},{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"discard",cardIds:["dj","dj"]},{type:"resolve-choice",playerId:"p2",choiceId:s.pendingChoice!.id,optionId:"discard",cardIds:["dj"]}] as const) {
    expect(applyActionWithEvents(s,gd,action as any).accepted).toBe(false);expect(snapshot(s)).toBe(before);
  }
  expect(advancePhase(s,gd).accepted).toBe(false);expect(snapshot(s)).toBe(before);
  const copy=cloneGameState(s);copy.pendingEffects![0]!.cardId="changed";expect(s.pendingEffects![0]!.cardId).toBe("toxin");
  const choiceId=s.pendingChoice!.id;
  const result=applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId,optionId:"discard",cardIds:["dj"]});
  expect(result.events.map(e=>e.type)).toEqual(["choice-resolved","card-discarded","phase-advanced"]);
  expect(s.players[0]!.hand).toEqual(["dj"]);expect(s.discard).toEqual(["dj"]);
  expect(s.phase).toBe("action");expect(s.players[0]!.oncePerTurnUsed).toEqual({});
  expect(s.pendingChoice).toBeUndefined();expect(s.pendingEffects).toBeUndefined();expect(s.pendingPhase).toBeUndefined();
  expect(s.rng.intn(10000)).toBe(rng.intn(10000));
  expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId,optionId:"sacrifice"}).accepted).toBe(false);
});

test("phase effects: empty-handed Toxin requires sacrifice and returns attachment costs", () => {
  const {gd,s,pawnId}=toxin();s.players[0]!.hand=[];
  s.cybernet.pawnById(pawnId)!.attachments![0]!.bonusPaid=2;
  advancePhase(s,gd);
  expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"discard",cardIds:["dj"]}).accepted).toBe(false);
  expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"sacrifice"}).accepted).toBe(true);
  expect(s.eliminated).toContain(pawnId);expect(s.players[0]!.bonusCounters).toBe(2);
  expect(s.discard).toEqual(["toxin"]);expect(s.phase).toBe("action");
});

test("phase effects: Rootkit discards at action end while played cards await recycling", () => {
  const {gd,s,pawnId}=toxin();s.phase="action";s.cybernet.pawnById(pawnId)!.attachments=[{cardId:"rootkit",slot:"add-on"}];s.playedCards=["octagon-dex"];
  const result=advancePhase(s,gd);
  expect(result.accepted).toBe(true);expect(String(s.phase)).toBe("recycle");
  expect(s.players[0]!.hand).toEqual([]);expect(s.discard).toEqual(["dj","dj"]);expect(s.playedCards).toEqual(["octagon-dex"]);
});

test("phase effects: Selective Disclosure discards itself and refunds before resetting markers", () => {
  const {gd,s,pawnId}=toxin();s.cybernet.pawnById(pawnId)!.attachments=[{cardId:"selective-disclosure",slot:"add-on",bonusPaid:1}];
  expect(advancePhase(s,gd).accepted).toBe(true);
  expect(s.cybernet.pawnById(pawnId)!.attachments).toEqual([]);expect(s.discard).toEqual(["selective-disclosure"]);expect(s.players[0]!.bonusCounters).toBe(1);expect(s.phase).toBe("action");
});

test("phase effects: unresolved simultaneous ordering rejects atomically", () => {
  const {gd,s,pawnId}=toxin();
  s.cybernet.placePawn({pawnId:"idoru",ownerId:"p1",coord:{q:0,r:0},spaceId:"core",attachments:[{cardId:"selective-disclosure",slot:"add-on"}]});
  const before=snapshot(s),rng=s.rng.clone();
  const result=advancePhase(s,gd);expect(result.accepted).toBe(false);expect(result.error).toContain("ordering is unresolved");
  expect(snapshot(s)).toBe(before);expect(s.rng.intn(1000)).toBe(rng.intn(1000));
});

test("phase effects: pending Toxin choice has shared snapshot and ordered event evidence", () => {
  const {gd,s}=toxin();const started=advancePhase(s,gd);
  expect(snapshot(s)).toBe(readFileSync(join(findSpecDir(),"../../golden/phase-choice.snap"),"utf8").trim());
  const resolved=applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"discard",cardIds:["dj"]});
  expect([started.events,resolved.events]).toEqual(JSON.parse(readFileSync(join(findSpecDir(),"../../golden/phase-choice.events.json"),"utf8")));
});
