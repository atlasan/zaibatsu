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
// DEFERRED: applying attached effects during resolution (armor replacing defense
// dice, weapon/gadget/ability/movement grants). Stored + cleaned up here; wiring
// their effects into combat/movement is a later task.

import { type Coord } from "../domain/hex.ts";
import { slotFilled, type Attachment, type PawnOnBoard } from "../domain/pawn_board.ts";
import { blockById, pawnById, type ActionCard, type GameData, type GameState, type Player } from "../domain/types.ts";
import { iceFaces } from "./icebreaker.ts";

function player(s: GameState, playerId: string): Player {
  const p = s.players.find((pl) => pl.id === playerId);
  if (!p) throw new Error(`unknown player "${playerId}"`);
  return p;
}

function cardById(gd: GameData, id: string): ActionCard | undefined {
  return gd.cards.find((c) => c.id === id);
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

function hasSlot(gd: GameData, pawnId: string, slot: string): boolean {
  return pawnById(gd, pawnId)?.slots?.includes(slot as never) ?? false;
}

function attachToPawnElement(s: GameState, gd: GameData, p: Player, card: ActionCard, tgt: PawnOnBoard): void {
  const slot = card.attach?.slot;
  if (!slot) throw new Error(`card "${card.id}" has no slot to attach into`);
  if (!hasSlot(gd, tgt.pawnId, slot)) throw new Error(`pawn "${tgt.pawnId}" has no ${slot} slot`);
  if (slotFilled(tgt, slot)) throw new Error(`pawn "${tgt.pawnId}" already has its ${slot} slot filled`);
  const paid = payAttachCost(p, card.attach?.cost ?? 0);
  try {
    removeCardFromHand(p, card.id);
  } catch (e) {
    p.bonusCounters += paid;
    throw e;
  }
  const att: Attachment = { cardId: card.id, slot, bonusPaid: paid };
  (tgt.attachments ??= []).push(att);
}

/** Attaches a `pawn` card to a pawn the player controls. */
export function attachToPawn(s: GameState, gd: GameData, playerId: string, cardId: string, targetPawnId: string): void {
  const p = player(s, playerId);
  if (!p.hand.includes(cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  const card = cardById(gd, cardId);
  if (!card?.attach || card.attach.as !== "pawn") throw new Error(`card "${cardId}" cannot attach to a pawn you control`);
  const tgt = s.cybernet.pawnById(targetPawnId);
  if (!tgt) throw new Error(`pawn "${targetPawnId}" is not on the board`);
  if (tgt.ownerId !== playerId) throw new Error(`pawn "${targetPawnId}" is not controlled by ${playerId}`);
  attachToPawnElement(s, gd, p, card, tgt);
}

/** Attaches an `enemy` card to an opponent's pawn co-located with an acting pawn. */
export function attachToEnemy(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  actorPawnId: string,
  targetPawnId: string,
): void {
  const p = player(s, playerId);
  if (!p.hand.includes(cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  const card = cardById(gd, cardId);
  if (!card?.attach || card.attach.as !== "enemy") throw new Error(`card "${cardId}" is not an enemy attachment`);
  const actor = requireOwnedActor(s, playerId, actorPawnId);
  const tgt = s.cybernet.pawnById(targetPawnId);
  if (!tgt) throw new Error(`target pawn "${targetPawnId}" is not on the board`);
  if (tgt.ownerId === playerId) throw new Error("enemy attachment must target another player's pawn");
  if (actor.coord.q !== tgt.coord.q || actor.coord.r !== tgt.coord.r) {
    throw new Error("acting pawn and target are not in the same block");
  }
  attachToPawnElement(s, gd, p, card, tgt);
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
  const paid = payAttachCost(p, card.attach.cost ?? 0);
  try {
    removeCardFromHand(p, card.id);
  } catch (e) {
    p.bonusCounters += paid;
    throw e;
  }
  (pb.attachments ??= []).push({ cardId: card.id, slot: card.attach.slot, bonusPaid: paid });
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
    for (const c of cardById(gd, a.cardId)?.attach?.class ?? []) add(c);
  }
  return out;
}
