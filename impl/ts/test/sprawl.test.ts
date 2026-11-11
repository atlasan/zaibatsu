import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {newGame,applyActionWithEvents,advancePhase,snapshot,availableActions,cloneGameState,controlledPawnCount,gainPawnControl,stepTargets,defenseProfile,validateSpaceArrows,type Action} from "../src/engine/index.ts";
import {discardPawnAttachment} from "../src/engine/attachment-slots.ts";
import {playerView} from "../src/engine/player-view.ts";

function fixture() {
 const gd=loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";s.deck.push(...s.players.flatMap(p=>p.hand));for(const p of s.players)p.hand=[];
 const take=(i:number,id:string)=>{const at=s.deck.indexOf(id);if(at<0)throw new Error(id);s.deck.splice(at,1);s.players[i]!.hand.push(id);};for(const id of ["dj","move-1","move-1","octagon-dex"])take(0,id);for(const id of ["dummy","worm"])take(1,id);
 s.blockPile=s.blockPile.filter(id=>id!=="idoru" && id!=="chiba-city");s.blockPile.push("chiba-city");s.cybernet.blocks.push({blockId:"idoru",coord:{q:0,r:1},rotation:0});s.reserve=s.reserve!.filter(id=>id!=="idoru");s.cybernet.placePawn({pawnId:"idoru",ownerId:"",coord:{q:0,r:1},spaceId:"idoru"});gainPawnControl(s,gd,"idoru","p1");
 const target=s.players[1]!.pawnId;s.cybernet.removePawn(target);s.eliminated.push(target);
 const actor=s.players[0]!.pawnId,command=(a:Action)=>applyActionWithEvents(s,gd,a);
 return {gd,s,actor,target,take,command};
}
function start(f:ReturnType<typeof fixture>) {const declared=f.command({type:"play-search",pawnId:f.actor,cardId:"dj"});if(!declared.accepted)throw new Error(declared.error);const revealed=JSON.parse(snapshot(f.s)),placed=f.command({type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"place:0:0"});if(!placed.accepted)throw new Error(placed.error);return {declared,revealed,placed};}
function inventory(s:ReturnType<typeof fixture>["s"]):string[] {return [...s.deck,...s.discard,...s.playedCards??[],...s.players.flatMap(p=>p.hand),...s.cybernet.pawns.flatMap(p=>(p.attachments??[]).map(a=>a.cardId)),...s.cybernet.blocks.flatMap(b=>(b.attachments??[]).map(a=>a.cardId))].sort();}
function response(f:ReturnType<typeof fixture>,id:string,cards:string[]):Action {const d=f.s.pendingBlockDiscards!.decisions.find(d=>d.playerId===id)!;return {type:"resolve-choice",playerId:id,choiceId:d.id,optionId:"discard",cardIds:cards};}
function reject(f:ReturnType<typeof fixture>,a:Action) {const before=snapshot(f.s),rng=f.s.rng.clone();expect(f.command(a).accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(10000)).toBe(rng.clone().intn(10000));}
function evidence() {
 const f=fixture(),initial=JSON.parse(snapshot(f.s)),started=start(f),pending=JSON.parse(snapshot(f.s)),options=f.s.players.map(p=>availableActions(f.s,f.gd,p.id));const first=f.command(response(f,"p2",["worm"]));if(!first.accepted)throw new Error(first.error);
 const committed=JSON.parse(snapshot(f.s)),observer=playerView(f.s,f.gd,"p1"),spectator=playerView(f.s,f.gd,"");const last=f.command(response(f,"p1",["move-1","move-1"]));if(!last.accepted)throw new Error(last.error);
 const tiles=f.gd.blocks.filter(b=>["hacktivism","chiba-city"].includes(b.id)).map(b=>({id:b.id,iceFaces:b.iceFaces,bonusCorners:b.bonusCorners,bonusFragments:b.bonusFragments,spaceArrows:b.spaceArrows,nonPlayableZoneIds:b.nonPlayableZoneIds,spaces:b.spaces}));
 return {tiles,initial,revealed:started.revealed,pending,options,committed,observer,spectator,finished:JSON.parse(snapshot(f.s)),events:[started.declared.events,started.placed.events,first.events,last.events]};
}

test("Sprawl: bilingual page-one geometry and independent player commitments share full evidence",()=>{
 const f=fixture(),hack=f.gd.blocks.find(b=>b.id==="hacktivism")!,sprawl=f.gd.blocks.find(b=>b.id==="chiba-city")!;expect(hack.iceFaces).toEqual([2,5,6]);expect(hack.bonusCorners).toEqual([false,true,true,true,true,true]);expect(hack.boundarySpaces).toEqual([["upper"],["right"],["lower"],["mask"],["shield"],["shield"]]);expect(hack.spaces![0]!.modifier!.dice).toEqual([{value:2,shielded:true},{value:3,shielded:true}]);expect(sprawl.iceFaces).toEqual([2,4,6]);expect(sprawl.bonusCorners).toEqual([true,true,true,false,false,true]);expect(sprawl.boundarySpaces).toEqual([["shield"],["right"],["city"],["city"],["left"],["rabbit"]]);expect(sprawl.effects?.underControl).toBeUndefined();expect(controlledPawnCount(f.s,"p1")).toBe(2);expect(controlledPawnCount(f.s,"p2")).toBe(1);expect(evidence()).toEqual(JSON.parse(readFileSync(new URL("../../../golden/sprawl.json",import.meta.url),"utf8")));
 for(const b of f.gd.blocks.filter(b=>["hacktivism","chiba-city"].includes(b.id))) {expect(b.edges).toEqual([true,true,true,true,true,true]);expect(b.spaces).toHaveLength(5);expect(b.nonPlayableZoneIds).toEqual(["h1"]);expect(b.provisional).toBe(true);}
});

test("Sprawl: off-turn owners may commit their own cards; public discards wait for everyone and order is stable",()=>{
 const a=fixture(),b=fixture(),physicalCards=inventory(a.s);start(a);start(b);const before=snapshot(a.s),rng=a.s.rng.clone();expect(playerView(a.s,a.gd,"p2").pendingChoice!.playerId).toBe("p2");expect(availableActions(a.s,a.gd,"p2")).toHaveLength(1);expect(snapshot(a.s)).toBe(before);expect(a.s.rng.clone().intn(10000)).toBe(rng.clone().intn(10000));
 const first=a.command(response(a,"p2",["worm"]));expect(first.accepted).toBe(true);expect(a.s.players[1]!.hand).toEqual(["dummy","worm"]);expect(a.s.discard).toEqual(["dj"]);expect(first.events.filter(e=>e.type==="card-discarded")).toEqual([]);expect(JSON.stringify(playerView(a.s,a.gd,"p1"))).not.toContain("worm");expect(playerView(a.s,a.gd,"p2").options).toEqual([]);
 const copy=cloneGameState(a.s);copy.pendingBlockDiscards!.decisions[1]!.cardIds![0]="dummy";expect(a.s.pendingBlockDiscards!.decisions[1]!.cardIds).toEqual(["worm"]);
 expect(a.command(response(a,"p1",["move-1","move-1"])).accepted).toBe(true);expect(b.command(response(b,"p1",["move-1","move-1"])).accepted).toBe(true);expect(b.command(response(b,"p2",["worm"])).accepted).toBe(true);expect(snapshot(a.s)).toBe(snapshot(b.s));expect(a.s.discard).toEqual(["dj","move-1","move-1","worm"]);expect(a.s.pendingChoice).toBeUndefined();expect(a.s.pendingBlockDiscards).toBeUndefined();expect(inventory(a.s)).toEqual(physicalCards);expect(availableActions(a.s,a.gd,"p2")).toEqual([]);expect(a.s.rng.clone().intn(10000)).toBe(rng.clone().intn(10000));
});

test("Sprawl: authorization, stale commitments, duplicate counts and interleaving reject without state or RNG loss",()=>{
 const f=fixture();start(f);const own=response(f,"p1",["move-1","move-1"]),other=response(f,"p2",["worm"]);for(const a of [{...other,playerId:"p1"},{...own,cardIds:["move-1"]},{...own,cardIds:["move-1","move-1","move-1"]},{...own,cardIds:["dummy","dummy"]},{...own,cardId:"dj"},{type:"pass"} as Action])reject(f,a);
 expect(advancePhase(f.s,f.gd).accepted).toBe(false);expect(f.command(other).accepted).toBe(true);reject(f,other);expect(f.s.discard).toEqual(["dj"]);
});

test("Sprawl: shortfalls preserve the revealed paid Search; Hacktivism's unresolved marker effect never silently executes",()=>{
 for(const id of ["chiba-city","hacktivism"]) {const f=fixture();if(id==="chiba-city") {f.s.deck.push(...f.s.players[1]!.hand);f.s.players[1]!.hand=[];}else {f.s.blockPile=f.s.blockPile.filter(b=>b!==id);f.s.blockPile.push(id);}expect(f.command({type:"play-search",pawnId:f.actor,cardId:"dj"}).accepted).toBe(true);reject(f,{type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"place:0:0"});expect(f.s.pendingChoice!.blockId).toBe(id);expect(f.s.discard).toEqual(["dj"]);}
});

test("Internal arrows: forward/reverse links, alternate exits, rotations, Octagon exception and cleanup use one graph",()=>{
 const f=fixture();f.s.blockPile=f.s.blockPile.filter(b=>b!=="chiba-city");f.s.cybernet.blocks.push({blockId:"chiba-city",coord:{q:1,r:0},rotation:3});const actor=f.s.cybernet.pawnById(f.actor)!;actor.coord={q:1,r:0};actor.spaceId="rabbit";
 expect(f.command({type:"play-move",pawnId:f.actor,cardId:"move-1",path:[{coord:actor.coord,spaceId:"shield"}]}).accepted).toBe(true);let targets=stepTargets(f.gd,f.s.cybernet,actor.coord,"shield",f.actor);expect(targets.some(t=>t.spaceId==="rabbit")).toBe(false);expect(targets.some(t=>t.spaceId==="right")).toBe(true);expect(targets.some(t=>t.coord.q===0 && t.coord.r===0)).toBe(true);expect(defenseProfile(f.s,f.gd,actor).find(d=>d.value===3)!.shielded).toBe(true);reject(f,{type:"play-move",pawnId:f.actor,cardId:"move-1",path:[{coord:actor.coord,spaceId:"rabbit"}]});
 expect(f.command({type:"attach-pawn",cardId:"octagon-dex",targetId:f.actor}).accepted).toBe(true);expect(stepTargets(f.gd,f.s.cybernet,actor.coord,"shield",f.actor).some(t=>t.spaceId==="rabbit")).toBe(true);discardPawnAttachment(f.s,f.gd,f.s.cybernet.pawnById(f.actor)!,0,[]);expect(stepTargets(f.gd,f.s.cybernet,actor.coord,"shield",f.actor).some(t=>t.spaceId==="rabbit")).toBe(false);
 const block=f.gd.blocks.find(b=>b.id==="chiba-city")!;for(const arrows of [[{from:"missing",to:"shield"}],[{from:"rabbit",to:"city"}],[{from:"rabbit",to:"shield"},{from:"shield",to:"rabbit"}]]) {block.spaceArrows=arrows;expect(()=>validateSpaceArrows(block)).toThrow(/adjacent spaces/);expect(()=>newGame({data:f.gd,allowProvisional:true,playerNames:["A","B"],seed:42})).toThrow(/adjacent spaces/);}
});
