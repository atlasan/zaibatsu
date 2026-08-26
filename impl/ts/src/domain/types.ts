// Zaibatsu entity types and game state — pure data, no I/O. Mirrors
// impl/go/internal/domain. See DOCS/domain-model.md and DOCS/parity.md.

import type { Rng } from "./rng.ts";
import type { Cybernet } from "./hex.ts";

export type Expansion = "speedrunners" | "shadowraiders";

export type Phase = "beginning" | "action" | "recycle" | "end";

export type IceValue = "none" | "low" | "medium" | "high" | "black";

export type SpaceType = "normal" | "double" | "special" | "pawn" | "effect";

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
  kind: "defense" | "hand-size" | "attack";
  amount?: number;
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

export interface Space {
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
      | "gain-control-card"
      | "place-pawn"
      | "area-attack"
      | "all-players"
      | "modify-ice"
      | "custom";
    amount?: number;
    target?: string;
    text?: string;
  };

export interface BlockEffects {
  inCybernet?: BlockEffect;
  underControl?: BlockEffect;
}

export interface Block {
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

export interface Pawn {
  id: string;
  name: string;
  expansion: Expansion;
  class: string[];
  defense: DefenseDie[];
  movement: Movement;
  abilities?: Ability[];
  iceValue?: IceValue;
  slots?: SlotType[];
  special?: string;
  isStarter?: boolean;
  mercCost?: number;
  provisional?: boolean;
}

export interface Attach {
  as: "pawn" | "enemy" | "block";
  slot?: SlotType;
  /** Target class restriction: the classes this card may attach to. */
  class?: string[];
  /** Abilities this attachment gives its target. */
  grants?: GrantedAbilityName[];
  /** Abilities this attachment strips from its target (the cross-marked badge). */
  removes?: GrantedAbilityName[];
  /** Movement options this attachment gives its target. */
  grantsMovement?: MovementGrant[];
  /** The attachment grants stealth-capable movement to its target. */
  grantsStealth?: boolean;
  /** Extra attachment slots this attachment grants to its target. */
  grantsSlot?: SlotType[];
  /** How the granted abilities may be used. */
  abilityUses?: AbilityUse[];
  /** Modifies the target's ICE faces, dice count, and black-ICE status. */
  iceModifier?: IceModifier;
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
}

export interface ActionCard {
  id: string;
  name: string;
  copies?: number;
  movement?: number;
  activates?: AbilityName[];
  attach?: Attach;
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
  id: string;
  name: string;
  expansions?: Expansion[];
  players: PlayerRange;
  controlMarkers: Record<string, number>;
  maxHandSize?: number;
  startingHand?: number[];
  win?: string[];
  lose?: string[];
  notes?: string;
}

export interface GameData {
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

export interface GameState {
  players: Player[];
  currentPlayer: number;
  turn: number;
  phase: Phase;
  deck: string[];
  discard: string[];
  blockPile: string[];
  cybernet: Cybernet;
  /** Pawn ids removed from the Cybernet (a Reboot re-enters them at the core). */
  eliminated: string[];
  winnerId?: string;
  rng: Rng;
}

export function currentPlayer(s: GameState): Player {
  return s.players[s.currentPlayer]!;
}

export function playerById(s: GameState, id: string): Player | undefined {
  return s.players.find((p) => p.id === id);
}
