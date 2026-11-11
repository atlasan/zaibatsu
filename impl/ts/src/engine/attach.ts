import {supportsAttachmentTiming,validateAttachmentRules} from "./attachment-timing.ts";
import {newAttachmentInstance,retainDiscardedUseCards,requireResolvedCardReuse} from "./use-markers.ts";
import { gainPawnControl } from "./control-markers.ts";
import type {EngineEvent} from "./index.ts";
// Card attachment: attaching action cards to pawns, enemy pawns, and blocks.
// Mirrors impl/go/internal/engine/attach.go. See DOCS/rules/speedrunners/pawns-abilities-and-cards.md
// ("Attaching cards", "Pawn attachment cards"). Backlog: card attachment.
//
// A card with an `attach` spec attaches to the element kind it names
// (pawn = your own, enemy = an opponent's pawn, block = an information block).
// Enforced: card in hand + matching `attach.as`; acting pawn owned by the player
// and co-located with the target (enemy) / on the block; a pawn/enemy target must
// expose the required slot and it must be empty; a block must have an ICE value;
// a bonus-counter cost must be affordable (counters move onto the attachment and
// return to the owner when it is discarded). The attached card leaves the hand
// and becomes part of the element — it is not discarded until elimination /
// takeover (see discardAttachments).
//
// PARTIAL RUNTIME RESOLUTION: ability grants/removals, granted slots,
// recycle draw/hand modifiers, ICE-face / ICE-dice / Black-ICE modifiers, and
// attachment-granted movement activation are now wired. Armor-style defense
// replacement, own-class grants, target-class eligibility and movement-use
// budgets and provider-slot cascades execute. Broader effects remain later work.

import { type Coord } from "../domain/hex.ts";
import { slotFilled, type Attachment, type PawnOnBoard } from "../domain/pawn_board.ts";
import { blockById, pawnById, type ActionCard, type DefenseDie, type GameData, type GameState, type Player } from "../domain/types.ts";
import { availableAttachmentSlots, pawnAttachmentSlots } from "./attachment-slots.ts";
import { iceFaces } from "./icebreaker.ts";

function player(s: GameState, playerId: string): Player {
  const p = s.players.find((pl) => pl.id === playerId);
  if (!p) throw new Error(`unknown player "${playerId}"`);
  return p;
}

function cardById(gd: GameData, id: string): ActionCard | undefined {
  return gd.cards.find((c) => c.id === id);
}

function attachmentCards(gd: GameData, atts: Attachment[] | undefined): ActionCard[] {
  return (atts ?? [])
    .map((att) => cardById(gd, att.cardId))
    .filter((card): card is ActionCard => !!card);
}

/** Removes one copy of cardId from the hand without discarding it. */
function removeCardFromHand(p: Player, cardId: string): void {
  const i = p.hand.indexOf(cardId);
  if (i < 0) throw new Error(`card "${cardId}" is not in ${p.id}'s hand`);
  p.hand.splice(i, 1);
}

/**
 * Moves a pawn's attached cards to the discard pile and returns any bonus
 * counters they held to the pawn's current owner. Used on elimination / takeover.
 */
export function discardAttachments(s: GameState, pob: PawnOnBoard): void {
  if (!pob.attachments || pob.attachments.length === 0) return;
  retainDiscardedUseCards(s,pob.attachments);
  const owner = s.players.find((p) => p.id === pob.ownerId);
  for (const a of pob.attachments) {
    s.discard.push(a.cardId);
    if (a.bonusPaid && owner) owner.bonusCounters += a.bonusPaid;
  }
  pob.attachments = [];
}

function requireOwnedActor(s: GameState, playerId: string, pawnId: string): PawnOnBoard {
  const pob = s.cybernet.pawnById(pawnId);
  if (!pob) throw new Error(`pawn "${pawnId}" is not on the board`);
  if (pob.ownerId !== playerId) throw new Error(`pawn "${pawnId}" is not controlled by ${playerId}`);
  return pob;
}

function payAttachCost(p: Player, cost: number): number {
  if (cost > p.bonusCounters) {
    throw new Error(`player ${p.id} cannot afford the ${cost} bonus-counter cost`);
  }
  p.bonusCounters -= cost;
  return cost;
}

export function effectivePawnSlots(gd: GameData, pob: PawnOnBoard): string[] {
  if (gd.regressionFixture!=="provisional-v1") return [...new Set(pawnAttachmentSlots(gd,pob).map(slot=>slot.slot))];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (slot: string | undefined) => {
    if (slot && !seen.has(slot)) {
      seen.add(slot);
      out.push(slot);
    }
  };
  for (const slot of pawnById(gd, pob.pawnId)?.slots ?? []) add(slot);
  for (const card of attachmentCards(gd, pob.attachments)) {
    for (const slot of card.attach?.grantsSlot ?? []) add(slot);
  }
  return out;
}

export function playerAttachmentModifiers(
  s: GameState,
  gd: GameData,
  playerId: string,
): { drawModifier: number; handModifier: number } {
  let drawModifier = 0;
  let handModifier = 0;
  for (const pawn of s.cybernet.pawns.filter((p) => p.ownerId === playerId)) {
    for (const card of attachmentCards(gd, pawn.attachments)) {
      drawModifier += card.attach?.drawModifier ?? 0;
      handModifier += card.attach?.handModifier ?? 0;
    }
  }
  for (const block of s.cybernet.blocks.filter((b) => b.ownerId === playerId)) {
    for (const card of attachmentCards(gd, block.attachments)) {
      drawModifier += card.attach?.drawModifier ?? 0;
      handModifier += card.attach?.handModifier ?? 0;
    }
  }
  return { drawModifier, handModifier };
}

export function effectiveDefenseDice(gd: GameData, pob: PawnOnBoard): DefenseDie[] {
  const base = pawnById(gd, pob.pawnId)?.defense ?? [];
  let override: DefenseDie[] | undefined;
  for (const card of attachmentCards(gd, pob.attachments)) if (card.attach?.defenseOverride?.length) override = card.attach.defenseOverride;
  return (override ?? base).map(die=>({...die}));
}

export function targetIceNullified(
  gd: GameData,
  atts: { cardId: string }[] | undefined,
): boolean {
  return attachmentCards(gd, atts).some((card) => card.attach?.nullifiesIce === true);
}

function attachToPawnElement(s: GameState, gd: GameData, p: Player, card: ActionCard, tgt: PawnOnBoard, slotRef?:string, events:EngineEvent[]=[]): void {
  requireResolvedCardReuse(s,card.id);
  validateAttachmentRules(card);
  if(!supportsAttachmentTiming(card)) throw new Error("attachment-time effects require unsupported placement/choice resolution");
  const slot = card.attach?.slot;
  if (!slot) throw new Error(`card "${card.id}" has no slot to attach into`);
  if (gd.regressionFixture !== "provisional-v1") {
    const classes = effectivePawnClasses(gd, tgt);
    if (card.attach?.forbiddenClasses?.some(value => classes.includes(value))) throw new Error(`card "${card.id}" forbids the target pawn's class`);
    if (card.attach?.class?.length && !card.attach.class.some(value => classes.includes(value))) throw new Error(`card "${card.id}" requires a matching target class`);
  }
  if (!effectivePawnSlots(gd, tgt).includes(slot)) throw new Error(`pawn "${tgt.pawnId}" has no ${slot} slot`);
  let selected:string|undefined;
  if(gd.regressionFixture==="provisional-v1") {
    if(slotRef) throw new Error("physical slot references require the source engine");
    if(slotFilled(tgt,slot)) throw new Error(`pawn "${tgt.pawnId}" already has its ${slot} slot filled`);
  } else {
    const free=availableAttachmentSlots(gd,tgt,slot);
    if(slotRef) {if(!free.some(location=>location.ref===slotRef)) throw new Error("the selected attachment slot is unavailable");selected=slotRef;}
    else {if(!free.length) throw new Error(`pawn "${tgt.pawnId}" has no empty ${slot} slot`);if(free.length>1) throw new Error("choose a physical attachment slot");selected=free[0]!.ref;}
  }
  const paid = payAttachCost(p, card.attach?.cost ?? 0);
  try {
    removeCardFromHand(p, card.id);
  } catch (e) {
    p.bonusCounters += paid;
    throw e;
  }
  const att: Attachment = { cardId: card.id, slot, ...(selected?{slotRef:selected}:{}), bonusPaid: paid,...(s.rulesVersion?{instanceId:newAttachmentInstance(s)}:{}) };
  (tgt.attachments ??= []).push(att);
  if(card.effects?.some(effect=>effect.trigger==="on-attach" && effect.kind==="gain-target-control")) {
    for(const attached of tgt.attachments) events.push({type:"card-discarded",cardId:attached.cardId});
    discardAttachments(s,tgt);gainPawnControl(s,gd,tgt.pawnId,p.id,events);
  }
}

/** Attaches a `pawn` card to a pawn the player controls. */
export function attachToPawn(s: GameState, gd: GameData, playerId: string, cardId: string, targetPawnId: string, slotRef?:string): void {
  requireResolvedCardReuse(s,cardId);
  const p = player(s, playerId);
  if (!p.hand.includes(cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  const card = cardById(gd, cardId);
  if (!card?.attach || card.attach.as !== "pawn") throw new Error(`card "${cardId}" cannot attach to a pawn you control`);
  const tgt = s.cybernet.pawnById(targetPawnId);
  if (!tgt) throw new Error(`pawn "${targetPawnId}" is not on the board`);
  if (tgt.ownerId !== playerId) throw new Error(`pawn "${targetPawnId}" is not controlled by ${playerId}`);
  attachToPawnElement(s, gd, p, card, tgt, slotRef);
}

/** Attaches an `enemy` card to an opponent's pawn co-located with an acting pawn. */
export function attachToEnemy(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  actorPawnId: string,
  targetPawnId: string,
  slotRef?:string,
  events:EngineEvent[]=[],
): void {
  const p = player(s, playerId);
  if (!p.hand.includes(cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  const card = cardById(gd, cardId);
  if (!card?.attach || card.attach.as !== "enemy") throw new Error(`card "${cardId}" is not an enemy attachment`);
  const actor = requireOwnedActor(s, playerId, actorPawnId);
  const tgt = s.cybernet.pawnById(targetPawnId);
  if (!tgt) throw new Error(`target pawn "${targetPawnId}" is not on the board`);
  if (tgt.ownerId === playerId) throw new Error("enemy attachment must target another player's pawn");
  if (gd.regressionFixture!=="provisional-v1" && !s.players.some(player=>player.id===tgt.ownerId)) throw new Error("enemy attachments require another player's controlled pawn");
  if (actor.coord.q !== tgt.coord.q || actor.coord.r !== tgt.coord.r) {
    throw new Error("acting pawn and target are not in the same block");
  }
  attachToPawnElement(s, gd, p, card, tgt, slotRef,events);
}

/** Attaches a `block` card to the block an acting pawn occupies. */
export function attachToBlock(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  actorPawnId: string,
  coord: Coord,
): void {
  const p = player(s, playerId);
  if (!p.hand.includes(cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  const card = cardById(gd, cardId);
  if (!card?.attach || card.attach.as !== "block") throw new Error(`card "${cardId}" is not a block attachment`);
  if (gd.regressionFixture !== "provisional-v1" && (card.attach.class?.length || card.attach.forbiddenClasses?.length)) throw new Error("target-class restrictions require a pawn or enemy attachment");
  const actor = requireOwnedActor(s, playerId, actorPawnId);
  if (actor.coord.q !== coord.q || actor.coord.r !== coord.r) {
    throw new Error("acting pawn is not on the target block");
  }
  const pb = s.cybernet.at(coord);
  if (!pb) throw new Error(`no block at (${coord.q},${coord.r})`);
  const def = blockById(gd, pb.blockId);
  if (!def) throw new Error(`unknown block "${pb.blockId}"`);
  if (iceFaces(def.iceValue).length === 0) {
    throw new Error(`cannot attach to block "${pb.blockId}": it has no ICE value`);
  }
  if(!supportsAttachmentTiming(card)) throw new Error("attachment-time effects require unsupported placement/choice resolution");
  const paid = payAttachCost(p, card.attach.cost ?? 0);
  try {
    removeCardFromHand(p, card.id);
  } catch (e) {
    p.bonusCounters += paid;
    throw e;
  }
  (pb.attachments ??= []).push({ cardId: card.id, slot: card.attach.slot, bonusPaid: paid,...(s.rulesVersion?{instanceId:newAttachmentInstance(s)}:{}) });
}

/** The pawn's base classes plus any granted by attached cards (deduplicated). */
export function effectivePawnClasses(gd: GameData, pob: PawnOnBoard): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (c: string | undefined) => {
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };
  for (const c of pawnById(gd, pob.pawnId)?.class ?? []) add(c);
  for (const a of pob.attachments ?? []) {
    const card=cardById(gd,a.cardId);
    for (const c of card?.class??[]) add(c);
    if (gd.regressionFixture === "provisional-v1") for (const c of card?.attach?.class ?? []) add(c);
  }
  return out;
}
