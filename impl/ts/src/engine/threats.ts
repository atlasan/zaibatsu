import {grantBonusCounters} from "./bonus-pool.ts";
import {defenseProfile} from "./defense.ts";
import {abilityUseSpent,spendAbilityUse} from "./use-markers.ts";
import {deleteProfile,requireDeleteActivation} from "./delete-profile.ts";
// Shadowraiders pp.20–25: public attack rolls, threat activation and fixed retaliation.
// Mirrors threats.go. Component definitions and defense faces are shared data.
import { coordEqual, coordKey, type Coord } from "../domain/hex.ts";
import { currentPlayer, playerById, pawnById, type GameData, type GameState } from "../domain/types.ts";
import { attackRoll, abilityUsedKey, defeats, effectiveAbility, effectiveAttackSkulls, eliminatePawn } from "./combat.ts";
import { consumeCard } from "./cards.ts";

export function deployThreats(s: GameState, gd: GameData, coord: Coord): void {
  const pb = s.cybernet.at(coord);
  const block = gd.blocks.find(b => b.id === pb?.blockId);
  if (!block) throw new Error("unknown threat block");
  for (const space of block.spaces ?? []) {
    const id = `${coordKey(coord)}:${space.id}`;
    if (s.clearedEvents?.includes(id)) continue;
    if ((s.threats ?? []).some(t => t.id === id)) continue;
    const threatId = space.threatId ?? (space.type as string === "event" ? s.threatPile?.pop() : undefined);
    if (!threatId) continue;
    const def = gd.threats?.find(t => t.id === threatId);
    if (!def?.defense?.length || !def.attackDie) throw new Error(`threat "${threatId}" needs sourced combat data`);
    (s.threats ??= []).push({ id, threatId, coord: { ...coord }, spaceId: space.id, status: "inactive" });
  }
}

export function threatsAt(s: GameState, coord: Coord) {
  return (s.threats ?? []).filter(t => coordEqual(t.coord, coord));
}

export function awakenThreats(s: GameState, gd: GameData, pawnId: string, stealth = false): boolean {
  const pawn = s.cybernet.pawnById(pawnId);
  if (!pawn) return false;
  const definition = pawnById(gd, pawnId);
  if (stealth || definition?.special === "does-not-activate-threats") return false;
  const threats = threatsAt(s, pawn.coord).filter(t => t.status !== "eliminated");
  if (!threats.length) return false;
  for (const threat of threats) threat.status = "active";
  s.pendingThreats = { coord: { ...pawn.coord }, attackerIds: [], stage: "response" };
  return true;
}

/** Pay once, roll once, then let the player assign the known faces. */
export function rollDelete(s: GameState, gd: GameData, pawnId: string, cardId?: string, joint = false,playerId=currentPlayer(s).id): { roll: number[] } {
  if (s.pendingAttack) throw new Error("assign the previous roll first");
  if (s.pendingThreats?.stage === "retaliation") throw new Error("resolve the threat attack first");
  const player = playerById(s,playerId);
  if(!player) throw new Error("unknown attacking controller");
  const actor = s.cybernet.pawnById(pawnId);
  if (!actor || actor.ownerId !== player.id) throw new Error("select a controlled attacker");
  if (s.pendingThreats && !coordEqual(s.pendingThreats.coord, actor.coord)) throw new Error("respond in the threatened block");
  const source=gd.regressionFixture!=="provisional-v1";
  if(source && joint && !threatsAt(s,actor.coord).some(threat=>threat.status!=="eliminated")) throw new Error("joint attacks require threats in the block");
  const activation=cardId?"card":"once-per-turn";
  if(source) requireDeleteActivation(gd,pawnById(gd,pawnId)!,actor.attachments,activation);
  const attackers = joint ? s.cybernet.pawns.filter(p => p.ownerId === player.id && coordEqual(p.coord, actor.coord) && (source ? deleteProfile(gd,pawnById(gd,p.pawnId)!,p.attachments).skulls>0 : effectiveAbility(gd, pawnById(gd, p.pawnId)!, p.attachments, "delete"))) : [actor];
  let skulls = 0;
  for (const p of attackers) {
    const def = pawnById(gd, p.pawnId);
    const ability = def && (source ? {ability:"delete",activation:p.pawnId===pawnId?activation:"none",skulls:deleteProfile(gd,def,p.attachments).skulls} : effectiveAbility(gd, def, p.attachments, "delete"));
    if (!ability || (!source && ability.activation === "none")) throw new Error("attacker has no Delete ability");
    const key = abilityUsedKey("delete", p.pawnId);
    if (ability.activation === "once-per-turn" && abilityUseSpent(s,gd,player,p.pawnId,"delete")) throw new Error("Delete already used this turn");
    if (!source && !cardId && ability.activation !== "once-per-turn") throw new Error("Delete requires a matching card");
    skulls += effectiveAttackSkulls(gd,s,p.pawnId,ability.skulls ?? 1);
  }
  if (cardId) {
    if (!player.hand.includes(cardId) || !gd.cards.find(c => c.id === cardId)?.activates?.includes("delete")) throw new Error("select a Delete card in hand");
    consumeCard(s, player, cardId);
  }
  for (const p of attackers) {
    const ability = source ? {activation:p.pawnId===pawnId?activation:"none"} : effectiveAbility(gd, pawnById(gd, p.pawnId)!, p.attachments, "delete")!;
    if (ability.activation === "once-per-turn") spendAbilityUse(s,gd,player,p.pawnId,"delete");
  }
  const roll = attackRoll(s.rng, skulls);
  awakenThreats(s, gd, pawnId);
  s.pendingAttack = { playerId: player.id, attackerIds: attackers.map(p => p.pawnId), coord: { ...actor.coord }, roll };
  if (s.pendingThreats) s.pendingThreats.attackerIds = attackers.map(p => p.pawnId);
  return { roll };
}

export function assignDelete(s: GameState, gd: GameData, targetIds: string[]): void {
  const pending = s.pendingAttack;
  if (!pending || !playerById(s,pending.playerId)) throw new Error("no attack roll to assign");
  if (targetIds.length !== pending.roll.length) throw new Error("assign every rolled die; use an empty target to discard it");
  const hits = new Set<string>();
  for (let i = 0; i < targetIds.length; i++) {
    const id = targetIds[i]!;
    if (!id) continue;
    const pawn = s.cybernet.pawnById(id);
    const threat = threatsAt(s, pending.coord).find(t => t.id === id && t.status !== "eliminated");
    if (pawn && coordEqual(pawn.coord, pending.coord) && !pending.attackerIds.includes(id)) {
      if (defeats([pending.roll[i]!], defenseProfile(s,gd,pawn))) hits.add(id);
    } else if (threat) {
      const def = gd.threats?.find(t => t.id === threat.threatId);
      if (!def?.defense?.length) throw new Error("threat has no defense data");
      if (defeats([pending.roll[i]!], def.defense)) hits.add(id);
    } else throw new Error("each target must be in the attack block");
  }
  for (const id of hits) {
    const threat = (s.threats ?? []).find(t => t.id === id);
    if (threat) threat.status = "eliminated";
    else eliminatePawn(s, id, gd);
  }
  delete s.pendingAttack;
  if (s.pendingThreats) {
    if (threatsAt(s, pending.coord).some(t => t.status === "active")) s.pendingThreats.stage = "retaliation";
    else delete s.pendingThreats;
  }
}

/** The active player allocates fixed dice, respecting own-pawn/attacker priority. */
export function assignThreatAttack(s: GameState, gd: GameData, targetIds: string[]): { roll: number[] } {
  const pending = s.pendingThreats;
  if (!pending || s.pendingAttack) throw new Error("no threat attack is ready");
  const active = threatsAt(s, pending.coord).filter(t => t.status === "active");
  if (targetIds.length !== active.length) throw new Error("assign one target per active threat");
  const own = s.cybernet.pawnsAt(pending.coord).filter(p => p.ownerId === currentPlayer(s).id).map(p => p.pawnId);
  const attacked = new Set(targetIds);
  if (targetIds.length >= own.length && own.some(id => !attacked.has(id))) throw new Error("assign at least one die to each controlled pawn first");
  if (targetIds.length < own.length && targetIds.some(id => !own.includes(id))) throw new Error("controlled pawns take priority");
  const attackers = pending.attackerIds.filter(id => own.includes(id));
  if (targetIds.length < own.length && targetIds.length >= attackers.length && attackers.some(id => !attacked.has(id))) throw new Error("attacking pawns take priority");
  if (targetIds.length < attackers.length && targetIds.some(id => !attackers.includes(id))) throw new Error("attacking pawns take priority");
  if (new Set(targetIds.filter(id => own.includes(id))).size < Math.min(own.length, targetIds.length)) throw new Error("distribute one die per controlled pawn before concentrating");
  const hits = new Set<string>();
  const roll = active.map(t => gd.threats?.find(def => def.id === t.threatId)?.attackDie ?? 0);
  for (let i = 0; i < targetIds.length; i++) {
    const target = s.cybernet.pawnById(targetIds[i]!);
    if (!target || !coordEqual(target.coord, pending.coord)) throw new Error("threat targets must be pawns in this block");
    if (!roll[i]) throw new Error("threat has no attack die");
    if (defeats([roll[i]!], defenseProfile(s,gd,target))) hits.add(target.pawnId);
  }
  for (const id of hits) eliminatePawn(s, id, gd);
  for (const t of active) t.status = "inactive";
  delete s.pendingThreats;
  return { roll };
}

export function collectThreat(s: GameState, gd: GameData, pawnId: string, targetId: string): void {
  const pawn = s.cybernet.pawnById(pawnId);
  const target = s.threats?.find(t => t.id === targetId);
  if (!pawn || pawn.ownerId !== currentPlayer(s).id || !target || !coordEqual(pawn.coord, target.coord)) throw new Error("select a defeated token in your pawn's block");
  if (target.status !== "eliminated" || gd.threats?.find(t => t.id === target.threatId)?.type !== "token") throw new Error("only defeated threat tokens can be collected");
  if (threatsAt(s, target.coord).some(t => t.status !== "eliminated")) throw new Error("clear the other threats before collecting");
  grantBonusCounters(s,currentPlayer(s).id,1);
  s.threats = s.threats!.filter(t => t.id !== targetId);
  const eventKey = `${coordKey(target.coord)}:${target.spaceId}`;
  if (!(s.clearedEvents ??= []).includes(eventKey)) s.clearedEvents.push(eventKey);

}

export function resetThreats(s: GameState): void {
  for (const t of s.threats ?? []) t.status = "inactive";
}
