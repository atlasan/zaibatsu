import {supportsSearchBlockEffect} from "../src/engine/search-choice.ts";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findSpecDir, loadDefault, loadRegression } from "../src/data/index.ts";
import { newRng } from "../src/domain/rng.ts";
import { type GameData } from "../src/domain/types.ts";
import { advancePhase, applyActionWithEvents, availableActions, cloneGameState, effectiveAbility, effectiveMovementOptions, eliminatePawn, icebreakBlock, newGame, reboot, snapshot, stepTargets } from "../src/engine/index.ts";

function sourceGame() {
  const gd = loadDefault("speedrunners");
  const s = newGame({allowProvisional:true,data: gd, playerNames: ["A", "B"], seed: 5 });
  s.phase = "action";
  s.players[0]!.pawnId="speedrunner-blue";s.players[0]!.color="blue";
  s.players[1]!.pawnId="speedrunner-green";s.players[1]!.color="green";
  s.cybernet.pawns = [{pawnId:"speedrunner-blue",ownerId:"p1",coord:{q:0,r:0},spaceId:"a"},{pawnId:"speedrunner-green",ownerId:"p2",coord:{q:-1,r:0},spaceId:"a"}];
  s.outOfGame=["speedrunner-pink","speedrunner-orange"];
  s.reserve=gd.pawns.filter(pawn=>!s.cybernet.pawnById(pawn.id) && !s.outOfGame!.includes(pawn.id)).map(pawn=>pawn.id);
  s.controlCards=gd.controlCards!.map(card=>({cardId:card.id,subject:{...card.subject},ownerId:card.subject.id==="speedrunner-blue"?"p1":card.subject.id==="speedrunner-green"?"p2":"",zone:["speedrunner-blue","speedrunner-green"].includes(card.subject.id)?"control" as const:card.isStarter?"out-of-game" as const:"common" as const}));
  // Explicit synthetic board: tests rule semantics, not unreviewed block geometry.
  gd.blocks.push({ id: "source-test-board", name: "Synthetic rule board", expansion: "speedrunners", iceValue: "high", iceFaces: [6], edges: [true,true,true,true,true,true], boundarySpaces: Array.from({length:6}, () => ["a"]), spaces: [{id:"a",type:"special",capacity:"unlimited",direction:0,neighbors:["b"]},{id:"b",type:"special",capacity:"unlimited",neighbors:["a","c"]},{id:"c",type:"special",capacity:"unlimited",neighbors:["b"]}] });
  s.cybernet.blocks = [{blockId:"source-test-board",rotation:0,coord:{q:0,r:0}}, {blockId:"source-test-board",rotation:0,coord:{q:-1,r:0}}];
  return { gd, s };
}

test("source foundation: Core and printed starters use exact attributes and physical control cards", () => {
  const gd = loadDefault("speedrunners");
  const core = gd.blocks.find(b => b.isCentralCore)!;
  expect(core.provisional).not.toBe(true);
  expect(core.spaces).toHaveLength(1);
  expect(core.spaces![0]!.capacity).toBe("unlimited");
  const starters = gd.pawns.filter(p => p.isStarter);
  expect(starters.map(p => p.id)).toEqual(["speedrunner-blue","speedrunner-green","speedrunner-pink","speedrunner-orange"]);
  expect(starters.map(p => p.icebreakerModifier?.faces)).toEqual([[1],[2],[4],[5]]);
  for (const pawn of starters) {
    expect(pawn.defense).toEqual([1,2,3,4,5,6].map(value => ({value,shielded:value<=2})));
    expect(pawn.movement.activation).toBe("card");
    expect(pawn.abilities?.some(a => a.ability === "delete")).toBe(false);
  }
  for (const n of [2,3,4]) {
    const s = newGame({allowProvisional:true,data:gd,playerNames:Array.from({length:n},(_,i)=>String(i)),seed:42 });
    expect(s.players.map(p=>p.hand.length)).toEqual([3,4,5,5].slice(0,n));
    expect(s.controlCards!.filter(c=>c.ownerId)).toHaveLength(n);
    expect(s.controlCards!.filter(c=>c.zone==="out-of-game")).toHaveLength(4-n);
    expect(s.controlCards!.filter(c=>c.zone==="common").map(c=>c.subject.id)).toEqual(["idoru","gynoid","drone-mk-2","drone-probe","drone-turret"]);
    expect(s.outOfGame).toHaveLength(4-n);
    expect(s.reserve!.some(id=>gd.pawns.find(pawn=>pawn.id===id)!.isStarter)).toBe(false);
    for (const p of s.players) expect(p.color).toBe(p.pawnId.split("-").at(-1)!);
  }
  expect(loadRegression("speedrunners").pawns.some(p=>p.id==="speedrunner-red")).toBe(true);
});

test("source foundation: Octagon bypasses arrows and removes Search atomically", () => {
  const {gd,s}=sourceGame(); s.players[0]!.hand=["octagon-dex","dj"];
  const action={type:"play-move" as const,pawnId:"speedrunner-blue",cardId:"dj",path:[{coord:{q:-1,r:0},spaceId:"a"}]};
  const before=snapshot(s), rng=s.rng.clone();
  expect(applyActionWithEvents(s,gd,action).accepted).toBe(false);
  expect(snapshot(s)).toBe(before); expect(s.rng.clone().intn(1000)).toBe(rng.intn(1000));
  expect(applyActionWithEvents(s,gd,{type:"attach-pawn",cardId:"octagon-dex",targetId:"speedrunner-blue"}).accepted).toBe(true);
  expect(effectiveAbility(gd,gd.pawns[0]!,s.cybernet.pawns[0]!.attachments,"search")).toBeUndefined();
  expect(stepTargets(gd,s.cybernet,{q:0,r:0},"a","speedrunner-blue").some(t=>t.coord.q===-1)).toBe(true);
  expect(applyActionWithEvents(s,gd,{type:"play-search",cardId:"dj",pawnId:"speedrunner-blue",coord:{q:0,r:0},dir:0,rotation:0}).accepted).toBe(false);
  expect(applyActionWithEvents(s,gd,action).accepted).toBe(true);
  expect(s.playedCards).toEqual(["dj"]);
});

test("source foundation: Simstim cancels card and granted movement; unresolved bonus is not invented", () => {
  const {gd,s}=sourceGame(); s.players[0]!.hand=["simstim-record","dj"];
  expect(applyActionWithEvents(s,gd,{type:"attach-pawn",cardId:"simstim-record",targetId:"speedrunner-blue"}).accepted).toBe(true);
  expect(effectiveMovementOptions(gd,gd.pawns[0]!,s.cybernet.pawns[0]!.attachments)).toEqual([]);
  const before=snapshot(s);
  expect(applyActionWithEvents(s,gd,{type:"play-move",cardId:"dj",pawnId:"speedrunner-blue",path:[{coord:{q:0,r:0},spaceId:"b"}]}).accepted).toBe(false);
  expect(snapshot(s)).toBe(before);
  expect(gd.cards.find(c=>c.id==="simstim-record")!.provisional).toBe(true);
});

test("source foundation: printed accelerators pay costs and add exactly one step", () => {
  for (const cardId of ["accelerator-transgenic-therapy","hyper-accelerator","accela-accelerator"]) {
    const {gd,s}=sourceGame(); s.players[0]!.hand=[cardId,"dj"];
    const attach={type:"attach-pawn" as const,cardId,targetId:"speedrunner-blue"};
    const before=snapshot(s);
    expect(applyActionWithEvents(s,gd,attach).accepted).toBe(false); expect(snapshot(s)).toBe(before);
    s.players[0]!.bonusCounters=1;
    expect(applyActionWithEvents(s,gd,attach).accepted).toBe(true); expect(s.players[0]!.bonusCounters).toBe(0);
    expect(applyActionWithEvents(s,gd,{type:"play-move",cardId:"dj",pawnId:"speedrunner-blue",path:[{coord:{q:0,r:0},spaceId:"b"},{coord:{q:0,r:0},spaceId:"c"}]}).accepted).toBe(true);
    eliminatePawn(s,"speedrunner-blue",gd);
    expect(s.players[0]!.bonusCounters).toBe(1); expect(s.discard).toContain(cardId);
  }
});

test("source foundation: E-Synapse movement has its own paid attachment and turn use", () => {
  for (const [cardId,steps,cost] of [["biochip",3,1],["e-synapse-neural-interface",5,2]] as const) {
    const {gd,s}=sourceGame(); s.players[0]!.hand=[cardId];s.players[0]!.bonusCounters=cost;
    expect(applyActionWithEvents(s,gd,{type:"attach-pawn",cardId,targetId:"speedrunner-blue"}).accepted).toBe(true);
    const options=effectiveMovementOptions(gd,gd.pawns[0]!,s.cybernet.pawns[0]!.attachments);
    expect(options[1]!.movement).toEqual({type:"steps",steps,activation:"once-per-turn"});
    expect(applyActionWithEvents(s,gd,{type:"move-steps",pawnId:"speedrunner-blue",movementIndex:1,path:[{coord:{q:0,r:0},spaceId:"b"}]}).accepted).toBe(true);
    expect(applyActionWithEvents(s,gd,{type:"move-steps",pawnId:"speedrunner-blue",movementIndex:1,path:[{coord:{q:0,r:0},spaceId:"a"}]}).accepted).toBe(false);
    s.phase="beginning";advancePhase(s,gd);
    expect(applyActionWithEvents(s,gd,{type:"move-steps",pawnId:"speedrunner-blue",movementIndex:1,path:[{coord:{q:0,r:0},spaceId:"a"}]}).accepted).toBe(true);
  }
});

test("source foundation: starter Icebreaker face augments a target and cannot make Core controllable", () => {
  const {gd,s}=sourceGame();s.rng=newRng(79);
  const result=icebreakBlock(s,gd,"speedrunner-blue",{q:0,r:0});
  expect(result.roll).toEqual([1]);expect(result.success).toBe(true);
  s.cybernet.blocks[0]!.blockId="central-core";
  expect(()=>icebreakBlock(s,gd,"speedrunner-blue",{q:0,r:0})).toThrow(/no ICE/);
});

test("source foundation: eliminated starter keeps its card and only its controller can Reboot", () => {
  const gd=loadDefault("speedrunners"),s=newGame({allowProvisional:true,data:gd,playerNames:["A","B"],seed:5});
  const pawnId=s.players[0]!.pawnId; eliminatePawn(s,pawnId,gd);
  expect(()=>reboot(s,gd,pawnId,"p2")).toThrow(/you control/);
  reboot(s,gd,pawnId,"p1");
  const copy=cloneGameState(s);copy.controlCards![0]!.ownerId="";
  expect(copy.controlCards).not.toEqual(s.controlCards);
});

test("source foundation: ordinary foundation setup has a shared golden snapshot", () => {
  const s=newGame({allowProvisional:true,data:loadDefault("speedrunners"),playerNames:["A","B"],seed:42});
  expect(snapshot(s)).toBe(readFileSync(join(findSpecDir(),"../../golden/source-foundation.snap"),"utf8").trim());
});

test("source foundation: action queries are isolated and preserve RNG including rolled-use movement", () => {
  const {gd,s}=sourceGame();s.players[0]!.hand=["octagon-dex","dj","biochip"];
  s.players[0]!.bonusCounters=1;
  const before=snapshot(s),rng=s.rng.clone();
  const options=availableActions(s,gd);
  expect(options.some(o=>o.action.type==="attach-pawn" && o.action.cardId==="biochip")).toBe(true);
  expect(snapshot(s)).toBe(before);
  const move=options.find(o=>o.targets?.length)!; move.targets![0]!.coord.q=999;
  expect(snapshot(s)).toBe(before);
  expect(s.rng.clone().intn(1000)).toBe(rng.intn(1000));
  gd.cards.push({id:"query-use-die",name:"Synthetic use budget",attach:{as:"pawn",slot:"gadget",grantsMovement:[{type:"fixed",amount:1}],abilityUses:[{ability:"move",dice:"d6"}]}});
  s.cybernet.pawns[0]!.attachments=[{cardId:"query-use-die",slot:"gadget"}];
  const marked=snapshot(s),r=s.rng.clone();availableActions(s,gd);availableActions(s,gd);
  expect(snapshot(s)).toBe(marked);expect(s.rng.intn(1000)).toBe(r.intn(1000));
});

test("source foundation: action templates match shared mirror evidence", () => {
  const gd=loadDefault("speedrunners"),s=newGame({allowProvisional:true,data:gd,playerNames:["A","B"],seed:42});
  advancePhase(s,gd);
  const expected=JSON.parse(readFileSync(join(findSpecDir(),"../../golden/source-options.json"),"utf8"));
  expect(availableActions(s,gd)).toEqual(expected);
});

test("source foundation: cataloged expansion modes cannot silently run base setup", () => {
  const gd=loadDefault("speedrunners");
  const {modes}=JSON.parse(readFileSync(join(findSpecDir(),"shadowraiders/modes.json"),"utf8"));
  for (const mode of modes) expect(()=>newGame({allowProvisional:true,data:{...gd,mode},playerNames:Array.from({length:mode.players.min},(_,i)=>String(i)),seed:42})).toThrow(/unsupported mode setup/);
});

test("source foundation: official construction requires verified content and supported end conditions", () => {
  const gd=loadDefault("speedrunners"),config={data:gd,playerNames:["A","B"],seed:42};
  expect(()=>newGame(config)).toThrow(/unsupported block placement effects/);
  expect(()=>newGame({...config,data:{...gd,blocks:gd.blocks.filter(supportsSearchBlockEffect)}})).toThrow(/official mode requires non-provisional content/);
  expect(newGame({...config,allowProvisional:true}).phase).toBe("beginning");
  const badWin={...gd,mode:{...gd.mode,win:["unimplemented-win"]}};
  expect(()=>newGame({...config,data:badWin,allowProvisional:true})).toThrow(/unsupported win condition/);
  const badLoss={...gd,mode:{...gd.mode,lose:["unimplemented-loss"]}};
  expect(()=>newGame({...config,data:badLoss,allowProvisional:true})).toThrow(/unsupported lose condition/);
});
