import {useMarkerAllocations,abilityUseSpent} from "../src/engine/use-markers.ts";
import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {newGame,applyActionWithEvents,availableActions,advancePhase,snapshot,cloneGameState,movementChoicePreview,effectiveMovementOptions,moveStepsWithOption,type Action} from "../src/engine/index.ts";
import {playerView} from "../src/engine/player-view.ts";
import type {Block,GameState} from "../src/domain/types.ts";
import type {SpaceRef} from "../src/engine/movement.ts";

function board(id:string):Block {return {id,name:"Synthetic movement board",expansion:"speedrunners",iceValue:"high",iceFaces:[1],edges:[true,true,true,true,true,true],boundarySpaces:[["a"],["a"],["a"],["a"],["a"],["a"]],spaces:[{id:"a",type:"special",capacity:"unlimited",neighbors:["b"]},{id:"b",type:"normal",neighbors:["a","c"]},{id:"c",type:"special",capacity:"unlimited",neighbors:["b"]}],provisional:true};}
const ref=(spaceId:string,q=1):SpaceRef=>({coord:{q,r:0},spaceId});
function fixture(type:"d6"|"2d6"="2d6") {
 const gd=loadDefault("speedrunners");gd.blocks.push(board("fixture-movement-board"),board("fixture-movement-next"));
 const s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
 for(const p of s.players) {s.deck.push(...p.hand);p.hand=[];}
 for(const id of ["move-1","move-1","dummy"]) {const at=s.deck.indexOf(id);if(at<0) throw new Error(id);s.deck.splice(at,1);s.players[0]!.hand.push(id);}
 const actor=s.players[0]!.pawnId;gd.pawns.find(p=>p.id===actor)!.movement={type,activation:"once-per-turn"};
 for(const [index,pawn] of s.cybernet.pawns.entries()) {pawn.coord={q:1,r:0};pawn.spaceId=index?"b":"a";}
 s.cybernet.blocks.push({blockId:"fixture-movement-board",coord:{q:1,r:0},rotation:0},{blockId:"fixture-movement-next",coord:{q:2,r:0},rotation:0});s.blockPile=s.blockPile.filter(id=>!["fixture-movement-board","fixture-movement-next"].includes(id));
 const begin=(extra:Partial<Action>={})=>applyActionWithEvents(s,gd,{type:"roll-movement",pawnId:actor,...extra});
 const finish=(path:SpaceRef[]=[])=>applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,optionId:"move",path});
 return {gd,s,actor,begin,finish};
}
function inventory(s:GameState) {return [...s.deck,...s.discard,...s.playedCards??[],...s.players.flatMap(p=>p.hand),...s.cybernet.pawns.flatMap(p=>(p.attachments??[]).map(a=>a.cardId))].sort();}
function reject(f:ReturnType<typeof fixture>,action:Action) {const before=snapshot(f.s),rng=f.s.rng.clone();const r=applyActionWithEvents(f.s,f.gd,action);expect(r.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));return r;}

test("Rolled movement: public dice, committed marker, occupied pass-through and completion match shared evidence",()=>{
 const f=fixture(),before=JSON.parse(snapshot(f.s)),rng=f.s.rng.clone(),cards=inventory(f.s),expected=[rng.intn(6)+1,rng.intn(6)+1];
 const started=f.begin();expect(started.accepted).toBe(true);expect(f.s.pendingChoice!.movement!.roll).toEqual(expected);expect(useMarkerAllocations(f.s).some(m=>m.pawnId===f.actor && m.ability==="move")).toBe(true);expect(f.s.cybernet.pawnById(f.actor)!.spaceId).toBe("a");
 const pendingSnapshot=snapshot(f.s),options=availableActions(f.s,f.gd),observer=playerView(f.s,f.gd,"p2");expect(observer.movement!.roll).toEqual(expected);expect(observer.options).toEqual([]);expect(observer.pendingChoice).toBeUndefined();
 const occupied=movementChoicePreview(f.s,f.gd,[ref("b")]);expect(occupied.canFinish).toBe(false);expect(occupied.nextTargets.some(t=>t.spaceId==="c")).toBe(true);expect(snapshot(f.s)).toBe(pendingSnapshot);
 const ended=f.finish([ref("b"),ref("c")]);expect(ended.accepted).toBe(true);expect(f.s.pendingChoice).toBeUndefined();expect(inventory(f.s)).toEqual(cards);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
 const golden=JSON.parse(readFileSync(new URL("../../../golden/movement-choice.json",import.meta.url),"utf8"));expect({before,pending:JSON.parse(pendingSnapshot),pendingSnapshot,options,observer,occupied,after:JSON.parse(snapshot(f.s)),events:[...started.events,...ended.events]}).toEqual(golden.native);
});

test("Rolled movement: path previews, unauthorized responses and over-budget retries never reroll or change state",()=>{
 const f=fixture();expect(f.begin().accepted).toBe(true);const id=f.s.pendingChoice!.id,budget=f.s.pendingChoice!.movement!.budget,before=snapshot(f.s),rng=f.s.rng.clone();
 const response:Action={type:"resolve-choice",choiceId:id,optionId:"move",path:[ref("b"),ref("c")]};
 for(const a of [{type:"pass"},{type:"roll-movement",pawnId:f.actor},{...response,playerId:"p2"},{...response,choiceId:"stale"},{...response,optionId:"discard"},{...response,cardId:"dummy"},{...response,pawnId:f.s.players[1]!.pawnId},{...response,path:[ref("b")]},{...response,path:[ref("missing")]},{...response,path:Array.from({length:budget+1},()=>ref("b"))}] as Action[]) reject(f,a);
 expect(advancePhase(f.s,f.gd).accepted).toBe(false);const preview=movementChoicePreview(f.s,f.gd,[]);preview.roll[0]=99;preview.nextTargets[0]!.coord.q=99;const copy=cloneGameState(f.s);copy.pendingChoice!.movement!.origin.coord.q=99;expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));expect(f.finish([ref("b"),ref("c")]).accepted).toBe(true);reject(f,response);
});

test("Rolled movement: upfront rejection and old path-first helpers preserve the uncommitted RNG",()=>{
 for(const kind of ["path-first","wrong-owner","card-on-free","fixed","phase","winner","missing","index"] as const) {
  const f=fixture();let a:Action={type:"roll-movement",pawnId:f.actor};if(kind==="path-first") a.path=[ref("b"),ref("c")];if(kind==="wrong-owner") a.pawnId=f.s.players[1]!.pawnId;if(kind==="card-on-free") a.cardId="dummy";if(kind==="fixed") f.gd.pawns.find(p=>p.id===f.actor)!.movement={type:"steps",steps:3,activation:"once-per-turn"};if(kind==="phase") f.s.phase="beginning";if(kind==="winner") f.s.winnerId="p1";if(kind==="missing") a.pawnId="missing";if(kind==="index") a.movementIndex=99;reject(f,a);
 }
 const f=fixture(),before=snapshot(f.s),rng=f.s.rng.clone();reject(f,{type:"move-steps",pawnId:f.actor,path:[ref("b"),ref("c")]});expect(()=>moveStepsWithOption(f.s,f.gd,f.actor,[ref("b"),ref("c")])).toThrow(/roll movement/);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
});

test("Rolled movement: one die and negative modifiers allow zero-step stopping after committed activation",()=>{
 const f=fixture("d6");f.gd.cards.push({id:"fixture-negative",name:"Synthetic modifier",attach:{as:"pawn",slot:"armor",movementModifier:-99}});f.s.cybernet.pawnById(f.actor)!.attachments=[{cardId:"fixture-negative",slot:"armor",slotRef:"pawn:armor"}];
 const rng=f.s.rng.clone(),die=rng.intn(6)+1;expect(f.begin().accepted).toBe(true);expect(f.s.pendingChoice!.movement!.roll).toEqual([die]);expect(f.s.pendingChoice!.movement!.budget).toBe(0);const options=availableActions(f.s,f.gd);expect(movementChoicePreview(f.s,f.gd).nextTargets).toEqual([]);expect(f.finish().accepted).toBe(true);expect(f.s.cybernet.pawnById(f.actor)!.spaceId).toBe("a");expect(useMarkerAllocations(f.s).some(m=>m.pawnId===f.actor && m.ability==="move")).toBe(true);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
 expect(options).toEqual(JSON.parse(readFileSync(new URL("../../../golden/movement-choice.json",import.meta.url),"utf8")).zeroOptions);
 const g=fixture("d6");g.gd.cards.push({id:"fixture-positive",name:"Synthetic positive modifier",attach:{as:"pawn",slot:"armor",movementModifier:1}});g.s.cybernet.pawnById(g.actor)!.attachments=[{cardId:"fixture-positive",slot:"armor",slotRef:"pawn:armor"}];const expected=g.s.rng.clone().intn(6)+2;expect(g.begin().accepted).toBe(true);expect(g.s.pendingChoice!.movement!.budget).toBe(expected);expect(reject(g,{type:"resolve-choice",choiceId:g.s.pendingChoice!.id,optionId:"move",path:Array.from({length:expected+1},(_,i)=>ref(i%2?"a":"b"))}).error).toContain("budget");expect(g.finish([ref("b"),ref("c")]).accepted).toBe(true);

});

test("Rolled movement: paid grants use one physical card per roll and leave native free movement independent",()=>{
 const f=fixture();f.gd.cards.push({id:"fixture-dice-grant",name:"Synthetic paid dice grant",attach:{as:"pawn",slot:"gadget",grantsMovement:[{type:"2d6"}],abilityUses:[{ability:"move",activation:"card"}]}});f.s.cybernet.pawnById(f.actor)!.attachments=[{cardId:"fixture-dice-grant",slot:"gadget",slotRef:"pawn:gadget"}];const cards=inventory(f.s);
 for(let i=0;i<2;i++) {expect(f.begin({movementIndex:1,cardId:"move-1"}).accepted).toBe(true);expect(f.s.playedCards).toHaveLength(i+1);expect(f.s.discard).toEqual([]);expect(f.finish().accepted).toBe(true);}
 expect(f.s.players[0]!.hand).toEqual(["dummy"]);expect(useMarkerAllocations(f.s)).toEqual([]);expect(inventory(f.s)).toEqual(cards);expect(availableActions(f.s,f.gd).some(o=>o.action.type==="roll-movement" && !o.action.movementIndex)).toBe(true);
 expect(f.begin().accepted).toBe(true);expect(f.finish([ref("b"),ref("c")]).accepted).toBe(true);expect(availableActions(f.s,f.gd).some(o=>o.action.type==="play-move" && o.action.cardId==="dummy")).toBe(true);expect(applyActionWithEvents(f.s,f.gd,{type:"play-move",pawnId:f.actor,cardId:"dummy",path:[ref("b"),ref("a")]}).accepted).toBe(true);expect(useMarkerAllocations(f.s).some(m=>m.pawnId===f.actor && m.ability==="move")).toBe(true);
});

test("Rolled movement: free granted dice, cumulative routes and ordinary next-turn marker reset",()=>{
 const f=fixture();f.gd.cards.push({id:"fixture-free-die",name:"Synthetic free die grant",attach:{as:"pawn",slot:"gadget",grantsMovement:[{type:"d6"}],abilityUses:[{ability:"move",activation:"once-per-turn",perTurn:1}]}});f.s.cybernet.pawnById(f.actor)!.attachments=[{cardId:"fixture-free-die",slot:"gadget",slotRef:"pawn:gadget"}];
 expect(f.begin({movementIndex:1}).accepted).toBe(true);expect(f.finish().accepted).toBe(true);reject(f,{type:"roll-movement",pawnId:f.actor,movementIndex:1});expect(f.begin().accepted).toBe(true);expect(f.finish().accepted).toBe(true);
 for(let i=0;i<8;i++) expect(advancePhase(f.s,f.gd).accepted).toBe(true);expect(useMarkerAllocations(f.s)).toEqual([]);expect(f.begin({movementIndex:1}).accepted).toBe(true);
});

test("Rolled movement: Core entry restrictions and movement cancellation apply to every route",()=>{
 const f=fixture();const at=f.s.deck.indexOf("lima-flag");f.s.deck.splice(at,1);f.s.cybernet.pawnById(f.actor)!.attachments=[{cardId:"lima-flag",slot:"add-on",slotRef:"pawn:add-on"}];expect(f.begin().accepted).toBe(true);expect(movementChoicePreview(f.s,f.gd).nextTargets.every(t=>t.coord.q!==0)).toBe(true);reject(f,{type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"move",path:[{coord:{q:0,r:0},spaceId:"core"}]});expect(f.finish([ref("b"),ref("c")]).accepted).toBe(true);

 for(const exception of [false,true]) {const g=fixture();g.gd.blocks.find(b=>b.id==="fixture-movement-board")!.spaces![0]!.direction=3;if(exception) {const at=g.s.deck.indexOf("octagon-dex");g.s.deck.splice(at,1);const slot=g.gd.cards.find(c=>c.id==="octagon-dex")!.attach!.slot!;g.s.cybernet.pawnById(g.actor)!.attachments=[{cardId:"octagon-dex",slot,slotRef:`pawn:${slot}`}];}expect(g.begin().accepted).toBe(true);expect(movementChoicePreview(g.s,g.gd).nextTargets.some(t=>t.coord.q===2)).toBe(exception);if(exception) expect(g.finish([ref("a",2)]).accepted).toBe(true);else reject(g,{type:"resolve-choice",choiceId:g.s.pendingChoice!.id,optionId:"move",path:[ref("a",2)]});}
 for(const native of [true,false]) {const g=fixture();g.gd.cards.push({id:"fixture-cancel",name:"Synthetic cancellation",attach:{as:"pawn",slot:"gadget",grantsMovement:[{type:"d6"}],abilityUses:[{ability:"move",activation:"once-per-turn"}],...(!native?{removes:["move"]}:{})}});g.s.cybernet.pawnById(g.actor)!.attachments=[{cardId:"fixture-cancel",slot:"gadget",slotRef:"pawn:gadget"}];if(native) g.gd.pawns.find(p=>p.id===g.actor)!.movement.activation="none";expect(effectiveMovementOptions(g.gd,g.gd.pawns.find(p=>p.id===g.actor)!,g.s.cybernet.pawnById(g.actor)!.attachments)).toEqual([]);reject(g,{type:"roll-movement",pawnId:g.actor});reject(g,{type:"play-move",pawnId:g.actor,cardId:"dummy",path:[ref("b"),ref("c")]});expect(availableActions(g.s,g.gd).filter(o=>["roll-movement","play-move"].includes(o.action.type))).toEqual([]);}
});

test("Rolled movement: threat entry stops ordinary movement while a selected stealth grant may pass",()=>{
 for(const stealth of [false,true]) {const f=fixture();f.s.threats=[{id:"fixture-threat",threatId:"fixture-guard",coord:{q:2,r:0},spaceId:"a",status:"inactive"}];let movementIndex=0;
  if(stealth) {f.gd.cards.push({id:"fixture-stealth",name:"Synthetic stealth dice",attach:{as:"pawn",slot:"gadget",grantsMovement:[{type:"2d6",stealth:true}],abilityUses:[{ability:"move",activation:"once-per-turn"}]}});f.s.cybernet.pawnById(f.actor)!.attachments=[{cardId:"fixture-stealth",slot:"gadget",slotRef:"pawn:gadget"}];movementIndex=1;}
  expect(f.begin({movementIndex}).accepted).toBe(true);const path=[ref("a",2),ref("b",2)];if(stealth) {expect(f.finish(path).accepted).toBe(true);expect(f.s.pendingThreats).toBeUndefined();expect(f.s.threats[0]!.status).toBe("inactive");} else {expect(movementChoicePreview(f.s,f.gd,[path[0]!]).nextTargets).toEqual([]);reject(f,{type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"move",path});expect(f.finish([path[0]!]).accepted).toBe(true);expect(f.s.pendingThreats?.stage).toBe("response");expect(advancePhase(f.s,f.gd).accepted).toBe(false);}
 }
});

test("Rolled movement: unverified legacy dice-use budgets reject in source constructors",()=>{
 const f=fixture();f.gd.cards.push({id:"fixture-legacy-use-roll",name:"Unverified legacy use roll",attach:{as:"pawn",grantsMovement:[{type:"fixed",amount:1}],abilityUses:[{ability:"move",dice:"d6"}]}});expect(()=>newGame({data:f.gd,allowProvisional:true,playerNames:["A","B"],seed:42})).toThrow(/unsupported source rolled movement-use budget/);
});


test("Movement cancellation: explicit normal relocation obeys it while placement remains distinct",()=>{
 for(const threatMode of ["normal-movement","placement"] as const) {const f=fixture();f.gd.pawns.find(p=>p.id===f.actor)!.movement.activation="none";f.gd.cards.push({id:"fixture-relocation",name:"Synthetic relocation policy",attach:{as:"pawn",slot:"gadget",phaseEffects:[{trigger:"begin-turn",kind:"discard-and-relocate",threatMode}]}});f.s.cybernet.pawnById(f.actor)!.attachments=[{cardId:"fixture-relocation",slot:"gadget",slotRef:"pawn:gadget"}];f.s.phase="beginning";expect(advancePhase(f.s,f.gd).accepted).toBe(true);const action:Action={type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"relocate",coord:{q:2,r:0},spaceId:"a"};
  if(threatMode==="normal-movement") {expect(availableActions(f.s,f.gd)[0]!.targets).toEqual([]);expect(reject(f,action).error).toContain("cannot move");} else {expect(applyActionWithEvents(f.s,f.gd,action).accepted).toBe(true);expect(f.s.cybernet.pawnById(f.actor)!.coord.q).toBe(2);}
 }
});
