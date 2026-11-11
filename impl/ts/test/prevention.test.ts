import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadDefault, loadRegression } from "../src/data/index.ts";
import { newRng } from "../src/domain/rng.ts";
import { advancePhase, applyAction, applyActionWithEvents, availableActions, cloneGameState, eliminatePawn, newGame, snapshot } from "../src/engine/index.ts";
import { playerAttachmentModifiers } from "../src/engine/attach.ts";

function preventionGame() {
  const gd=loadDefault("speedrunners");
  gd.cards.push({id:"fixture-support",name:"Synthetic support",attach:{as:"pawn",slot:"gadget",cost:2,handModifier:1}});
  gd.controlCards!.push({id:"cracker-test-control",name:"Synthetic Cracker control",expansion:"speedrunners",subject:{kind:"pawn",id:"cracker"},provisional:true});
  const s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
  const attacker=s.players[0]!.pawnId,victim=s.players[1]!.pawnId;
  gd.pawns.find(p=>p.id===attacker)!.abilities!.push({ability:"delete",activation:"card",skulls:1});
  gd.pawns.find(p=>p.id===victim)!.defense=[1,2,3,4,5,6].map(value=>({value,shielded:false}));
  s.cybernet.pawnById(victim)!.attachments=[{cardId:"dummy",slot:"add-on",bonusPaid:1},{cardId:"fixture-support",slot:"gadget",bonusPaid:2}];
  s.players[0]!.hand=["electric-sheep","electric-sheep"];
  return {gd,s,attacker,victim};
}
const golden=(file:string)=>readFileSync(new URL(`../../../golden/${file}`,import.meta.url),"utf8").trim();
function pieceConservation(s:ReturnType<typeof newGame>,ids:string[]) {
  const pieces=[...s.cybernet.pawns.map(p=>p.pawnId),...s.eliminated,...s.reserve??[],...s.outOfGame??[]];
  expect(new Set(pieces).size).toBe(pieces.length);expect(pieces.sort()).toEqual([...ids].sort());
}
function publicHit(f:ReturnType<typeof preventionGame>) {
  const rolled=applyActionWithEvents(f.s,f.gd,{type:"roll-delete",pawnId:f.attacker,cardId:"electric-sheep"});
  expect(rolled.accepted).toBe(true);
  const assigned=applyActionWithEvents(f.s,f.gd,{type:"assign-delete",targetIds:[f.victim]});expect(assigned.accepted).toBe(true);
  return [rolled.events,assigned.events];
}

test("prevention: defender-owned Dummy decision prevents cleanup outside the active turn",()=>{
  const f=preventionGame(),{gd,s,attacker,victim}=f;const events=publicHit(f);
  expect(s.currentPlayer).toBe(0);expect(s.pendingChoice?.playerId).toBe("p2");expect(s.pendingChoice?.kind).toBe("prevent-elimination");
  expect(s.pendingEliminations?.[0]!.cause).toBe("attack");expect(s.cybernet.pawnById(victim)!.attachments).toHaveLength(2);expect(s.players[1]!.bonusCounters).toBe(0);
  expect(snapshot(s)).toBe(golden("prevention.snap"));
  const before=snapshot(s),rng=s.rng.clone(),choiceId=s.pendingChoice!.id;
  const options=availableActions(s,gd);expect(options[0]!.responses).toEqual([
    {type:"resolve-choice",choiceId,playerId:"p2",optionId:"prevent",cardId:"dummy"},
    {type:"resolve-choice",choiceId,playerId:"p2",optionId:"allow"},
  ]);expect(snapshot(s)).toBe(before);
  const copy=cloneGameState(s);copy.pendingEliminations![0]!.cause="sacrifice";copy.pendingChoice!.cardIds![0]="changed";copy.reserve!.pop();
  expect(snapshot(s)).toBe(before);
  for(const action of [{type:"pass"},{type:"resolve-choice",choiceId,optionId:"prevent",cardId:"dummy"},{type:"resolve-choice",playerId:"p2",choiceId:"old",optionId:"prevent",cardId:"dummy"},{type:"resolve-choice",playerId:"p2",choiceId,optionId:"prevent",cardId:"electric-sheep"},{type:"resolve-choice",playerId:"p2",choiceId,optionId:"prevent",cardId:"dummy",cardIds:["dj"]},{type:"resolve-choice",playerId:"p2",choiceId,optionId:"allow",cardId:"dummy"},{type:"resolve-choice",playerId:"p2",choiceId,optionId:"prevent",cardId:"dummy",extraSkulls:3}]) {
    expect(applyActionWithEvents(s,gd,action as any).accepted).toBe(false);expect(snapshot(s)).toBe(before);
  }
  expect(advancePhase(s,gd).accepted).toBe(false);expect(s.rng.clone().intn(1000)).toBe(rng.intn(1000));
  const saved=applyActionWithEvents(s,gd,options[0]!.responses![0]!);expect(saved.accepted).toBe(true);events.push(saved.events);
  expect(s.cybernet.pawnById(victim)!.attachments!.map(a=>a.cardId)).toEqual(["fixture-support"]);expect(playerAttachmentModifiers(s,gd,"p2").handModifier).toBe(1);
  expect(s.players[1]!.bonusCounters).toBe(1);expect(s.discard).toEqual(["dummy"]);expect(s.playedCards).toEqual(["electric-sheep"]);expect(s.players[0]!.hand).toEqual(["electric-sheep"]);
  expect(s.pendingChoice).toBeUndefined();expect(s.pendingEliminations).toBeUndefined();expect(s.eliminated).not.toContain(victim);pieceConservation(s,gd.pawns.map(p=>p.id));
  const rolledAgain=applyActionWithEvents(s,gd,{type:"roll-delete",pawnId:attacker,cardId:"electric-sheep"});
  const killed=applyActionWithEvents(s,gd,{type:"assign-delete",targetIds:[victim]});expect(killed.accepted).toBe(true);events.push(rolledAgain.events,killed.events);
  expect(s.pendingChoice).toBeUndefined();expect(s.eliminated).toContain(victim);expect(s.players[1]!.bonusCounters).toBe(3);expect(s.discard).toEqual(["dummy","fixture-support"]);
  expect(s.controlCards!.find(c=>c.subject.id===victim)!.ownerId).toBe("p2");expect(events).toEqual(JSON.parse(golden("prevention.events.json")));
  expect(applyActionWithEvents(s,gd,options[0]!.responses![0]!).accepted).toBe(false);pieceConservation(s,gd.pawns.map(p=>p.id));
});

test("prevention: declining resolves sourced Reboot retention versus reserve/common cleanup",()=>{
  for(const reboot of [true,false]) {
    const f=preventionGame(),{gd,s,victim}=f;
    if(!reboot) gd.pawns.find(p=>p.id===victim)!.abilities=gd.pawns.find(p=>p.id===victim)!.abilities!.filter(a=>a.ability!=="reboot");
    publicHit(f);const result=applyActionWithEvents(s,gd,availableActions(s,gd)[0]!.responses!.find(a=>a.optionId==="allow")!);
    expect(result.accepted).toBe(true);expect(s.cybernet.pawnById(victim)).toBeUndefined();expect(s.players[1]!.bonusCounters).toBe(3);
    expect(s.eliminated.includes(victim)).toBe(reboot);expect(s.reserve!.includes(victim)).toBe(!reboot);
    expect(s.controlCards!.find(c=>c.subject.id===victim)!.ownerId).toBe(reboot?"p2":"");
    expect(s.controlCards!.find(c=>c.subject.id===victim)!.zone).toBe(reboot?"control":"common");
    if(!reboot) expect(result.events.some(e=>e.type==="control-card-released" && e.pawnId===victim)).toBe(true);
    pieceConservation(s,gd.pawns.map(p=>p.id));
  }
});

test("lifecycle: typed placement consumes reserve and non-Reboot elimination releases the control card",()=>{
  const {gd,s,attacker}=preventionGame();
  gd.blocks.push({id:"fixture-lifecycle",name:"Synthetic lifecycle board",expansion:"speedrunners",iceValue:"high",iceFaces:[1,2,3,4,5,6],spaces:[{id:"core",type:"special",capacity:"unlimited"}]});s.cybernet.blocks[0]!.blockId="fixture-lifecycle";
  gd.cards.push({id:"fixture-placement",name:"Synthetic placement",activates:["icebreaker"],effects:[{kind:"place-pawn",target:"cracker",trigger:"on-icebreak"}]});
  s.players[0]!.hand=["fixture-placement"];
  expect(s.reserve).toContain("cracker");expect(applyActionWithEvents(s,gd,{type:"play-icebreak-block",pawnId:attacker,cardId:"fixture-placement",coord:{q:0,r:0}}).accepted).toBe(true);
  expect(s.reserve).not.toContain("cracker");expect(s.cybernet.pawnById("cracker")!.ownerId).toBe("p1");
  expect(s.controlCards!.find(c=>c.subject.id==="cracker")!.ownerId).toBe("p1");pieceConservation(s,gd.pawns.map(p=>p.id));
  s.cybernet.pawnById("cracker")!.attachments=[{cardId:"fixture-support",slot:"gadget",bonusPaid:2}];
  expect(eliminatePawn(s,"cracker",gd)).toBe(true);expect(s.reserve).toContain("cracker");expect(s.eliminated).not.toContain("cracker");expect(s.players[0]!.bonusCounters).toBe(2);
  expect(s.controlCards!.find(c=>c.subject.id==="cracker")!.ownerId).toBe("");pieceConservation(s,gd.pawns.map(p=>p.id));
  const before=snapshot(s);expect(applyActionWithEvents(s,gd,{type:"play-reboot",pawnId:"cracker",cardIds:["dj","dj","dj","dj"]}).accepted).toBe(false);expect(snapshot(s)).toBe(before);
  const regression=newGame({data:loadRegression("speedrunners"),playerNames:["A","B"],seed:42});expect(regression.rulesVersion).toBeUndefined();expect(regression.reserve).toBeUndefined();
});

test("prevention: failed Black ICE opens the same replacement before attachment cleanup",()=>{
  const {gd,s,attacker,victim}=preventionGame();
  s.cybernet.pawnById(victim)!.attachments=[];s.cybernet.pawnById(attacker)!.attachments=[{cardId:"dummy",slot:"add-on",bonusPaid:1}];
  gd.pawns.find(p=>p.id===attacker)!.icebreakerModifier={};
  gd.blocks.push({id:"fixture-black",name:"Synthetic Black ICE",expansion:"speedrunners",iceValue:"black",iceFaces:[6],spaces:[{id:"core",type:"special",capacity:"unlimited"}]});s.cybernet.blocks[0]!.blockId="fixture-black";
  s.players[0]!.hand=["dj"];s.rng=newRng(79);
  const result=applyActionWithEvents(s,gd,{type:"play-icebreak-block",pawnId:attacker,cardId:"dj",coord:{q:0,r:0}});
  expect(result.accepted).toBe(true);expect(s.pendingEliminations![0]!.cause).toBe("black-ice");expect(s.pendingChoice!.playerId).toBe("p1");expect(s.playedCards).toEqual(["dj"]);
  expect(applyActionWithEvents(s,gd,availableActions(s,gd)[0]!.responses![0]!).accepted).toBe(true);expect(s.cybernet.pawnById(attacker)).toBeDefined();expect(s.players[0]!.bonusCounters).toBe(1);
});

test("prevention: area attacks hold a defender decision and unresolved simultaneous windows reject atomically",()=>{
  for(const twoGuards of [false,true]) {
    const {gd,s,attacker,victim}=preventionGame();gd.pawns.find(p=>p.id===attacker)!.class=["bomb"];gd.pawns.find(p=>p.id===attacker)!.defense=[1,2,3,4,5,6].map(value=>({value,shielded:false}));
    if(twoGuards) {gd.cards.push({id:"fixture-second-guard",name:"Synthetic guard",attach:{as:"pawn",slot:"add-on",eliminationPrevention:{kind:"discard-self"}}});s.cybernet.pawnById(attacker)!.attachments=[{cardId:"fixture-second-guard",slot:"add-on"}];}
    const action={type:"play-delete-area" as const,pawnId:attacker,cardId:"electric-sheep"};const before=snapshot(s),rng=s.rng.clone();const result=applyActionWithEvents(s,gd,action);
    if(twoGuards) {
      expect(result.accepted).toBe(false);expect(result.error).toContain("simultaneous elimination-prevention ordering is unresolved");expect(snapshot(s)).toBe(before);expect(s.rng.clone().intn(1000)).toBe(rng.intn(1000));
      expect(()=>applyAction(s,gd,action)).toThrow(/ordering is unresolved/);expect(snapshot(s)).toBe(before);
    } else {expect(result.accepted).toBe(true);expect(s.eliminated).toContain(attacker);expect(s.pendingChoice!.pawnId).toBe(victim);expect(applyActionWithEvents(s,gd,availableActions(s,gd)[0]!.responses![0]!).accepted).toBe(true);expect(s.cybernet.pawnById(victim)).toBeDefined();}
  }
});

test("prevention: unresolved sacrifice reading rejects without drawing or losing attachments",()=>{
  const {gd,s,attacker}=preventionGame();gd.cards.push({id:"fixture-sacrifice",name:"Synthetic sacrifice",attach:{as:"pawn",slot:"gadget",phaseEffects:[{trigger:"begin-turn",kind:"sacrifice-and-draw",amount:3}]}});
  s.cybernet.pawnById(attacker)!.attachments=[{cardId:"dummy",slot:"add-on",bonusPaid:1},{cardId:"fixture-sacrifice",slot:"gadget"}];s.phase="beginning";
  const before=snapshot(s),rng=s.rng.clone(),result=advancePhase(s,gd);expect(result.accepted).toBe(false);expect(result.error).toContain("sacrifice versus elimination prevention is unresolved");expect(snapshot(s)).toBe(before);expect(s.rng.intn(1000)).toBe(rng.intn(1000));
});


test("prevention: beginning movement and fixed retaliation stay pending until Dummy resolves",()=>{
  const {gd,s,attacker,victim}=preventionGame();s.cybernet.pawnById(victim)!.attachments=[];
  gd.cards.push({id:"fixture-phase-jump",name:"Synthetic phase jump",attach:{as:"pawn",slot:"gadget",phaseEffects:[{trigger:"begin-turn",kind:"discard-and-relocate",threatMode:"normal-movement"}]}});
  gd.blocks.push({id:"fixture-threat",name:"Synthetic threat board",expansion:"speedrunners",iceValue:"none",spaces:[{id:"free",type:"special",capacity:"unlimited"}]});s.cybernet.blocks.push({blockId:"fixture-threat",rotation:0,coord:{q:8,r:0}});
  gd.threats=[{id:"test",name:"Synthetic fixed attack",type:"token",attackDie:5,defense:[{value:1,shielded:false}]}];s.threats=[{id:"test",threatId:"test",coord:{q:8,r:0},spaceId:"free",status:"inactive"}];
  gd.pawns.find(p=>p.id===attacker)!.defense=[1,2,3,4,5,6].map(value=>({value,shielded:false}));
  s.cybernet.pawnById(attacker)!.attachments=[{cardId:"dummy",slot:"add-on",bonusPaid:1},{cardId:"fixture-phase-jump",slot:"gadget"}];s.players[0]!.hand=[];s.players[0]!.oncePerTurnUsed={old:true};s.phase="beginning";
  const rng=s.rng.clone();expect(advancePhase(s,gd).accepted).toBe(true);
  expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"relocate",coord:{q:8,r:0},spaceId:"free"}).accepted).toBe(true);
  expect(applyActionWithEvents(s,gd,{type:"assign-threat-attack",targetIds:[attacker]}).accepted).toBe(true);
  expect(s.pendingChoice!.kind).toBe("prevent-elimination");expect(s.phase).toBe("beginning");expect(s.players[0]!.oncePerTurnUsed.old).toBe(true);
  const before=snapshot(s);expect(advancePhase(s,gd).accepted).toBe(false);expect(snapshot(s)).toBe(before);
  expect(applyActionWithEvents(s,gd,availableActions(s,gd)[0]!.responses![0]!).accepted).toBe(true);
  expect(String(s.phase)).toBe("action");expect(s.pendingPhase).toBeUndefined();expect(s.pendingChoice).toBeUndefined();expect(s.pendingEliminations).toBeUndefined();expect(s.cybernet.pawnById(attacker)).toBeDefined();expect(s.players[0]!.oncePerTurnUsed).toEqual({});expect(s.rng.intn(1000)).toBe(rng.intn(1000));pieceConservation(s,gd.pawns.map(p=>p.id));
});


test("prevention: unsupported replacement definitions fail before match construction",()=>{
  const {gd}=preventionGame();(gd.cards.find(card=>card.id==="dummy")!.attach!.eliminationPrevention as any).kind="unknown-handler";
  expect(()=>newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42})).toThrow(/unsupported elimination prevention handler/);
});


test("source command compatibility entry enforces live phase and active-player authority",()=>{
  const {gd,s,attacker}=preventionGame();s.phase="beginning";const before=snapshot(s),rng=s.rng.clone();
  expect(()=>applyAction(s,gd,{type:"pass"})).toThrow(/action phase/);expect(snapshot(s)).toBe(before);
  s.phase="action";const active=snapshot(s);expect(()=>applyAction(s,gd,{type:"pass",playerId:"p2"})).toThrow(/active player/);expect(snapshot(s)).toBe(active);expect(s.rng.intn(1000)).toBe(rng.intn(1000));
});
