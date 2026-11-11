import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault,loadRegression} from "../src/data/index.ts";
import {advancePhase,applyActionWithEvents,availableActions,effectivePawnClasses,effectiveMovementOptions,newGame,snapshot} from "../src/engine/index.ts";
import {effectiveAbility} from "../src/engine/combat.ts";
import {playerAttachmentModifiers} from "../src/engine/attach.ts";
import type {Action} from "../src/engine/index.ts";

function fixture(cardId:string) {
  const gd=loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
  const actor=s.players[0]!.pawnId,target=s.players[1]!.pawnId,def=gd.pawns.find(p=>p.id===target)!;
  // These attributes exercise printed effects; they are not a promoted pawn record.
  def.class=["fixture-subject"];def.abilities!.push({ability:"delete",activation:"card",skulls:1});
  def.movement={type:"steps",steps:2,activation:"once-per-turn"};def.iceFaces=[1,2,3,4,5,6];
  gd.blocks[0]!.spaces=[{id:"a",type:"special",capacity:"unlimited",neighbors:["b"]},{id:"b",type:"special",capacity:"unlimited",neighbors:["a"]}];
  for(const p of s.cybernet.pawns) p.spaceId="a";
  s.players[0]!.hand=[cardId];s.players[1]!.hand=["dummy","dj","dj","dj","dj"];s.deck=["dj","dj","dj","dj","dj"];
  return {gd,s,actor,target,def};
}
function rejectUnchanged(f:ReturnType<typeof fixture>,action:Action) {
  const before=snapshot(f.s),rng=f.s.rng.clone();
  expect(applyActionWithEvents(f.s,f.gd,action).accepted).toBe(false);expect(snapshot(f.s)).toBe(before);
  expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
}

test("attachment restrictions: bilingual malware records keep target exclusions separate from their own class",()=>{
  for(const id of ["worm","under-clocker","hijacker"]) {
    const {gd}=fixture(id),card=gd.cards.find(c=>c.id===id)!;
    expect(card.type).toBe("add-on");expect(card.class).toEqual(["malware"]);expect(card.copies).toBe(1);
    expect(card.movement).toBe(1);expect(card.activates).toEqual(["icebreaker"]);expect(card.provisional).not.toBe(true);
    expect(card.attach?.forbiddenClasses).toEqual(["operative"]);expect(card.attach?.cost??0).toBe(0);
  }
});

test("attachment restrictions: native and gained Operative classes reject before payment or RNG",()=>{
  for(const id of ["worm","under-clocker","hijacker"]) for(const gained of [false,true]) {
    const f=fixture(id),{gd,s,actor,target,def}=f;
    if(gained) {gd.cards.push({id:"fixture-class",name:"Synthetic class grant",class:["operative"],attach:{as:"pawn",slot:"gadget"}});s.cybernet.pawnById(target)!.attachments=[{cardId:"fixture-class",slot:"gadget"}];}
    else def.class=["operative"];
    const before=snapshot(s),rng=s.rng.clone();expect(availableActions(s,gd).some(o=>o.action.type==="attach-enemy" && o.action.cardId===id)).toBe(false);
    expect(snapshot(s)).toBe(before);expect(s.rng.clone().intn(100000)).toBe(rng.intn(100000));
    rejectUnchanged(f,{type:"attach-enemy",pawnId:actor,targetId:target,cardId:id});
  }
});

test("attachment restrictions: required classes use any existing match, exclusions win, and a card cannot qualify itself",()=>{
  const f=fixture("fixture-restricted"),{gd,s,target}=f;
  gd.cards.push({id:"fixture-restricted",name:"Synthetic restricted card",class:["cleaner"],attach:{as:"pawn",slot:"add-on",class:["cleaner","bot"],forbiddenClasses:["operative"],cost:1}});
  s.players[0]!.bonusCounters=1;s.cybernet.pawnById(target)!.ownerId="p1";
  rejectUnchanged(f,{type:"attach-pawn",cardId:"fixture-restricted",targetId:target});
  gd.cards.push({id:"fixture-class",name:"Synthetic Bot grant",class:["bot"],attach:{as:"pawn",slot:"gadget"}});
  s.cybernet.pawnById(target)!.attachments=[{cardId:"fixture-class",slot:"gadget"}];
  gd.cards.find(c=>c.id==="fixture-class")!.class!.push("operative");
  rejectUnchanged(f,{type:"attach-pawn",cardId:"fixture-restricted",targetId:target});
  gd.cards.find(c=>c.id==="fixture-class")!.class=["bot"];
  expect(applyActionWithEvents(s,gd,{type:"attach-pawn",cardId:"fixture-restricted",targetId:target}).accepted).toBe(true);
  expect(effectivePawnClasses(gd,s.cybernet.pawnById(target)!)).toEqual(["fixture-subject","bot","cleaner"]);expect(s.players[0]!.bonusCounters).toBe(0);
});

test("attachment restrictions: continuous penalties, action strips and takeover cleanup share snapshots and events",()=>{
  const rows=[];
  for(const id of ["worm","under-clocker","hijacker"]) {
    const f=fixture(id),{gd,s,actor,target,def}=f;
    expect(availableActions(s,gd).some(o=>o.action.type==="attach-enemy" && o.action.cardId===id && o.action.targetId===target)).toBe(true);
    const attached=applyActionWithEvents(s,gd,{type:"attach-enemy",pawnId:actor,targetId:target,cardId:id});expect(attached.accepted).toBe(true);
    const events=[...attached.events];
    const attachedSnapshot=snapshot(s),classes=effectivePawnClasses(gd,s.cybernet.pawnById(target)!);
    expect(classes).toEqual(["fixture-subject","malware"]);
    expect(playerAttachmentModifiers(s,gd,"p2").handModifier).toBe(id==="worm"?-1:0);
    expect(!!effectiveAbility(gd,def,s.cybernet.pawnById(target)!.attachments,"delete")).toBe(id!=="under-clocker");
    expect(effectiveMovementOptions(gd,def,s.cybernet.pawnById(target)!.attachments).length>0).toBe(id!=="hijacker");
    s.currentPlayer=1;
    if(id==="under-clocker") rejectUnchanged(f,{type:"play-delete",pawnId:target,targetId:actor,cardId:"dummy"});
    if(id==="hijacker") {
      rejectUnchanged(f,{type:"move-steps",pawnId:target,path:[{coord:{q:0,r:0},spaceId:"b"}]});
      rejectUnchanged(f,{type:"play-move",pawnId:target,cardId:"dummy",path:[{coord:{q:0,r:0},spaceId:"b"}]});
    }
    if(id==="worm") {
      const phase=advancePhase(s,gd);expect(phase.accepted).toBe(true);events.push(...phase.events);
      const recycle=applyActionWithEvents(s,gd,{type:"recycle",cardIds:["dj"]});expect(recycle.accepted).toBe(true);events.push(...recycle.events);expect(s.players[1]!.hand.length).toBe(4);
      s.phase="action";
    }
    s.currentPlayer=0;s.players[0]!.hand=["dj"];
    const taken=applyActionWithEvents(s,gd,{type:"play-icebreak-pawn",pawnId:actor,targetId:target,cardId:"dj"});expect(taken.accepted).toBe(true);
    expect(effectivePawnClasses(gd,s.cybernet.pawnById(target)!)).toEqual(["fixture-subject"]);expect(playerAttachmentModifiers(s,gd,"p1").handModifier).toBe(0);
    expect(effectiveAbility(gd,def,s.cybernet.pawnById(target)!.attachments,"delete")).toBeDefined();expect(effectiveMovementOptions(gd,def,s.cybernet.pawnById(target)!.attachments).length).toBe(1);
    rows.push({cardId:id,attached:JSON.parse(attachedSnapshot),after:JSON.parse(snapshot(s)),events:[...events,...taken.events]});
    // The strip is another use: it does not attach malware or impose the restriction.
    const strip=fixture(id);strip.def.class=["operative"];strip.gd.blocks[0]!.iceValue="high";strip.gd.blocks[0]!.iceFaces=[1,2,3,4,5,6];
    expect(applyActionWithEvents(strip.s,strip.gd,{type:"play-icebreak-block",pawnId:strip.actor,cardId:id,coord:{q:0,r:0}}).accepted).toBe(true);
    expect(strip.s.playedCards).toEqual([id]);expect(strip.s.cybernet.pawnById(strip.actor)!.attachments??[]).toEqual([]);
  }
  expect(rows).toEqual(JSON.parse(readFileSync(new URL("../../../golden/attachment-restrictions.json",import.meta.url),"utf8")));
});

test("attachment restrictions: only the explicit regression loader retains legacy attach.class grants",()=>{
  const gd=loadRegression("speedrunners"),def=gd.pawns[0]!;
  expect(effectivePawnClasses(gd,{pawnId:def.id,ownerId:"p1",coord:{q:0,r:0},spaceId:"core",attachments:[{cardId:"add-on-accelerator",slot:"add-on"}]})).toContain("accelerator");
  const f=fixture("fixture-target-rule");f.gd.cards.push({id:"fixture-target-rule",name:"Restriction without own class",attach:{as:"pawn",slot:"gadget",class:["fixture-subject"]}});
  f.s.cybernet.pawnById(f.target)!.attachments=[{cardId:"fixture-target-rule",slot:"gadget"}];
  expect(effectivePawnClasses(f.gd,f.s.cybernet.pawnById(f.target)!)).toEqual(["fixture-subject"]);
});

test("attachment restrictions: block definitions cannot silently ignore pawn eligibility fields",()=>{
  for(const restriction of [{class:["cleaner"]},{forbiddenClasses:["operative"]}]) {
    const f=fixture("fixture-invalid-block");f.gd.cards.push({id:"fixture-invalid-block",name:"Invalid block restriction",attach:{as:"block",...restriction}});
    expect(()=>newGame({data:f.gd,allowProvisional:true,playerNames:["A","B"],seed:42})).toThrow(/target-class restrictions require a pawn or enemy/);
    rejectUnchanged(f,{type:"attach-block",pawnId:f.actor,cardId:"fixture-invalid-block",coord:{q:0,r:0}});
    expect(availableActions(f.s,f.gd).some(option=>option.action.type==="attach-block" && option.action.cardId==="fixture-invalid-block")).toBe(false);
  }
});
