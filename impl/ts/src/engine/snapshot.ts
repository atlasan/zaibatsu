// Produces a canonical, compact JSON string of the meaningful game state for
// cross-mirror comparison and golden-game tests. Mirrors
// impl/go/internal/engine/snapshot.go exactly: same field order, same
// normalization (no omitted fields, empty arrays as [], map keys sorted), so both
// mirrors emit byte-identical snapshots from the same seed + action sequence. The
// RNG's internal state is intentionally excluded. See DOCS/parity.md.

import type { GameState } from "../domain/types.ts";
import type { Attachment } from "../domain/pawn_board.ts";

function snapAtts(atts: Attachment[] | undefined): Array<{ cardId: string; slot: string; slotRef?:string; bonusPaid: number;instanceId?:string;useMarkers?:import("../domain/types.ts").UseMarker[] }> {
  return (atts ?? []).map((a) => ({ cardId: a.cardId, slot: a.slot ?? "", ...(a.slotRef?{slotRef:a.slotRef}:{}), bonusPaid: a.bonusPaid ?? 0,...(a.instanceId?{instanceId:a.instanceId}:{}),...(a.useMarkers?.length?{useMarkers:a.useMarkers}:{}) }));
}

function sortedKeys(m: Record<string, boolean>): string[] {
  return Object.keys(m).filter((k) => m[k]).sort();
}

/** Returns the canonical JSON snapshot of s. Key order matches the Go mirror. */
export function snapshot(s: GameState): string {
  const dto = {
    turn: s.turn,
    phase: s.phase,
    currentPlayer: s.currentPlayer,
    winnerId: s.winnerId ?? "",
    players: s.players.map((p) => ({
      id: p.id,
      color: p.color,
      pawnId: p.pawnId,
      markersTotal: p.controlMarkersTotal,
      markersPlaced: p.controlMarkersPlaced,
      bonus: p.bonusCounters,
      hand: p.hand ?? [],
      oncePerTurn: sortedKeys(p.oncePerTurnUsed),
    })),
    deck: s.deck ?? [],
    discard: s.discard ?? [],
    playedCards: s.playedCards ?? [],
    ...(s.playedCardOwners?{playedCardOwners:[...s.playedCardOwners]}:{}),
    blockPile: s.blockPile ?? [],
    eliminated: s.eliminated ?? [],
    ...(s.rulesVersion ? {rulesVersion:s.rulesVersion,reserve:s.reserve??[],outOfGame:s.outOfGame??[],nativeUseMarkers:s.nativeUseMarkers??[],unresolvedUseCards:snapAtts(s.unresolvedUseCards),...(s.attachmentSerial?{attachmentSerial:s.attachmentSerial}:{})} : {}),
    ...(s.bonusCounterSupply!==undefined?{bonusCounterSupply:s.bonusCounterSupply}:{}),
    ...(s.controlCardMarkers?.length?{controlCardMarkers:s.controlCardMarkers.map(m=>({...m}))}:{}),
    bonusIcons: (s.cybernet.bonusIcons ?? []).map((icon) => ({
      key: icon.key,
      ...(icon.counterPlaced?{counterPlaced:true}:{}),
      collectedBy: icon.collectedBy ?? "",
      coords: icon.coords.map((coord) => ({ q: coord.q, r: coord.r })),
    })),
    blocks: s.cybernet.blocks.map((b) => ({
      blockId: b.blockId,
      ...(b.bonusCounter?{bonusCounter:structuredClone(b.bonusCounter)}:{}),
      rotation: b.rotation,
      q: b.coord.q,
      r: b.coord.r,
      ownerId: b.ownerId ?? "",
      attachments: snapAtts(b.attachments),
    })),
    pawns: s.cybernet.pawns.map((pw) => ({
      pawnId: pw.pawnId,
      ownerId: pw.ownerId,
      q: pw.coord.q,
      r: pw.coord.r,
      spaceId: pw.spaceId,
      attachments: snapAtts(pw.attachments),
    })),
    ...(s.controlCards?.length ? { controlCards: s.controlCards.map(card => ({ subject: {kind: card.subject.kind, id: card.subject.id}, cardId: card.cardId, ownerId: card.ownerId,...(card.zone?{zone:card.zone}:{}) })) } : {}),
    ...(s.pendingBlockSacrifices?{pendingBlockSacrifices:structuredClone(s.pendingBlockSacrifices)}:{}),
    ...(s.pendingBlockDiscards?{pendingBlockDiscards:s.pendingBlockDiscards}:{}),
    ...(s.pendingPhase ? {pendingPhase:s.pendingPhase} : {}),
    ...(s.pendingEffects?.length ? {pendingEffects:s.pendingEffects.map(e=>({trigger:e.trigger,kind:e.kind,...(e.amount?{amount:e.amount}:{}),...(e.threatMode?{threatMode:e.threatMode}:{}),id:e.id,playerId:e.playerId,pawnId:e.pawnId,cardId:e.cardId,...(e.source?{source:e.source}:{}),...(e.scope?{scope:e.scope}:{}),...(e.target?{target:e.target}:{}),...(e.optional?{optional:e.optional}:{})}))} : {}),
    ...(s.pendingChoice ? {pendingChoice:s.pendingChoice} : {}),
    ...(s.pendingEliminations?.length ? {pendingEliminations:s.pendingEliminations} : {}),
    ...(s.decisionSerial ? {decisionSerial:s.decisionSerial} : {}),
    ...(s.threats?.length ? { threats: s.threats } : {}),
    ...(s.threatPile?.length ? { threatPile: s.threatPile } : {}),
    ...(s.clearedEvents?.length ? { clearedEvents: s.clearedEvents } : {}),
    ...(s.pendingAttack ? { pendingAttack: s.pendingAttack } : {}),
    ...(s.pendingThreats ? { pendingThreats: s.pendingThreats } : {}),
  };
  return JSON.stringify(dto);
}
