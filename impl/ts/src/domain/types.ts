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

export interface DefenseDie {
  value: number;
  shielded: boolean;
}

export interface SpaceModifier {
  kind: "defense" | "hand-size" | "attack";
  amount?: number;
}

export interface Space {
  id: string;
  type: SpaceType;
  pawnId?: string;
  effectId?: string;
  modifier?: SpaceModifier;
}

export interface BlockEffects {
  inCybernet?: string;
  underControl?: string;
}

export interface Block {
  id: string;
  name: string;
  expansion: Expansion;
  isCentralCore?: boolean;
  iceValue?: IceValue;
  edges?: boolean[];
  bonusFragments?: number;
  spaces?: Space[];
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
  class?: string[];
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
