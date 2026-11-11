import type {ActionCard} from "../domain/types.ts";

/** Capability gate for attachment-time operations; block placement remains pending. */
export function supportsAttachmentTiming(card:ActionCard):boolean {
  const effects=(card.effects??[]).filter(effect=>effect.trigger==="on-attach");
  return !effects.length || (effects.length===1 && effects[0]!.kind==="gain-target-control" && card.attach?.as==="enemy" && !(card.attach.cost??0) && effects[0]!.amount===undefined && effects[0]!.target===undefined);
}

export function validateAttachmentRules(card:ActionCard):void {
  for(const effect of card.effects??[]) if(effect.kind==="gain-target-control" && (effect.trigger!=="on-attach" || !supportsAttachmentTiming(card))) throw new Error("unsupported gain-target-control timing, target, cost or sequencing");
  if(card.attach?.controllerHand!==undefined && (card.attach.controllerHand!=="face-up" || !["pawn","enemy"].includes(card.attach.as))) throw new Error("unsupported controller hand visibility");
  if(card.attach?.abilityUses?.some(use=>use.ability==="move" && use.dice)) throw new Error("unsupported source rolled movement-use budget; encode die steps as a movement type");
  const forbidden=card.attach?.forbiddenDestinations;
  if(forbidden && (forbidden.length!==1 || forbidden.some(kind=>kind!=="central-core") || !["pawn","enemy"].includes(card.attach!.as))) throw new Error("unsupported attachment movement destination restriction");
}
