import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault,loadRegression} from "../src/data/index.ts";
import {advancePhase,applyActionWithEvents,availableActions,availableAttachmentSlots,cloneGameState,discardPawnAttachment,effectivePawnClasses,eliminatePawn,newGame,pawnAttachmentSlots,playerAttachmentModifiers,snapshot,type Action} from "../src/engine/index.ts";

function slotGame() {
  const gd=loadDefault("speedrunners");
  gd.cards.push(
    {id:"fixture-slot-bridge",name:"Synthetic slot bridge",copies:2,class:["fixture-chip"],attach:{as:"pawn",slot:"add-on",cost:1,grantsSlot:["add-on","weapon"]}},
    {id:"fixture-expiring-bridge",name:"Synthetic expiring bridge",copies:1,attach:{as:"pawn",slot:"add-on",cost:2,grantsSlot:["add-on","weapon"],phaseEffects:[{trigger:"begin-turn",kind:"discard-self"}]}},
    {id:"fixture-module-carrier",name:"Synthetic module carrier",copies:1,attach:{as:"pawn",slot:"weapon",cost:1,grantsSlot:["module"]}},
    {id:"fixture-module",name:"Synthetic module",copies:1,class:["fixture-module"],attach:{as:"pawn",slot:"module",cost:2,movementModifier:1}},
    {id:"fixture-gadget-bridge",name:"Synthetic gadget bridge",copies:1,attach:{as:"pawn",slot:"armor",grantsSlot:["gadget"]}},
    {id:"fixture-gadget",name:"Synthetic gadget",copies:1,attach:{as:"pawn",slot:"gadget",cost:1,handModifier:1}},
  );
  const s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
  s.deck.push(...s.players.flatMap(player=>player.hand));for(const player of s.players) player.hand=[];
  for(const id of ["fixture-expiring-bridge","fixture-slot-bridge","fixture-slot-bridge","fixture-module-carrier","fixture-module","fixture-gadget-bridge","fixture-gadget","dummy"]) {
    s.deck.splice(s.deck.indexOf(id),1);s.players[0]!.hand.push(id);
  }
  s.players[0]!.bonusCounters=10;
  return {gd,s,pawnId:s.players[0]!.pawnId};
}
function attach(f:ReturnType<typeof slotGame>,cardId:string,slotRef?:string) {
  const r=applyActionWithEvents(f.s,f.gd,{type:"attach-pawn",cardId,targetId:f.pawnId,...(slotRef?{slotRef}:{})});expect(r.accepted).toBe(true);return r;
}
function rejected(f:ReturnType<typeof slotGame>,action:Action) {
  const before=snapshot(f.s),rng=f.s.rng.clone(),r=applyActionWithEvents(f.s,f.gd,action);
  expect(r.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
}
function inventory(f:ReturnType<typeof slotGame>) {
  return [...f.s.deck,...f.s.discard,...f.s.playedCards??[],...f.s.players.flatMap(player=>player.hand),...f.s.cybernet.pawns.flatMap(pawn=>(pawn.attachments??[]).map(att=>att.cardId))].sort();
}

test("attachment slots: identical cards occupy distinct rooted slots and multiple free providers require a choice",()=>{
  const f=slotGame(),{gd,s,pawnId}=f,pawn=s.cybernet.pawnById(pawnId)!,cards=inventory(f);
  attach(f,"fixture-slot-bridge");attach(f,"fixture-slot-bridge");
  expect(pawn.attachments!.map(att=>att.slotRef)).toEqual(["pawn:add-on","pawn:add-on/add-on"]);
  const before=snapshot(s),rng=s.rng.clone();
  const options=availableActions(s,gd).filter(option=>option.action.type==="attach-pawn" && option.action.cardId==="fixture-module-carrier");
  expect(options.map(option=>option.action.slotRef)).toEqual(["pawn:add-on/weapon","pawn:add-on/add-on/weapon"]);
  expect(snapshot(s)).toBe(before);expect(s.rng.clone().intn(100000)).toBe(rng.intn(100000));
  rejected(f,{type:"attach-pawn",cardId:"fixture-module-carrier",targetId:pawnId});
  rejected(f,{...options[0]!.action,slotRef:"pawn:weapon"});
  rejected(f,{...options[0]!.action,slotRef:"pawn:add-on"});
  const selected=applyActionWithEvents(s,gd,options[1]!.action);expect(selected.accepted).toBe(true);
  attach(f,"fixture-module");expect(s.cybernet.pawnById(pawnId)!.attachments!.at(-1)!.slotRef).toBe("pawn:add-on/add-on/weapon/module");
  expect(inventory(f)).toEqual(cards);expect(s.players[0]!.bonusCounters+s.cybernet.pawnById(pawnId)!.attachments!.reduce((sum,att)=>sum+(att.bonusPaid??0),0)).toBe(10);
  const clone=cloneGameState(s);clone.cybernet.pawnById(pawnId)!.attachments![0]!.slotRef="changed";expect(snapshot(s)).not.toBe(snapshot(clone));
});

test("attachment slots: native and granted slots of the same type remain separate and occupied references reject atomically",()=>{
  const f=slotGame();attach(f,"fixture-gadget-bridge");
  rejected(f,{type:"attach-pawn",cardId:"fixture-gadget",targetId:f.pawnId});
  expect(availableAttachmentSlots(f.gd,f.s.cybernet.pawnById(f.pawnId)!,"gadget").map(slot=>slot.ref)).toEqual(["pawn:gadget","pawn:armor/gadget"]);
  attach(f,"fixture-gadget","pawn:armor/gadget");
  // No hand/counter change on a stale or wrong slot, including an otherwise valid type.
  f.s.players[0]!.hand.push("fixture-gadget");
  rejected(f,{type:"attach-pawn",cardId:"fixture-gadget",targetId:f.pawnId,slotRef:"pawn:armor/gadget"});
  rejected(f,{type:"pass",slotRef:"pawn:gadget"});
  expect(availableAttachmentSlots(f.gd,f.s.cybernet.pawnById(f.pawnId)!,"gadget").map(slot=>slot.ref)).toEqual(["pawn:gadget"]);
});

test("attachment slots: phase self-discard cascades through providers, refunds once and preserves unrelated attachments",()=>{
  const f=slotGame(),{gd,s,pawnId}=f,cards=inventory(f);
  const events=[];
  for(const [cardId,slotRef] of [["fixture-expiring-bridge","pawn:add-on"],["fixture-slot-bridge","pawn:add-on/add-on"],["fixture-module-carrier","pawn:add-on/weapon"],["fixture-module","pawn:add-on/weapon/module"],["fixture-gadget","pawn:gadget"]]) events.push(...attach(f,cardId!,slotRef).events);
  const attached=snapshot(s);s.phase="beginning";const phase=advancePhase(s,gd);expect(phase.accepted).toBe(true);events.push(...phase.events);
  expect(s.discard).toEqual(["fixture-expiring-bridge","fixture-slot-bridge","fixture-module-carrier","fixture-module"]);
  expect(s.cybernet.pawnById(pawnId)!.attachments!.map(att=>att.cardId)).toEqual(["fixture-gadget"]);
  expect(s.players[0]!.bonusCounters).toBe(9);expect(effectivePawnClasses(gd,s.cybernet.pawnById(pawnId)!)).toEqual(["operative"]);
  expect(playerAttachmentModifiers(s,gd,"p1").handModifier).toBe(1);expect(inventory(f)).toEqual(cards);
  expect({attached:JSON.parse(attached),after:JSON.parse(snapshot(s)),events}).toEqual(JSON.parse(readFileSync(new URL("../../../golden/attachment-slots.json",import.meta.url),"utf8")));
});

test("attachment slots: prevention discards its granted-slot descendants without allowing a move to another free slot",()=>{
  const f=slotGame(),{gd,s,pawnId}=f;gd.cards.find(card=>card.id==="dummy")!.attach!.grantsSlot=["weapon"];
  attach(f,"dummy");attach(f,"fixture-module-carrier");attach(f,"fixture-module");attach(f,"fixture-gadget");
  // Another independent weapon slot cannot rescue cards attached to Dummy.
  gd.pawns.find(pawn=>pawn.id===pawnId)!.slots!.push("weapon");
  s.currentPlayer=1;eliminatePawn(s,pawnId,gd);
  expect(applyActionWithEvents(s,gd,{type:"resolve-choice",choiceId:s.pendingChoice!.id,playerId:"p1",optionId:"prevent",cardId:"dummy"}).accepted).toBe(true);
  expect(s.discard).toEqual(["dummy","fixture-module-carrier","fixture-module"]);
  expect(s.cybernet.pawnById(pawnId)!.attachments!.map(att=>att.cardId)).toEqual(["fixture-gadget"]);expect(s.players[0]!.bonusCounters).toBe(9);
});

test("attachment slots: only grounded providers grant slots and fixture inference is read-only",()=>{
  const f=slotGame(),pawn=f.s.cybernet.pawnById(f.pawnId)!;
  pawn.attachments=[{cardId:"fixture-module-carrier",slot:"weapon",slotRef:"pawn:module/weapon"},{cardId:"fixture-module",slot:"module",slotRef:"pawn:module/weapon/module"}];
  expect(availableAttachmentSlots(f.gd,pawn,"weapon")).toEqual([]);expect(availableAttachmentSlots(f.gd,pawn,"module")).toEqual([]);
  pawn.attachments=[{cardId:"fixture-slot-bridge",slot:"add-on"},{cardId:"fixture-module-carrier",slot:"weapon"},{cardId:"fixture-module",slot:"module"}];
  const before=snapshot(f.s);expect(pawnAttachmentSlots(f.gd,pawn).filter(slot=>slot.occupied).map(slot=>slot.ref)).toEqual(["pawn:add-on","pawn:add-on/weapon","pawn:add-on/weapon/module"]);expect(snapshot(f.s)).toBe(before);
  discardPawnAttachment(f.s,f.gd,pawn,0);expect(pawn.attachments).toEqual([]);
});

test("attachment slots: explicit regression fixtures retain the historical one-slot-per-type behavior",()=>{
  const gd=loadRegression("speedrunners"),s=newGame({data:gd,playerNames:["A","B"],seed:42}),pawn=s.cybernet.pawns[0]!;
  gd.cards.push({id:"fixture-slot-bridge",name:"Historical synthetic bridge",attach:{as:"pawn",slot:"add-on",grantsSlot:["add-on"]}});
  pawn.attachments=[{cardId:"fixture-slot-bridge",slot:"add-on"}];expect(availableAttachmentSlots(gd,pawn,"add-on")).toEqual([]);
});
