import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {newGame,applyActionWithEvents,advancePhase,cloneGameState,type Action,type EngineEvent} from "../src/engine/index.ts";
import {playerView,eventsForPlayer,controllerHandRevealed} from "../src/engine/player-view.ts";
import {snapshot} from "../src/engine/snapshot.ts";
import {discardPawnAttachment} from "../src/engine/attachment-slots.ts";
import {finalizePawnElimination} from "../src/engine/combat.ts";
import type {GameState} from "../src/domain/types.ts";

function fixture() {
  const gd=loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
  for(const p of s.players) {s.deck.push(...p.hand);p.hand=[];}
  const take=(who:number,id:string)=>{const at=s.deck.indexOf(id);if(at<0) throw new Error(id);s.deck.splice(at,1);s.players[who]!.hand.push(id);};
  take(0,"trojan");take(0,"lima-flag");take(1,"dummy");take(1,"dj");
  const actor=s.players[0]!.pawnId,target=s.players[1]!.pawnId;
  const attach=()=>applyActionWithEvents(s,gd,{type:"attach-enemy",pawnId:actor,targetId:target,cardId:"trojan"});
  return {gd,s,actor,target,take,attach};
}
function inventory(s:GameState) {return [...s.deck,...s.discard,...s.playedCards??[],...s.players.flatMap(p=>p.hand),...s.cybernet.pawns.flatMap(p=>(p.attachments??[]).map(a=>a.cardId))].sort();}

test("Trojan: source-backed continuous reveal and removal match shared player-view evidence",()=>{
  const f=fixture(),before=playerView(f.s,f.gd),rng=f.s.rng.clone(),cards=inventory(f.s);
  const result=f.attach();expect(result.accepted).toBe(true);expect(controllerHandRevealed(f.s,f.gd,"p2")).toBe(true);expect(controllerHandRevealed(f.s,f.gd,"p1")).toBe(false);
  const revealed=playerView(f.s,f.gd),effects:EngineEvent[]=[];
  discardPawnAttachment(f.s,f.gd,f.s.cybernet.pawnById(f.target)!,0,effects);
  const removed=playerView(f.s,f.gd);expect(removed.players[1]!.hand).toEqual({count:2,visibility:"hidden",cards:[]});expect(f.s.players[1]!.bonusCounters).toBe(0);
  expect(inventory(f.s)).toEqual(cards);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  const golden=JSON.parse(readFileSync(new URL("../../../golden/player-view.json",import.meta.url),"utf8"));
  expect({before,revealed,removed,events:[...result.events,...effects]}).toEqual(golden);
});

test("Player views: owner, opponent and spectator conceal piles and deny unauthorized action options",()=>{
  const f=fixture(),before=snapshot(f.s),rng=f.s.rng.clone();f.s.threatPile=["private-threat"];
  const own=playerView(f.s,f.gd,"p1"),other=playerView(f.s,f.gd,"p2"),spectator=playerView(f.s,f.gd);
  expect(own.players[0]!.hand.cards).toEqual(["trojan","lima-flag"]);expect(own.players[1]!.hand.cards).toEqual([]);expect(other.players[0]!.hand.cards).toEqual([]);expect(other.players[1]!.hand.cards).toEqual(["dummy","dj"]);
  expect(own.options.length).toBeGreaterThan(0);expect(other.options).toEqual([]);expect(spectator.options).toEqual([]);expect(spectator.players.every(p=>p.hand.cards.length===0)).toBe(true);
  const raw=JSON.stringify(spectator);expect(raw).not.toContain("private-threat");for(const key of ["deck","blockPile","threatPile"]) expect(typeof (spectator.piles as any)[key]).toBe("number");
  for(const key of ["rng","seed","setup","recoveryTrace","pendingEffects"]) expect(key in spectator).toBe(false);
  const search=own.options.filter(option=>["search","play-search"].includes(option.action.type));expect(search.length).toBeGreaterThan(0);expect(search.every(option=>option.action.dir===undefined && option.action.rotation===undefined)).toBe(true);
  f.s.deck.reverse();f.s.blockPile.reverse();expect(playerView(f.s,f.gd,"p1")).toEqual(own);f.s.deck.reverse();f.s.blockPile.reverse();
  f.s.threatPile=undefined;expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  expect(()=>playerView(f.s,f.gd,"unknown")).toThrow(/unknown.*viewer/);
});

test("Trojan: current draws become visible, historical opponent draws stay redacted",()=>{
  const f=fixture();expect(f.attach().accepted).toBe(true);f.s.currentPlayer=1;f.s.phase="recycle";
  const transition=advancePhase(f.s,f.gd);expect(transition.accepted).toBe(true);
  const view=playerView(f.s,f.gd,"p1");expect(view.players[1]!.hand.cards).toEqual(f.s.players[1]!.hand);expect(view.players[1]!.hand.count).toBeGreaterThan(2);
  const historical:EngineEvent[]=[{type:"draw",playerId:"p2",cardId:"private-old-card"},{type:"validation-failed",playerId:"p2",message:"private error"},{type:"card-discarded",cardId:"trojan"}];
  expect(eventsForPlayer(f.s,historical,"p1")).toEqual([{type:"draw",playerId:"p2"},{type:"card-discarded",cardId:"trojan"}]);expect(eventsForPlayer(f.s,historical,"p2")).toEqual(historical);expect(()=>eventsForPlayer(f.s,historical,"unknown")).toThrow();
});

test("Trojan: takeover, elimination, provider cascade and duplicate reveal cleanup follow existing lifecycle",()=>{
  for(const kind of ["takeover","eliminate","provider","duplicate"] as const) {
    const f=fixture();expect(f.attach().accepted).toBe(true);const pawn=f.s.cybernet.pawnById(f.target)!;
    if(kind==="takeover") {f.gd.pawns.find(p=>p.id===f.target)!.iceFaces=[1,2,3,4,5,6];expect(applyActionWithEvents(f.s,f.gd,{type:"play-icebreak-pawn",pawnId:f.actor,targetId:f.target,cardId:"lima-flag"}).accepted).toBe(true);}
    if(kind==="eliminate") finalizePawnElimination(f.s,f.target,f.gd);
    if(kind==="provider") {f.gd.cards.push({id:"provider",name:"Synthetic provider",attach:{as:"pawn",slot:"add-on",grantsSlot:["add-on"]}});pawn.attachments!.unshift({cardId:"provider",slot:"add-on",slotRef:"pawn:add-on"});pawn.attachments![1]!.slotRef="pawn:add-on/add-on";discardPawnAttachment(f.s,f.gd,pawn,0);}
    if(kind==="duplicate") {f.gd.cards.push({id:"reveal-fixture",name:"Synthetic second reveal",attach:{as:"pawn",slot:"armor",controllerHand:"face-up"}});pawn.attachments!.push({cardId:"reveal-fixture",slot:"armor",slotRef:"pawn:armor"});discardPawnAttachment(f.s,f.gd,pawn,0);expect(controllerHandRevealed(f.s,f.gd,"p2")).toBe(true);discardPawnAttachment(f.s,f.gd,pawn,0);}
    expect(controllerHandRevealed(f.s,f.gd,"p2")).toBe(false);expect(controllerHandRevealed(f.s,f.gd,"p1")).toBe(false);
  }
});

test("Player views: pending responder authorization, deep copies and previews preserve state and RNG",()=>{
  const f=fixture();f.s.pendingChoice={id:"fixture-choice",kind:"discard-or-sacrifice",playerId:"p2",pawnId:f.target,cardId:"toxin",amount:1} as any;
  const before=snapshot(f.s),rng=f.s.rng.clone(),owner=playerView(f.s,f.gd,"p2"),other=playerView(f.s,f.gd,"p1");
  expect(owner.pendingChoice?.id).toBe("fixture-choice");expect(owner.options[0]!.action.type).toBe("resolve-choice");expect(other.options).toEqual([]);expect(other.pendingChoice).toBeUndefined();expect(other.decision?.playerId).toBe("p2");
  owner.players[1]!.hand.cards.push("injected");owner.pawns[0]!.attachments.push({cardId:"injected",slot:"",bonusPaid:0});owner.options[0]!.action.choiceId="injected";
  expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  const copy=cloneGameState(f.s);expect(playerView(copy,f.gd,"p1")).toEqual(other);
});

test("Trojan: wrong target, repeat/occupied slot and movement-strip use never create unintended reveals",()=>{
  for(const kind of ["own","slot","repeat","strip"] as const) {
    const f=fixture();if(kind==="repeat") expect(f.attach().accepted).toBe(true);
    const before=snapshot(f.s),rng=f.s.rng.clone();let action:Action={type:"attach-enemy",pawnId:f.actor,targetId:kind==="own"?f.actor:f.target,cardId:"trojan",...(kind==="slot"?{slotRef:"pawn:armor"}:{})};
    if(kind==="strip") {const core=f.gd.blocks.find(b=>b.isCentralCore)!;core.spaces![0]!.neighbors=["fixture-b"];core.spaces!.push({id:"fixture-b",type:"special",capacity:"unlimited",neighbors:["core"]});action={type:"play-move",pawnId:f.actor,cardId:"trojan",path:[{coord:{q:0,r:0},spaceId:"fixture-b"}]};}
    const result=applyActionWithEvents(f.s,f.gd,action);if(kind!=="strip") {expect(result.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);}else {expect(result.accepted).toBe(true);expect(controllerHandRevealed(f.s,f.gd,"p2")).toBe(false);}
    expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  }
});

test("Trojan: source constructor rejects unsupported visibility policies and block attachments",()=>{
  for(const attach of [{as:"enemy",controllerHand:"hidden"},{as:"block",controllerHand:"face-up"}]) {
    const gd=loadDefault("speedrunners");gd.cards.push({id:"bad",name:"Bad",attach:attach as any});expect(()=>newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42})).toThrow(/hand visibility/);
  }
});
