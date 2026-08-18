// Local-only Speedrunners play sessions. This module owns no files: it loads
// canonical data once and keeps all commands/state in memory for the Bun host.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadDefault } from "../../impl/ts/src/data/index.ts";
import { validSearchPlacements } from "../../impl/ts/src/engine/abilities.ts";
import { advancePhase, applyActionWithEvents, newGame, type Action, type TransitionResult } from "../../impl/ts/src/engine/index.ts";
import { snapshot } from "../../impl/ts/src/engine/snapshot.ts";
import { currentPlayer, pawnById, type GameData, type GameState } from "../../impl/ts/src/domain/types.ts";
import { neighbor } from "../../impl/ts/src/domain/hex.ts";
import { stepTargets, type SpaceRef } from "../../impl/ts/src/engine/movement.ts";
import { sha256 } from "./model.ts";

export type PlayCommand = { kind: "phase" } | { kind: "action"; action: Action };
export interface PlaySetup { playerNames: string[]; seed: number; }
export interface PlayTrace { format: "zaibatsu-speedrunners-trace/v1"; setup: PlaySetup; dataChecksum: string; commands: PlayCommand[]; }

interface PlaySession { id: string; setup: PlaySetup; commands: PlayCommand[]; state: GameState; events: TransitionResult["events"]; }

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

function replay(setup: PlaySetup, commands: PlayCommand[]): { state: GameState; events: TransitionResult["events"] } {
  const state = newGame({ data, ...setup });
  let events: TransitionResult["events"] = [];
  for (const command of commands) {
    const result = command.kind === "phase" ? advancePhase(state, data) : applyActionWithEvents(state, data, command.action);
    if (!result.accepted) throw new Error(`trace command is no longer valid: ${result.error ?? "rejected command"}`);
    events = result.events;
  }
  return { state, events };
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

function legalOptions(state: GameState) {
  const player = currentPlayer(state);
  const owned = state.cybernet.pawns.filter((pawn) => pawn.ownerId === player.id);
  const actions: Array<Record<string, unknown>> = [{ type: "pass", label: "Pass" }];
  if (player.controlMarkersPlaced < player.controlMarkersTotal) actions.push({ type: "place-marker", label: "Place a control marker" });
  for (const pawn of owned) {
    const pawnDef = pawnById(data, pawn.pawnId);
    if (pawnDef && pawnDef.movement.type !== "hex" && pawnDef.movement.activation === "once-per-turn") {
      const targets = stepTargets(data, state.cybernet, pawn.coord, pawn.spaceId);
      if (targets.length) {
        actions.push({
          type: "move-steps",
          label: `Move ${pawnDef.name}`,
          pawnId: pawn.pawnId,
          movement: pawnDef.movement,
          maxSelectableSteps: maxSelectableSteps(pawnDef.movement.type, pawnDef.movement.steps),
          targets,
        });
      }
    }
    if (pawnDef?.movement.type === "hex" && pawnDef.movement.activation === "once-per-turn") {
      const directions = [0, 1, 2, 3, 4, 5].filter((dir) => state.cybernet.at(neighbor(pawn.coord, dir)));
      if (directions.length) actions.push({ type: "move-hex", label: `Move ${pawnDef.name}`, pawnId: pawn.pawnId, directions });
    }
    const abilities = pawnDef?.abilities ?? [];
    if (abilities.some((ability) => ability.ability === "search" && ability.activation === "once-per-turn")) {
      try { actions.push({ type: "search", label: `Search with ${pawnDef?.name}`, pawnId: pawn.pawnId, placements: validSearchPlacements(state, data, pawn.pawnId) }); } catch { /* no legal placement is simply not an option */ }
    }
    const colocated = state.cybernet.pawns.filter((other) => other.pawnId !== pawn.pawnId && other.coord.q === pawn.coord.q && other.coord.r === pawn.coord.r);
    if (colocated.length && abilities.some((ability) => ability.ability === "delete" && ability.activation === "once-per-turn")) actions.push({ type: "delete", label: `Delete with ${pawnDef?.name}`, pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId) });
    const deleteAbility = abilities.find((ability) => ability.ability === "delete" && ability.activation === "once-per-turn");
    const skulls = Math.max(1, deleteAbility?.skulls ?? 1);
    if (colocated.length > 1 && skulls > 1) actions.push({ type: "delete-multi", label: `Split Delete with ${pawnDef?.name}`, pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId), maxTargets: skulls });
    if (colocated.length && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "once-per-turn")) actions.push({ type: "icebreak-pawn", label: `Icebreak with ${pawnDef?.name}`, pawnId: pawn.pawnId, targetIds: colocated.filter((other) => other.ownerId !== player.id).map((other) => other.pawnId) });
    const block = state.cybernet.at(pawn.coord);
    if (block && block.ownerId !== player.id && blockDataFor(block.blockId)?.iceValue && blockDataFor(block.blockId)?.iceValue !== "none" && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "once-per-turn")) actions.push({ type: "icebreak-block", label: `Icebreak ${block.blockId}`, pawnId: pawn.pawnId, coord: pawn.coord });
  }
  for (const cardId of new Set(player.hand)) {
    const card = data.cards.find((item) => item.id === cardId);
    if (!card) continue;
    for (const pawn of owned) {
      const pawnDef = pawnById(data, pawn.pawnId);
      const abilities = pawnDef?.abilities ?? [];
      const colocated = state.cybernet.pawns.filter((other) => other.pawnId !== pawn.pawnId && other.coord.q === pawn.coord.q && other.coord.r === pawn.coord.r);
      if (card.activates?.includes("delete") && abilities.some((ability) => ability.ability === "delete" && ability.activation === "card") && colocated.length) actions.push({ type: "play-delete", label: `Play ${card.name}: Delete`, cardId, pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId) });
      if (typeof card.movement === "number" && card.movement > 0) {
        const targets = stepTargets(data, state.cybernet, pawn.coord, pawn.spaceId);
        if (targets.length) actions.push({ type: "play-move", label: `Play ${card.name}: Move ${card.movement}`, cardId, pawnId: pawn.pawnId, movement: { type: "steps", steps: card.movement, activation: "card" }, maxSelectableSteps: card.movement, targets });
      }
      if (card.activates?.includes("icebreaker") && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "card")) {
        const enemies = colocated.filter((other) => other.ownerId !== player.id).map((other) => other.pawnId);
        if (enemies.length) actions.push({ type: "play-icebreak-pawn", label: `Play ${card.name}: Icebreak pawn`, cardId, pawnId: pawn.pawnId, targetIds: enemies });
        const block = state.cybernet.at(pawn.coord);
        if (block && block.ownerId !== player.id && blockDataFor(block.blockId)?.iceValue && blockDataFor(block.blockId)?.iceValue !== "none") actions.push({ type: "play-icebreak-block", label: `Play ${card.name}: Icebreak block`, cardId, pawnId: pawn.pawnId, coord: pawn.coord });
      }
      if (abilities.some((ability) => ability.ability === "search" && ability.activation === "card")) {
        try { actions.push({ type: "play-search", label: `Play ${card.name}: Search`, cardId, pawnId: pawn.pawnId, placements: validSearchPlacements(state, data, pawn.pawnId) }); } catch { /* no legal placement */ }
      }
      if (card.attach?.as === "enemy" && colocated.some((other) => other.ownerId !== player.id)) actions.push({ type: "attach-enemy", label: `Attach ${card.name} to enemy`, cardId, pawnId: pawn.pawnId, targetIds: colocated.filter((other) => other.ownerId !== player.id).map((other) => other.pawnId) });
      if (card.attach?.as === "block") actions.push({ type: "attach-block", label: `Attach ${card.name} to block`, cardId, pawnId: pawn.pawnId, coord: pawn.coord });
    }
    if (card.attach?.as === "pawn" && owned.length) actions.push({ type: "attach-pawn", label: `Attach ${card.name} to pawn`, cardId, targetIds: owned.map((pawn) => pawn.pawnId) });
  }
  for (const pawnId of state.eliminated) {
    const pawnDef = pawnById(data, pawnId);
    if (pawnDef?.abilities?.some((ability) => ability.ability === "reboot" && ability.activation === "once-per-turn")) actions.push({ type: "reboot", label: `Reboot ${pawnDef.name}`, pawnId });
    if (pawnDef?.abilities?.some((ability) => ability.ability === "reboot" && ability.activation === "card") && player.hand.length >= 4) actions.push({ type: "play-reboot", label: `Play 4 cards: Reboot ${pawnDef.name}`, pawnId, cardIds: player.hand });
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
export function getMovementOptions(id: string, pawnId: string, rawPath: unknown, cardId?: string) {
  const session = get(id);
  if (session.state.phase !== "action") throw new Error("movement is available only during the action phase");
  const player = currentPlayer(session.state);
  const pawn = session.state.cybernet.pawnById(pawnId);
  if (!pawn || pawn.ownerId !== player.id) throw new Error("choose an active player's pawn");
  const definition = pawnById(data, pawnId);
  if (!definition) throw new Error("unknown pawn");
  let maximum: number;
  let movement: { type: string; steps?: number; activation: string };
  if (cardId) {
    const card = data.cards.find((item) => item.id === cardId);
    if (!player.hand.includes(cardId) || !card || !Number.isInteger(card.movement) || card.movement! <= 0) {
      throw new Error("choose a movement-valued card in the active player's hand");
    }
    maximum = card.movement!;
    movement = { type: "steps", steps: maximum, activation: "card" };
  } else {
    if (definition.movement.type === "hex" || definition.movement.activation !== "once-per-turn") {
      throw new Error("this pawn does not have guided once-per-turn space movement");
    }
    if (player.oncePerTurnUsed[`move:${pawnId}`]) throw new Error("this pawn already moved this turn");
    maximum = maxSelectableSteps(definition.movement.type, definition.movement.steps);
    movement = definition.movement;
  }
  const path = cleanPath(rawPath);
  if (path.length > maximum) throw new Error(`path exceeds the selectable maximum of ${maximum} steps`);
  let coord = pawn.coord;
  let spaceId = pawn.spaceId;
  for (const [index, step] of path.entries()) {
    const reachable = stepTargets(data, session.state.cybernet, coord, spaceId);
    if (!reachable.some((target) => target.coord.q === step.coord.q && target.coord.r === step.coord.r && target.spaceId === step.spaceId)) {
      throw new Error(`step ${index + 1} is not adjacent to the preceding space`);
    }
    coord = step.coord;
    spaceId = step.spaceId;
  }
  return {
    pawnId,
    movement,
    maxSelectableSteps: maximum,
    exactBudgetKnown: movement.type === "steps",
    path,
    nextTargets: path.length < maximum ? stepTargets(data, session.state.cybernet, coord, spaceId) : [],
  };
}

function blockDataFor(id: string) { return data.blocks.find((block) => block.id === id); }

function view(session: PlaySession) {
  return {
    id: session.id,
    setup: session.setup,
    dataChecksum,
    state: JSON.parse(snapshot(session.state)),
    data: readableData(data),
    layout,
    legalOptions: legalOptions(session.state),
    events: session.events,
    commandCount: session.commands.length,
  };
}

export function createPlaySession(setup: PlaySetup) {
  const normalized = cleanSetup(setup);
  const state = newGame({ data, ...normalized });
  const session: PlaySession = { id: `play-${nextSessionID++}`, setup: normalized, commands: [], state, events: [] };
  sessions.set(session.id, session);
  return view(session);
}

export function resetPlaySession(id: string, setup?: PlaySetup) {
  const session = get(id);
  session.setup = cleanSetup(setup ?? session.setup);
  session.commands = [];
  const replayed = replay(session.setup, []);
  session.state = replayed.state;
  session.events = [];
  return view(session);
}

export function getPlaySession(id: string) { return view(get(id)); }

export function submitPlayCommand(id: string, command: PlayCommand) {
  const session = get(id);
  const result = command.kind === "phase" ? advancePhase(session.state, data) : applyActionWithEvents(session.state, data, command.action);
  session.events = result.events;
  if (result.accepted) session.commands.push(command);
  return { ...view(session), result };
}

export function undoPlayCommand(id: string) {
  const session = get(id);
  session.commands.pop();
  const replayed = replay(session.setup, session.commands);
  session.state = replayed.state;
  session.events = replayed.events;
  return view(session);
}

export function exportPlayTrace(id: string): PlayTrace {
  const session = get(id);
  return { format: "zaibatsu-speedrunners-trace/v1", setup: session.setup, dataChecksum, commands: session.commands };
}

export function importPlayTrace(trace: PlayTrace) {
  if (trace?.format !== "zaibatsu-speedrunners-trace/v1") throw new Error("Unsupported play trace format");
  if (trace.dataChecksum !== dataChecksum) throw new Error("Trace data checksum does not match local Speedrunners data");
  const setup = cleanSetup(trace.setup);
  if (!Array.isArray(trace.commands)) throw new Error("Trace commands must be an array");
  const replayed = replay(setup, trace.commands);
  const session: PlaySession = { id: `play-${nextSessionID++}`, setup, commands: trace.commands, state: replayed.state, events: replayed.events };
  sessions.set(session.id, session);
  return view(session);
}

export const playDataChecksum = dataChecksum;
