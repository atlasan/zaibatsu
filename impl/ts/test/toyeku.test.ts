import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {newGame,applyActionWithEvents,availableActions,snapshot,cloneGameState,applyBlockEffectForTrigger,stepTargets,defenseProfile,type Action} from "../src/engine/index.ts";
import {playerView} from "../src/engine/player-view.ts";

function fixture() {
 const gd=loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
 for(const p of s.players) {s.deck.push(...p.hand);p.hand=[];}const take=(who:number,id:string)=>{const at=s.deck.indexOf(id);if(at<0) throw new Error(id);s.deck.splice(at,1);s.players[who]!.hand.push(id);};take(0,"dj");take(0,"move-1");take(0,"worm");take(1,"lima-flag");
 s.blockPile=s.blockPile.filter(id=>id!=="idoru");s.blockPile.push("idoru");const actor=s.players[0]!.pawnId,target=s.players[1]!.pawnId,command=(a:Action)=>applyActionWithEvents(s,gd,a);return {gd,s,actor,target,take,command};
}
function declare(f:ReturnType<typeof fixture>) {const result=f.command({type:"play-search",pawnId:f.actor,cardId:"dj"});expect(result.accepted).toBe(true);return result;}
function place(f:ReturnType<typeof fixture>) {return f.command({type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"place:0:0"});}
function pieces(f:ReturnType<typeof fixture>) {return [...f.s.cybernet.pawns.map(p=>p.pawnId),...f.s.reserve??[],...f.s.eliminated,...f.s.outOfGame??[]].sort();}
function reject(f:ReturnType<typeof fixture>,a:Action) {const before=snapshot(f.s),rng=f.s.rng.clone(),r=f.command(a);expect(r.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));return r;}

test("Toyeku: printed topology, ICE, bonus corners and defense face match bilingual page-one tile-one",()=>{
 const {gd}=fixture(),b=gd.blocks.find(b=>b.id==="idoru")!;expect(b.provisional).not.toBe(true);expect(b.iceFaces).toEqual([3,4,6]);expect(b.blackIce).toBe(false);expect(b.bonusCorners).toEqual([false,true,true,false,false,true]);expect(b.bonusFragments).toBe(3);expect(b.edges).toEqual([true,true,true,true,true,true]);expect(b.nonPlayableZoneIds).toEqual(["h1"]);
 expect(b.spaces!.map(s=>[s.id,s.type,s.zoneIds,s.capacity,s.neighbors])).toEqual([["upper","normal",["h2","h3"],2,["left","defense"]],["left","normal",["h7"],1,["upper","idoru"]],["defense","normal",["h4"],1,["upper","idoru"]],["idoru","pawn",["h5","h6"],"unlimited",["left","defense"]]]);expect(b.spaces![2]!.modifier).toEqual({kind:"defense",dice:[{value:1,shielded:false}]});expect(b.spaces![3]!.pawnId).toBe("idoru");expect(b.effects!.inCybernet).toEqual({kind:"place-neutral-pawn",target:"idoru",text:"Place the Idoru in this block."});expect(b.effects!.underControl).toBeUndefined();
});

test("Toyeku: Search places Idoru on its pawn space without control and shares full snapshots, views and events",()=>{
 const f=fixture(),inventory=pieces(f),before=JSON.parse(snapshot(f.s)),started=declare(f),pending=JSON.parse(snapshot(f.s)),options=availableActions(f.s,f.gd);expect(options[0]!.responses).toHaveLength(36);expect(f.s.reserve).toContain("idoru");const rng=f.s.rng.clone();
 const ended=place(f);expect(ended.accepted).toBe(true);expect(f.s.cybernet.pawnById("idoru")).toEqual({pawnId:"idoru",ownerId:"",coord:{q:1,r:0},spaceId:"idoru"});expect(f.s.controlCards!.find(c=>c.subject.id==="idoru")).toEqual({cardId:"idoru-control",subject:{kind:"pawn",id:"idoru"},ownerId:"",zone:"common"});expect(f.s.reserve).not.toContain("idoru");expect(pieces(f)).toEqual(inventory);expect(f.s.players.map(p=>p.controlMarkersPlaced)).toEqual([0,0]);expect(ended.events.filter(e=>e.type==="pawn-placed")).toEqual([{type:"pawn-placed",element:"pawn",elementId:"idoru",coord:{q:1,r:0},spaceId:"idoru"}]);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
 const tile={...f.gd.blocks.find(b=>b.id==="idoru")!};delete tile.blackIce;const evidence={tile,before,pending,options,after:JSON.parse(snapshot(f.s)),observer:playerView(f.s,f.gd,"p2"),events:[...started.events,...ended.events]};expect(evidence).toEqual(JSON.parse(readFileSync(new URL("../../../golden/toyeku.json",import.meta.url),"utf8")));
 const copy=cloneGameState(f.s);copy.cybernet.pawnById("idoru")!.ownerId="p1";expect(f.s.cybernet.pawnById("idoru")!.ownerId).toBe("");const state=snapshot(f.s);expect(()=>applyBlockEffectForTrigger(f.s,f.gd,{q:1,r:0},"inCybernet")).toThrow(/physical pawn in reserve/);expect(snapshot(f.s)).toBe(state);
});

test("Toyeku: block control never activates the neutral pawn's control-card effect",()=>{
 const f=fixture();declare(f);expect(place(f).accepted).toBe(true);const pawn=f.s.cybernet.pawnById(f.actor)!;pawn.coord={q:1,r:0};pawn.spaceId="idoru";f.gd.pawns.find(p=>p.id===f.actor)!.icebreakerModifier={faces:[1,2,3,4,5,6]};
 expect(f.command({type:"play-icebreak-block",pawnId:f.actor,cardId:"worm",coord:{q:1,r:0}}).accepted).toBe(true);expect(f.s.cybernet.at({q:1,r:0})!.ownerId).toBe("p1");expect(f.s.cybernet.pawnById("idoru")!.ownerId).toBe("");expect(f.s.controlCards!.find(c=>c.subject.id==="idoru")!.zone).toBe("common");expect(f.s.players[0]!.controlMarkersPlaced).toBe(1);
 f.s.currentPlayer=1;const other=f.s.cybernet.pawnById(f.target)!;other.coord={q:1,r:0};other.spaceId="idoru";f.gd.pawns.find(p=>p.id===f.target)!.icebreakerModifier={faces:[1,2,3,4,5,6]};expect(f.command({type:"play-icebreak-block",pawnId:f.target,cardId:"lima-flag",coord:{q:1,r:0}}).accepted).toBe(true);expect(f.s.cybernet.pawnById("idoru")!.ownerId).toBe("");expect(f.s.players.map(p=>p.controlMarkersPlaced)).toEqual([0,1]);
});

test("Toyeku: unavailable pieces and malformed source mappings reject the placement without losing its committed draw",()=>{
 for(const kind of ["missing-card","controlled-card","retained","excluded","already-on-board","missing-space"] as const) {const f=fixture();declare(f);
  if(kind==="missing-card") f.s.controlCards=f.s.controlCards!.filter(c=>c.subject.id!=="idoru");if(kind==="controlled-card") {const card=f.s.controlCards!.find(c=>c.subject.id==="idoru")!;card.ownerId="p2";card.zone="control";}if(kind==="retained") {f.s.reserve=f.s.reserve!.filter(id=>id!=="idoru");f.s.eliminated.push("idoru");}if(kind==="excluded") f.s.outOfGame!.push("idoru");if(kind==="already-on-board") f.s.cybernet.placePawn({pawnId:"idoru",ownerId:"",coord:{q:0,r:0},spaceId:"core"});if(kind==="missing-space") delete f.gd.blocks.find(b=>b.id==="idoru")!.spaces![3]!.pawnId;
  reject(f,{type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"place:0:0"});expect(f.s.pendingChoice!.blockId).toBe("idoru");expect(f.s.discard).toEqual(["dj"]);expect(f.s.cybernet.blocks).toHaveLength(1);
 }
});

test("Toyeku: source movement uses four real spaces without a phantom title-space shortcut",()=>{
 const f=fixture();declare(f);place(f);expect(f.command({type:"play-move",pawnId:f.actor,cardId:"move-1",path:[{coord:{q:1,r:0},spaceId:"idoru"}]}).accepted).toBe(true);
 const next=stepTargets(f.gd,f.s.cybernet,{q:1,r:0},"idoru",f.actor);expect(next.some(t=>t.coord.q===1 && t.spaceId==="upper")).toBe(false);expect(next.filter(t=>t.coord.q===1).map(t=>t.spaceId)).toEqual(["left","defense"]);reject(f,{type:"play-move",pawnId:f.actor,cardId:"worm",path:[{coord:{q:1,r:0},spaceId:"upper"}]});expect(f.command({type:"play-move",pawnId:f.actor,cardId:"worm",path:[{coord:{q:1,r:0},spaceId:"defense"}]}).accepted).toBe(true);expect(defenseProfile(f.s,f.gd,f.s.cybernet.pawnById(f.actor)!)[0]!.shielded).toBe(false);
});
