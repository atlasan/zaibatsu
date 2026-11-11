import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {newRng} from "../src/domain/rng.ts";
import {newGame,applyActionWithEvents,availableActions,snapshot,advancePhase,playerAttachmentModifiers,effectiveIcebreakerModifier,icebreakBlock,icebreakPawn,discardPawnAttachment,cloneGameState,type Action} from "../src/engine/index.ts";

function fixture(equip=true) {
 const gd=loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";s.deck.push(...s.players.flatMap(p=>p.hand));for(const p of s.players)p.hand=[];
 const take=(i:number,id:string)=>{const at=s.deck.indexOf(id);if(at<0)throw new Error(id);s.deck.splice(at,1);s.players[i]!.hand.push(id);};
 for(const id of ["weapon-gunhed","ak-12km","phase-loop","dj","move-2","move-1","move-2","move-3","worm"])take(0,id);take(1,"dummy");
 s.players[0]!.bonusCounters=6;s.players[1]!.bonusCounters=2;
 const actor=s.players[0]!.pawnId,target=s.players[1]!.pawnId,command=(a:Action)=>applyActionWithEvents(s,gd,a);
 const attach=(id:string,pawn=actor)=>{const r=command({type:"attach-pawn",targetId:pawn,cardId:id});if(!r.accepted)throw new Error(r.error);};
 attach("weapon-gunhed");attach("ak-12km");if(equip)attach("phase-loop");s.currentPlayer=1;attach("dummy",target);s.currentPlayer=0;
 s.blockPile=s.blockPile.filter(id=>id!=="antro");s.blockPile.push("antro");return {gd,s,actor,target,take,command,attach};
}
function start(f:ReturnType<typeof fixture>) {const a=f.command({type:"play-search",pawnId:f.actor,cardId:"dj"});if(!a.accepted)throw new Error(a.error);const b=f.command({type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"place:0:0"});if(!b.accepted)throw new Error(b.error);return [a.events,b.events];}
function arrive(f:ReturnType<typeof fixture>,space="add-on") {const r=f.command({type:"play-move",pawnId:f.actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"dance"},{coord:{q:1,r:0},spaceId:space}]});if(!r.accepted)throw new Error(r.error);return r;}
function responses(f:ReturnType<typeof fixture>) {return availableActions(f.s,f.gd)[0]!.responses!;}
function reject(f:ReturnType<typeof fixture>,a:Action) {const before=snapshot(f.s),rng=f.s.rng.clone();expect(f.command(a).accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(10000)).toBe(rng.intn(10000));}
function inventory(f:ReturnType<typeof fixture>) {return [...f.s.deck,...f.s.discard,...f.s.playedCards??[],...f.s.players.flatMap(p=>p.hand),...f.s.cybernet.pawns.flatMap(p=>(p.attachments??[]).map(a=>a.cardId))].sort();}
function evidence() {const f=fixture(),initial=JSON.parse(snapshot(f.s)),events=start(f);events.push(arrive(f).events);const pending=JSON.parse(snapshot(f.s)),options=responses(f),r=f.command(options.find(a=>a.targetId===f.actor)!);if(!r.accepted)throw new Error(r.error);events.push(r.events);return {initial,pending,options,finished:JSON.parse(snapshot(f.s)),events};}

test("Antro: printed geometry, physical choices and dependent cleanup share evidence",()=>{
 const f=fixture(),b=f.gd.blocks.find(b=>b.id==="antro")!;expect(b.iceFaces).toEqual([3,5,6]);expect(b.bonusCorners).toEqual([false,false,true,false,true,true]);expect(b.edges).toEqual([true,true,true,true,true,true]);expect(b.spaces!.map(s=>[s.id,s.capacity??1])).toEqual([["upper",2],["add-on",1],["gadget",1],["dance",2]]);expect(b.spaces![0]!.modifier!.dice!.map(d=>d.value)).toEqual([3,4,5]);expect(b.spaces![1]!.effect).toEqual({kind:"discard-attachment",cardType:"add-on",scope:"cybernet",optional:true});
 const cards=inventory(f);start(f);arrive(f);const before=snapshot(f.s),rng=f.s.rng.clone(),options=responses(f);expect(options.map(a=>a.targetId??"skip")).toEqual(["skip",f.actor,f.target]);expect(availableActions(f.s,f.gd,"p2")).toEqual([]);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(10000)).toBe(rng.intn(10000));
 expect(f.command(options[1]!).accepted).toBe(true);expect(f.s.cybernet.pawnById(f.actor)!.attachments!.map(a=>a.cardId)).toEqual(["phase-loop"]);expect(f.s.players[0]!.bonusCounters).toBe(5);expect(playerAttachmentModifiers(f.s,f.gd,"p1").handModifier).toBe(-2);expect(inventory(f)).toEqual(cards);expect(evidence()).toEqual(JSON.parse(readFileSync(new URL("../../../golden/antro.json",import.meta.url),"utf8")));
});
test("Antro: owner, exact attachment identity, card family and interleaving reject atomically",()=>{
 const f=fixture();start(f);arrive(f);const a=responses(f)[1]!;for(const bad of [{...a,playerId:"p2"},{...a,choiceId:"old"},{...a,attachmentId:"absent"},{...a,targetId:f.target},{...a,attachmentId:f.s.cybernet.pawnById(f.actor)!.attachments![1]!.instanceId},{...a,cardId:"worm"},{...responses(f)[0]!,targetId:f.actor},{type:"pass"} as Action])reject(f,bad);const before=snapshot(f.s);expect(advancePhase(f.s,f.gd).accepted).toBe(false);expect(snapshot(f.s)).toBe(before);
 expect(f.command(responses(f).find(a=>a.targetId===f.target)!).accepted).toBe(true);expect(f.s.cybernet.pawnById(f.target)!.attachments).toEqual([]);expect(f.s.players[1]!.bonusCounters).toBe(2);
});
test("Antro: Gadget removal restores hand size and acting modifiers; skip and stop timing are explicit",()=>{
 const f=fixture();start(f);arrive(f,"gadget");expect(responses(f)).toHaveLength(2);expect(f.command(responses(f)[1]!).accepted).toBe(true);expect(f.s.players[0]!.bonusCounters).toBe(3);expect(playerAttachmentModifiers(f.s,f.gd,"p1").handModifier).toBe(0);expect(effectiveIcebreakerModifier(f.gd,f.s.cybernet.pawnById(f.actor)!)).toEqual({faces:[4]});
 expect(f.command({type:"play-move",pawnId:f.actor,cardId:"move-1",path:[]}).accepted).toBe(true);expect(f.s.pendingChoice).toBeUndefined();
 expect(f.command({type:"play-move",pawnId:f.actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"upper"},{coord:{q:1,r:0},spaceId:"gadget"}]}).accepted).toBe(true);expect(responses(f)).toHaveLength(1);expect(f.command(responses(f)[0]!).accepted).toBe(true);
 const pass=fixture();start(pass);expect(pass.command({type:"play-move",pawnId:pass.actor,cardId:"move-3",path:[{coord:{q:1,r:0},spaceId:"dance"},{coord:{q:1,r:0},spaceId:"add-on"},{coord:{q:1,r:0},spaceId:"upper"}]}).accepted).toBe(true);expect(pass.s.pendingChoice).toBeUndefined();
});
test("Antro: malformed physical identities roll back the move and strict official loading refuses provisional targeting",()=>{
 const f=fixture();start(f);f.s.cybernet.pawnById(f.actor)!.attachments![0]!.instanceId=undefined;reject(f,{type:"play-move",pawnId:f.actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"dance"},{coord:{q:1,r:0},spaceId:"add-on"}]});
 const gd=loadDefault("speedrunners");for(const b of gd.blocks)b.provisional=false;for(const p of gd.pawns)p.provisional=false;for(const c of gd.cards)c.provisional=false;expect(()=>newGame({data:gd,playerNames:["A","B"],seed:42})).toThrow();
});
test("Phase-Loop: bilingual printed fields, no granted activation and both acting Icebreaker routes",()=>{
 for(const route of ["block","pawn"]) {const f=fixture(),card=f.gd.cards.find(c=>c.id==="phase-loop")!;expect(card).toMatchObject({type:"gadget",copies:1,class:["cyberdeck"],movement:2,activates:["icebreaker"],attach:{as:"pawn",slot:"gadget",cost:1,handModifier:-2,icebreakerModifier:{rollDice:1,ignoresBlackIce:true}}});expect(card.attach!.grants).toBeUndefined();
 start(f);const actor=f.s.cybernet.pawnById(f.actor)!,target=f.s.cybernet.pawnById(f.target)!;actor.coord={q:1,r:0};actor.spaceId="dance";target.coord={q:1,r:0};target.spaceId="upper";const def=f.gd.pawns.find(p=>p.id===f.target)!;def.iceFaces=[3,5,6];def.iceValue="high";f.s.rng=newRng(79);const r=route==="block"?icebreakBlock(f.s,f.gd,f.actor,actor.coord):icebreakPawn(f.s,f.gd,f.actor,f.target);expect(r.roll).toEqual([1,5]);expect(r.success).toBe(true);
 }
});
test("Phase-Loop: failed Black ICE survives until removal and modifiers do not create target ICE",()=>{
 for(const route of ["block","pawn"]) {const f=fixture();start(f);const actor=f.s.cybernet.pawnById(f.actor)!,target=f.s.cybernet.pawnById(f.target)!;actor.coord={q:1,r:0};actor.spaceId="dance";target.coord={q:1,r:0};target.spaceId="upper";f.gd.pawns.find(p=>p.id===f.actor)!.icebreakerModifier=undefined;const b=f.gd.blocks.find(b=>b.id==="antro")!,p=f.gd.pawns.find(p=>p.id===f.target)!;b.iceFaces=[6];b.iceValue="black";p.iceFaces=[6];p.iceValue="black";const roll=()=>route==="block"?icebreakBlock(f.s,f.gd,f.actor,actor.coord):icebreakPawn(f.s,f.gd,f.actor,f.target);f.s.rng=newRng(1);expect(roll()).toEqual({roll:[2,2],success:false,attackerEliminated:false});discardPawnAttachment(f.s,f.gd,actor,2,[]);f.s.rng=newRng(1);expect(roll()).toEqual({roll:[2],success:false,attackerEliminated:true});}
 const f=fixture();expect(()=>icebreakBlock(f.s,f.gd,f.actor,{q:0,r:0})).toThrow(/no ICE/);expect(f.s.cybernet.pawnById(f.actor)).toBeDefined();
});

test("Antro: a committed movement roll opens a second choice without rerolling or resetting its marker",()=>{
 const f=fixture();start(f);f.gd.pawns.find(p=>p.id===f.actor)!.movement={type:"d6",activation:"once-per-turn"};f.s.rng=newRng(1);expect(f.command({type:"roll-movement",pawnId:f.actor}).accepted).toBe(true);expect(f.s.pendingChoice!.movement!.roll).toEqual([2]);const rng=f.s.rng.clone();expect(f.command({type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"move",path:[{coord:{q:1,r:0},spaceId:"dance"},{coord:{q:1,r:0},spaceId:"add-on"}]}).accepted).toBe(true);expect(f.s.pendingChoice!.kind).toBe("space-discard");reject(f,{...responses(f)[1]!,attachmentId:"stale"});expect(f.command(responses(f)[0]!).accepted).toBe(true);expect(availableActions(f.s,f.gd).some(a=>a.action.type==="roll-movement")).toBe(false);expect(f.s.rng.clone().intn(10000)).toBe(rng.intn(10000));
});
test("Antro: normal relocation pauses phase completion; undefined relocation policy excludes effect spaces",()=>{
 for(const explicit of [false,true]) {const f=fixture();start(f);f.take(0,"jetpack");f.attach("jetpack");if(explicit)f.gd.cards.find(c=>c.id==="jetpack")!.attach!.phaseEffects![0]!.threatMode="normal-movement";f.s.phase="beginning";expect(advancePhase(f.s,f.gd).accepted).toBe(true);const a:Action={type:"resolve-choice",choiceId:f.s.pendingChoice!.id,optionId:"relocate",coord:{q:1,r:0},spaceId:"add-on"};if(!explicit){expect(availableActions(f.s,f.gd)[0]!.targets!.some(t=>t.spaceId==="add-on")).toBe(false);reject(f,a);continue;}expect(f.command(a).accepted).toBe(true);expect(f.s.pendingPhase).toBe("beginning");expect(f.s.pendingChoice!.kind).toBe("space-discard");expect(f.command(responses(f)[0]!).accepted).toBe(true);expect(f.s.pendingPhase).toBeUndefined();expect(String(f.s.phase)).toBe("action");}
});
test("Phase-Loop: the action strip pays one physical card and does not apply attachment benefits",()=>{
 const f=fixture(false);start(f);const actor=f.s.cybernet.pawnById(f.actor)!;actor.coord={q:1,r:0};actor.spaceId="dance";f.gd.blocks.find(b=>b.id==="antro")!.iceFaces=[1,2,3,4,5,6];const r=f.command({type:"play-icebreak-block",pawnId:f.actor,cardId:"phase-loop",coord:actor.coord});expect(r.accepted).toBe(true);expect(r.events.filter(e=>e.type==="roll")[0]!.roll).toHaveLength(1);expect(f.s.playedCards).toContain("phase-loop");expect(f.s.players[0]!.bonusCounters).toBe(3);expect(playerAttachmentModifiers(f.s,f.gd,"p1").handModifier).toBe(0);expect(effectiveIcebreakerModifier(f.gd,actor).rollDice).toBeUndefined();
});

test("Antro: whole-block movement opens the same decision and threat overlap rolls back",()=>{
 const f=fixture();start(f);const block=f.gd.blocks.find(b=>b.id==="antro")!;block.spaces!.unshift(block.spaces!.splice(1,1)[0]!); // Synthetic first-open landing order isolates the stop hook.
 f.gd.pawns.find(p=>p.id===f.actor)!.movement={type:"hex",activation:"once-per-turn"};expect(f.command({type:"move-hex",pawnId:f.actor,dir:0}).accepted).toBe(true);expect(f.s.pendingChoice!.spaceId).toBe("add-on");const copy=cloneGameState(f.s);copy.pendingChoice!.reference!.q=99;copy.pendingChoice!.spaceId="elsewhere";expect(f.s.pendingChoice!.reference!.q).toBe(1);expect(f.command(responses(f)[0]!).accepted).toBe(true);
 const g=fixture();start(g);const actor=g.s.cybernet.pawnById(g.actor)!;actor.coord={q:1,r:0};actor.spaceId="dance";g.s.threats=[{id:"test-threat",threatId:"synthetic",coord:{q:1,r:0},spaceId:"upper",status:"inactive"}];reject(g,{type:"play-move",pawnId:g.actor,cardId:"move-1",path:[{coord:{q:1,r:0},spaceId:"add-on"}]});expect(g.s.pendingThreats).toBeUndefined();expect(g.s.threats![0]!.status).toBe("inactive");
});
test("Antro: old slot-authored Add-ons and opposing Gadgets use the printed family and physical copy",()=>{
 const f=fixture();start(f);f.take(0,"octagon-dex");f.attach("octagon-dex");arrive(f);const card=f.s.cybernet.pawnById(f.actor)!.attachments!.find(a=>a.cardId==="octagon-dex")!;expect(f.command(responses(f).find(a=>a.attachmentId===card.instanceId)!).accepted).toBe(true);expect(f.s.cybernet.pawnById(f.actor)!.attachments!.map(a=>a.cardId)).toEqual(["weapon-gunhed","ak-12km","phase-loop"]);
 const g=fixture(false),at=g.s.players[0]!.hand.indexOf("phase-loop");g.s.players[0]!.hand.splice(at,1);g.s.players[1]!.hand.push("phase-loop");g.s.currentPlayer=1;g.attach("phase-loop",g.target);g.s.currentPlayer=0;start(g);arrive(g,"gadget");expect(g.command(responses(g)[1]!).accepted).toBe(true);expect(g.s.cybernet.pawnById(g.target)!.attachments!.map(a=>a.cardId)).toEqual(["dummy"]);expect(g.s.players[1]!.bonusCounters).toBe(1);
});
test("Phase-Loop: unsupported acting modifiers reject before setup and a Gadget does not grant Icebreaker",()=>{
 for(const modifier of [{rollDice:-1},{faces:[7]},{faces:[1,1]}]) {const gd=loadDefault("speedrunners");gd.cards.find(c=>c.id==="phase-loop")!.attach!.icebreakerModifier=modifier;expect(()=>newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42})).toThrow(/acting Icebreaker/);}
 const f=fixture();f.gd.pawns.find(p=>p.id===f.actor)!.abilities=[];expect(()=>icebreakBlock(f.s,f.gd,f.actor,{q:0,r:0})).toThrow(/cannot activate/);
});
