import {test,expect} from "bun:test";
import {readFileSync} from "node:fs";
import {loadDefault,loadRegression} from "../src/data/index.ts";
import {newRng} from "../src/domain/rng.ts";
import {newGame,defenseProfile,effectiveDefenseDice,applyActionWithEvents,snapshot,availableActions,type Action} from "../src/engine/index.ts";

function fixture(regression=false) {
 const gd=regression?loadRegression("speedrunners"):loadDefault("speedrunners"),s=newGame({data:gd,allowProvisional:true,playerNames:["A","B"],seed:42});s.phase="action";s.rng=newRng(79);
 const actor=s.players[0]!.pawnId,target=s.players[1]!.pawnId;gd.blocks.push({id:"fixture-defense-board",name:"Synthetic defense board",expansion:"speedrunners",edges:[true,true,true,true,true,true],boundarySpaces:Array.from({length:6},()=>["plain"]),spaces:[{id:"plain",type:"special",capacity:"unlimited",neighbors:["shield","weak"]},{id:"shield",type:"special",capacity:"unlimited",neighbors:["plain"],modifier:{kind:"defense",dice:[{value:3,shielded:true}]}},{id:"weak",type:"special",capacity:"unlimited",neighbors:["plain"],modifier:{kind:"defense",dice:[{value:1,shielded:false},{value:2,shielded:false}]}}],provisional:true});s.cybernet.blocks.push({blockId:"fixture-defense-board",coord:{q:1,r:0},rotation:0});for(const p of s.cybernet.pawns) {p.coord={q:1,r:0};p.spaceId=p.pawnId===actor?"plain":"weak";}
 const a=gd.pawns.find(p=>p.id===actor)!,t=gd.pawns.find(p=>p.id===target)!;a.class=["bomb"];a.abilities=[{ability:"delete",activation:"once-per-turn",skulls:1}];t.defense=[1,2,3,4,5,6].map(value=>({value,shielded:value<=2}));
 return {gd,s,actor,target,pawn:s.cybernet.pawnById(target)!,command:(a:Action)=>applyActionWithEvents(s,gd,a)};
}
function reject(f:ReturnType<typeof fixture>,a:Action) {const before=snapshot(f.s),rng=f.s.rng.clone(),r=f.command(a);expect(r.accepted).toBe(false);expect(snapshot(f.s)).toBe(before);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));return r;}

test("Defense spaces: bilingual page21 face-by-face examples and armor precedence share exact profiles",()=>{
 const f=fixture(),pawn=f.pawn,before=JSON.stringify(f.gd),profiles=[];
 for(const space of ["plain","shield","weak"]) {pawn.spaceId=space;profiles.push({space,dice:defenseProfile(f.s,f.gd,pawn)});}
 expect(profiles.map(p=>p.dice.filter(d=>d.shielded).map(d=>d.value))).toEqual([[1,2],[1,2,3],[]]);expect(JSON.stringify(f.gd)).toBe(before);
 f.gd.cards.push({id:"fixture-defense-armor",name:"Synthetic armor",attach:{as:"pawn",slot:"armor",defenseOverride:[1,2,3,4,5,6].map(value=>({value,shielded:true}))}});pawn.attachments=[{cardId:"fixture-defense-armor",slot:"armor",slotRef:"pawn:armor"}];
 for(const space of ["weak","plain"]) {pawn.spaceId=space;profiles.push({space:`armor:${space}`,dice:defenseProfile(f.s,f.gd,pawn)});}
 expect(profiles.at(-2)!.dice.filter(d=>!d.shielded).map(d=>d.value)).toEqual([1,2]);expect(profiles.at(-1)!.dice.every(d=>d.shielded)).toBe(true);
 expect(profiles).toEqual(JSON.parse(readFileSync(new URL("../../../golden/defense-spaces.json",import.meta.url),"utf8")).profiles);
 const state=snapshot(f.s),data=JSON.stringify(f.gd),rng=f.s.rng.clone(),copy=defenseProfile(f.s,f.gd,pawn);copy[0]!.shielded=false;availableActions(f.s,f.gd);expect(snapshot(f.s)).toBe(state);expect(JSON.stringify(f.gd)).toBe(data);expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));expect(effectiveDefenseDice(f.gd,pawn).every(d=>d.shielded)).toBe(true);
});

test("Defense spaces: targeted, split, area and public assigned attacks use the target's current shielding",()=>{
 for(const kind of ["delete","delete-multi","delete-area","roll-delete"] as const) {const f=fixture(),a:Action={type:kind,pawnId:f.actor,...(kind==="delete"?{targetId:f.target}:kind==="delete-multi"?{targetIds:[f.target]}:{})};const r=f.command(a);expect(r.accepted).toBe(true);if(kind==="roll-delete") {expect(f.s.pendingAttack!.roll).toEqual([1]);expect(f.command({type:"assign-delete",targetIds:[f.target]}).accepted).toBe(true);}expect(f.s.cybernet.pawnById(f.target)).toBeUndefined();expect(f.s.eliminated).toContain(f.target);
 }
 const f=fixture();f.pawn.spaceId="plain";expect(f.command({type:"delete",pawnId:f.actor,targetId:f.target}).accepted).toBe(true);expect(f.s.cybernet.pawnById(f.target)).toBeDefined();
});

test("Defense spaces: fixed threat retaliation applies the same profile without consuming RNG",()=>{
 const f=fixture();for(const p of f.gd.pawns.filter(p=>[f.actor,f.target].includes(p.id))) p.defense=[1,2,3,4,5,6].map(value=>({value,shielded:true}));f.gd.blocks.find(b=>b.id==="fixture-defense-board")!.spaces![2]!.modifier={kind:"defense",dice:[{value:4,shielded:false}]};f.gd.threats=[{id:"fixture-defense-threat",name:"Synthetic fixed attack",type:"drone",copies:2,attackDie:4,defense:[{value:6,shielded:false}]}];f.s.threats=[0,1].map(i=>({id:`fixture-threat-${i}`,threatId:"fixture-defense-threat",coord:{q:1,r:0},spaceId:"plain",status:"active" as const}));f.s.pendingThreats={coord:{q:1,r:0},attackerIds:[f.actor],stage:"retaliation"};const rng=f.s.rng.clone();expect(f.command({type:"assign-threat-attack",targetIds:[f.actor,f.target]}).accepted).toBe(true);expect(f.s.cybernet.pawnById(f.target)).toBeUndefined();expect(f.s.cybernet.pawnById(f.actor)).toBeDefined();expect(f.s.rng.clone().intn(100000)).toBe(rng.intn(100000));
});

test("Defense spaces: numeric placeholders and malformed face records reject atomically, preserving committed public rolls",()=>{
 for(const kind of ["numeric","duplicate","wrong-kind","out-of-range"] as const) {const f=fixture(),space=f.gd.blocks.find(b=>b.id==="fixture-defense-board")!.spaces![2]!;if(kind==="numeric") space.modifier={kind:"defense",amount:1};if(kind==="duplicate") space.modifier!.dice!.push({value:1,shielded:true});if(kind==="wrong-kind") space.modifier!.kind="ice";if(kind==="out-of-range") space.modifier!.dice![0]!.value=7;
  expect(()=>defenseProfile(f.s,f.gd,f.pawn)).toThrow();reject(f,{type:"delete",pawnId:f.actor,targetId:f.target});expect(f.command({type:"roll-delete",pawnId:f.actor}).accepted).toBe(true);expect(f.s.pendingAttack!.roll).toEqual([1]);reject(f,{type:"assign-delete",targetIds:[f.target]});expect(f.s.pendingAttack!.roll).toEqual([1]);
 }
 const f=fixture(true),base=effectiveDefenseDice(f.gd,f.pawn);expect(defenseProfile(f.s,f.gd,f.pawn)).toEqual(base);
});
