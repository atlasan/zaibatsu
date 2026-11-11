import type {Block} from "../domain/types.ts";

/** Arrows decorate an existing physical neighbor link; their reverse traversal is barred. */
export function validateSpaceArrows(block:Block):void {
 const seen=new Set<string>();
 for(const arrow of block.spaceArrows??[]) {
  const from=block.spaces?.find(s=>s.id===arrow.from),to=block.spaces?.find(s=>s.id===arrow.to),key=[arrow.from,arrow.to].sort().join("/");
  if(!from || !to || from.id===to.id || !from.neighbors?.includes(to.id) || !to.neighbors?.includes(from.id) || seen.has(key)) throw new Error("space arrows require distinct adjacent spaces and one direction per link");
  seen.add(key);
 }
}

export function arrowAllowsStep(block:Block,from:string,to:string):boolean {
 return !block.spaceArrows?.some(arrow=>arrow.from===to && arrow.to===from);
}
