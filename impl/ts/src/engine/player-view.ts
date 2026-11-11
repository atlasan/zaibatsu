import {handSizeProfile,type HandSizeProfile} from "./hand-size.ts";
import {bonusCounterPool,type BonusPool} from "./bonus-pool.ts";
import {blockSacrificeChoice} from "./block-sacrifices.ts";
import {blockDiscardChoice} from "./block-discards.ts";
import {useMarkerAllocations} from "./use-markers.ts";
import type {GameData, GameState} from "../domain/types.ts";
import {availableActions} from "./options.ts";
import type {EngineEvent} from "./index.ts";
import {snapshot} from "./snapshot.ts";
import {effectiveAbility,abilityUsedKey} from "./combat.ts";
import type {AvailableAction} from "./options.ts";
import type {Coord} from "../domain/hex.ts";

export interface ViewHand {count:number;visibility:"hidden"|"owner"|"face-up";cards:string[];}
export interface ViewPlayer {handSize?:HandSizeProfile;id:string;name:string;color:string;pawnId:string;markersTotal:number;markersPlaced:number;bonus:number;oncePerTurn:string[];hand:ViewHand;}
interface PublicAttachment {cardId:string;slot:string;slotRef?:string;bonusPaid:number;instanceId?:string;useMarkers?:import("../domain/types.ts").UseMarker[];}
export interface PlayerViewState {
  bonusPool?:BonusPool;
  blockSacrifices?:GameState["pendingBlockSacrifices"];
  blockDiscards?:{blockId:string;coord:Coord;decisions:Array<{id:string;playerId:string;amount:number;submitted:boolean}>};
  format:"zaibatsu-player-view/v1";viewerId:string;
  turn:number;phase:GameState["phase"];currentPlayer:number;winnerId:string;
  players:ViewPlayer[];piles:{deck:number;blockPile:number;threatPile:number};
  playedCardOwners?:string[];
  discard:string[];playedCards:string[];eliminated:string[];reserve:string[];outOfGame:string[];
  bonusIcons:Array<{counterPlaced?:boolean;key:string;collectedBy:string;coords:Coord[]}>;
  blocks:Array<{bonusCounter?:import("../domain/hex.ts").BlockBonusCounter;blockId:string;rotation:number;q:number;r:number;ownerId:string;attachments:PublicAttachment[]}>;
  pawns:Array<{pawnId:string;ownerId:string;q:number;r:number;spaceId:string;attachments:PublicAttachment[]}>;
  controlCardMarkers?:GameState["controlCardMarkers"];
  controlCards:NonNullable<GameState["controlCards"]>;threats:NonNullable<GameState["threats"]>;clearedEvents:string[];
  pendingAttack?:GameState["pendingAttack"];pendingThreats?:GameState["pendingThreats"];
  decision?:Pick<NonNullable<GameState["pendingChoice"]>,"id"|"kind"|"playerId">;
  pendingChoice?:GameState["pendingChoice"];options:AvailableAction[];
  useMarkers:ReturnType<typeof useMarkerAllocations>;
  revealedBlock?:{blockId:string;reference:Coord};
  movement?:NonNullable<NonNullable<GameState["pendingChoice"]>["movement"]>;
}

function visibleOptions(s:GameState,gd:GameData) {
  if(gd.regressionFixture!=="provisional-v1") return availableActions(s,gd);
  // Search declaration precedes revealing the top tile. Placement previews in the
  // trusted query can disclose its topology, so expose only the public intent here.
  const options=availableActions(s,gd).filter(option=>!["search","play-search"].includes(option.action.type));
  if(s.winnerId || s.pendingChoice || s.pendingAttack || s.pendingThreats || s.phase!=="action" || !s.blockPile.length) return options;
  const player=s.players[s.currentPlayer]!;
  for(const placed of s.cybernet.pawns.filter(pawn=>pawn.ownerId===player.id)) {
    const pawn=gd.pawns.find(pawn=>pawn.id===placed.pawnId);if(!pawn) continue;
    const ability=effectiveAbility(gd,pawn,placed.attachments,"search");
    if(!ability || ability.activation==="none" || ability.activation==="once-per-turn" && player.oncePerTurnUsed[abilityUsedKey("search",pawn.id)]) continue;
    for(const cardId of ability.activation==="card"?[...new Set(player.hand)]:[undefined]) options.push({action:{type:cardId?"play-search":"search",pawnId:pawn.id,...(cardId?{cardId}:{})}});
  }
  return options;
}

/** Continuous visibility belongs to the current controller, never the attaching player. */
export function controllerHandRevealed(s:GameState, gd:GameData, playerId:string):boolean {
  return s.cybernet.pawns.some(pawn=>pawn.ownerId===playerId && pawn.attachments?.some(att=>gd.cards.find(card=>card.id===att.cardId)?.attach?.controllerHand==="face-up"));
}

function validateViewer(s:GameState, viewerId:string):void {
  if(viewerId && !s.players.some(player=>player.id===viewerId)) throw new Error("unknown player-view viewer");
}

/** A detached, whitelisted projection. Empty viewerId means spectator. No seed/trace/RNG. */
export function playerView(s:GameState, gd:GameData, viewerId=""):PlayerViewState {
  validateViewer(s,viewerId);
  const raw=JSON.parse(snapshot(s));
  const responderId=s.pendingChoice?.playerId??s.players[s.currentPlayer]?.id??"";
  const view:PlayerViewState={
    ...(s.bonusCounterSupply!==undefined?{bonusPool:bonusCounterPool(s)}:{}),
    format:"zaibatsu-player-view/v1" as const, viewerId,
    turn:s.turn,phase:s.phase,currentPlayer:s.currentPlayer,winnerId:s.winnerId??"",
    players:s.players.map(player=>{
      const revealed=controllerHandRevealed(s,gd,player.id);
      const visibility=revealed?"face-up":player.id===viewerId?"owner":"hidden";
      return {id:player.id,name:player.name,color:player.color,pawnId:player.pawnId,
        markersTotal:player.controlMarkersTotal,markersPlaced:player.controlMarkersPlaced,bonus:player.bonusCounters,
        oncePerTurn:Object.keys(player.oncePerTurnUsed).filter(key=>player.oncePerTurnUsed[key]).sort(),
        hand:{count:player.hand.length,visibility,cards:visibility==="hidden"?[]:[...player.hand]},...(s.rulesVersion?{handSize:handSizeProfile(s,gd,player.id)}:{})};
    }),
    useMarkers:useMarkerAllocations(s),
    ...(s.controlCardMarkers?.length?{controlCardMarkers:raw.controlCardMarkers}:{}),
    piles:{deck:s.deck.length,blockPile:s.blockPile.length,threatPile:s.threatPile?.length??0},
    discard:raw.discard,playedCards:raw.playedCards,...(s.playedCardOwners?{playedCardOwners:[...s.playedCardOwners]}:{}),eliminated:raw.eliminated,
    reserve:raw.reserve??[],outOfGame:raw.outOfGame??[],
    bonusIcons:raw.bonusIcons,blocks:raw.blocks,pawns:raw.pawns,controlCards:raw.controlCards??[],
    threats:raw.threats??[],clearedEvents:raw.clearedEvents??[],
    ...(s.pendingChoice?.kind==="place-block" && s.pendingChoice.blockId && s.pendingChoice.reference?{revealedBlock:{blockId:s.pendingChoice.blockId,reference:s.pendingChoice.reference}}:{}),
    ...(s.pendingChoice?.kind==="move-path"?{movement:s.pendingChoice.movement}:{}),
    ...(s.pendingAttack?{pendingAttack:raw.pendingAttack}:{}),
    ...(s.pendingThreats?{pendingThreats:raw.pendingThreats}:{}),
    ...(s.pendingChoice?{decision:{id:s.pendingChoice.id,kind:s.pendingChoice.kind,playerId:s.pendingChoice.playerId},...(viewerId===responderId?{pendingChoice:raw.pendingChoice}:{})}:{}),
    options:viewerId?(gd.regressionFixture!=="provisional-v1"?availableActions(s,gd,viewerId):viewerId===responderId?visibleOptions(s,gd):[]):[],
  };
  if(s.pendingBlockDiscards) {const batch=s.pendingBlockDiscards;view.blockDiscards={blockId:batch.blockId,coord:{...batch.coord},decisions:batch.decisions.map(({id,playerId,amount,submitted})=>({id,playerId,amount,submitted}))};delete view.pendingChoice;delete view.decision;view.options=availableActions(s,gd,viewerId);const d=batch.decisions.find(d=>d.playerId===viewerId && !d.submitted),choice=blockDiscardChoice(s,d?.id);if(choice) {view.pendingChoice=choice;view.decision={id:choice.id,kind:choice.kind,playerId:choice.playerId};}}
  if(s.pendingBlockSacrifices) {const batch=s.pendingBlockSacrifices;view.blockSacrifices=batch;delete view.pendingChoice;delete view.decision;view.options=availableActions(s,gd,viewerId);const d=batch.decisions.find(d=>d.playerId===viewerId && !d.submitted),choice=blockSacrificeChoice(s,d?.id);if(choice){view.pendingChoice=choice;view.decision={id:choice.id,kind:choice.kind,playerId:choice.playerId};}}
  return structuredClone(view);
}

/** History lacks event-time reveal provenance: opponents' draw identities stay private.
 * Current face-up cards are supplied by playerView, without revealing old draw order. */
export function eventsForPlayer(s:GameState, events:readonly EngineEvent[], viewerId=""):EngineEvent[] {
  validateViewer(s,viewerId);
  return events.filter(event=>event.type!=="validation-failed" || (!!viewerId && event.playerId===viewerId)).map(event=>{
    if(event.type==="card-stolen") {const copy=structuredClone(event);if(!event.cardRevealed && (!viewerId || ![event.fromOwnerId,event.toOwnerId].includes(viewerId)))delete copy.cardId;return copy;}
    if(event.type==="draw") return {type:event.type,...(event.playerId?{playerId:event.playerId}:{}),...(viewerId && event.playerId===viewerId && event.cardId?{cardId:event.cardId}:{})};
    return structuredClone(event);
  });
}
