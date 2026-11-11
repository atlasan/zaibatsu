import type {Ability,Attach,GameData,Pawn} from "../domain/types.ts";

export function validateDeleteAttachment(attach:Attach|undefined):void {
  if(!attach) return;
  if(attach.delete!==undefined) {
    if(!attach.delete || !Number.isInteger(attach.delete.skulls) || attach.delete.skulls<1 || (attach.delete.activation!==undefined && !["card","once-per-turn"].includes(attach.delete.activation))) throw new Error("unsupported or malformed printed Delete attribute");
    if(!["pawn","enemy"].includes(attach.as)) throw new Error("printed Delete attributes require a pawn attachment");
    if(attach.grants?.includes("delete") || attach.abilityUses?.some(use=>use.ability==="delete")) throw new Error("printed Delete attributes cannot mix with legacy Delete grants/uses");
  }
  for(const use of attach.abilityUses??[]) if(use.ability==="delete" && (use.perTurn!==undefined || use.dice!==undefined || !["card","once-per-turn"].includes(use.activation??"") || !attach.grants?.includes("delete"))) throw new Error("unsupported Delete use budget; encode printed activation badges explicitly");
}

export interface DeleteProfile {skulls:number;card:boolean;freeActivators:number;cancelled:boolean;}

/** Printed strength and activation badges are independent contributions. */
export function deleteProfile(gd:GameData,pawn:Pawn,atts:{cardId:string}[]=[]):DeleteProfile {
  const native=pawn.abilities?.find(ability=>ability.ability==="delete");
  const cards=atts.map(att=>gd.cards.find(card=>card.id===att.cardId));
  const cancelled=cards.some(card=>card?.attach?.removes?.includes("delete")) || native?.activation==="none";
  if(gd.regressionFixture==="provisional-v1") {
    const ability=native??(cards.some(card=>card?.attach?.grants?.includes("delete"))?{activation:"card",skulls:1}:undefined);
    return {skulls:ability?Math.max(1,ability.skulls??1):0,card:!cancelled&&ability?.activation==="card",freeActivators:!cancelled&&ability?.activation==="once-per-turn"?1:0,cancelled};
  }
  let skulls=native?Math.max(1,native.skulls??1):0,card=native?.activation==="card",freeActivators=native?.activation==="once-per-turn"?1:0;
  for(const definition of cards) {
    const attach=definition?.attach;
    if(attach?.delete) {
      skulls+=attach.delete.skulls;
      card ||= attach.delete.activation==="card";
      if(attach.delete.activation==="once-per-turn") freeActivators++;
    } else if(attach?.grants?.includes("delete")) {
      const uses=attach.abilityUses?.filter(use=>use.ability==="delete")??[];
      if(!uses.length) card=true;
      for(const use of uses) {card ||= use.activation==="card";if(use.activation==="once-per-turn") freeActivators++;}
    }
  }
  if((card||freeActivators) && !skulls) skulls=1; // Explicit compatibility grants without printed strength.
  return {skulls,card:!cancelled&&card,freeActivators:cancelled?0:freeActivators,cancelled};
}

/** Multiple free badges are an unresolved EN/ES conflict, not a selected policy. */
export function deleteActivationOptions(gd:GameData,pawn:Pawn,atts:{cardId:string}[]=[]):Ability[] {
  const profile=deleteProfile(gd,pawn,atts),options:Ability[]=[];
  if(profile.card) options.push({ability:"delete",activation:"card",skulls:profile.skulls});
  if(profile.freeActivators===1) options.push({ability:"delete",activation:"once-per-turn",skulls:profile.skulls});
  return options;
}

export function requireDeleteActivation(gd:GameData,pawn:Pawn,atts:{cardId:string}[]|undefined,activation:"card"|"once-per-turn"):Ability {
  const profile=deleteProfile(gd,pawn,atts);
  if(activation==="once-per-turn" && profile.freeActivators>1) throw new Error("multiple once-per-turn Delete activators conflict between English and Spanish; this combination remains provisional");
  const ability=deleteActivationOptions(gd,pawn,atts).find(option=>option.activation===activation);
  if(!ability) throw new Error(`pawn "${pawn.id}" cannot activate Delete by ${activation}`);
  return ability;
}
