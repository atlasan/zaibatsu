import {useMarkerAllocations,abilityUseSpent} from "../src/engine/use-markers.ts";
import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {advancePhase,applyActionWithEvents,availableActions,deleteActivationOptions,deleteProfile,effectivePawnClasses,newGame,setPawnControl,snapshot,type Action} from "../src/engine/index.ts";

function weaponGame() {
  const gd=loadDefault("speedrunners");gd.cards.push({id:"fixture-module-adapter",name:"Synthetic module adapter",copies:1,attach:{as:"pawn",slot:"gadget",grantsSlot:["module"]}});
  const s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
  s.deck.push(...s.players.flatMap(player=>player.hand));for(const player of s.players) player.hand=[];
  for(const id of ["weapon-gunhed","ak-12km","fixture-module-adapter","servocanon","dummy","electric-sheep","selective-disclosure","jetpack"]) {s.deck.splice(s.deck.indexOf(id),1);s.players[0]!.hand.push(id);}
  s.players[0]!.bonusCounters=4;
  const pawnId=s.players[0]!.pawnId,target=s.players[1]!.pawnId;
  // Repeatable attacks need a synthetic fully shielded defender, not a promoted profile.
  gd.pawns.find(pawn=>pawn.id===target)!.defense=[1,2,3,4,5,6].map(value=>({value,shielded:true}));
  return {gd,s,pawnId,target};
}
function install(f:ReturnType<typeof weaponGame>,ids=["weapon-gunhed","ak-12km","fixture-module-adapter","servocanon"]) {
  const events=[];
  for(const cardId of ids) {const r=applyActionWithEvents(f.s,f.gd,{type:"attach-pawn",cardId,targetId:f.pawnId});expect(r.accepted).toBe(true);events.push(...r.events);}
  return events;
}
function rejectWeapon(f:ReturnType<typeof weaponGame>,action:Action) {
  const before=snapshot(f.s),rng=f.s.rng.clone(),r=applyActionWithEvents(f.s,f.gd,action);
  expect(r.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));return r;
}
function profile(f:ReturnType<typeof weaponGame>) {return deleteProfile(f.gd,f.gd.pawns.find(pawn=>pawn.id===f.pawnId)!,f.s.cybernet.pawnById(f.pawnId)!.attachments);}

test("printed Delete: Gunhed and AK-12kM identities, copies, costs and slots match the bilingual sheet",()=>{
  const f=weaponGame(),gun=f.gd.cards.find(card=>card.id==="weapon-gunhed")!,ak=f.gd.cards.find(card=>card.id==="ak-12km")!,servo=f.gd.cards.find(card=>card.id==="servocanon")!;
  expect(gun.type).toBe("add-on");expect(gun.class).toEqual(["brainchip"]);expect(gun.copies).toBe(1);expect(gun.attach!.cost).toBe(2);expect(gun.attach!.grantsSlot).toEqual(["add-on","weapon"]);
  expect(gun.attach!.delete).toEqual({skulls:1,activation:"card"});expect(ak.attach!.delete).toEqual({skulls:1});expect(ak.type).toBe("weapon");expect(ak.attach!.cost).toBe(1);
  expect(servo.attach!.delete).toEqual({skulls:1,activation:"once-per-turn"});expect(servo.type).toBe("module");expect(servo.attach!.cost).toBe(1);expect(servo.provisional).toBe(true);
  for(const card of [gun,ak,servo]) {expect(card.copies).toBe(1);expect(card.movement).toBe(2);expect(card.activates).toEqual(["delete"]);}
  f.s.players[0]!.bonusCounters=1;rejectWeapon(f,{type:"attach-pawn",cardId:gun.id,targetId:f.pawnId});
});

test("printed Delete: skulls add once and free versus card activations share public-roll evidence",()=>{
  const f=weaponGame(),{gd,s,pawnId}=f;
  const inventory=()=>[...s.deck,...s.discard,...s.playedCards??[],...s.players.flatMap(player=>player.hand),...s.cybernet.pawns.flatMap(pawn=>(pawn.attachments??[]).map(att=>att.cardId))].sort();const cards=inventory(),events=install(f),def=gd.pawns.find(pawn=>pawn.id===pawnId)!;
  expect(profile(f)).toEqual({skulls:3,card:true,freeActivators:1,cancelled:false});expect(s.players[0]!.bonusCounters).toBe(0);
  expect(effectivePawnClasses(gd,s.cybernet.pawnById(pawnId)!)).toEqual(["operative","brainchip"]);
  const before=snapshot(s),rng=s.rng.clone(),options=availableActions(s,gd).filter(option=>option.action.type==="roll-delete").map(option=>option.action);
  expect(options.some(option=>!option.cardId)).toBe(true);expect(options.some(option=>option.cardId==="dummy")).toBe(true);expect(snapshot(s)).toBe(before);expect(s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  const stages=[{label:"installed",state:JSON.parse(before)}];
  for(const cardId of [undefined,"dummy","electric-sheep"]) {
    const hand=[...s.players[0]!.hand],r=applyActionWithEvents(s,gd,{type:"roll-delete",pawnId,...(cardId?{cardId}:{})});expect(r.accepted).toBe(true);events.push(...r.events);
    expect(s.pendingAttack!.roll.length).toBe(3);expect(s.players[0]!.hand.length).toBe(hand.length-(cardId?1:0));expect(abilityUseSpent(s,gd,s.players[0]!,pawnId,"delete")).toBe(true);
    stages.push({label:cardId??"free",state:JSON.parse(snapshot(s))});
    rejectWeapon(f,{type:"roll-delete",pawnId,cardId:"dummy"});rejectWeapon(f,{type:"assign-delete",targetIds:[""]});
    const assigned=applyActionWithEvents(s,gd,{type:"assign-delete",targetIds:["","",""]});expect(assigned.accepted).toBe(true);events.push(...assigned.events);
    rejectWeapon(f,{type:"roll-delete",pawnId});
  }
  expect(availableActions(s,gd).filter(option=>option.action.type==="roll-delete").every(option=>!!option.action.cardId)).toBe(true);
  for(let phase=0;phase<8;phase++) {const r=advancePhase(s,gd);expect(r.accepted).toBe(true);events.push(...r.events);}
  expect(abilityUseSpent(s,gd,s.players[0]!,pawnId,"delete")).toBe(false);expect(deleteActivationOptions(gd,def,s.cybernet.pawnById(pawnId)!.attachments)).toHaveLength(2);
  expect(inventory()).toEqual(cards);
  stages.push({label:"next-turn",state:JSON.parse(snapshot(s))});
  expect({profile:profile(f),options,stages,events}).toEqual(JSON.parse(readFileSync(new URL("../../../golden/delete-attributes.json",import.meta.url),"utf8")));
});

test("printed Delete: strength-only weapon does not invent an activation and a free-only module cannot be card-paid",()=>{
  const f=weaponGame(),def=f.gd.pawns.find(pawn=>pawn.id===f.pawnId)!;def.slots!.push("weapon");install(f,["ak-12km"]);
  expect(profile(f)).toEqual({skulls:1,card:false,freeActivators:0,cancelled:false});expect(availableActions(f.s,f.gd).some(option=>option.action.type==="roll-delete")).toBe(false);
  rejectWeapon(f,{type:"roll-delete",pawnId:f.pawnId,cardId:"dummy"});
  install(f,["fixture-module-adapter","servocanon"]);expect(profile(f).skulls).toBe(2);
  rejectWeapon(f,{type:"roll-delete",pawnId:f.pawnId,cardId:"dummy"});rejectWeapon(f,{type:"play-delete",pawnId:f.pawnId,targetId:f.target,cardId:"dummy"});
  expect(applyActionWithEvents(f.s,f.gd,{type:"roll-delete",pawnId:f.pawnId}).accepted).toBe(true);
  expect(f.s.pendingAttack!.roll.length).toBe(2);
});

test("printed Delete: native strength adds to printed attachments while conflicting free badges reject atomically",()=>{
  const f=weaponGame(),def=f.gd.pawns.find(pawn=>pawn.id===f.pawnId)!;def.abilities!.push({ability:"delete",activation:"once-per-turn",skulls:2});install(f);
  expect(profile(f)).toEqual({skulls:5,card:true,freeActivators:2,cancelled:false});
  expect(rejectWeapon(f,{type:"roll-delete",pawnId:f.pawnId}).error).toContain("English and Spanish");
  expect(rejectWeapon(f,{type:"delete",pawnId:f.pawnId,targetId:f.target}).error).toContain("English and Spanish");
  expect(availableActions(f.s,f.gd).filter(option=>option.action.type==="roll-delete").every(option=>!!option.action.cardId)).toBe(true);
  expect(applyActionWithEvents(f.s,f.gd,{type:"roll-delete",pawnId:f.pawnId,cardId:"dummy"}).accepted).toBe(true);expect(f.s.pendingAttack!.roll.length).toBe(5);expect(useMarkerAllocations(f.s)).toEqual([]);
});

test("printed Delete: cancellation defeats every activation and takeover refunds all three printed costs",()=>{
  const f=weaponGame(),{gd,s,pawnId,target}=f;install(f);gd.pawns.find(pawn=>pawn.id===pawnId)!.class=["fixture-subject"];
  s.currentPlayer=1;s.players[1]!.hand=["under-clocker","dj"];gd.pawns.find(pawn=>pawn.id===pawnId)!.iceFaces=[1,2,3,4,5,6];
  expect(applyActionWithEvents(s,gd,{type:"attach-enemy",pawnId:target,targetId:pawnId,cardId:"under-clocker",slotRef:"pawn:add-on/add-on"}).accepted).toBe(true);
  s.currentPlayer=0;expect(profile(f).cancelled).toBe(true);expect(deleteActivationOptions(gd,gd.pawns.find(pawn=>pawn.id===pawnId)!,s.cybernet.pawnById(pawnId)!.attachments)).toEqual([]);
  rejectWeapon(f,{type:"roll-delete",pawnId});rejectWeapon(f,{type:"roll-delete",pawnId,cardId:"dummy"});
  s.currentPlayer=1;expect(applyActionWithEvents(s,gd,{type:"play-icebreak-pawn",pawnId:target,targetId:pawnId,cardId:"dj"}).accepted).toBe(true);
  expect(s.players[0]!.bonusCounters).toBe(4);expect(s.cybernet.pawnById(pawnId)!.attachments??[]).toEqual([]);expect(profile(f).skulls).toBe(0);
});

test("printed Delete: a joint attack pays only its initiator and includes a bare-skull contributor",()=>{
  const f=weaponGame(),{gd,s,pawnId,target}=f;install(f,["weapon-gunhed"]);setPawnControl(s,target,"p1");gd.pawns.find(pawn=>pawn.id===target)!.slots!.push("weapon");
  expect(applyActionWithEvents(s,gd,{type:"attach-pawn",targetId:target,cardId:"ak-12km"}).accepted).toBe(true);
  gd.threats=[{id:"fixture-token",name:"Synthetic shielded threat",type:"token",attackDie:5,defense:[1,2,3,4,5,6].map(value=>({value,shielded:true}))}];s.threats=[{id:"t1",threatId:"fixture-token",coord:{q:0,r:0},spaceId:"core",status:"inactive"}];
  expect(availableActions(s,gd).some(option=>option.action.type==="roll-delete" && option.action.joint && option.action.pawnId===pawnId)).toBe(true);
  expect(applyActionWithEvents(s,gd,{type:"roll-delete",pawnId,cardId:"dummy",joint:true}).accepted).toBe(true);expect(s.pendingAttack!.attackerIds).toEqual([pawnId,target]);expect(s.pendingAttack!.roll).toHaveLength(2);expect(useMarkerAllocations(s)).toEqual([]);
});

test("printed Delete: malformed or conflicting typed definitions fail before a source match",()=>{
  for(const attach of [{as:"pawn",slot:"weapon",delete:{skulls:0}},{as:"pawn",slot:"weapon",delete:{skulls:1,activation:"unknown"}},{as:"block",delete:{skulls:1}},{as:"pawn",delete:{skulls:1},grants:["delete"]},{as:"pawn",delete:{skulls:1},abilityUses:[{ability:"delete",activation:"card"}]},{as:"pawn",grants:["delete"],abilityUses:[{ability:"delete",perTurn:2}]}]) {
    const f=weaponGame();f.gd.cards.push({id:"fixture-invalid",name:"Invalid Delete",attach:attach as any});expect(()=>newGame({data:f.gd,allowProvisional:true,playerNames:["A","B"],seed:42})).toThrow(/Delete/);
  }
});

test("printed Delete: direct, split and area paid attacks preserve the separate free activation",()=>{
  const f=weaponGame(),{gd,s,pawnId,target}=f;install(f);
  const direct=applyActionWithEvents(s,gd,{type:"play-delete",pawnId,targetId:target,cardId:"dummy"});expect(direct.accepted).toBe(true);expect(direct.events.find(event=>event.type==="roll")!.roll).toHaveLength(3);expect(useMarkerAllocations(s)).toEqual([]);
  const split=applyActionWithEvents(s,gd,{type:"delete-multi",pawnId,targetIds:[target,target,target]});expect(split.accepted).toBe(true);expect(abilityUseSpent(s,gd,s.players[0]!,pawnId,"delete")).toBe(true);
  const def=gd.pawns.find(pawn=>pawn.id===pawnId)!;def.class.push("bomb");def.defense=[1,2,3,4,5,6].map(value=>({value,shielded:true}));
  const area=applyActionWithEvents(s,gd,{type:"play-delete-area",pawnId,cardId:"electric-sheep"});expect(area.accepted).toBe(true);expect(area.events.find(event=>event.type==="roll")!.roll).toHaveLength(3);
  rejectWeapon(f,{type:"delete-area",pawnId});
});
