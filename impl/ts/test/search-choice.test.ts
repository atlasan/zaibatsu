import {useMarkerAllocations,abilityUseSpent} from "../src/engine/use-markers.ts";
import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {newGame,availableActions,applyActionWithEvents,advancePhase,cloneGameState,snapshot,validSearchPlacements,search,type Action,type EngineEvent} from "../src/engine/index.ts";
import {playerView} from "../src/engine/player-view.ts";
import {neighbor} from "../src/domain/hex.ts";
import type {Block,GameState} from "../src/domain/types.ts";

function tile():Block {return {id:"fixture-search-tile",name:"Synthetic Search tile",expansion:"speedrunners",iceValue:"high",iceFaces:[1],edges:[true,false,false,false,false,false],boundarySpaces:[["a"],[],[],[],[],[]],spaces:[{id:"a",type:"special",capacity:"unlimited"}],provisional:true};}
function fixture() {
  const gd=loadDefault("speedrunners");gd.blocks.push(tile());
  const s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
  for(const p of s.players) {s.deck.push(...p.hand);p.hand=[];}
  for(const id of ["move-1","move-1","dummy"]) {const at=s.deck.indexOf(id);if(at<0) throw new Error(id);s.deck.splice(at,1);s.players[0]!.hand.push(id);}
  s.blockPile=s.blockPile.filter(id=>id!=="fixture-search-tile");s.blockPile.push("fixture-search-tile");
  const actor=s.players[0]!.pawnId;
  const begin=()=>applyActionWithEvents(s,gd,{type:"play-search",pawnId:actor,cardId:"move-1"});
  return {gd,s,actor,begin};
}
function blocks(s:GameState) {return [...s.blockPile,...s.cybernet.blocks.map(b=>b.blockId),...(s.pendingChoice?.kind==="place-block"?[s.pendingChoice.blockId!]:[])].sort();}
function cards(s:GameState) {return [...s.deck,...s.discard,...s.playedCards??[],...s.players.flatMap(p=>p.hand),...s.cybernet.pawns.flatMap(p=>(p.attachments??[]).map(a=>a.cardId))].sort();}
function reject(f:ReturnType<typeof fixture>,action:Action) {const before=snapshot(f.s),rng=f.s.rng.clone();const result=applyActionWithEvents(f.s,f.gd,action);expect(result.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));return result;}
function responses(f:ReturnType<typeof fixture>) {return availableActions(f.s,f.gd)[0]!.responses!;}

test("Source Search: commit, public reveal, retry and legal placement match shared windows and events",()=>{
  const f=fixture(),before=JSON.parse(snapshot(f.s)),inventory=blocks(f.s),cardInventory=cards(f.s),rng=f.s.rng.clone();
  const declared=f.begin();expect(declared.accepted).toBe(true);expect(f.s.players[0]!.hand).toEqual(["move-1","dummy"]);expect(f.s.discard).toEqual(["move-1"]);expect(f.s.playedCards??[]).toEqual([]);
  expect(f.s.pendingChoice?.blockId).toBe("fixture-search-tile");expect(f.s.cybernet.blocks).toHaveLength(1);expect(blocks(f.s)).toEqual(inventory);
  const pending=JSON.parse(snapshot(f.s)),options=responses(f);expect(options).toHaveLength(6);expect(validSearchPlacements(f.s,f.gd,f.actor)).toEqual(options.map(a=>{const [,dir,rotation]=a.optionId!.split(":").map(Number);return {dir:dir!,rotation:rotation!};}));
  const observer=playerView(f.s,f.gd,"p2");expect(observer.revealedBlock).toEqual({blockId:"fixture-search-tile",reference:{q:0,r:0}});expect(observer.pendingChoice).toBeUndefined();expect(observer.options).toEqual([]);
  reject(f,{type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"place:0:0"});
  const placed=applyActionWithEvents(f.s,f.gd,options[0]!);expect(placed.accepted).toBe(true);expect(f.s.pendingChoice).toBeUndefined();expect(f.s.cybernet.blocks.at(-1)!.blockId).toBe("fixture-search-tile");expect(cards(f.s)).toEqual(cardInventory);expect(blocks(f.s)).toEqual(inventory);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  const golden=JSON.parse(readFileSync(new URL("../../../golden/search-choice.json",import.meta.url),"utf8"));expect({before,pending,pendingSnapshot:JSON.stringify(pending),options,observer,after:JSON.parse(snapshot(f.s)),events:[...declared.events,...placed.events]}).toEqual(golden);
});

test("Source Search: previews do not inspect hidden tile order, mutate state or advance RNG",()=>{
  const f=fixture(),before=snapshot(f.s),rng=f.s.rng.clone(),options=availableActions(f.s,f.gd),view=playerView(f.s,f.gd,"p1");
  expect(()=>validSearchPlacements(f.s,f.gd,f.actor)).toThrow(/declare Search/);expect(()=>search(f.s,f.gd,f.actor,0,3)).toThrow(/declaration/);
  f.s.blockPile.reverse();expect(availableActions(f.s,f.gd)).toEqual(options);expect(playerView(f.s,f.gd,"p1")).toEqual(view);f.s.blockPile.reverse();
  expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  expect(f.begin().accepted).toBe(true);const pending=snapshot(f.s),choiceOptions=responses(f);expect(cloneGameState(f.s).pendingChoice).toEqual(f.s.pendingChoice);expect(snapshot(f.s)).toBe(pending);
  choiceOptions[0]!.choiceId="mutated";expect(f.s.pendingChoice!.id).not.toBe("mutated");const copy=cloneGameState(f.s);copy.pendingChoice!.reference!.q=99;expect(snapshot(f.s)).toBe(pending);
});

test("Source Search: pending decision rejects unauthorized, stale, malformed and interleaved responses atomically",()=>{
  const f=fixture();expect(f.begin().accepted).toBe(true);const response=responses(f)[0]!;
  for(const action of [{type:"pass"},{type:"play-search",pawnId:f.actor,cardId:"move-1"},{...response,playerId:"p2"},{...response,choiceId:"stale"},{...response,optionId:"place:6:0"},{...response,optionId:"place:0:3junk"},{...response,optionId:"discard"},{...response,cardIds:["dummy"]},{...response,targetId:f.s.players[1]!.pawnId},{...response,coord:{q:1,r:0}}] as Action[]) reject(f,action);
  const before=snapshot(f.s),rng=f.s.rng.clone();expect(advancePhase(f.s,f.gd).accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  expect(applyActionWithEvents(f.s,f.gd,response).accepted).toBe(true);reject(f,response);
});

test("Source Search: activation, public geometry and exhausted-pile rejection preserve all state and RNG",()=>{
  for(const kind of ["no-card","wrong-owner","missing-pawn","no-ability","empty-pile","surrounded","phase","winner","free-misuse"] as const) {
    const f=fixture();let action:Action={type:"play-search",pawnId:f.actor,cardId:"move-1"};
    if(kind==="no-card") action.cardId="not-in-hand";
    if(kind==="wrong-owner") action.pawnId=f.s.players[1]!.pawnId;
    if(kind==="missing-pawn") action.pawnId="missing";
    if(kind==="no-ability") f.gd.pawns.find(p=>p.id===f.actor)!.abilities=[];
    if(kind==="empty-pile") f.s.blockPile=[];
    if(kind==="surrounded") for(let dir=0;dir<6;dir++) f.s.cybernet.blocks.push({blockId:"data-haven",coord:neighbor({q:0,r:0},dir),rotation:0});
    if(kind==="phase") f.s.phase="beginning";
    if(kind==="winner") f.s.winnerId="p1";
    if(kind==="free-misuse") action={type:"search",pawnId:f.actor,cardId:"move-1"};
    reject(f,action);if(kind!=="no-card" && kind!=="free-misuse") expect(availableActions(f.s,f.gd).filter(o=>o.action.type==="play-search" && o.action.pawnId===action.pawnId)).toEqual([]);
  }
});

test("Source Search: free use is spent on declaration and resets only at the next ordinary beginning",()=>{
  const f=fixture();f.gd.pawns.find(p=>p.id===f.actor)!.abilities!.find(a=>a.ability==="search")!.activation="once-per-turn";
  reject(f,{type:"play-search",pawnId:f.actor});reject(f,{type:"play-search",pawnId:f.actor,cardId:"move-1"});
  const hand=[...f.s.players[0]!.hand],r=applyActionWithEvents(f.s,f.gd,{type:"search",pawnId:f.actor});expect(r.accepted).toBe(true);expect(useMarkerAllocations(f.s).some(m=>m.pawnId===f.actor && m.ability==="search")).toBe(true);expect(f.s.players[0]!.hand).toEqual(hand);expect(f.s.discard).toEqual([]);
  expect(applyActionWithEvents(f.s,f.gd,responses(f)[0]!).accepted).toBe(true);reject(f,{type:"search",pawnId:f.actor});
  for(let index=0;index<8;index++) expect(advancePhase(f.s,f.gd).accepted).toBe(true);
  expect(f.s.currentPlayer).toBe(0);expect(f.s.phase).toBe("action");expect(useMarkerAllocations(f.s)).toEqual([]);expect(applyActionWithEvents(f.s,f.gd,{type:"search",pawnId:f.actor}).accepted).toBe(true);
});

test("Source Search: repeated paid use consumes duplicate physical costs once per newly revealed tile",()=>{
  const f=fixture();f.s.blockPile=f.s.blockPile.filter(id=>!["engineering-war","fixture-search-tile"].includes(id));f.s.blockPile.push("engineering-war","fixture-search-tile");const inventory=blocks(f.s),cardInventory=cards(f.s);let previous="";
  for(let index=0;index<2;index++) {expect(f.begin().accepted).toBe(true);expect(f.s.pendingChoice!.id).not.toBe(previous);previous=f.s.pendingChoice!.id;expect(applyActionWithEvents(f.s,f.gd,responses(f)[0]!).accepted).toBe(true);}
  expect(f.s.discard).toEqual(["move-1","move-1"]);expect(f.s.players[0]!.hand).toEqual(["dummy"]);expect(f.s.cybernet.pawns[0]!.coord).toEqual({q:0,r:0});expect(blocks(f.s)).toEqual(inventory);expect(cards(f.s)).toEqual(cardInventory);
});

test("Source Search: placement creates bonus geometry and deploys threats only after the choice",()=>{
  const f=fixture(),core=f.gd.blocks.find(b=>b.isCentralCore)!,newTile=f.gd.blocks.at(-1)!;
  core.bonusCorners=[true,true,true,true,true,true];newTile.bonusCorners=[true,true,true,true,true,true];
  f.gd.blocks.push({...structuredClone(core),id:"fixture-peer",name:"Synthetic bonus peer",isCentralCore:false});f.s.cybernet.blocks.push({blockId:"fixture-peer",coord:{q:1,r:-1},rotation:0});
  newTile.effects={inCybernet:{kind:"area-attack",amount:1}};newTile.spaces![0]!.type="event";f.gd.threats=[{id:"fixture-guard",name:"Synthetic guard",type:"drone",attackDie:4,defense:[{value:1,shielded:false}]}];f.s.threatPile=["fixture-guard"];
  expect(f.begin().accepted).toBe(true);expect(f.s.cybernet.bonusIcons).toEqual([]);expect(f.s.threats??[]).toEqual([]);const option=responses(f).find(a=>a.optionId==="place:0:3")!;
  const placed=applyActionWithEvents(f.s,f.gd,option);expect(placed.accepted).toBe(true);expect(f.s.cybernet.bonusIcons).toHaveLength(1);expect(placed.events.some(e=>e.type==="bonus-icon-created")).toBe(true);expect(f.s.threats).toHaveLength(1);expect(f.s.threatPile).toEqual([]);expect(placed.events.map(e=>e.type)).toEqual(["choice-resolved","block-placed","bonus-icon-created","bonus-counter-placed","roll"]);
});

test("Source Search: unsupported topology and placement effects fail explicitly without losing the revealed tile",()=>{
  const f=fixture();f.gd.blocks.at(-1)!.edges=[false,false,false,false,false,false];reject(f,{type:"play-search",pawnId:f.actor,cardId:"move-1"});f.gd.blocks.at(-1)!.edges=[true,false,false,false,false,false];
  f.gd.blocks.at(-1)!.effects={inCybernet:{kind:"custom",text:"Unimplemented fixture"}};expect(f.begin().accepted).toBe(true);const response=responses(f)[0]!;expect(reject(f,response).error).toContain("unsupported");expect(f.s.discard).toEqual(["move-1"]);expect(f.s.pendingChoice!.blockId).toBe("fixture-search-tile");
  expect(()=>newGame({data:f.gd,playerNames:["A","B"],seed:42})).toThrow(/unsupported block placement/);
  delete f.gd.blocks.at(-1)!.effects;expect(applyActionWithEvents(f.s,f.gd,response).accepted).toBe(true);
});


test("Source Search: occupied placements and failures after effect rolls preserve the committed window",()=>{
 const f=fixture();f.s.cybernet.blocks.push({blockId:"data-haven",coord:{q:1,r:0},rotation:0});expect(f.begin().accepted).toBe(true);expect(responses(f).some(a=>a.optionId==="place:0:3")).toBe(false);reject(f,{type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"place:0:3"});
 const g=fixture(),tile=g.gd.blocks.at(-1)!;tile.effects={inCybernet:{kind:"area-attack",amount:1}};tile.spaces![0]!.type="event";g.s.threatPile=["missing-threat"];expect(g.begin().accepted).toBe(true);const response=responses(g)[0]!,rng=g.s.rng.clone();
 expect(reject(g,response).error).toContain("sourced combat data");expect(g.s.cybernet.blocks).toHaveLength(1);expect(g.s.threatPile).toEqual(["missing-threat"]);expect(g.s.discard).toEqual(["move-1"]);
 g.gd.threats=[{id:"missing-threat",name:"Synthetic fixed guard",type:"drone",attackDie:4,defense:[{value:1,shielded:false}]}];const accepted=applyActionWithEvents(g.s,g.gd,response);expect(accepted.accepted).toBe(true);const die=rng.intn(6)+1;expect(accepted.events.find(e=>e.type==="roll")?.roll).toEqual([die]);expect(g.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
});
