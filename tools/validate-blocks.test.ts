import {test,expect} from "bun:test";
import {blockSourceErrors,controlCardSourceErrors} from "./validate-blocks.ts";
import blocks from "../spec/data/speedrunners/blocks.json";
import pawns from "../spec/data/speedrunners/pawns.json";
import cards from "../spec/data/speedrunners/control-cards.json";

test("Pink/Gynoid source cross-references validate native timing and matching controlled placement",()=>{
 const b:any=structuredClone(blocks.blocks.find(b=>b.id==="pink-district")!),p:any=structuredClone(pawns.pawns.find(p=>p.id==="gynoid")!);expect(blockSourceErrors([b],[p],cards.controlCards)).toEqual([]);expect(controlCardSourceErrors([p],cards.controlCards)).toEqual([]);
 b.effects={inCybernet:b.effects.underControl};expect(blockSourceErrors([b],[p],cards.controlCards).join(" ")).toContain("under-control timing");b.effects={underControl:{kind:"place-controlled-pawn",target:"missing"}};expect(blockSourceErrors([b],[p],cards.controlCards).length).toBeGreaterThan(0);p.phaseEffects[0].scope="same-block";expect(controlCardSourceErrors([p],cards.controlCards).join(" ")).toContain("native pawn phase effect");
});

test("Broadcast permission requires under-control timing and an unlimited special landing space",()=>{
 const original:any=structuredClone(blocks.blocks.find(b=>b.id==="clandestine-broadcast")!);expect(blockSourceErrors([original],pawns.pawns,cards.controlCards)).toEqual([]);
 for(const change of ["timing","target","capacity","identity","amount"]){const b=structuredClone(original);if(change==="timing")b.effects={inCybernet:b.effects.underControl};if(change==="target")b.effects.underControl.target="left";if(change==="capacity")b.spaces[0].capacity=1;if(change==="identity")b.isCentralCore=true;if(change==="amount")b.effects.underControl.amount=2;expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).join(" ")).toContain("controller Core permission");}
});

test("Copyleft strict geometry and all-player award descriptor reject phantom targets and timing",()=>{
 const original:any=structuredClone(blocks.blocks.find(b=>b.id==="copyleft")!);original.provisional=false;expect(blockSourceErrors([original],pawns.pawns,cards.controlCards)).toEqual([]);for(const change of ["amount","target","timing"]){const b=structuredClone(original),e=b.effects.inCybernet;if(change==="amount")e.amount=0;if(change==="target")e.target="eko";if(change==="timing")b.effects={underControl:e};expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).join(" ")).toContain("bonus award");}
});

test("EMP source geometry and sacrifice threshold semantics validate independently of provisional flags",()=>{
 const original:any=structuredClone(blocks.blocks.find(b=>b.id==="electromagnetic-pulse")!);original.provisional=false;expect(blockSourceErrors([original],pawns.pawns,cards.controlCards)).toEqual([]);for(const change of ["amount","threshold","target","timing"]) {const b=structuredClone(original),e=b.effects.inCybernet;if(change==="amount")e.amount=2;if(change==="threshold")e.minimumControlledPawns=0;if(change==="target")e.target="p1";if(change==="timing")b.effects={underControl:e};expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).join(" ")).toContain("sacrifice");}
});

test("Antro source effects retain geometry and reject unsupported space policies",()=>{
 const original:any=structuredClone(blocks.blocks.find(b=>b.id==="antro")!);original.provisional=false;expect(blockSourceErrors([original],pawns.pawns,cards.controlCards)).toEqual([]);
 for(const change of ["type","family","scope","optional","handler"]) {const b=structuredClone(original),s=b.spaces.find((s:any)=>s.effect);if(change==="type")s.type="normal";if(change==="family")s.effect.cardType="weapon";if(change==="scope")s.effect.scope="self";if(change==="optional")s.effect.optional=false;if(change==="handler")s.effect.kind="prose";expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).join(" ")).toContain("optional attachment");}
});

test("verified block source accounting rejects phantom zones, dangling neutral targets and misplaced defense symbols",()=>{
 expect(blockSourceErrors(blocks.blocks,pawns.pawns,cards.controlCards)).toEqual([]);
 const original=blocks.blocks.find(b=>b.id==="idoru")!;
 for(const mutation of ["missing-title-zone","overlap","boundary","neighbor","neutral-card","neutral-space","neutral-timing","duplicate-face","ice-dice"] as const) {
  const b:any=structuredClone(original),cc:any[]=structuredClone(cards.controlCards);
  if(mutation==="missing-title-zone") b.nonPlayableZoneIds=[];if(mutation==="overlap") b.nonPlayableZoneIds=["h2"];if(mutation==="boundary") b.boundarySpaces[0]=["missing"];if(mutation==="neighbor") b.spaces[0].neighbors.push("missing");if(mutation==="neutral-card") cc.splice(cc.findIndex(c=>c.subject.id==="idoru"),1);if(mutation==="neutral-space") b.spaces.find((s:any)=>s.type==="pawn").pawnId="missing";if(mutation==="neutral-timing") b.effects={underControl:b.effects.inCybernet};if(mutation==="duplicate-face") b.spaces[2].modifier.dice.push({value:1,shielded:true});if(mutation==="ice-dice") b.spaces[2].modifier.kind="ice";
  expect(blockSourceErrors([b],pawns.pawns,cc).length).toBeGreaterThan(0);
 }
});

test("counted control-card instructions require exactly one matching physical card",()=>{const pawns=[{id:"idol",controlMarkerEffect:{kind:"place-on-control-card",amount:1}}],card={subject:{kind:"pawn",id:"idol"}};expect(controlCardSourceErrors(pawns,[card])).toEqual([]);expect(controlCardSourceErrors(pawns,[])).toHaveLength(1);expect(controlCardSourceErrors(pawns,[card,card])).toHaveLength(1);expect(controlCardSourceErrors(pawns,[{subject:{kind:"block",id:"idol"}}])).toHaveLength(1);});

test("page-one arrows and corrected topology pass strict geometry checks while global timing stays explicit",()=>{
 for(const id of ["hacktivism","chiba-city"]) {const b:any=structuredClone(blocks.blocks.find(b=>b.id===id)!);b.provisional=false;expect(blockSourceErrors([b],pawns.pawns,cards.controlCards)).toEqual([]);const original=structuredClone(b);for(const arrows of [[{from:"missing",to:"shield"}],[{from:"shield",to:"shield"}],[...b.spaceArrows,...b.spaceArrows]]){b.spaceArrows=arrows;expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).join(" ")).toContain("space arrows");}b.spaceArrows=original.spaceArrows;if(id==="chiba-city") {b.effects={underControl:b.effects.inCybernet};expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).join(" ")).toContain("placement timing");}}
});
test("Yakuza exact geometry and targeted attack descriptor reject scope, timing, costs and fixed-target substitutions",()=>{
 const original:any=structuredClone(blocks.blocks.find(b=>b.id==="yakuza")!);expect(blockSourceErrors([original],pawns.pawns,cards.controlCards)).toEqual([]);
 for(const change of ["scope","optional","amount","target","timing"]){const b=structuredClone(original),e=b.effects.underControl;if(change==="scope")e.scope="cybernet";if(change==="optional")e.optional=false;if(change==="amount")e.amount=0;if(change==="target")e.target="gynoid";if(change==="timing")b.effects={inCybernet:e};expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).length).toBeGreaterThan(0);}
});
test("Corporate Scandal source threshold accepts exact geometry and rejects invented amounts, targets and placement timing",()=>{
 const b:any=structuredClone(blocks.blocks.find(b=>b.id==="corporate-scandal")!);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards)).toEqual([]);
 for(const change of ["threshold","amount","target","timing","misplaced"]){const c=structuredClone(b),e=c.effects.underControl;if(change==="threshold")e.markerThreshold=0;if(change==="amount")e.amount=1;if(change==="target")e.target="p1";if(change==="timing")c.effects={inCybernet:e};if(change==="misplaced")e.kind="controller-core";expect(blockSourceErrors([c],pawns.pawns,cards.controlCards).length).toBeGreaterThan(0);}
});
test("Black Clinic exact geometry, mandatory global detachment and signed hand-space values reject unsupported policies",()=>{
 const b:any=structuredClone(blocks.blocks.find(b=>b.id==="black-clinic")!);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards)).toEqual([]);
 for(const change of ["scope","optional","target","amount","timing","hand-zero","hand-dice"]){const c=structuredClone(b),e=c.effects.underControl;if(change==="scope")e.scope="adjacent-blocks";if(change==="optional")e.optional=true;if(change==="target")e.target="gynoid";if(change==="amount")e.amount=1;if(change==="timing")c.effects={inCybernet:e};if(change==="hand-zero")c.spaces[2].modifier.amount=0;if(change==="hand-dice")c.spaces[2].modifier.dice=[{value:1,shielded:true}];expect(blockSourceErrors([c],pawns.pawns,cards.controlCards).length).toBeGreaterThan(0);}
});
test("Engineering War exact two-entrance topology and matching Drone MK-2 reject title paths and missing physical card references",()=>{
 const b:any=structuredClone(blocks.blocks.find(b=>b.id==="engineering-war")!);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards)).toEqual([]);const missing=cards.controlCards.filter(c=>c.subject.id!=="drone-mk-2");expect(blockSourceErrors([b],pawns.pawns,missing).length).toBeGreaterThan(0);b.edges[0]=true;b.boundarySpaces[0]=["drone-mk-2"];expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).length).toBeGreaterThan(0);
});
test("Combat Prototypes four entrances, exact excluded zones and matching Drone Probe reject phantom title paths/cards",()=>{
 const b:any=structuredClone(blocks.blocks.find(b=>b.id==="combat-prototypes")!);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards)).toEqual([]);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards.filter(c=>c.subject.id!=="drone-probe")).length).toBeGreaterThan(0);b.edges[0]=true;b.boundarySpaces[0]=["drone-probe"];expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).length).toBeGreaterThan(0);
});

test("Military Development exact hand topology and physical Turret card reject phantom entrances and missing cards",()=>{
 const b:any=structuredClone(blocks.blocks.find(b=>b.id==="military-development")!);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards)).toEqual([]);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards.filter(c=>c.subject.id!=="drone-turret")).length).toBeGreaterThan(0);b.edges[0]=true;b.boundarySpaces[0]=["drone-turret"];expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).length).toBeGreaterThan(0);
});

test("Cleaner B matching home, hand arrow and physical card reject a reversed arrow and a missing card",()=>{
 const b:any=structuredClone(blocks.blocks.find(b=>b.id==="cleaner-b")!);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards)).toEqual([]);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards.filter(c=>c.subject.id!=="cleaner-b")).length).toBeGreaterThan(0);b.spaceArrows=[{from:"circuit",to:"hand"},{from:"hand",to:"circuit"}];expect(blockSourceErrors([b],pawns.pawns,cards.controlCards).join(" ")).toContain("space arrows");
});

test("Arms Industry paired reserve allocation/collection requires exact timing, amount and mandatory transfer",()=>{
 const b:any=structuredClone(blocks.blocks.find(b=>b.id==="arms-industry")!);expect(blockSourceErrors([b],pawns.pawns,cards.controlCards)).toEqual([]);for(const kind of ["missing","amount","target","optional","timing"]){const c=structuredClone(b);if(kind==="missing")delete c.effects.underControl;if(kind==="amount")c.effects.inCybernet.amount=2;if(kind==="target")c.effects.underControl.target="p1";if(kind==="optional")c.effects.underControl.optional=true;if(kind==="timing")[c.effects.inCybernet,c.effects.underControl]=[c.effects.underControl,c.effects.inCybernet];expect(blockSourceErrors([c],pawns.pawns,cards.controlCards).length).toBeGreaterThan(0);}
});
