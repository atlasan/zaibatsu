import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault,loadRegression} from "../src/data/index.ts";
import {newGame,applyActionWithEvents,advancePhase,availableActions,snapshot,useMarkerAllocations,type Action} from "../src/engine/index.ts";

function fixture(regression=false) {
 const gd=regression?loadRegression("speedrunners"):loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
 for(const p of s.players) {s.deck.push(...p.hand);p.hand=[];}for(const id of ["move-1","move-1"]) {const at=s.deck.indexOf(id);if(at<0) throw new Error(id);s.deck.splice(at,1);s.players[0]!.hand.push(id);}
 const actor=s.players[0]!.pawnId;gd.pawns.find(p=>p.id===actor)!.movement={type:"steps",steps:2,activation:"once-per-turn"};return {gd,s,actor,command:(a:Action)=>applyActionWithEvents(s,gd,a)};
}
function reject(f:ReturnType<typeof fixture>,a:Action) {const before=snapshot(f.s),rng=f.s.rng.clone(),r=f.command(a);expect(r.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));return r;}
function inventory(f:ReturnType<typeof fixture>) {const s=f.s;return [...s.deck,...s.discard,...s.playedCards??[],...s.players.flatMap(p=>p.hand),...s.cybernet.pawns.flatMap(p=>(p.attachments??[]).map(a=>a.cardId))].sort();}

test("Zero movement: isolated native activation and duplicate physical card payments share snapshots and events",()=>{
 const f=fixture(),before=JSON.parse(snapshot(f.s)),cards=inventory(f),rng=f.s.rng.clone(),options=availableActions(f.s,f.gd).filter(o=>["move-steps","play-move"].includes(o.action.type));expect(options).toHaveLength(2);expect(options.every(o=>!o.targets && o.responses?.length===1)).toBe(true);
 const free=f.command({type:"move-steps",pawnId:f.actor,path:[]});expect(free.accepted).toBe(true);expect(useMarkerAllocations(f.s)[0]!.ability).toBe("move");const spent=JSON.parse(snapshot(f.s));reject(f,{type:"move-steps",pawnId:f.actor,path:[]});
 const paid=[];for(let i=0;i<2;i++) {const r=f.command({type:"play-move",pawnId:f.actor,cardId:"move-1",path:[]});expect(r.accepted).toBe(true);paid.push(...r.events);expect(f.s.playedCards).toHaveLength(i+1);expect(useMarkerAllocations(f.s)).toHaveLength(1);}
 expect(f.s.players[0]!.hand).toEqual([]);expect(inventory(f)).toEqual(cards);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));expect(f.s.cybernet.pawnById(f.actor)!.spaceId).toBe("core");expect([...free.events,...paid].some(e=>e.type==="roll" || e.type==="pawn-moved")).toBe(false);
 const evidence={before,options,spent,after:JSON.parse(snapshot(f.s)),events:[...free.events,...paid]};expect(evidence).toEqual(JSON.parse(readFileSync(new URL("../../../golden/zero-movement.json",import.meta.url),"utf8")));
 for(let i=0;i<8;i++) expect(advancePhase(f.s,f.gd).accepted).toBe(true);expect(useMarkerAllocations(f.s)).toEqual([]);expect(f.command({type:"move-steps",pawnId:f.actor}).accepted).toBe(true);
});

test("Zero movement: clamped allowances still spend free and paid grant uses without RNG",()=>{
 for(const paid of [false,true]) {const f=fixture();f.gd.cards.push({id:"fixture-zero-grant",name:"Synthetic limited movement",attach:{as:"pawn",slot:"gadget",movementModifier:-99,grantsMovement:[{type:"fixed",amount:2}],abilityUses:[{ability:"move",activation:paid?"card":"once-per-turn",perTurn:2}]}});f.s.cybernet.pawnById(f.actor)!.attachments=[{cardId:"fixture-zero-grant",slot:"gadget",slotRef:"pawn:gadget"}];const rng=f.s.rng.clone();
  const queryBefore=snapshot(f.s),options=availableActions(f.s,f.gd);expect(options.filter(o=>o.movement).every(o=>!o.maxSteps && !o.targets && o.responses?.length===1)).toBe(true);expect(snapshot(f.s)).toBe(queryBefore);
  for(let i=0;i<2;i++) expect(f.command({type:"move-steps",pawnId:f.actor,movementIndex:1,...(paid?{cardId:"move-1"}:{}),path:[]}).accepted).toBe(true);
  expect(useMarkerAllocations(f.s)[0]!.uses).toBe(2);expect(f.s.playedCards??[]).toHaveLength(paid?2:0);reject(f,{type:"move-steps",pawnId:f.actor,movementIndex:1,...(paid?{cardId:"move-1"}:{})});expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
 }
});

test("Zero movement: cancellation, ownership, missing costs and interleaving still reject atomically",()=>{
 for(const kind of ["native-cancel","attached-cancel","wrong-owner","missing-card","missing-pawn","phase","winner","over-budget"] as const) {const f=fixture();let a:Action={type:"play-move",pawnId:f.actor,cardId:"move-1",path:[]};
  if(kind==="native-cancel") f.gd.pawns.find(p=>p.id===f.actor)!.movement.activation="none";
  if(kind==="attached-cancel") {f.gd.cards.push({id:"fixture-zero-cancel",name:"Synthetic cancellation",attach:{as:"pawn",slot:"gadget",removes:["move"]}});f.s.cybernet.pawnById(f.actor)!.attachments=[{cardId:"fixture-zero-cancel",slot:"gadget"}];}
  if(kind==="wrong-owner") a.pawnId=f.s.players[1]!.pawnId;if(kind==="missing-card") a.cardId="missing";if(kind==="missing-pawn") a.pawnId="missing";if(kind==="phase") f.s.phase="beginning";if(kind==="winner") f.s.winnerId="p1";if(kind==="over-budget") a.path=[{coord:{q:99,r:0},spaceId:"missing"}];reject(f,a);
  if(kind.endsWith("cancel")) expect(availableActions(f.s,f.gd).filter(o=>o.movement)).toEqual([]);
 }
 const f=fixture();f.s.pendingChoice={id:"fixture-other-choice",playerId:"p1",kind:"discard-or-sacrifice",effectId:"fixture",pawnId:f.actor,cardId:"toxin",amount:1};reject(f,{type:"move-steps",pawnId:f.actor,path:[]});
 const g=fixture();expect(reject(g,{type:"move-steps",pawnId:g.actor,cardId:"move-1",path:[]}).error).toContain("free movement");
});

test("Zero movement: staying put does not awaken a threat and frozen empty-path rejection stays compatible",()=>{
 const f=fixture();f.s.threats=[{id:"fixture-threat",threatId:"guard",coord:{q:0,r:0},spaceId:"core",status:"inactive"}];expect(f.command({type:"move-steps",pawnId:f.actor,path:[]}).accepted).toBe(true);expect(f.s.pendingThreats).toBeUndefined();expect(f.s.threats![0]!.status).toBe("inactive");
 const g=fixture(true);expect(reject(g,{type:"move-steps",pawnId:g.actor,path:[]}).error).toContain("empty movement path");expect(reject(g,{type:"play-move",pawnId:g.actor,cardId:"move-1",path:[]}).error).toContain("empty movement path");
});
