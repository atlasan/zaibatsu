import {supportsSearchBlockEffect} from "../src/engine/search-choice.ts";
import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault} from "../src/data/index.ts";
import {applyActionWithEvents,availableActions,effectivePawnClasses,newGame,snapshot} from "../src/engine/index.ts";

function classGame() {
  const gd=loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";
  return {gd,s,pawnId:s.players[0]!.pawnId};
}

test("source classes: printed Accelerator, E-Synapse and Trade Secret classes belong to the attached pawn",()=>{
  const rows:Array<{cardId:string;name:string;attached:string[];after:string[]}>=[];
  for(const [cardId,classification,cost] of [["accelerator-transgenic-therapy","accelerator",1],["hyper-accelerator","accelerator",1],["accela-accelerator","accelerator",1],["biochip","e-synapse",1],["e-synapse-neural-interface","e-synapse",2],["selective-disclosure","trade-secret",0],["insider-trading","trade-secret",1]] as const) {
    const {gd,s,pawnId}=classGame();s.players[0]!.hand=[cardId];s.players[0]!.bonusCounters=cost;
    expect(gd.cards.find(card=>card.id===cardId)!.class).toEqual([classification]);
    expect(applyActionWithEvents(s,gd,{type:"attach-pawn",targetId:pawnId,cardId}).accepted).toBe(true);
    expect(effectivePawnClasses(gd,s.cybernet.pawnById(pawnId)!)).toEqual(["operative",classification]);
    const attached=effectivePawnClasses(gd,s.cybernet.pawnById(pawnId)!);
    expect(gd.pawns.find(pawn=>pawn.id===pawnId)!.class).toEqual(["operative"]);
    // Synthetic target ICE allows any roll to exercise ordinary source cleanup.
    gd.pawns.find(pawn=>pawn.id===pawnId)!.iceFaces=[1,2,3,4,5,6];s.currentPlayer=1;s.players[1]!.hand=["dj"];
    expect(applyActionWithEvents(s,gd,{type:"play-icebreak-pawn",pawnId:s.players[1]!.pawnId,targetId:pawnId,cardId:"dj"}).accepted).toBe(true);
    expect(effectivePawnClasses(gd,s.cybernet.pawnById(pawnId)!)).toEqual(["operative"]);expect(s.players[0]!.bonusCounters).toBe(cost);
    rows.push({cardId,name:gd.cards.find(card=>card.id===cardId)!.name,attached,after:effectivePawnClasses(gd,s.cybernet.pawnById(pawnId)!)});
  }
  expect(rows).toEqual(JSON.parse(readFileSync(new URL("../../../golden/attachment-classes.json",import.meta.url),"utf8")));
});

function blockGame() {
  const f=classGame();f.gd.blocks.push({id:"fixture-attachment-block",name:"Synthetic attachment block",expansion:"speedrunners",iceValue:"high",iceFaces:[1,2,3,4,5,6],spaces:[{id:"core",type:"special",capacity:"unlimited"}]});f.s.cybernet.blocks[0]!.blockId="fixture-attachment-block";f.s.players[0]!.hand=["cracker"];
  return f;
}

test("source classes: Gentleman Loser is a block attachment and cannot place Cracker through Icebreaker",()=>{
  const {gd,s,pawnId}=blockGame(),card=gd.cards.find(card=>card.id==="cracker")!;
  expect(card.name).toBe("Gentleman Loser");expect(card.type).toBe("block");expect(card.attach?.as).toBe("block");expect(card.provisional).toBe(true);expect(card.effects![0]!.trigger).toBe("on-attach");
  expect(applyActionWithEvents(s,gd,{type:"play-icebreak-block",pawnId,cardId:"cracker",coord:{q:0,r:0}}).accepted).toBe(true);
  expect(s.cybernet.pawnById("cracker")).toBeUndefined();expect(s.reserve).toContain("cracker");expect(s.playedCards).toEqual(["cracker"]);
});

test("source classes: unsupported block attachment resolution rejects without payment or random changes",()=>{
  const {gd,s,pawnId}=blockGame();const before=snapshot(s),rng=s.rng.clone();
  const result=applyActionWithEvents(s,gd,{type:"attach-block",pawnId,cardId:"cracker",coord:{q:0,r:0}});
  expect(result.accepted).toBe(false);expect(result.error).toContain("unsupported placement/choice resolution");expect(snapshot(s)).toBe(before);
  expect(availableActions(s,gd).some(option=>option.action.type==="attach-block" && option.action.cardId==="cracker")).toBe(false);expect(snapshot(s)).toBe(before);expect(s.rng.intn(1000)).toBe(rng.intn(1000));
  gd.blocks=gd.blocks.filter(supportsSearchBlockEffect); // isolate this attachment gate from separately unsupported block effects
  // Even a caller falsely clearing provisional flags cannot make this mechanic official.
  for(const record of [...gd.blocks,...gd.pawns,...gd.cards,...gd.controlCards!]) record.provisional=false;
  expect(()=>newGame({data:gd,playerNames:["A","B"],seed:42})).toThrow(/unsupported attachment-time effects/);
});
