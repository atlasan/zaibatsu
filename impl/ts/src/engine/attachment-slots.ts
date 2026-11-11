import {retainDiscardedUseCards} from "./use-markers.ts";
import type {Attachment, PawnOnBoard} from "../domain/pawn_board.ts";
import {pawnById, type GameData, type GameState} from "../domain/types.ts";
import type {EngineEvent} from "./index.ts";

export interface PawnAttachmentSlot {
  slot:string;
  ref:string;
  occupied:boolean;
  providerCardId?:string;
  attachmentIndex?:number;
}

/** Physical slot locations rooted in the pawn. Grants cannot bootstrap cycles.
 * Missing references are inferred only for old hand-authored fixtures, in array order.
 * This query never annotates or otherwise changes its input. */
export function pawnAttachmentSlots(gd:GameData,pawn:PawnOnBoard):PawnAttachmentSlot[] {
  const slots:PawnAttachmentSlot[]=[];
  const definition=pawnById(gd,pawn.pawnId);
  if(!definition) return slots;
  const cards=(pawn.attachments??[]).map(att=>gd.cards.find(card=>card.id===att.cardId));
  if(gd.regressionFixture==="provisional-v1") {
    const kinds=[...(definition.slots??[]),...cards.flatMap(card=>card?.attach?.grantsSlot??[])];
    for(const slot of new Set(kinds)) {
      const index=pawn.attachments?.findIndex(att=>att.slot===slot)??-1;
      slots.push({slot,ref:`legacy:${slot}`,occupied:index>=0,...(index>=0?{attachmentIndex:index}:{})});
    }
    return slots;
  }
  for(const slot of new Set(definition.slots??[])) slots.push({slot,ref:`pawn:${slot}`,occupied:false});
  const remaining=new Set((pawn.attachments??[]).map((_,index)=>index));
  let progress=true;
  while(progress) {
    progress=false;
    for(const index of remaining) {
      const att=pawn.attachments![index]!,kind=att.slot??cards[index]?.attach?.slot;
      const location=slots.find(slot=>!slot.occupied && slot.slot===kind && (!att.slotRef || slot.ref===att.slotRef));
      if(!location) continue;
      location.occupied=true;location.attachmentIndex=index;remaining.delete(index);progress=true;
      for(const slot of cards[index]?.attach?.grantsSlot??[]) slots.push({slot,ref:`${location.ref}/${slot}`,occupied:false,providerCardId:att.cardId});
    }
  }
  return slots;
}

export function availableAttachmentSlots(gd:GameData,pawn:PawnOnBoard,kind?:string):PawnAttachmentSlot[] {
  return pawnAttachmentSlots(gd,pawn).filter(slot=>!slot.occupied && (!kind || slot.slot===kind));
}

/** Remove the selected physical attachment and its descendants. Cards cannot
 * move to another slot merely because a provider is being discarded (p.33). */
export function discardPawnAttachment(s:GameState,gd:GameData,pawn:PawnOnBoard,index:number,events:EngineEvent[]=[]):Attachment[] {
  if(!pawn.attachments?.[index]) return [];
  const slots=pawnAttachmentSlots(gd,pawn),source=slots.find(slot=>slot.attachmentIndex===index);
  const dependent=gd.regressionFixture==="provisional-v1" || !source ? [] : slots.filter(slot=>slot.attachmentIndex!==undefined && slot.ref.startsWith(source.ref+"/"))
    .sort((a,b)=>a.ref.split("/").length-b.ref.split("/").length || a.attachmentIndex!-b.attachmentIndex!).map(slot=>slot.attachmentIndex!);
  const removed=[index,...dependent].map(at=>pawn.attachments![at]!),indices=new Set([index,...dependent]);
  retainDiscardedUseCards(s,removed);
  pawn.attachments=pawn.attachments.filter((_,at)=>!indices.has(at));
  const owner=s.players.find(player=>player.id===pawn.ownerId);
  for(const att of removed) {
    s.discard.push(att.cardId);if(owner) owner.bonusCounters+=att.bonusPaid??0;
    events.push({type:"card-discarded",cardId:att.cardId});
  }
  return removed;
}
