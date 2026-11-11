import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadDefault } from "../src/data/index.ts";
import { advancePhase, applyActionWithEvents, availableActions, newGame, snapshot } from "../src/engine/index.ts";
import { playerAttachmentModifiers } from "../src/engine/attach.ts";

function phaseCard(cardId: string) {
  const gd=loadDefault("speedrunners"),s=newGame({allowProvisional:true,data:gd,playerNames:["A","B"],seed:42});
  const pawn=s.cybernet.pawnById(s.players[0]!.pawnId)!;
  pawn.attachments=[{cardId,slot:"add-on",bonusPaid:gd.cards.find(c=>c.id===cardId)!.attach!.cost}];
  s.players[0]!.hand=["dj","dj","octagon-dex"];
  s.players[0]!.oncePerTurnUsed={old:true};
  gd.blocks.push({id:"destination",name:"Synthetic destination",expansion:"speedrunners",iceValue:"none",spaces:[{id:"free",type:"special",capacity:1,neighbors:[]},{id:"occupied",type:"special",capacity:1,neighbors:[]}]});
  s.cybernet.blocks.push({blockId:"destination",rotation:0,coord:{q:8,r:0}});
  s.cybernet.placePawn({pawnId:"idoru",ownerId:"p2",coord:{q:8,r:0},spaceId:"occupied"});
  s.reserve=s.reserve!.filter(id=>id!=="idoru");
  return {gd,s,pawnId:pawn.pawnId};
}
const golden=(name:string)=>readFileSync(new URL(`../../../golden/${name}`,import.meta.url),"utf8").trim();

test("phase cards: Electric Sheep sacrifices before drawing, refunds and conserves cards through a depleted deck",()=>{
  const {gd,s,pawnId}=phaseCard("electric-sheep");
  s.players[0]!.hand=Array(6).fill("dj");s.deck=[];s.discard=["octagon-dex","biochip"];
  const count=s.players.reduce((n,p)=>n+p.hand.length,0)+s.deck.length+s.discard.length+s.cybernet.pawns.reduce((n,p)=>n+(p.attachments?.length??0),0);
  const copy=phaseCard("electric-sheep");copy.s.players[0]!.hand=Array(6).fill("dj");copy.s.deck=[];copy.s.discard=["octagon-dex","biochip"];
  const result=advancePhase(s,gd);expect(result.accepted).toBe(true);
  expect(result.events).toEqual(JSON.parse(golden("phase-sacrifice.events.json")));
  expect(s.eliminated).toContain(pawnId);expect(s.players[0]!.bonusCounters).toBe(2);
  expect(s.players[0]!.hand).toHaveLength(9);expect(s.players[0]!.hand.slice(6).sort()).toEqual(["biochip","electric-sheep","octagon-dex"]);
  expect(s.controlCards!.find(c=>c.subject.id===pawnId)!.ownerId).toBe("p1");
  expect(s.phase).toBe("action");expect(s.pendingPhase).toBeUndefined();
  expect(s.players.reduce((n,p)=>n+p.hand.length,0)+s.deck.length+s.discard.length+s.cybernet.pawns.reduce((n,p)=>n+(p.attachments?.length??0),0)).toBe(count);
  expect(advancePhase(copy.s,copy.gd).accepted).toBe(true);expect(snapshot(copy.s)).toBe(snapshot(s));
  expect(s.rng.intn(10000)).toBe(copy.s.rng.intn(10000));
  const empty=phaseCard("electric-sheep");empty.s.deck=[];empty.s.discard=[];
  expect(advancePhase(empty.s,empty.gd).accepted).toBe(true);expect(empty.s.players[0]!.hand).toHaveLength(4);
});

test("phase cards: Insider Trading selects exactly two physical copies and retains its hand benefit",()=>{
  const {gd,s,pawnId}=phaseCard("insider-trading");
  expect(gd.cards.find(c=>c.id==="insider-trading")!.class).toEqual(["trade-secret"]);
  expect(gd.cards.find(c=>c.id==="insider-trading")!.type).toBe("add-on");
  expect(playerAttachmentModifiers(s,gd,"p1").handModifier).toBe(2);
  expect(advancePhase(s,gd).accepted).toBe(true);expect(s.pendingChoice?.kind).toBe("discard-cards");expect(s.pendingChoice?.amount).toBe(2);
  const before=snapshot(s),rng=s.rng.clone(),choiceId=s.pendingChoice!.id;
  for(const cardIds of [[],["dj"],["dj","dj","dj"],["dj","missing"],["octagon-dex","octagon-dex"]]) {
    expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId,optionId:"discard",cardIds}).accepted).toBe(false);expect(snapshot(s)).toBe(before);
  }
  expect(s.rng.clone().intn(1000)).toBe(rng.intn(1000));
  expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId,optionId:"discard",cardIds:["dj","dj"]}).accepted).toBe(true);
  expect(s.players[0]!.hand).toEqual(["octagon-dex"]);expect(s.discard).toEqual(["dj","dj"]);
  expect(s.cybernet.pawnById(pawnId)!.attachments).toHaveLength(1);expect(playerAttachmentModifiers(s,gd,"p1").handModifier).toBe(2);
  expect(s.players[0]!.bonusCounters).toBe(0);expect(s.players[0]!.oncePerTurnUsed).toEqual({});expect(s.phase).toBe("action");
});

test("phase cards: underfilled mandatory discard remains an explicit atomic source gap",()=>{
  const {gd,s}=phaseCard("insider-trading");s.players[0]!.hand=["dj"];
  const before=snapshot(s),rng=s.rng.clone();const result=advancePhase(s,gd);
  expect(result.accepted).toBe(false);expect(result.error).toContain("shortfall interpretation is unresolved");expect(snapshot(s)).toBe(before);expect(s.rng.intn(1000)).toBe(rng.intn(1000));
});

test("phase cards: Jetpack offers free destinations, rejects occupied spaces and refunds only on resolution",()=>{
  const {gd,s,pawnId}=phaseCard("jetpack");const started=advancePhase(s,gd);
  expect(started.accepted).toBe(true);expect(s.pendingChoice?.kind).toBe("relocate-pawn");
  expect(snapshot(s)).toBe(golden("phase-relocation.snap"));
  const before=snapshot(s),rng=s.rng.clone(),choiceId=s.pendingChoice!.id;
  const options=availableActions(s,gd);expect(options[0]!.targets).toContainEqual({coord:{q:8,r:0},spaceId:"free"});expect(options[0]!.targets).not.toContainEqual({coord:{q:8,r:0},spaceId:"occupied"});
  options[0]!.targets![0]!.coord.q=999;expect(snapshot(s)).toBe(before);
  for (const action of [{spaceId:"occupied",coord:{q:8,r:0}},{spaceId:"free",coord:{q:9,r:0}},{spaceId:"missing",coord:{q:8,r:0}},{spaceId:"free",coord:{q:8.5,r:0}},{spaceId:"free",coord:{q:8,r:0},cardIds:["dj"]}]) {
    expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId,optionId:"relocate",...action}).accepted).toBe(false);expect(snapshot(s)).toBe(before);
  }
  const resolved=applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId,optionId:"relocate",coord:{q:8,r:0},spaceId:"free"});
  expect(resolved.accepted).toBe(true);expect(s.cybernet.pawnById(pawnId)!.coord).toEqual({q:8,r:0});
  expect(s.cybernet.pawnById(pawnId)!.attachments).toEqual([]);expect(s.discard).toEqual(["jetpack"]);expect(s.players[0]!.bonusCounters).toBe(1);expect(s.phase).toBe("action");
  expect([started.events,resolved.events]).toEqual(JSON.parse(golden("phase-relocation.events.json")));expect(s.rng.intn(1000)).toBe(rng.intn(1000));
});

test("phase cards: Jetpack threat destinations stay isolated until move-versus-place wording is resolved",()=>{
  const {gd,s}=phaseCard("jetpack");s.threats=[{id:"guard",threatId:"guard",coord:{q:8,r:0},spaceId:"free",status:"inactive"}];
  advancePhase(s,gd);const before=snapshot(s),rng=s.rng.clone();
  expect(availableActions(s,gd)[0]!.targets!.some(t=>t.coord.q===8)).toBe(false);
  const result=applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"relocate",coord:{q:8,r:0},spaceId:"free"});
  expect(result.accepted).toBe(false);expect(result.error).toContain("versus threats interpretation is unresolved");expect(snapshot(s)).toBe(before);expect(s.rng.intn(1000)).toBe(rng.intn(1000));
});

test("phase cards: explicitly normal-movement effect pauses for public combat, then resumes beginning bookkeeping",()=>{
  for (const defeatsThreat of [false,true]) {
    const {gd,s,pawnId}=phaseCard("jetpack");
    // Synthetic effect contract; canonical Jetpack deliberately does not opt into this unresolved reading.
    gd.cards.find(c=>c.id==="jetpack")!.attach!.phaseEffects![0]!.threatMode="normal-movement";
    gd.pawns.find(p=>p.id===pawnId)!.abilities!.push({ability:"delete",activation:"card",skulls:1});
    gd.threats=[{id:"test",name:"Synthetic threat",type:"token",attackDie:5,defense:[1,2,3,4,5,6].map(value=>({value,shielded:!defeatsThreat}))}];
    s.threats=[{id:"test",threatId:"test",coord:{q:8,r:0},spaceId:"free",status:"inactive"}];s.players[0]!.hand=["electric-sheep"];
    const began=advancePhase(s,gd);
    const moved=applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"relocate",coord:{q:8,r:0},spaceId:"free"});expect(moved.accepted).toBe(true);
    expect(s.phase).toBe("beginning");expect(s.pendingPhase).toBe("beginning");expect(s.players[0]!.oncePerTurnUsed.old).toBe(true);
    const before=snapshot(s),rng=s.rng.clone();
    expect(availableActions(s,gd).map(o=>o.action.type)).toEqual(["assign-threat-attack","roll-delete"]);expect(snapshot(s)).toBe(before);expect(s.rng.clone().intn(1000)).toBe(rng.intn(1000));
    expect(advancePhase(s,gd).accepted).toBe(false);expect(applyActionWithEvents(s,gd,{type:"pass"}).accepted).toBe(false);expect(snapshot(s)).toBe(before);
    const rolled=applyActionWithEvents(s,gd,{type:"roll-delete",pawnId,cardId:"electric-sheep"});expect(rolled.accepted).toBe(true);expect(s.playedCards).toEqual(["electric-sheep"]);
    if(!defeatsThreat) expect(snapshot(s)).toBe(golden("phase-combat.snap"));
    const assigned=applyActionWithEvents(s,gd,{type:"assign-delete",targetIds:["test"]});expect(assigned.accepted).toBe(true);
    if(!defeatsThreat) { expect(s.phase).toBe("beginning");expect(s.pendingThreats?.stage).toBe("retaliation");const attacked=applyActionWithEvents(s,gd,{type:"assign-threat-attack",targetIds:[pawnId]});expect(attacked.accepted).toBe(true);expect(s.eliminated).toContain(pawnId);expect([began.events,moved.events,rolled.events,assigned.events,attacked.events]).toEqual(JSON.parse(golden("phase-combat.events.json"))); }
    expect(s.phase).toBe("action");expect(s.pendingPhase).toBeUndefined();expect(s.pendingThreats).toBeUndefined();expect(s.players[0]!.oncePerTurnUsed).toEqual({});
    expect(s.threats![0]!.status).toBe("inactive");expect(s.playedCards).toEqual(["electric-sheep"]);
  }
});


test("phase cards: malformed or unregistered definitions fail before a match can silently ignore them",()=>{
  for(const effect of [{trigger:"future",kind:"discard-self"},{trigger:"begin-turn",kind:"future"},{trigger:"begin-turn",kind:"discard-cards",amount:0},{trigger:"begin-turn",kind:"sacrifice-and-draw"},{trigger:"begin-turn",kind:"discard-and-relocate",threatMode:"future"}]) {
    const {gd}=phaseCard("jetpack");gd.cards.find(c=>c.id==="jetpack")!.attach!.phaseEffects=[effect as any];
    expect(()=>newGame({data:gd,playerNames:["A","B"],seed:42,allowProvisional:true})).toThrow();
  }
});


test("phase cards: explicit placement bypasses activation and normal movement can accept fixed retaliation",()=>{
  for(const threatMode of ["placement","normal-movement"] as const) {
    const {gd,s,pawnId}=phaseCard("jetpack");
    gd.cards.find(c=>c.id==="jetpack")!.attach!.phaseEffects![0]!.threatMode=threatMode;
    gd.threats=[{id:"test",name:"Test",type:"token",attackDie:5,defense:[{value:1,shielded:false}]}];
    s.threats=[{id:"test",threatId:"test",coord:{q:8,r:0},spaceId:"free",status:"inactive"}];
    const rng=s.rng.clone();advancePhase(s,gd);
    expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"relocate",coord:{q:8,r:0},spaceId:"free"}).accepted).toBe(true);
    if(threatMode==="normal-movement") {
      expect(s.phase).toBe("beginning");expect(availableActions(s,gd).map(option=>option.action.type)).toEqual(["assign-threat-attack"]);
      expect(applyActionWithEvents(s,gd,{type:"assign-threat-attack",targetIds:[pawnId]}).accepted).toBe(true);expect(s.eliminated).toContain(pawnId);
    } else {expect(s.cybernet.pawnById(pawnId)).toBeDefined();expect(s.threats[0]!.status).toBe("inactive");}
    expect(s.phase).toBe("action");expect(s.pendingPhase).toBeUndefined();expect(s.rng.intn(1000)).toBe(rng.intn(1000));
  }
});


test("phase cards: printed attachment costs pay once and failed or duplicate attachments preserve state",()=>{
  for(const [cardId,cost] of [["electric-sheep",2],["jetpack",1],["insider-trading",1],["dummy",1]] as const) {
    const {gd,s,pawnId}=phaseCard(cardId);s.phase="action";s.cybernet.pawnById(pawnId)!.attachments=[];
    expect(gd.cards.find(card=>card.id===cardId)!.copies).toBe(1);expect(gd.cards.find(card=>card.id===cardId)!.attach!.cost).toBe(cost);
    s.players[0]!.hand=[cardId];s.players[0]!.bonusCounters=cost-1;
    const action={type:"attach-pawn" as const,cardId,targetId:pawnId};const before=snapshot(s),rng=s.rng.clone();
    expect(applyActionWithEvents(s,gd,action).accepted).toBe(false);expect(snapshot(s)).toBe(before);expect(s.rng.clone().intn(1000)).toBe(rng.intn(1000));
    s.players[0]!.bonusCounters=cost;expect(applyActionWithEvents(s,gd,action).accepted).toBe(true);
    expect(s.players[0]!.bonusCounters).toBe(0);expect(s.players[0]!.hand).toEqual([]);expect(s.cybernet.pawnById(pawnId)!.attachments![0]!.bonusPaid).toBe(cost);
    s.players[0]!.hand=[cardId];s.players[0]!.bonusCounters=cost;const occupied=snapshot(s);
    expect(applyActionWithEvents(s,gd,action).accepted).toBe(false);expect(snapshot(s)).toBe(occupied);
  }
});
