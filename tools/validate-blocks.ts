/** Cross-record checks beyond the JSON field schema. Provisional geometry stays reviewable. */
import layouts from "../spec/data/block-layouts.json";
export function controlCardSourceErrors(pawns:any[],cards:any[]):string[] {
 const errors=pawns.flatMap(p=>(p.phaseEffects??[]).flatMap((e:any)=>e.trigger!=="begin-turn" || e.kind!=="steal-random-card" || e.amount!==1 || e.scope!=="cybernet" || e.target!=="another-pawn" || e.optional!==true || cards.filter(c=>c.subject?.kind==="pawn" && c.subject.id===p.id).length!==1?[`${p.id}: invalid native pawn phase effect/control card`]:[]));
 return [...errors,...pawns.filter(p=>p.controlMarkerEffect).flatMap(p=>cards.filter(c=>c.subject?.kind==="pawn" && c.subject.id===p.id).length===1?[]:[`${p.id}: a control-marker effect requires one physical control card`])];
}
export function blockSourceErrors(blocks:any[],pawns:any[],controlCards:any[]):string[] {
 const errors:string[]=[],zones=["h1","h2","h3","h4","h5","h6","h7"],edgeZones=["h3","h4","h5","h6","h7","h2"],pawnIds=new Set(pawns.map(p=>p.id));
 for(const b of blocks) {
  const spaces=b.spaces??[],ids=new Set(spaces.map((sp:any)=>sp.id)),used=new Set<string>(),excluded=b.nonPlayableZoneIds??[];
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind==="controller-core" && (trigger!=="underControl" || b.isCentralCore || (e.amount??0)!==0 || (e.minimumControlledPawns??0)!==0 || spaces.filter((sp:any)=>sp.id===e.target && sp.type==="special" && sp.capacity==="unlimited").length!==1))errors.push(`${b.id}: controller Core permission requires one unlimited special landing space and under-control timing`);}
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind==="place-controlled-pawn" && (trigger!=="underControl" || !pawnIds.has(e.target) || (e.amount??0)!==0 || (e.minimumControlledPawns??0)!==0 || spaces.filter((sp:any)=>sp.type==="pawn" && sp.pawnId===e.target).length!==1 || controlCards.filter(c=>c.subject?.kind==="pawn" && c.subject.id===e.target).length!==1))errors.push(`${b.id}: controlled placement requires a matching pawn/space/card and under-control timing`);}
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind==="attack-pawn" && (trigger!=="underControl" || !Number.isInteger(e.amount) || e.amount<1 || e.scope!=="adjacent-blocks" || e.optional!==true || e.target!==undefined || (e.minimumControlledPawns??0)!==0))errors.push(`${b.id}: targeted attack requires under-control timing, adjacent scope, optional choice and positive skulls`);if(e && typeof e==="object" && e.kind!=="attack-pawn" && (e.scope && e.kind!=="discard-pawn-attachments" || e.optional))errors.push(`${b.id}: attack scope/optionality belongs only to a targeted attack`);}
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind==="discard-hands-above-markers" && (trigger!=="underControl" || !Number.isInteger(e.markerThreshold) || e.markerThreshold<1 || e.amount!==undefined || e.target!==undefined || e.scope!==undefined || e.optional!==undefined || e.minimumControlledPawns!==undefined))errors.push(`${b.id}: marker hand discard requires under-control timing and a positive exclusive threshold without other costs/targets`);if(e && typeof e==="object" && e.kind!=="discard-hands-above-markers" && e.markerThreshold!==undefined)errors.push(`${b.id}: misplaced marker hand discard threshold`);}
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind==="discard-pawn-attachments" && (trigger!=="underControl" || e.scope!=="cybernet" || e.optional!==undefined || e.amount!==undefined || e.target!==undefined || e.markerThreshold!==undefined || e.minimumControlledPawns!==undefined))errors.push(`${b.id}: pawn detachment requires mandatory under-control timing and Cybernet scope without extra costs or targets`);}

  const first=b.effects?.inCybernet,second=b.effects?.underControl;
  if([first,second].some(e=>e && ["place-block-bonus","collect-block-bonus"].includes(e.kind))) {
   if(first?.kind!=="place-block-bonus" || first.amount!==1 || second?.kind!=="collect-block-bonus" || second.amount!==undefined || [first,second].some(e=>e && ["target","scope","optional","minimumControlledPawns","markerThreshold"].some(k=>e[k]!==undefined)))errors.push(`${b.id}: block bonus requires one placement counter and collection on control without extra costs/targets`);
  }
  const arrowPairs=new Set<string>();for(const a of b.spaceArrows??[]) {const from=spaces.find((sp:any)=>sp.id===a.from),to=spaces.find((sp:any)=>sp.id===a.to),key=[a.from,a.to].sort().join("/");if(!from || !to || from.id===to.id || !from.neighbors?.includes(to.id) || !to.neighbors?.includes(from.id) || arrowPairs.has(key)) errors.push(`${b.id}: space arrows require distinct adjacent spaces and one direction per link`);arrowPairs.add(key);}
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind==="gain-bonus-all-players" && (trigger!=="inCybernet" || !Number.isInteger(e.amount) || e.amount<1 || e.target!==undefined || e.minimumControlledPawns!==undefined))errors.push(`${b.id}: invalid all-player bonus award`);}
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind==="sacrifice-per-player" && (trigger!=="inCybernet" || e.amount!==1 || !Number.isInteger(e.minimumControlledPawns) || e.minimumControlledPawns<1 || e.target!==undefined))errors.push(`${b.id}: invalid per-player sacrifice threshold/amount/timing`);if(e && typeof e!=="string" && e.kind!=="sacrifice-per-player" && e.minimumControlledPawns!==undefined)errors.push(`${b.id}: misplaced sacrifice threshold`);}
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind==="discard-per-controlled-pawn" && (trigger!=="inCybernet" || e.target!==undefined || e.amount!==undefined && e.amount!==0)) errors.push(`${b.id}: global pawn discard requires placement timing without extra targets or amounts`);}
  if(!b.provisional && ids.size!==spaces.length) errors.push(`${b.id}: gameplay space ids must be unique`);
  for(const sp of spaces) {
   const e=sp.effect;if(e && (sp.type!=="effect" || e.kind!=="discard-attachment" || !["add-on","gadget"].includes(e.cardType) || e.scope!=="cybernet" || e.optional!==true)) errors.push(`${b.id}/${sp.id}: unsupported optional attachment effect`);
   const m=sp.modifier;if(m?.kind==="hand-size" && (!Number.isInteger(m.amount) || m.amount===0 || m.dice!==undefined))errors.push(`${b.id}/${sp.id}: hand-size space requires a nonzero signed amount without defense dice`);if(m?.dice!==undefined && (m.kind!=="defense" || m.amount!==undefined && m.amount!==0 || !Array.isArray(m.dice) || !m.dice.length || new Set(m.dice.map((d:any)=>d.value)).size!==m.dice.length)) errors.push(`${b.id}/${sp.id}: printed defense dice require unique faces and shielding without a numeric adjustment`);
   if(sp.pawnId && !pawnIds.has(sp.pawnId)) errors.push(`${b.id}/${sp.id}: unknown pawn ${sp.pawnId}`);
   for(const z of sp.zoneIds??[]) {if(used.has(z) && !b.provisional) errors.push(`${b.id}: duplicate gameplay zone ${z}`);used.add(z);}
   if(!b.provisional) {
    if(sp.type==="pawn" && !sp.pawnId) errors.push(`${b.id}/${sp.id}: printed pawn spaces need a named pawn`);
    for(const n of sp.neighbors??[]) if(!ids.has(n) || !(spaces.find((s:any)=>s.id===n)?.neighbors??[]).includes(sp.id)) errors.push(`${b.id}/${sp.id}: neighbors must exist and be reciprocal`);
    const expected=spaces.filter((other:any)=>other.id!==sp.id && (sp.zoneIds??[]).some((z:string)=>layouts.layouts[0]!.zones.find(zone=>zone.id===z)?.touches.some(t=>other.zoneIds?.includes(t)))).map((other:any)=>other.id).sort();
    if(JSON.stringify([...(sp.neighbors??[])].sort())!==JSON.stringify(expected)) errors.push(`${b.id}/${sp.id}: neighbors must match touching authored zones`);
    if(m?.kind==="defense" && !m.dice?.length) errors.push(`${b.id}/${sp.id}: verified defense spaces need printed faces`);
   }
  }
  if(new Set(excluded).size!==excluded.length || excluded.some((z:string)=>!zones.includes(z) || used.has(z))) errors.push(`${b.id}: non-playable zones overlap gameplay or are invalid`);
  if(!b.provisional) {
   if(zones.some(z=>!used.has(z) && !excluded.includes(z))) errors.push(`${b.id}: all zones need explicit gameplay or non-playable accounting`);
   if(!Array.isArray(b.iceFaces)) errors.push(`${b.id}: verified blocks require exact printed ICE faces`);
   if(!Array.isArray(b.bonusCorners) || b.bonusCorners.filter(Boolean).length!==b.bonusFragments) errors.push(`${b.id}: bonus count must match exact corners`);
   const derived=edgeZones.map((z,i)=>b.edges?.[i]?spaces.filter((sp:any)=>sp.zoneIds?.includes(z)).map((sp:any)=>sp.id):[]);
   if(JSON.stringify(derived)!==JSON.stringify(b.boundarySpaces)) errors.push(`${b.id}: boundaries must match open edges and authored spaces`);
  }
  for(const trigger of ["inCybernet","underControl"]) {const e=b.effects?.[trigger];if(e?.kind!=="place-neutral-pawn") continue;
   if(trigger!=="inCybernet" || !pawnIds.has(e.target) || spaces.filter((sp:any)=>sp.type==="pawn" && sp.pawnId===e.target).length!==1 || controlCards.filter(c=>c.subject?.kind==="pawn" && c.subject?.id===e.target).length!==1) errors.push(`${b.id}: neutral placement needs a known pawn, one matching space/common-area card, and placement timing`);
  }
 }
 return errors;
}
