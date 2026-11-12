// Zaibatsu entity types and game state â€” pure data, no I/O. Mirrors
// impl/go/internal/domain. See DOCS/domain-model.md and DOCS/parity.md.

import type { Rng } from "./rng.ts";
import type { Cybernet } from "./hex.ts";

export type Expansion = "speedrunners" | "shadowraiders";

export type Phase = "beginning" | "action" | "recycle" | "end";

export type IceValue = "none" | "low" | "medium" | "high" | "black";

export type SpaceType = "normal" | "double" | "special" | "pawn" | "effect" | "event" | "drone";

export type SlotType = "add-on" | "gadget" | "weapon" | "armor" | "module" | "mission";

export type MovementType = "steps" | "d6" | "2d6" | "hex";

export type Activation = "card" | "once-per-turn" | "none";

export type AbilityName = "search" | "delete" | "reboot" | "icebreaker";
export type GrantedAbilityName = AbilityName | "move";

export interface DefenseDie {
  value: number;
  shielded: boolean;
}

export interface SpaceModifier {
  kind: "defense" | "hand-size" | "attack" | "ice";
  amount?: number;
  dice?: DefenseDie[];
}

/** Normalized visual/source position in a block crop; not movement geometry. */
export interface SpaceLocation {
  x: number;
  y: number;
}

/** One axial coordinate on the source-layout pointy-hex grid. */
export interface SpaceGridCell {
  q: number;
  r: number;
}

/** Physical printed coverage for a space; it never changes runtime movement or capacity. */
export interface SpaceFootprint {
  shape: "hex" | "pill" | "large";
  cells: SpaceGridCell[];
}

/** Explicit finite capacity or unlimited; absent values are legacy type-derived data. */
export type ExplicitSpaceCapacity = number | "unlimited";

/** Source-facing render metadata only; never interpreted by the engine. */
export type SpaceDisplayShape = "auto" | "circle" | "capsule" | "compound";

export interface SpaceEffect {kind:"discard-attachment";cardType:"add-on"|"gadget";scope:"cybernet";optional:true;}
export interface Space {
  effect?:SpaceEffect;
  id: string;
  /** `double` remains readable for legacy data only; new canonical data uses explicit capacity. */
  type: SpaceType;
  zoneIds?: ("h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "h7")[];
  capacity?: ExplicitSpaceCapacity;
  capacityNote?: string;
  /** Source-facing rendering only; zoneIds and capacity remain authoritative. */
  displayShape?: SpaceDisplayShape;
  /** Gameplay-space links used by executable space-to-space movement. */
  neighbors?: string[];
  pawnId?: string;
  effectId?: string;
  threatId?: string;
  location?: SpaceLocation;
  footprint?: SpaceFootprint;
  modifier?: SpaceModifier;
  /** Directional restriction: a pawn may only exit toward this edge (0=top, clockwise). */
  direction?: number;
}

/** A block effect: a bare source effect-id (legacy) or a typed action. */
export type BlockEffect =
  | string
  | {
    kind:
      | "discard-hands-above-markers"
      | "discard-pawn-attachments"
      | "attack-pawn"
      | "place-controlled-pawn"
      | "controller-core"
      | "place-block-bonus"
      | "collect-block-bonus"
      | "gain-bonus-all-players"
      | "gain-control-card"
      | "place-pawn"
      | "sacrifice-per-player"
      | "discard-per-controlled-pawn"
      | "return-control-marker"
      | "place-neutral-pawn"
      | "area-attack"
      | "all-players"
      | "modify-ice"
      | "custom";
    markerThreshold?:number;
    scope?:"adjacent-blocks"|"cybernet";
    optional?:true;
    minimumControlledPawns?:number;
    amount?: number;
    target?: string;
    text?: string;
  };

export interface BlockEffects {
  inCybernet?: BlockEffect;
  underControl?: BlockEffect;
}

export type CardEffectTrigger =
  | "on-attach"
  | "on-play"
  | "begin-turn"
  | "end-turn"
  | "on-control"
  | "on-icebreak"
  | "continuous";

export interface CardEffect {
  kind:
    | "gain-control-card"
    | "gain-target-control"
    | "place-pawn"
    | "area-attack"
    | "all-players"
    | "modify-ice"
    | "draw-cards"
    | "gain-bonus"
    | "sacrifice-pawn"
    | "custom";
  amount?: number;
  target?: string;
  text?: string;
  trigger?: CardEffectTrigger;
}

export interface SpaceArrow {from:string;to:string;}
export interface Block {
  spaceArrows?:SpaceArrow[];
  nonPlayableZoneIds?: ("h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "h7")[];
  id: string;
  name: string;
  expansion: Expansion;
  /** Standardized internal placement layout: h2/h3, h7/h1/h4, h6/h5. */
  layoutId?: "standard-seven-zone-2-3-2-pointy";
  isCentralCore?: boolean;
  iceValue?: IceValue;
  /** Specific 1-6 die faces a successful Icebreak must match; overrides iceValue derivation. */
  iceFaces?: number[];
  /** A failed Icebreak against a Black-ICE block eliminates the attacker. */
  blackIce?: boolean;
  edges?: boolean[];
  /** Derived from each open entrance's mapped ring zone; it is not hand-authored. */
  boundarySpaces?: string[][];
  bonusFragments?: number;
  bonusCorners?: boolean[];
  spaces?: Space[];
  assetRefs?: string[];
  effects?: BlockEffects;
  provisional?: boolean;
}

export interface Movement {
  type: MovementType;
  steps?: number;
  activation: Activation;
}

export interface Ability {
  ability: AbilityName;
  activation: Activation;
  skulls?: number;
}

export interface MovementGrant {
  type: "fixed" | "d6" | "2d6" | "hex";
  amount?: number;
  stealth?: boolean;
}

export interface AbilityUse {
  ability: GrantedAbilityName;
  perTurn?: number;
  dice?: "d6";
  activation?: "card" | "once-per-turn";
}

export interface IceModifier {
  faces?: number[];
  deltaDice?: number;
  black?: boolean;
}

/** Modifiers supplied by the acting pawn, distinct from a target's ICE. */
export interface IcebreakerModifier {
  faces?: number[];
  rollDice?: number;
  black?: boolean;
  ignoresBlackIce?: boolean;
}

export interface ControlMarkerEffect {kind:"place-on-control-card";amount:1;}
export interface ControlCardMarker {playerId:string;cardId:string;amount:number;}
export interface PawnPhaseEffect {trigger:"begin-turn";kind:"steal-random-card";amount:1;scope:"cybernet";target:"another-pawn";optional:true;}
export interface Pawn {
  abilityTurn?: "any-player-turn";
  phaseEffects?:PawnPhaseEffect[];
  controlMarkerEffect?:ControlMarkerEffect;
  id: string;
  name: string;
  expansion: Expansion;
  class: string[];
  defense: DefenseDie[];
  movement: Movement;
  abilities?: Ability[];
  iceValue?: IceValue;
  iceFaces?: number[];
  icebreakerModifier?: IcebreakerModifier;
  slots?: SlotType[];
  special?: string;
  isStarter?: boolean;
  color?: string;
  mercCost?: number;
  provisional?: boolean;
  assetRefs?: string[];
  artwork?: { assetId: string; width: number; height: number; rect: { x: number; y: number; width: number; height: number }; rotation?: number };
}

export interface Attach {
  icebreakerModifier?:IcebreakerModifier;
  controllerHand?: "face-up";
  delete?: {skulls:number;activation?:"card"|"once-per-turn"};
  as: "pawn" | "enemy" | "block";
  slot?: SlotType;
  /** Target class restriction: the classes this card may attach to. */
  class?: string[];
  /** Effective target classes barred at attachment time. */
  forbiddenClasses?: string[];
  forbiddenDestinations?: "central-core"[];
  /** Abilities this attachment gives its target. */
  grants?: GrantedAbilityName[];
  /** Abilities this attachment strips from its target (the cross-marked badge). */
  removes?: GrantedAbilityName[];
  /** Movement options this attachment gives its target. */
  grantsMovement?: MovementGrant[];
  /** The attachment grants stealth-capable movement to its target. */
  grantsStealth?: boolean;
  ignoresDirectionArrows?: boolean;
  movementModifier?: number;
  phaseEffects?: PhaseEffect[];
  eliminationPrevention?: {kind:"discard-self"};
  /** Extra attachment slots this attachment grants to its target. */
  grantsSlot?: SlotType[];
  /** How the granted abilities may be used. */
  abilityUses?: AbilityUse[];
  /** Modifies the target's ICE faces, dice count, and black-ICE status. */
  iceModifier?: IceModifier;
  /** Replaces the target pawn's defense dice while the attachment remains equipped. */
  defenseOverride?: DefenseDie[];
  /** The target's ICE is treated as absent while the attachment remains equipped. */
  nullifiesIce?: boolean;
  /** Change to the number of cards drawn during recycle. */
  drawModifier?: number;
  /** Change to the controller's maximum hand size while attached. */
  handModifier?: number;
  /** Mini-block metadata for block attachments. */
  blockSpace?: { shape: "circle" | "hex" };
  /** Special on-attach effect text, e.g. "Gain control of this pawn." */
  effectText?: string;
  effectTrigger?: "on-attach" | "begin-turn" | "end-turn" | "on-control" | "on-icebreak" | "continuous";
  cost?: number;
  attackModifier?: number;
}

export interface ActionCard {
  id: string;
  name: string;
  type?: "add-on" | "gadget" | "weapon" | "armor" | "module" | "mission" | "action" | "movement" | "event" | "block";
  /** Printed card classes, distinct from attachment target restrictions. */
  class?: string[];
  copies?: number;
  movement?: number;
  activates?: AbilityName[];
  effects?: CardEffect[];
  attach?: Attach;
  assetRefs?: string[];
  summary?: string;
  provisional?: boolean;
}

/** A physical control card is distinct from the pawn or block it controls. */
export interface ControlCard {
  id: string;
  name: string;
  expansion: Expansion;
  subject: { kind: "pawn" | "block"; id: string };
  isStarter?: boolean;
  provisional?: boolean;
}

export interface Threat {
  id: string;
  name: string;
  type: "drone" | "token" | "mark" | "chaos";
  attackDie?: 4 | 5 | 6;
  defense?: DefenseDie[];
  copies?: number;
  effects?: string[];
  provisional?: boolean;
}

export interface MissionCard {
  id: string;
  name: string;
  tags: ("mark" | "cargo" | "counter" | "location")[];
  cost?: number;
  reward: { medals?: number; pawnId?: string };
  provisional?: boolean;
}

export interface PlayerRange {
  min: number;
  max: number;
}

export interface Mode {
  bonusCounterSupply?:number;
  id: string;
  name: string;
  expansions?: Expansion[];
  players: PlayerRange;
  allowedPlayerCounts?: number[];
  sourceId?: string;
  setup?: string[];
  controlMarkers: Record<string, number>;
  maxHandSize?: number;
  startingHand?: number[];
  win?: string[];
  lose?: string[];
  notes?: string;
  provisional?: boolean;
}

export interface GameData {
  /** Explicit compatibility corpus; never set by the ordinary loaders. */
  regressionFixture?: "provisional-v1";
  blocks: Block[];
  pawns: Pawn[];
  cards: ActionCard[];
  mode: Mode;
  controlCards?: ControlCard[];
  threats?: Threat[];
  missions?: MissionCard[];
  modes?: Mode[];
}

export function blockById(data: GameData, id: string): Block | undefined {
  return data.blocks.find((b) => b.id === id);
}

export function centralCore(data: GameData): Block | undefined {
  return data.blocks.find((b) => b.isCentralCore);
}

export function pawnById(data: GameData, id: string): Pawn | undefined {
  return data.pawns.find((p) => p.id === id);
}

export interface Player {
  id: string;
  name: string;
  color: string;
  pawnId: string;
  controlMarkersTotal: number;
  controlMarkersPlaced: number;
  bonusCounters: number;
  hand: string[];
  maxHandSize: number;
  oncePerTurnUsed: Record<string, boolean>;
}

export function markersRemaining(p: Player): number {
  return p.controlMarkersTotal - p.controlMarkersPlaced;
}

export interface UseMarker {ability:string;uses:number;}
export interface NativeUseMarker extends UseMarker {pawnId:string;}
export interface BlockSacrificeDecision {id:string;playerId:string;candidatePawnIds:string[];submitted:boolean;pawnId?:string;}
export interface PendingBlockSacrifices {blockId:string;coord:import("./hex.ts").Coord;decisions:BlockSacrificeDecision[];}
export interface BlockDiscardDecision {id:string;playerId:string;amount:number;submitted:boolean;cardIds?:string[];}
export interface PendingBlockDiscards {blockId:string;coord:import("./hex.ts").Coord;decisions:BlockDiscardDecision[];}
export interface GameState {
  bonusCounterSupply?:number;
  pendingBlockSacrifices?:PendingBlockSacrifices;
  pendingBlockDiscards?:PendingBlockDiscards;
  controlCardMarkers?:ControlCardMarker[];
  nativeUseMarkers?:NativeUseMarker[];
  unresolvedUseCards?:import("./pawn_board.ts").Attachment[];
  attachmentSerial?:number;
  rulesVersion?: "source-v21";
  /** Physical pawn pieces available outside the Cybernet. */
  reserve?: string[];
  outOfGame?: string[];
  players: Player[];
  currentPlayer: number;
  turn: number;
  phase: Phase;
  deck: string[];
  discard: string[];
  playedCards?: string[];
  playedCardOwners?: string[];
  controlCards?: Array<{ cardId: string; ownerId: string; subject: ControlCard["subject"]; zone?: "control"|"common"|"out-of-game" }>;
  pendingPhase?: "beginning" | "action";
  pendingEffects?: PendingEffect[];
  pendingChoice?: PendingChoice;
  pendingEliminations?: PendingElimination[];
  decisionSerial?: number;
  threats?: ThreatOnBoard[];
  threatPile?: string[];
  clearedEvents?: string[];
  pendingAttack?: PendingAttack;
  pendingThreats?: PendingThreatCombat;
  blockPile: string[];
  cybernet: Cybernet;
  /** Pawn ids removed from the Cybernet (a Reboot re-enters them at the core). */
  eliminated: string[];
  winnerId?: string;
  rng: Rng;
}

export interface PhaseEffect {
  trigger: "begin-turn" | "end-action";
  kind: "steal-random-card" | "discard-self" | "discard-hand" | "discard-or-sacrifice" | "sacrifice-and-draw" | "discard-and-relocate" | "discard-cards";
  amount?: number;
  threatMode?: "normal-movement" | "placement";
}
export interface PendingEffect extends PhaseEffect {
  source?:"pawn";
  scope?:"cybernet";
  target?:"another-pawn";
  optional?:true;
  id: string;
  playerId: string;
  pawnId: string;
  cardId: string;
}
export interface PendingElimination {
  id: string;
  pawnId: string;
  playerId: string;
  cause: "attack" | "black-ice" | "sacrifice";
}

export interface PendingChoice {
  spaceId?:string;
  id: string;
  playerId: string;
  kind: "block-detach" | "block-attack" | "steal-card" | "block-sacrifice" | "space-discard" | "block-discard" | "discard-or-sacrifice" | "relocate-pawn" | "discard-cards" | "prevent-elimination" | "place-block" | "move-path";
  movement?: {roll:number[];budget:number;origin:{coord:import("./hex.ts").Coord;spaceId:string};movementIndex:number;movementKey:string;stealth:boolean};
  blockId?: string;
  reference?: import("./hex.ts").Coord;
  effectId: string;
  pawnId: string;
  cardId: string;
  amount?: number;
  cardIds?: string[];
}

export interface ThreatOnBoard {
  id: string;
  threatId: string;
  coord: import("./hex.ts").Coord;
  spaceId: string;
  status: "inactive" | "active" | "eliminated";
}

/** The roll is public before dice are assigned. Empty target ids discard a die. */
export interface PendingAttack {
  playerId: string;
  attackerIds: string[];
  coord: import("./hex.ts").Coord;
  roll: number[];
}

export interface PendingThreatCombat {
  coord: import("./hex.ts").Coord;
  attackerIds: string[];
  stage: "response" | "retaliation";
}

export function currentPlayer(s: GameState): Player {
  return s.players[s.currentPlayer]!;
}

export function playerById(s: GameState, id: string): Player | undefined {
  return s.players.find((p) => p.id === id);
}
