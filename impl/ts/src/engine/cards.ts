// Action-card use resolution: playing cards from hand to drive the core
// abilities. Mirrors impl/go/internal/engine/cards.go. See
// DOCS/rules/speedrunners/pawns-abilities-and-cards.md ("SR-CARD-001").
//
// An action card is multi-use; one use is chosen per play. This layer covers the
// ability-activation uses:
//   - Delete / Icebreaker: play ONE card whose `activates` lists the ability.
//   - Search: discard ONE card (any card).
//   - Reboot: discard FOUR cards (any cards).
// The remaining uses — activate card movement, and attach to an element — are
// deferred (they depend on space-to-space movement and the attach system).
//
// Consumed cards move to the discard pile. Illegal plays are rejected WITHOUT
// consuming a card; a legal play (including a Delete/Icebreak that misses)
// consumes it.

import type { Coord, PlacedBlock } from "../domain/hex.ts";
import type { PawnOnBoard } from "../domain/pawn_board.ts";
import type { GameData, GameState, Player } from "../domain/types.ts";
import { deleteAbility, type DeleteResult } from "./combat.ts";
import { icebreakBlock, icebreakPawn, type IcebreakResult } from "./icebreaker.ts";
import { search } from "./abilities.ts";
import { reboot } from "./abilities.ts";

function cardById(gd: GameData, id: string) {
  return gd.cards.find((c) => c.id === id);
}

function cardInHand(p: Player, cardId: string): boolean {
  return p.hand.includes(cardId);
}

function cardActivates(gd: GameData, cardId: string, ability: string): boolean {
  return cardById(gd, cardId)?.activates?.includes(ability as never) ?? false;
}

/** Removes one copy of cardId from the hand and moves it to the discard pile. */
export function consumeCard(s: GameState, p: Player, cardId: string): void {
  const i = p.hand.indexOf(cardId);
  if (i < 0) throw new Error(`card "${cardId}" is not in ${p.id}'s hand`);
  p.hand.splice(i, 1);
  s.discard.push(cardId);
}

function handContainsAll(p: Player, cardIds: string[]): boolean {
  const counts = new Map<string, number>();
  for (const c of p.hand) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const id of cardIds) {
    const n = counts.get(id) ?? 0;
    if (n <= 0) return false;
    counts.set(id, n - 1);
  }
  return true;
}

function requireOwnedActor(s: GameState, playerId: string, pawnId: string): void {
  const pob = s.cybernet.pawnById(pawnId);
  if (!pob) throw new Error(`pawn "${pawnId}" is not on the board`);
  if (pob.ownerId !== playerId) {
    throw new Error(`pawn "${pawnId}" is not controlled by ${playerId}`);
  }
}

function player(s: GameState, playerId: string): Player {
  const p = s.players.find((pl) => pl.id === playerId);
  if (!p) throw new Error(`unknown player "${playerId}"`);
  return p;
}

/** Plays a Delete-capable card to activate the attacker's Delete ability. */
export function playDelete(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  attackerId: string,
  targetId: string,
  extraSkulls = 0,
): DeleteResult {
  const p = player(s, playerId);
  if (!cardInHand(p, cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  if (!cardActivates(gd, cardId, "delete")) throw new Error(`card "${cardId}" cannot activate Delete`);
  requireOwnedActor(s, playerId, attackerId);
  const res = deleteAbility(s, gd, attackerId, targetId, extraSkulls);
  consumeCard(s, p, cardId);
  return res;
}

/** Plays an Icebreaker-capable card to Icebreak the block the attacker occupies. */
export function playIcebreakBlock(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  attackerId: string,
  coord: Coord,
  extraRollDice = 0,
): IcebreakResult {
  const p = player(s, playerId);
  if (!cardInHand(p, cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  if (!cardActivates(gd, cardId, "icebreaker")) throw new Error(`card "${cardId}" cannot activate Icebreaker`);
  requireOwnedActor(s, playerId, attackerId);
  const res = icebreakBlock(s, gd, attackerId, coord, extraRollDice);
  consumeCard(s, p, cardId);
  return res;
}

/** Plays an Icebreaker-capable card to Icebreak a co-located pawn. */
export function playIcebreakPawn(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  attackerId: string,
  targetId: string,
  extraRollDice = 0,
): IcebreakResult {
  const p = player(s, playerId);
  if (!cardInHand(p, cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  if (!cardActivates(gd, cardId, "icebreaker")) throw new Error(`card "${cardId}" cannot activate Icebreaker`);
  requireOwnedActor(s, playerId, attackerId);
  const res = icebreakPawn(s, gd, attackerId, targetId, extraRollDice);
  consumeCard(s, p, cardId);
  return res;
}

/** Discards one card (any card) to activate a pawn's Search ability. */
export function playSearch(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardId: string,
  pawnId: string,
  dir: number,
  rot: number,
): PlacedBlock {
  const p = player(s, playerId);
  if (!cardInHand(p, cardId)) throw new Error(`card "${cardId}" is not in ${playerId}'s hand`);
  requireOwnedActor(s, playerId, pawnId);
  const pb = search(s, gd, pawnId, dir, rot);
  consumeCard(s, p, cardId);
  return pb;
}

/** Discards four cards (any cards) to activate Reboot on an eliminated pawn. */
export function playReboot(
  s: GameState,
  gd: GameData,
  playerId: string,
  cardIds: string[],
  pawnId: string,
): PawnOnBoard {
  const p = player(s, playerId);
  if (cardIds.length !== 4) {
    throw new Error(`Reboot requires discarding exactly 4 cards, got ${cardIds.length}`);
  }
  if (!handContainsAll(p, cardIds)) {
    throw new Error(`${playerId} does not hold all 4 cards to discard`);
  }
  const pob = reboot(s, gd, pawnId, playerId);
  for (const c of cardIds) consumeCard(s, p, c);
  return pob;
}
