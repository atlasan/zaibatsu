import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {newGame,applyActionWithEvents,advancePhase,snapshot,cloneGameState,availableActions,discardPawnAttachment,finalizePawnElimination,setPawnControl,useMarkerAllocations,clearControlledUseMarkers,type Action} from "../src/engine/index.ts";
import {playerView} from "../src/engine/player-view.ts";
import {draw} from "../src/engine/deck.ts";
import type {GameState} from "../src/domain/types.ts";

function fixture() {
 const gd=loadDefault("speedrunners");gd.blocks.push({id:"fixture-marker-board",name:"Synthetic marker board",expansion:"speedrunners",edges:[true,true,true,true,true,true],boundarySpaces:[["a"],["a"],["a"],["a"],["a"],["a"]],spaces:[{id:"a",type:"special",capacity:"unlimited",neighbors:["b"]},{id:"b",type:"special",capacity:"unlimited",neighbors:["a"]}],provisional:true});
 gd.cards.push({id:"fixture-provider",name:"Synthetic provider",copies:1,attach:{as:"pawn",slot:"armor",grantsSlot:["gadget"]}},{id:"fixture-mover",name:"Synthetic duplicate mover",copies:2,attach:{as:"pawn",slot:"gadget",grantsMovement:[{type:"fixed",amount:2}],abilityUses:[{ability:"move",activation:"once-per-turn",perTurn:1}]}});
 const s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";for(const p of s.players) {s.deck.push(...p.hand);p.hand=[];}
 for(const pawn of s.cybernet.pawns) {pawn.coord={q:1,r:0};pawn.spaceId="a";}s.cybernet.blocks.push({blockId:"fixture-marker-board",coord:{q:1,r:0},rotation:0});s.blockPile=s.blockPile.filter(id=>id!=="fixture-marker-board");
 const actor=s.players[0]!.pawnId,target=s.players[1]!.pawnId,take=(who:number,id:string)=>{const at=s.deck.indexOf(id);if(at<0) throw new Error(id);s.deck.splice(at,1);s.players[who]!.hand.push(id);};
 const command=(action:Action)=>applyActionWithEvents(s,gd,action);return {gd,s,actor,target,take,command};
}
const step=(spaceId:string)=>({coord:{q:1,r:0},spaceId});
function inventory(s:GameState) {return [...s.deck,...s.discard,...s.playedCards??[],...s.players.flatMap(p=>p.hand),...s.cybernet.pawns.flatMap(p=>(p.attachments??[]).map(a=>a.cardId))].sort();}
function reject(f:ReturnType<typeof fixture>,a:Action) {const before=snapshot(f.s),rng=f.s.rng.clone(),r=f.command(a);expect(r.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));return r;}
function nativeSpent() {const f=fixture();f.gd.pawns.find(p=>p.id===f.target)!.movement={type:"steps",steps:2,activation:"once-per-turn"};f.gd.pawns.find(p=>p.id===f.target)!.class=["cleaner"];f.s.currentPlayer=1;const spent=f.command({type:"move-steps",pawnId:f.target,path:[step("b")]});expect(spent.accepted).toBe(true);return {...f,spent};}
function duplicates() {const f=fixture();for(const id of ["fixture-provider","fixture-mover","fixture-mover"]) f.take(0,id);for(const [cardId,slotRef] of [["fixture-provider","pawn:armor"],["fixture-mover","pawn:gadget"],["fixture-mover","pawn:armor/gadget"]]) expect(f.command({type:"attach-pawn",cardId,targetId:f.actor,slotRef}).accepted).toBe(true);return f;}

test("Physical use markers: native uses follow control-card transfer and clear at the new controller's beginning",()=>{
 const f=nativeSpent(),spent=JSON.parse(snapshot(f.s)),rng=f.s.rng.clone();f.take(0,"virus");f.s.currentPlayer=0;
 const capture=f.command({type:"attach-enemy",cardId:"virus",pawnId:f.actor,targetId:f.target});expect(capture.accepted).toBe(true);const captured=JSON.parse(snapshot(f.s));expect(useMarkerAllocations(f.s)[0]!.ownerId).toBe("p1");reject(f,{type:"move-steps",pawnId:f.target,path:[step("a")]});
 clearControlledUseMarkers(f.s,"p2");expect(useMarkerAllocations(f.s)).toHaveLength(1);const observer=playerView(f.s,f.gd,"p2");expect(observer.useMarkers[0]!.pawnId).toBe(f.target);expect(observer.options).toEqual([]);
 f.s.phase="beginning";const reset=advancePhase(f.s,f.gd);expect(reset.accepted).toBe(true);expect(useMarkerAllocations(f.s)).toEqual([]);expect(reset.events.map(e=>e.type)).toEqual(["ability-use-cleared","phase-advanced"]);
 const golden=JSON.parse(readFileSync(new URL("../../../golden/use-markers.json",import.meta.url),"utf8"));expect({spent,captured,observer,reset:JSON.parse(snapshot(f.s)),events:[...f.spent.events,...capture.events,...reset.events]}).toEqual(golden.native);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
 expect(f.command({type:"move-steps",pawnId:f.target,path:[step("a")]}).accepted).toBe(true);
});

test("Physical use markers: attachment identities survive unrelated removal and distinguish duplicate cards",()=>{
 const f=duplicates(),cards=inventory(f.s),atts=f.s.cybernet.pawnById(f.actor)!.attachments!,ids=atts.map(a=>a.instanceId);expect(new Set(ids).size).toBe(3);
 expect(f.command({type:"move-steps",pawnId:f.actor,movementIndex:1,path:[step("b")]}).accepted).toBe(true);expect(atts[1]!.useMarkers).toEqual([{ability:"move:0",uses:1}]);expect(atts[2]!.useMarkers).toBeUndefined();expect(availableActions(f.s,f.gd).some(o=>o.action.type==="move-steps" && o.action.movementIndex===2)).toBe(true);
 discardPawnAttachment(f.s,f.gd,f.s.cybernet.pawnById(f.actor)!,0);expect(f.s.cybernet.pawnById(f.actor)!.attachments![0]!.instanceId).toBe(ids[1]);expect(f.s.unresolvedUseCards).toEqual([]);reject(f,{type:"move-steps",pawnId:f.actor,movementIndex:1,path:[step("a")]});expect(inventory(f.s)).toEqual(cards);
 f.s.phase="beginning";advancePhase(f.s,f.gd);expect(f.command({type:"move-steps",pawnId:f.actor,movementIndex:1,path:[step("a")]}).accepted).toBe(true);
});

test("Physical use markers: provider cleanup retains spent-card evidence and rejects unresolved reuse atomically",()=>{
 const f=duplicates(),cards=inventory(f.s);expect(f.command({type:"move-steps",pawnId:f.actor,movementIndex:2,path:[step("b")]}).accepted).toBe(true);const id=f.s.cybernet.pawnById(f.actor)!.attachments![2]!.instanceId;
 discardPawnAttachment(f.s,f.gd,f.s.cybernet.pawnById(f.actor)!,0);expect(f.s.unresolvedUseCards).toHaveLength(1);expect(f.s.unresolvedUseCards![0]!.instanceId).toBe(id);expect(f.s.unresolvedUseCards![0]!.useMarkers).toEqual([{ability:"move:0",uses:1}]);expect(inventory(f.s)).toEqual(cards);
 expect(f.command({type:"move-steps",pawnId:f.actor,movementIndex:1,path:[step("a")]}).accepted).toBe(true);clearControlledUseMarkers(f.s,"p1");expect(f.s.unresolvedUseCards).toHaveLength(1);
 f.s.discard.push(...f.s.deck);f.s.deck=[];let card:string|undefined;do {card=draw(f.s);if(card) f.s.players[0]!.hand.push(card);}while(card && card!=="fixture-mover");expect(card).toBe("fixture-mover");
 expect(reject(f,{type:"attach-pawn",cardId:"fixture-mover",targetId:f.actor,slotRef:"pawn:gadget"}).error).toContain("unresolved");expect(inventory(f.s)).toEqual(cards);
});

test("Physical use markers: retained Reboot cards and common/reserve cards keep native spent state",()=>{
 for(const retained of [true,false]) {const f=nativeSpent();if(!retained) f.gd.pawns.find(p=>p.id===f.target)!.abilities=[];expect(finalizePawnElimination(f.s,f.target,f.gd)).toBe(true);expect(useMarkerAllocations(f.s)).toHaveLength(1);
  if(retained) {expect(f.s.eliminated).toContain(f.target);clearControlledUseMarkers(f.s,"p1");expect(useMarkerAllocations(f.s)).toHaveLength(1);clearControlledUseMarkers(f.s,"p2");expect(useMarkerAllocations(f.s)).toEqual([]);}
  else {expect(f.s.reserve).toContain(f.target);clearControlledUseMarkers(f.s,"p2");expect(useMarkerAllocations(f.s)[0]!.ownerId).toBe("");f.s.cybernet.placePawn({pawnId:f.target,ownerId:"p1",coord:{q:1,r:0},spaceId:"a"});f.s.reserve=f.s.reserve!.filter(id=>id!==f.target);setPawnControl(f.s,f.target,"p1");f.s.currentPlayer=0;reject(f,{type:"move-steps",pawnId:f.target,path:[step("b")]});clearControlledUseMarkers(f.s,"p1");expect(f.command({type:"move-steps",pawnId:f.target,path:[step("b")]}).accepted).toBe(true);}
 }
});

test("Physical use markers: native Delete, Search, Icebreaker and Reboot have independent physical references",()=>{
 for(const ability of ["delete","search","icebreaker","reboot"] as const) {const f=fixture(),pawn=f.gd.pawns.find(p=>p.id===f.actor)!;pawn.abilities=[{ability,activation:"once-per-turn",...(ability==="delete"?{skulls:1}:{})}];
  let action:Action;if(ability==="delete") {f.gd.pawns.find(p=>p.id===f.target)!.defense=[1,2,3,4,5,6].map(value=>({value,shielded:true}));action={type:"delete",pawnId:f.actor,targetId:f.target};}
  else if(ability==="search") action={type:"search",pawnId:f.actor};
  else if(ability==="icebreaker") {f.gd.pawns.find(p=>p.id===f.target)!.iceFaces=[1,2,3,4,5,6];action={type:"icebreak-pawn",pawnId:f.actor,targetId:f.target};}
  else {finalizePawnElimination(f.s,f.actor,f.gd);action={type:"reboot",pawnId:f.actor};}
  expect(f.command(action).accepted).toBe(true);expect(useMarkerAllocations(f.s).some(m=>m.pawnId===f.actor && m.ability===ability && m.uses===1)).toBe(true);
 }
});

test("Physical use markers: views and snapshots clone native, active and unresolved marker records without RNG changes",()=>{
 const f=duplicates();f.command({type:"move-steps",pawnId:f.actor,movementIndex:1,path:[step("b")]});const before=snapshot(f.s),rng=f.s.rng.clone(),copy=cloneGameState(f.s),view=playerView(f.s,f.gd,"p1");copy.cybernet.pawnById(f.actor)!.attachments![1]!.useMarkers![0]!.uses=99;view.useMarkers[0]!.uses=99;view.pawns[0]!.attachments[1]!.useMarkers![0]!.uses=99;availableActions(f.s,f.gd);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
 discardPawnAttachment(f.s,f.gd,f.s.cybernet.pawnById(f.actor)!,1);const pending=snapshot(f.s),clone=cloneGameState(f.s);clone.unresolvedUseCards![0]!.useMarkers![0]!.uses=99;expect(snapshot(f.s)).toBe(pending);
});

test("Physical use markers: official bundles reject unresolved discarded-card lifetimes",()=>{
 const gd=loadDefault("speedrunners");gd.blocks=gd.blocks.filter(b=>b.id==="central-core");gd.pawns=gd.pawns.filter(p=>p.isStarter);gd.cards=[{id:"fixture-limited",name:"Synthetic limited card",attach:{as:"pawn",slot:"gadget",grantsMovement:[{type:"fixed",amount:1}],abilityUses:[{ability:"move",perTurn:1}]}}];gd.controlCards=[];
 expect(()=>newGame({data:gd,playerNames:["A","B"],seed:42})).toThrow(/unresolved discarded-card use-marker lifetime/);
 expect(newGame({data:gd,playerNames:["A","B"],seed:42,allowProvisional:true}).rulesVersion).toBe("source-v21");
});
