import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {newRng} from "../src/domain/rng.ts";
import {newGame,applyActionWithEvents,availableActions,cloneGameState,snapshot,controlMarkerAllocations,gainPawnControl,eliminatePawn,type Action} from "../src/engine/index.ts";
import {playerView} from "../src/engine/player-view.ts";

function fixture() {
 const gd=loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
 s.deck.push(...s.players.flatMap(p=>p.hand));for(const p of s.players) p.hand=[];
 for(const [i,id] of ["worm","lima-flag"].entries()) {const at=s.deck.indexOf(id);if(at<0) throw new Error(id);s.deck.splice(at,1);s.players[i]!.hand.push(id);}
 s.blockPile=s.blockPile.filter(id=>id!=="idoru");s.cybernet.blocks.push({blockId:"idoru",coord:{q:1,r:0},rotation:0});
 s.reserve=s.reserve!.filter(id=>id!=="idoru");s.cybernet.placePawn({pawnId:"idoru",ownerId:"",coord:{q:1,r:0},spaceId:"idoru"});
 for(const p of s.cybernet.pawns) {p.coord={q:1,r:0};p.spaceId="idoru";}
 s.rng=newRng(79);
 const action=(i=0):Action=>({type:"play-icebreak-pawn",pawnId:s.players[i]!.pawnId,targetId:"idoru",cardId:i?"lima-flag":"worm"});
 return {gd,s,action};
}
function evidence() {
 const f=fixture(),initial=JSON.parse(snapshot(f.s)),first=applyActionWithEvents(f.s,f.gd,f.action());if(!first.accepted) throw new Error(first.error);
 const gained=JSON.parse(snapshot(f.s)),allocations=controlMarkerAllocations(f.s),observer=playerView(f.s,f.gd,"p2");
 f.s.currentPlayer=1;f.s.rng=newRng(79);const second=applyActionWithEvents(f.s,f.gd,f.action(1));if(!second.accepted) throw new Error(second.error);
 const p=f.gd.pawns.find(p=>p.id==="idoru")!;
 return {attributes:{class:p.class,defense:p.defense,movement:p.movement,abilities:p.abilities??[],iceFaces:p.iceFaces,slots:p.slots,controlMarkerEffect:p.controlMarkerEffect},initial,gained,allocations,observer,transferred:JSON.parse(snapshot(f.s)),events:[first.events,second.events]};
}

test("Idoru: bilingual attributes correct the class, all six defense faces, movement and ICE 1/6",()=>{
 const {gd,s}=fixture(),p=gd.pawns.find(p=>p.id==="idoru")!;expect(p.class).toEqual([]);expect(p.abilities).toEqual([]);expect(p.iceFaces).toEqual([1,6]);expect(p.defense.map(d=>d.shielded)).toEqual([true,false,false,false,false,false]);expect(p.movement).toEqual({type:"steps",activation:"card"});expect(p.slots).toEqual(["add-on","armor"]);expect(p.provisional).toBe(true);expect(s.controlCards!.find(c=>c.subject.id==="idoru")!.zone).toBe("common");
 expect(evidence()).toEqual(JSON.parse(readFileSync(new URL("../../../golden/idoru-control-markers.json",import.meta.url),"utf8")));
});

test("Idoru: card markers count immediately, transfer returns the old marker and queries preserve state and RNG",()=>{
 const f=fixture();const before=snapshot(f.s),rng=f.s.rng.clone();expect(availableActions(f.s,f.gd).some(o=>o.action.targetId==="idoru")).toBe(true);expect(controlMarkerAllocations(f.s)).toEqual([]);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(10000)).toBe(rng.intn(10000));
 expect(applyActionWithEvents(f.s,f.gd,f.action()).accepted).toBe(true);expect(f.s.players.map(p=>p.controlMarkersPlaced)).toEqual([1,0]);expect(f.s.controlCardMarkers).toEqual([{playerId:"p1",cardId:"idoru-control",amount:1}]);
 const copy=cloneGameState(f.s);copy.controlCardMarkers![0]!.playerId="p2";expect(f.s.controlCardMarkers![0]!.playerId).toBe("p1");const view=playerView(f.s,f.gd,"");view.controlCardMarkers![0]!.amount=10;expect(f.s.controlCardMarkers![0]!.amount).toBe(1);
 gainPawnControl(f.s,f.gd,"idoru","p1");expect(f.s.players[0]!.controlMarkersPlaced).toBe(1);
 f.s.currentPlayer=1;f.s.rng=newRng(79);expect(applyActionWithEvents(f.s,f.gd,f.action(1)).accepted).toBe(true);expect(f.s.players.map(p=>p.controlMarkersPlaced)).toEqual([0,1]);expect(f.s.controlCardMarkers).toEqual([{playerId:"p2",cardId:"idoru-control",amount:1}]);
});

test("Idoru: placing the last marker declares victory during acquisition and disables further commands",()=>{
 const f=fixture();f.s.players[0]!.controlMarkersTotal=1;const r=applyActionWithEvents(f.s,f.gd,f.action());expect(r.accepted).toBe(true);expect(f.s.winnerId).toBe("p1");expect(r.events.filter(e=>["control-marker-placed","winner-declared"].includes(e.type)).map(e=>e.type)).toEqual(["control-marker-placed","winner-declared"]);expect(availableActions(f.s,f.gd)).toEqual([]);const before=snapshot(f.s),rng=f.s.rng.clone();expect(applyActionWithEvents(f.s,f.gd,{type:"pass"}).accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(10000)).toBe(rng.intn(10000));
});

test("Idoru: missing cards, exhausted or malformed markers and unsupported handlers reject atomically",()=>{
 for(const kind of ["missing-card","exhausted","duplicate","amount","handler"] as const) {const f=fixture();if(kind==="missing-card") f.s.controlCards=f.s.controlCards!.filter(c=>c.subject.id!=="idoru");if(kind==="exhausted") f.s.players[0]!.controlMarkersPlaced=f.s.players[0]!.controlMarkersTotal;if(kind==="duplicate") f.s.controlCardMarkers=[{playerId:"p2",cardId:"idoru-control",amount:1},{playerId:"p2",cardId:"idoru-control",amount:1}];if(kind==="amount") f.s.controlCardMarkers=[{playerId:"p2",cardId:"idoru-control",amount:2}];if(kind==="handler") (f.gd.pawns.find(p=>p.id==="idoru")!.controlMarkerEffect as any).kind="unknown";
  const before=snapshot(f.s),rng=f.s.rng.clone();expect(applyActionWithEvents(f.s,f.gd,f.action()).accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(10000)).toBe(rng.intn(10000));
 }
});

test("Idoru: literal card-marker retention on reserve release is explicit; same-owner reacquisition stays unresolved",()=>{
 const f=fixture();expect(applyActionWithEvents(f.s,f.gd,f.action()).accepted).toBe(true);expect(eliminatePawn(f.s,"idoru",f.gd)).toBe(true);expect(f.s.reserve).toContain("idoru");expect(f.s.controlCards!.find(c=>c.subject.id==="idoru")!.zone).toBe("common");expect(f.s.controlCardMarkers).toHaveLength(1);expect(f.s.players[0]!.controlMarkersPlaced).toBe(1);
 const before=snapshot(f.s);expect(()=>gainPawnControl(f.s,f.gd,"idoru","p1")).toThrow(/source ruling/);expect(snapshot(f.s)).toBe(before);
});

test("Idoru: a failed roll spends its card without a marker; takeover discards and refunds a paid attachment",()=>{
 const missed=fixture();missed.s.rng=newRng(1);const r=applyActionWithEvents(missed.s,missed.gd,missed.action());expect(r.accepted).toBe(true);expect(r.events.find(e=>e.type==="roll")!.roll).toEqual([2]);expect(missed.s.controlCardMarkers??[]).toEqual([]);expect(missed.s.players[0]!.hand).toEqual([]);expect(missed.s.playedCards).toContain("worm");expect(missed.s.cybernet.pawnById("idoru")!.ownerId).toBe("");
 const f=fixture();expect(applyActionWithEvents(f.s,f.gd,f.action()).accepted).toBe(true);const index=f.s.deck.indexOf("dummy");f.s.deck.splice(index,1);f.s.players[0]!.hand=["dummy"];f.s.players[0]!.bonusCounters=1;
 expect(applyActionWithEvents(f.s,f.gd,{type:"attach-pawn",cardId:"dummy",targetId:"idoru"}).accepted).toBe(true);expect(f.s.players[0]!.bonusCounters).toBe(0);f.s.currentPlayer=1;f.s.rng=newRng(79);expect(applyActionWithEvents(f.s,f.gd,f.action(1)).accepted).toBe(true);expect(f.s.players[0]!.bonusCounters).toBe(1);expect(f.s.discard).toContain("dummy");expect(f.s.cybernet.pawnById("idoru")!.attachments??[]).toEqual([]);expect(f.s.players.map(p=>p.controlMarkersPlaced)).toEqual([0,1]);
 const v=fixture();expect(applyActionWithEvents(v.s,v.gd,v.action()).accepted).toBe(true);v.gd.pawns.find(p=>p.id==="idoru")!.class=["cleaner"]; // synthetic eligibility isolates the Virus/card-marker journal
 const virus=v.s.deck.indexOf("virus");v.s.deck.splice(virus,1);v.s.players[1]!.hand.push("virus");v.s.currentPlayer=1;const taken=applyActionWithEvents(v.s,v.gd,{type:"attach-enemy",cardId:"virus",pawnId:v.s.players[1]!.pawnId,targetId:"idoru"});expect(taken.accepted).toBe(true);expect(taken.events.filter(e=>["control-marker-returned","control-changed","control-marker-placed"].includes(e.type) && e.elementId!=="markers").map(e=>e.type)).toEqual(["control-marker-returned","control-changed","control-marker-placed"]);expect(v.s.players.map(p=>p.controlMarkersPlaced)).toEqual([0,1]);
 const bad=fixture();(bad.gd.pawns.find(p=>p.id==="idoru")!.controlMarkerEffect as any).kind="unknown";expect(()=>newGame({data:bad.gd,allowProvisional:true,playerNames:["A","B"],seed:42})).toThrow(/unsupported control-marker effect/);
});
