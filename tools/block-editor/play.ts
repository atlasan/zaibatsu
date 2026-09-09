// Local-only Speedrunners play sessions. This module owns no files: it loads
// canonical data once and keeps all commands/state in memory for the Bun host.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadDefault } from "../../impl/ts/src/data/index.ts";
import { validSearchPlacements } from "../../impl/ts/src/engine/abilities.ts";
import { targetIceNullified } from "../../impl/ts/src/engine/attach.ts";
import { advancePhase, applyActionWithEvents, newGame, type Action, type TransitionResult } from "../../impl/ts/src/engine/index.ts";
import { snapshot } from "../../impl/ts/src/engine/snapshot.ts";
import { currentPlayer, pawnById, type GameData, type GameState } from "../../impl/ts/src/domain/types.ts";
import { neighbor } from "../../impl/ts/src/domain/hex.ts";
import { canActivateMovementOption, effectiveMovementOptions, stepTargets, type MovementOption, type SpaceRef } from "../../impl/ts/src/engine/movement.ts";
import { coverageSurface } from "./coverage.ts";
import { sha256 } from "./model.ts";

export type PlayCommand = { kind: "phase" } | { kind: "action"; action: Action };
export interface PlaySetup { playerNames: string[]; seed: number; }
export interface StandardPlayTrace { format: "zaibatsu-speedrunners-trace/v1"; setup: PlaySetup; dataChecksum: string; commands: PlayCommand[]; }
export interface FixturePlayTrace { format: "zaibatsu-speedrunners-trace/v2"; setup: PlaySetup; scenarioId: string; dataChecksum: string; commands: PlayCommand[]; }
export type PlayTrace = StandardPlayTrace | FixturePlayTrace;

export interface PlayScenario {
  id: string;
  title: string;
  description: string;
  checkpoints: string[];
}

interface PlaySession { id: string; setup: PlaySetup; scenarioId?: string; commands: PlayCommand[]; data: GameData; state: GameState; events: TransitionResult["events"]; }

const repoRoot = resolve(import.meta.dir, "../..");
const data = loadDefault("speedrunners");
const dataChecksum = sha256([
  "blocks.json", "pawns.json", "action-cards.json", "mode.json",
].map((file) => readFileSync(join(repoRoot, "spec/data/speedrunners", file), "utf8")).join("\n"));
const layout = JSON.parse(readFileSync(join(repoRoot, "spec/data/block-layouts.json"), "utf8")).layouts[0];
const sessions = new Map<string, PlaySession>();
let nextSessionID = 1;

function cleanNames(names: unknown): string[] {
  if (!Array.isArray(names)) throw new Error("playerNames must be an array");
  const cleaned = names.map((name) => typeof name === "string" ? name.trim() : "").filter(Boolean);
  if (cleaned.length < 2 || cleaned.length > 4) throw new Error("Speedrunners requires 2–4 named players");
  return cleaned;
}

function cleanSetup(setup: PlaySetup): PlaySetup {
  if (!Number.isSafeInteger(setup?.seed)) throw new Error("seed must be a whole number");
  return { playerNames: cleanNames(setup.playerNames), seed: setup.seed };
}

const scenarios: PlayScenario[] = [
  { id: "game-basics", title: "Game basics", description: "A short basics fixture for control-marker placement, victory, and reset.", checkpoints: ["Place your last control marker.", "Confirm the winner event, then reset the fixture."] },
  { id: "search-and-move", title: "Search and movement", description: "Place the next block, then test fixed/card movement across the Central Core boundary.", checkpoints: ["Play Search and place the top block.", "Move the Red Speedrunner into that block.", "Use Undo to confirm deterministic replay."] },
  { id: "combat-and-control", title: "Combat and control", description: "A co-located combat fixture with a controllable ICE block and an ICE-bearing pawn.", checkpoints: ["Use a card to Delete a target.", "Use the Cyberninja for a Test Lab Split Delete.", "Icebreak the Cyberninja or the Hacktivism block.", "Inspect rolls, eliminations, and control events."] },
  { id: "attachments", title: "Attachments", description: "Exercise granted movement, armor defense, and ICE nullification without touching canonical spec data.", checkpoints: ["Attach the Stealth Harness to your Red Speedrunner.", "Use the granted stealth move.", "Attach the Block ICE Jammer and confirm block control is no longer offered."] },
  { id: "reboot-and-turn", title: "Reboot and turn flow", description: "Reboot an eliminated pawn with four cards, then exercise pass, recycle, end, and reset.", checkpoints: ["Play four cards to Reboot the eliminated Red Speedrunner.", "Pass and end the turn.", "Reset the fixture and compare its trace."] },
];

export function listPlayScenarios(): PlayScenario[] { return scenarios.map((scenario) => ({ ...scenario, checkpoints: [...scenario.checkpoints] })); }

function scenarioById(id: string): PlayScenario {
  const scenario = scenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown Test Lab scenario "${id}"`);
  return scenario;
}

function playDataForScenario(id?: string): GameData {
  if (id !== "attachments") return data;
  const cloned = structuredClone(data);
  cloned.cards.push(
    {
      id: "fixture-grant-stealth-steps",
      name: "Stealth Harness",
      attach: {
        as: "pawn",
        slot: "gadget",
        grantsMovement: [{ type: "fixed", amount: 1, stealth: true }],
        abilityUses: [{ ability: "move", activation: "card" }],
      },
    },
    {
      id: "fixture-armor-override",
      name: "Shield Mesh",
      attach: {
        as: "pawn",
        slot: "armor",
        defenseOverride: [1, 2, 3, 4, 5, 6].map((value) => ({ value, shielded: true })),
      },
    },
    {
      id: "fixture-block-nullify-ice",
      name: "Block ICE Jammer",
      attach: { as: "block", nullifiesIce: true },
    },
  );
  return cloned;
}

function fixtureState(id: string, setup: PlaySetup, gd: GameData): GameState {
  scenarioById(id);
  const state = newGame({ data: gd, ...setup });
  state.currentPlayer = 0;
  state.turn = 1;
  state.phase = "action";
  state.deck = ["move-3", "move-2", "move-1", "enemy-malware", "add-on-accelerator"];
  state.discard = [];
  state.blockPile = ["data-haven", "hacktivism"];
  state.eliminated = [];
  const p1 = state.players[0]!;
  const p2 = state.players[1]!;
  p1.oncePerTurnUsed = {}; p2.oncePerTurnUsed = {};
  const core = state.cybernet.blocks[0]!;
  state.cybernet.blocks = [core];
  state.cybernet.pawns = [];

  if (id === "game-basics") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-blue";
    p1.controlMarkersPlaced = Math.max(0, p1.controlMarkersTotal - 1);
    p1.hand = ["move-1"]; p2.hand = [];
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 0, r: 0 }, spaceId: "core" });
    state.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: p2.id, coord: { q: 0, r: 0 }, spaceId: "core" });
  } else if (id === "search-and-move") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-blue";
    p1.hand = ["move-1", "move-2"]; p2.hand = ["move-1"];
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 0, r: 0 }, spaceId: "core" });
    state.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: p2.id, coord: { q: 0, r: 0 }, spaceId: "core" });
  } else if (id === "combat-and-control") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-yellow";
    p1.hand = ["move-1", "move-2", "move-3"]; p2.hand = [];
    state.cybernet.blocks.push({ blockId: "hacktivism", rotation: 4, coord: { q: 0, r: 1 } });
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 0, r: 1 }, spaceId: "h7" });
    state.cybernet.placePawn({ pawnId: "merc-cyberninja", ownerId: p1.id, coord: { q: 0, r: 1 }, spaceId: "h1" });
    state.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: p2.id, coord: { q: 0, r: 1 }, spaceId: "h2" });
    state.cybernet.placePawn({ pawnId: "speedrunner-green", ownerId: p2.id, coord: { q: 0, r: 1 }, spaceId: "h3" });
  } else if (id === "attachments") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-yellow";
    p1.hand = ["fixture-grant-stealth-steps", "fixture-armor-override", "fixture-block-nullify-ice", "enemy-malware", "move-1"]; p2.hand = [];
    state.cybernet.blocks.push({ blockId: "data-haven", rotation: 0, coord: { q: 0, r: 1 } });
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 0, r: 1 }, spaceId: "a" });
    state.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: p2.id, coord: { q: 0, r: 1 }, spaceId: "b" });
  } else if (id === "reboot-and-turn") {
    p1.pawnId = "speedrunner-green"; p2.pawnId = "speedrunner-blue";
    p1.hand = ["move-1", "move-2", "move-3", "enemy-malware", "add-on-accelerator"]; p2.hand = [];
    state.eliminated = ["speedrunner-red"];
    state.cybernet.placePawn({ pawnId: "speedrunner-green", ownerId: p1.id, coord: { q: 0, r: 0 }, spaceId: "core" });
    state.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: p2.id, coord: { q: 0, r: 0 }, spaceId: "core" });
  }
  return state;
}

function replay(setup: PlaySetup, commands: PlayCommand[], scenarioId?: string): { data: GameData; state: GameState; events: TransitionResult["events"] } {
  const gd = playDataForScenario(scenarioId);
  const state = scenarioId ? fixtureState(scenarioId, setup, gd) : newGame({ data: gd, ...setup });
  let events: TransitionResult["events"] = [];
  for (const command of commands) {
    const result = command.kind === "phase" ? advancePhase(state, gd) : applyActionWithEvents(state, gd, command.action);
    if (!result.accepted) throw new Error(`trace command is no longer valid: ${result.error ?? "rejected command"}`);
    events = result.events;
  }
  return { data: gd, state, events };
}

function get(id: string): PlaySession {
  const session = sessions.get(id);
  if (!session) throw new Error("Play session not found");
  return session;
}

function readableData(gd: GameData) {
  return {
    mode: gd.mode,
    blocks: gd.blocks.map(({ id, name, iceValue, iceFaces, blackIce, edges, spaces, assetRefs, isCentralCore }) => ({ id, name, iceValue, iceFaces, blackIce, edges, spaces, assetRefs, isCentralCore })),
    pawns: gd.pawns.map(({ id, name, class: pawnClass, movement, abilities, defense, slots, iceValue, assetRefs }) => ({ id, name, class: pawnClass, movement, abilities, defense, slots, iceValue, assetRefs })),
    cards: gd.cards.map(({ id, name, activates, attach, movement, assetRefs }) => ({ id, name, activates, attach, movement, assetRefs })),
  };
}

function movementLabel(name: string, option: MovementOption, movementIndex: number): string {
  const typeLabel = option.movement.type === "steps"
    ? `${Math.max(0, option.movement.steps ?? 0)} steps`
    : option.movement.type === "d6"
      ? "d6 steps"
      : option.movement.type === "2d6"
        ? "2d6 steps"
        : "hex";
  const sourceLabel = movementIndex === 0 ? "base" : `grant ${option.key}`;
  return `Move ${name} (${sourceLabel}: ${typeLabel}${option.stealth ? " · stealth" : ""})`;
}

function legalOptions(state: GameState, gd: GameData, scenarioId?: string) {
  const player = currentPlayer(state);
  const owned = state.cybernet.pawns.filter((pawn) => pawn.ownerId === player.id);
  const actions: Array<Record<string, unknown>> = [];
  const addAction = (type: string, label: string, extra: Record<string, unknown> = {}) => {
    const family = type === "pass" || type === "place-marker"
      ? "basics"
      : type.includes("move")
        ? "movement"
        : type.includes("search")
          ? "search"
          : type.includes("delete")
            ? "combat"
            : type.includes("icebreak")
              ? "icebreaker"
              : type.includes("attach")
                ? "attachments"
                : type.includes("reboot")
                  ? "reboot"
                  : "basics";
    actions.push({ type, label, family, ...extra });
  };
  addAction("pass", "Pass");
  if (player.controlMarkersPlaced < player.controlMarkersTotal) addAction("place-marker", "Place a control marker");
  for (const pawn of owned) {
    const pawnDef = pawnById(gd, pawn.pawnId);
    if (pawnDef) {
      effectiveMovementOptions(gd, pawnDef, pawn.attachments).forEach((option, movementIndex) => {
        const gate = canActivateMovementOption(state, player, pawn.pawnId, option);
        if (gate) return;
        if (option.movement.type === "hex") {
          const directions = [0, 1, 2, 3, 4, 5].filter((dir) => state.cybernet.at(neighbor(pawn.coord, dir)));
          if (directions.length) {
            addAction("move-hex", movementLabel(pawnDef.name, option, movementIndex), {
              pawnId: pawn.pawnId,
              movement: option.movement,
              movementIndex,
              movementKey: option.key,
              stealth: option.stealth,
              directions,
            });
          }
          return;
        }
        const targets = stepTargets(gd, state.cybernet, pawn.coord, pawn.spaceId);
        const maxSelectable = maxSelectableSteps(option.movement.type, option.movement.steps);
        if (targets.length && maxSelectable > 0) {
          addAction("move-steps", movementLabel(pawnDef.name, option, movementIndex), {
            pawnId: pawn.pawnId,
            movement: option.movement,
            movementIndex,
            movementKey: option.key,
            stealth: option.stealth,
            maxSelectableSteps: maxSelectable,
            targets,
          });
        }
      });
    }
    const abilities = pawnDef?.abilities ?? [];
    if (abilities.some((ability) => ability.ability === "search" && ability.activation === "once-per-turn")) {
      try { addAction("search", `Search with ${pawnDef?.name}`, { pawnId: pawn.pawnId, placements: validSearchPlacements(state, gd, pawn.pawnId) }); } catch { /* no legal placement is simply not an option */ }
    }
    const colocated = state.cybernet.pawns.filter((other) => other.pawnId !== pawn.pawnId && other.coord.q === pawn.coord.q && other.coord.r === pawn.coord.r);
    if (colocated.length && abilities.some((ability) => ability.ability === "delete" && ability.activation === "once-per-turn")) addAction("delete", `Delete with ${pawnDef?.name}`, { pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId) });
    const deleteAbility = abilities.find((ability) => ability.ability === "delete" && ability.activation !== "none");
    const skulls = Math.max(1, deleteAbility?.skulls ?? 1);
    if (scenarioId === "combat-and-control" && colocated.length > 1 && skulls > 1) addAction("delete-multi", `Test Lab: Split Delete with ${pawnDef?.name}`, { pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId), maxTargets: skulls });
    if (colocated.length && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "once-per-turn")) {
      const enemyTargets = colocated
        .filter((other) => other.ownerId !== player.id)
        .filter((other) => {
          const target = pawnById(gd, other.pawnId);
          return !!target?.iceValue && target.iceValue !== "none" && !targetIceNullified(gd, other.attachments);
        })
        .map((other) => other.pawnId);
      if (enemyTargets.length) addAction("icebreak-pawn", `Icebreak with ${pawnDef?.name}`, { pawnId: pawn.pawnId, targetIds: enemyTargets });
    }
    const block = state.cybernet.at(pawn.coord);
    const blockDef = block ? blockDataFor(gd, block.blockId) : undefined;
    if (block && block.ownerId !== player.id && blockDef?.iceValue && blockDef.iceValue !== "none" && !targetIceNullified(gd, block.attachments) && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "once-per-turn")) addAction("icebreak-block", `Icebreak ${block.blockId}`, { pawnId: pawn.pawnId, coord: pawn.coord });
  }
  for (const cardId of new Set(player.hand)) {
    const card = gd.cards.find((item) => item.id === cardId);
    if (!card) continue;
    for (const pawn of owned) {
      const pawnDef = pawnById(gd, pawn.pawnId);
      const abilities = pawnDef?.abilities ?? [];
      const colocated = state.cybernet.pawns.filter((other) => other.pawnId !== pawn.pawnId && other.coord.q === pawn.coord.q && other.coord.r === pawn.coord.r);
      if (card.activates?.includes("delete") && abilities.some((ability) => ability.ability === "delete" && ability.activation === "card") && colocated.length) addAction("play-delete", `Play ${card.name}: Delete`, { cardId, pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId) });
      if (typeof card.movement === "number" && card.movement > 0) {
        const targets = stepTargets(gd, state.cybernet, pawn.coord, pawn.spaceId);
        if (targets.length) addAction("play-move", `Play ${card.name}: Move ${card.movement}`, { cardId, pawnId: pawn.pawnId, movement: { type: "steps", steps: card.movement, activation: "card" }, maxSelectableSteps: card.movement, targets });
      }
      if (card.activates?.includes("icebreaker") && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "card")) {
        const enemies = colocated
          .filter((other) => other.ownerId !== player.id)
          .filter((other) => {
            const target = pawnById(gd, other.pawnId);
            return !!target?.iceValue && target.iceValue !== "none" && !targetIceNullified(gd, other.attachments);
          })
          .map((other) => other.pawnId);
        if (enemies.length) addAction("play-icebreak-pawn", `Play ${card.name}: Icebreak pawn`, { cardId, pawnId: pawn.pawnId, targetIds: enemies });
        const block = state.cybernet.at(pawn.coord);
        const blockDef = block ? blockDataFor(gd, block.blockId) : undefined;
        if (block && block.ownerId !== player.id && blockDef?.iceValue && blockDef.iceValue !== "none" && !targetIceNullified(gd, block.attachments)) addAction("play-icebreak-block", `Play ${card.name}: Icebreak block`, { cardId, pawnId: pawn.pawnId, coord: pawn.coord });
      }
      if (abilities.some((ability) => ability.ability === "search" && ability.activation === "card")) {
        try { addAction("play-search", `Play ${card.name}: Search`, { cardId, pawnId: pawn.pawnId, placements: validSearchPlacements(state, gd, pawn.pawnId) }); } catch { /* no legal placement */ }
      }
      if (card.attach?.as === "enemy" && colocated.some((other) => other.ownerId !== player.id)) addAction("attach-enemy", `Attach ${card.name} to enemy`, { cardId, pawnId: pawn.pawnId, targetIds: colocated.filter((other) => other.ownerId !== player.id).map((other) => other.pawnId) });
      if (card.attach?.as === "block") addAction("attach-block", `Attach ${card.name} to block`, { cardId, pawnId: pawn.pawnId, coord: pawn.coord });
    }
    if (card.attach?.as === "pawn" && owned.length) addAction("attach-pawn", `Attach ${card.name} to pawn`, { cardId, targetIds: owned.map((pawn) => pawn.pawnId) });
  }
  for (const pawnId of state.eliminated) {
    const pawnDef = pawnById(gd, pawnId);
    if (pawnDef?.abilities?.some((ability) => ability.ability === "reboot" && ability.activation === "once-per-turn")) addAction("reboot", `Reboot ${pawnDef.name}`, { pawnId });
    if (pawnDef?.abilities?.some((ability) => ability.ability === "reboot" && ability.activation === "card") && player.hand.length >= 4) addAction("play-reboot", `Play 4 cards: Reboot ${pawnDef.name}`, { pawnId, cardIds: player.hand });
  }
  return { phase: state.phase, activePlayerId: player.id, actions, cardsInHand: player.hand };
}

function maxSelectableSteps(type: string, steps?: number): number {
  switch (type) {
    case "steps": return Math.max(0, steps ?? 0);
    case "d6": return 6;
    case "2d6": return 12;
    default: return 0;
  }
}

function cleanPath(path: unknown): SpaceRef[] {
  if (!Array.isArray(path)) throw new Error("movement path must be an array");
  return path.map((step) => {
    if (!step || typeof step !== "object") throw new Error("each movement step must name a space");
    const candidate = step as { coord?: { q?: unknown; r?: unknown }; spaceId?: unknown };
    if (!Number.isSafeInteger(candidate.coord?.q) || !Number.isSafeInteger(candidate.coord?.r) || typeof candidate.spaceId !== "string") {
      throw new Error("each movement step needs integer q/r coordinates and a space id");
    }
    return { coord: { q: candidate.coord.q, r: candidate.coord.r }, spaceId: candidate.spaceId };
  });
}

/**
 * Projects the next guided step without resolving dice or mutating a session.
 * Dice movement exposes its maximum selectable path; the actual seeded roll is
 * still made only when the accepted move action reaches the engine.
 */
export function getMovementOptions(id: string, pawnId: string, rawPath: unknown, cardId?: string, movementIndex = 0) {
  const session = get(id);
  if (session.state.phase !== "action") throw new Error("movement is available only during the action phase");
  const player = currentPlayer(session.state);
  const pawn = session.state.cybernet.pawnById(pawnId);
  if (!pawn || pawn.ownerId !== player.id) throw new Error("choose an active player's pawn");
  const definition = pawnById(session.data, pawnId);
  if (!definition) throw new Error("unknown pawn");
  let maximum: number;
  let movement: { type: string; steps?: number; activation: string };
  let movementKey = "base";
  let stealth = false;
  if (cardId) {
    const card = session.data.cards.find((item) => item.id === cardId);
    if (!player.hand.includes(cardId) || !card || !Number.isInteger(card.movement) || card.movement! <= 0) {
      throw new Error("choose a movement-valued card in the active player's hand");
    }
    maximum = card.movement!;
    movement = { type: "steps", steps: maximum, activation: "card" };
  } else {
    const option = effectiveMovementOptions(session.data, definition, pawn.attachments)[movementIndex];
    if (!option) throw new Error(`movement option ${movementIndex} is unavailable for pawn "${pawnId}"`);
    const gate = canActivateMovementOption(session.state, player, pawnId, option);
    if (gate) throw new Error(gate);
    if (option.movement.type === "hex") throw new Error("guided path preview supports only space movement; use the hex move action");
    maximum = maxSelectableSteps(option.movement.type, option.movement.steps);
    movement = option.movement;
    movementKey = option.key;
    stealth = option.stealth;
  }
  const path = cleanPath(rawPath);
  if (path.length > maximum) throw new Error(`path exceeds the selectable maximum of ${maximum} steps`);
  let coord = pawn.coord;
  let spaceId = pawn.spaceId;
  for (const [index, step] of path.entries()) {
    const reachable = stepTargets(session.data, session.state.cybernet, coord, spaceId);
    if (!reachable.some((target) => target.coord.q === step.coord.q && target.coord.r === step.coord.r && target.spaceId === step.spaceId)) {
      throw new Error(`step ${index + 1} is not adjacent to the preceding space`);
    }
    coord = step.coord;
    spaceId = step.spaceId;
  }
  return {
    pawnId,
    movement,
    movementIndex,
    movementKey,
    stealth,
    maxSelectableSteps: maximum,
    exactBudgetKnown: movement.type === "steps",
    path,
    nextTargets: path.length < maximum ? stepTargets(session.data, session.state.cybernet, coord, spaceId) : [],
  };
}

function blockDataFor(gd: GameData, id: string) { return gd.blocks.find((block) => block.id === id); }

function view(session: PlaySession) {
  const state = JSON.parse(snapshot(session.state));
  const scenario = session.scenarioId ? scenarioById(session.scenarioId) : undefined;
  return {
    id: session.id,
    setup: session.setup,
    scenario: scenario ? { ...scenario, checkpoints: scenario.checkpoints.map((label, index) => ({ id: `${scenario.id}-${index + 1}`, label, complete: scenarioCheckpoint(session, index) })) } : null,
    dataChecksum,
    state,
    players: session.state.players.map((player) => ({ id: player.id, name: player.name, color: player.color, pawnId: player.pawnId, markersTotal: player.controlMarkersTotal, markersPlaced: player.controlMarkersPlaced, bonus: player.bonusCounters, hand: player.hand.map((id) => ({ id, name: session.data.cards.find((card) => card.id === id)?.name ?? id })) })),
    activePlayer: session.state.players[session.state.currentPlayer] ? { id: session.state.players[session.state.currentPlayer]!.id, name: session.state.players[session.state.currentPlayer]!.name, color: session.state.players[session.state.currentPlayer]!.color } : null,
    counts: { deck: session.state.deck.length, discard: session.state.discard.length, blockPile: session.state.blockPile.length, eliminated: session.state.eliminated.length },
    data: readableData(session.data),
    layout,
    coverage: coverageSurface("play-workbench"),
    legalOptions: legalOptions(session.state, session.data, session.scenarioId),
    events: session.events,
    commandCount: session.commands.length,
  };
}

function scenarioCheckpoint(session: PlaySession, index: number): boolean {
  switch (session.scenarioId) {
    case "game-basics": return index === 0 ? session.commands.some((command) => command.kind === "action" && command.action.type === "place-marker") : Boolean(session.state.winnerId);
    case "search-and-move": return index === 0 ? session.state.cybernet.blocks.length > 1 : index === 1 ? session.state.cybernet.pawns.some((pawn) => pawn.pawnId === "speedrunner-red" && (pawn.coord.q !== 0 || pawn.coord.r !== 0)) : session.commands.length > 2;
    case "combat-and-control": return index === 0 ? session.commands.some((command) => command.kind === "action" && command.action.type === "play-delete") : index === 1 ? session.commands.some((command) => command.kind === "action" && command.action.type === "delete-multi") : index === 2 ? session.commands.some((command) => command.kind === "action" && command.action.type.startsWith("play-icebreak")) : session.events.some((event) => event.type === "roll");
    case "attachments": return index === 0 ? Boolean(session.state.cybernet.pawnById("speedrunner-red")?.attachments?.some((att) => att.cardId === "fixture-grant-stealth-steps")) : index === 1 ? Boolean(session.commands.some((command) => command.kind === "action" && command.action.type === "move-steps" && command.action.movementIndex === 1)) : !legalOptions(session.state, session.data, session.scenarioId).actions.some((action) => action.type === "play-icebreak-block");
    case "reboot-and-turn": return index === 0 ? !session.state.eliminated.includes("speedrunner-red") : index === 1 ? session.state.turn > 1 : session.commands.length > 0;
    default: return false;
  }
}

export function createPlaySession(setup: PlaySetup) {
  const normalized = cleanSetup(setup);
  const sessionData = playDataForScenario();
  const state = newGame({ data: sessionData, ...normalized });
  const session: PlaySession = { id: `play-${nextSessionID++}`, setup: normalized, commands: [], data: sessionData, state, events: [] };
  sessions.set(session.id, session);
  return view(session);
}

export function createPlayScenario(id: string, setup: PlaySetup = { playerNames: ["Ada", "Bea"], seed: 5 }) {
  const normalized = cleanSetup(setup);
  const sessionData = playDataForScenario(id);
  const state = fixtureState(id, normalized, sessionData);
  const session: PlaySession = { id: `play-${nextSessionID++}`, setup: normalized, scenarioId: id, commands: [], data: sessionData, state, events: [] };
  sessions.set(session.id, session);
  return view(session);
}

export function resetPlaySession(id: string, setup?: PlaySetup) {
  const session = get(id);
  session.setup = cleanSetup(setup ?? session.setup);
  session.commands = [];
  const replayed = replay(session.setup, [], session.scenarioId);
  session.data = replayed.data;
  session.state = replayed.state;
  session.events = [];
  return view(session);
}

export function getPlaySession(id: string) { return view(get(id)); }

export function submitPlayCommand(id: string, command: PlayCommand) {
  const session = get(id);
  const result = command.kind === "phase" ? advancePhase(session.state, session.data) : applyActionWithEvents(session.state, session.data, command.action);
  session.events = result.events;
  if (result.accepted) session.commands.push(command);
  return { ...view(session), result };
}

export function undoPlayCommand(id: string) {
  const session = get(id);
  session.commands.pop();
  const replayed = replay(session.setup, session.commands, session.scenarioId);
  session.data = replayed.data;
  session.state = replayed.state;
  session.events = replayed.events;
  return view(session);
}

export function exportPlayTrace(id: string): PlayTrace {
  const session = get(id);
  return session.scenarioId
    ? { format: "zaibatsu-speedrunners-trace/v2", setup: session.setup, scenarioId: session.scenarioId, dataChecksum, commands: session.commands }
    : { format: "zaibatsu-speedrunners-trace/v1", setup: session.setup, dataChecksum, commands: session.commands };
}

export function importPlayTrace(trace: PlayTrace) {
  if (trace?.format !== "zaibatsu-speedrunners-trace/v1" && trace?.format !== "zaibatsu-speedrunners-trace/v2") throw new Error("Unsupported play trace format");
  if (trace.dataChecksum !== dataChecksum) throw new Error("Trace data checksum does not match local Speedrunners data");
  const setup = cleanSetup(trace.setup);
  if (!Array.isArray(trace.commands)) throw new Error("Trace commands must be an array");
  const scenarioId = trace.format === "zaibatsu-speedrunners-trace/v2" ? trace.scenarioId : undefined;
  if (scenarioId) scenarioById(scenarioId);
  const replayed = replay(setup, trace.commands, scenarioId);
  const session: PlaySession = { id: `play-${nextSessionID++}`, setup, scenarioId, commands: trace.commands, data: replayed.data, state: replayed.state, events: replayed.events };
  sessions.set(session.id, session);
  return view(session);
}

export const playDataChecksum = dataChecksum;
