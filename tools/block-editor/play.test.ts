import { expect, test } from "bun:test";
import {createHash} from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPlayScenario, createPlaySession, exportPlayTrace, getMovementOptions, getPlaySession, getPlayPlayerView, importPlayTrace, listPlayScenarios, playDataChecksum, resetPlaySession, submitPlayCommand, undoPlayCommand } from "./play.ts";

test("Copyleft sandbox keeps physical reserve, icon counters and investments through replay and undo",()=>{
 const created=createPlayScenario("copyleft-bonus"),actor=created.state.players[0].pawnId;expect(created.bonusPool).toEqual({supply:24,reserve:3,free:21,invested:0,onBoard:0});const drawn=submitPlayCommand(created.id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(drawn.result.accepted).toBe(true);const placed=submitPlayCommand(created.id,{kind:"action",action:drawn.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});expect(placed.bonusPool).toEqual({supply:24,reserve:0,free:23,invested:0,onBoard:1});expect(placed.playerView.bonusPool).toEqual(placed.bonusPool);expect(placed.state.pawns).toHaveLength(2);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(placed.state);
 const attached=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-pawn",cardId:"phase-loop",targetId:actor}});expect(attached.result.accepted).toBe(true);expect(attached.bonusPool.invested).toBe(1);const moved=submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",cardId:"move-2",pawnId:actor,path:[{coord:{q:1,r:0},spaceId:"portrait"}]}});expect(moved.result.accepted).toBe(true);const before=getPlaySession(created.id).state;getMovementOptions(created.id,actor,[],"worm");expect(getPlaySession(created.id).state).toEqual(before);const done=submitPlayCommand(created.id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(done.result.accepted).toBe(true);expect(done.bonusPool).toEqual({supply:24,reserve:0,free:23,invested:1,onBoard:0});expect(done.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(done.state);expect(undoPlayCommand(created.id).bonusPool).toEqual(moved.bonusPool);expect(resetPlaySession(created.id).state).toEqual(created.state);
});

test("EMP sandbox keeps public owner commitments through replay, cleanup, undo and recovery",()=>{
 const created=createPlayScenario("emp-sacrifice"),actor=created.state.players[0].pawnId;const drawn=submitPlayCommand(created.id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(drawn.result.accepted).toBe(true);expect(drawn.playerView.revealedBlock!.blockId).toBe("electromagnetic-pulse");const placed=submitPlayCommand(created.id,{kind:"action",action:drawn.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});expect(placed.result.accepted).toBe(true);expect(placed.state.pendingBlockSacrifices.decisions).toHaveLength(2);
 const offTurn=getPlayPlayerView(created.id,"p2").view;expect(offTurn.pendingChoice!.kind).toBe("block-sacrifice");const first=submitPlayCommand(created.id,{kind:"action",action:offTurn.options[0]!.responses!.find(a=>a.targetId==="fixture-worker")!});expect(first.result.accepted).toBe(true);expect(first.state.pawns.some((p:any)=>p.pawnId==="fixture-worker")).toBe(true);expect(first.playerView.blockSacrifices!.decisions[1]!.pawnId).toBe("fixture-worker");expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(first.state);
 const bad=submitPlayCommand(created.id,{kind:"phase"});expect(bad.result.accepted).toBe(false);expect(bad.state).toEqual(first.state);const done=submitPlayCommand(created.id,{kind:"action",action:first.legalOptions.choiceResponses.find(a=>a.targetId===actor)!});expect(done.result.accepted).toBe(true);expect(done.state.eliminated).toContain(actor);expect(done.state.reserve).toContain("fixture-worker");expect(done.state.players.map((p:any)=>p.bonus)).toEqual([6,2]);expect(done.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(done.state);expect(undoPlayCommand(created.id).state).toEqual(first.state);expect(resetPlaySession(created.id).state).toEqual(created.state);
});

test("Antro sandbox exposes physical choices, modifier cleanup, replay and recovery",()=>{
 const created=createPlayScenario("antro-discard"),actor=created.state.players[0].pawnId;
 expect(created.pawnIcebreakerModifiers[actor].rollDice).toBe(1);expect(created.pawnIcebreakerModifiers[actor].ignoresBlackIce).toBe(true);
 const path=[{coord:{q:1,r:0},spaceId:"add-on"}];expect(getMovementOptions(created.id,actor,path,"move-1").canFinish).toBe(true);expect(getPlaySession(created.id).state).toEqual(created.state);
 const moved=submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path}});expect(moved.result.accepted).toBe(true);expect(moved.state.pendingChoice.kind).toBe("space-discard");expect(moved.legalOptions.choiceResponses).toHaveLength(3);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(moved.state);
 const selected=moved.legalOptions.choiceResponses.find(a=>a.targetId===actor)!;const wrong=submitPlayCommand(created.id,{kind:"action",action:{...selected,playerId:"p2"}});expect(wrong.result.accepted).toBe(false);expect(wrong.state).toEqual(moved.state);
 const done=submitPlayCommand(created.id,{kind:"action",action:selected});expect(done.result.accepted).toBe(true);expect(done.state.pawns.find((p:any)=>p.pawnId===actor).attachments.map((a:any)=>a.cardId)).toEqual(["phase-loop"]);expect(done.state.players[0].bonus).toBe(5);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(done.state);expect(undoPlayCommand(created.id).state).toEqual(moved.state);
 const skip=submitPlayCommand(created.id,{kind:"action",action:moved.legalOptions.choiceResponses[0]!});expect(skip.result.accepted).toBe(true);expect(skip.state.pawns.find((p:any)=>p.pawnId===actor).attachments).toHaveLength(3);
 expect(resetPlaySession(created.id).state).toEqual(created.state);
});

test("official play rejects provisional content even when the old block-count gate would pass", () => {
  expect(()=>createPlaySession({playerNames:["A","B","C","D"],seed:42,modeId:"speedrunners"})).toThrow(/Official Speedrunners is not ready/);
});

test("phase choice sandbox replays a pending decision and a physical duplicate discard", () => {
  const created=createPlayScenario("phase-choices");
  const started=submitPlayCommand(created.id,{kind:"phase"});
  expect(started.state.pendingChoice.kind).toBe("discard-or-sacrifice");
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(started.state);
  const rejected=submitPlayCommand(created.id,{kind:"phase"});expect(rejected.result.accepted).toBe(false);
  const resolved=submitPlayCommand(created.id,{kind:"action",action:{type:"resolve-choice",choiceId:started.state.pendingChoice.id,optionId:"discard",cardIds:["dj"]}});
  expect(resolved.result.accepted).toBe(true);expect(resolved.state.phase).toBe("action");expect(resolved.state.players[0].hand).toEqual(["dj"]);
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(resolved.state);
  expect(undoPlayCommand(created.id).state).toEqual(started.state);
});

test("source foundation sandbox uses canonical card rules, actor-aware previews and corpus-bound replay", () => {
  const created=createPlayScenario("source-foundation");
  expect(created.dataChecksum).not.toBe(playDataChecksum);
  const initial=getMovementOptions(created.id,"speedrunner-blue",[],"dj");
  expect(initial.nextTargets.some(t=>t.coord.q===0)).toBe(false);
  const attached=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-pawn",cardId:"octagon-dex",targetId:"speedrunner-blue"}});
  expect(attached.result.accepted).toBe(true);
  expect(attached.legalOptions.actions.some(a=>a.pawnId==="speedrunner-blue" && (a.type==="search" || a.type==="play-search"))).toBe(false);
  const preview=getMovementOptions(created.id,"speedrunner-blue",[],"dj");
  expect(preview.nextTargets.some(t=>t.coord.q===0 && t.spaceId==="core")).toBe(true);
  const before=getPlaySession(created.id).state;
  getMovementOptions(created.id,"speedrunner-blue",[],"dj");
  expect(getPlaySession(created.id).state).toEqual(before);
  const moved=submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",cardId:"dj",pawnId:"speedrunner-blue",path:[{coord:{q:0,r:0},spaceId:"core"}]}});
  expect(moved.result.accepted).toBe(true);
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(moved.state);
  const wrong=exportPlayTrace(created.id);wrong.dataChecksum=playDataChecksum;
  expect(()=>importPlayTrace(wrong)).toThrow(/checksum/);
  resetPlaySession(created.id);
  const blocked=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-pawn",cardId:"simstim-record",targetId:"speedrunner-blue"}});
  expect(blocked.legalOptions.actions.some(a=>a.pawnId==="speedrunner-blue" && String(a.type).includes("move"))).toBe(false);
  expect(()=>getMovementOptions(created.id,"speedrunner-blue",[],"dj")).toThrow(/cannot move/);
});

test("each host response carries an independent trace of confirmed commands for recovery", () => {
  const created = createPlaySession({playerNames:["Ada","Bea"],seed:5});
  created.recoveryTrace.commands.push({kind:"phase"});
  expect(exportPlayTrace(created.id).commands).toEqual([]);
  const started = submitPlayCommand(created.id,{kind:"phase"});
  expect(started.recoveryTrace.commands).toEqual([{kind:"phase"}]);
  expect(importPlayTrace(started.recoveryTrace).state).toEqual(started.state);
});

test("play sessions advance, replay undo, and export deterministically", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 91 });
  const started = submitPlayCommand(created.id, { kind: "phase" });
  expect(started.result.accepted).toBe(true);
  const choice = started.legalOptions.actions.find((action) => action.type === "play-search") as any;
  const intent = { type: "play-search" as const, pawnId: choice.pawnId, cardId: choice.cardId, ...choice.placements[0] };
  const action = submitPlayCommand(created.id, { kind: "action", action: intent });
  expect(action.result.accepted).toBe(true);
  const afterAction = action.state;
  undoPlayCommand(created.id);
  expect(getPlaySession(created.id).state).not.toEqual(afterAction);
  submitPlayCommand(created.id, { kind: "action", action: intent });
  expect(getPlaySession(created.id).state).toEqual(afterAction);
  const trace = exportPlayTrace(created.id);
  expect(trace.dataChecksum).toBe(playDataChecksum);
  expect(importPlayTrace(trace).state).toEqual(afterAction);
});

test("play sessions return structured validation errors and reject checksum mismatches", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 92 });
  const rejected = submitPlayCommand(created.id, { kind: "action", action: { type: "pass" } });
  expect(rejected.result.accepted).toBe(false);
  expect(rejected.result.events[0]!.type).toBe("validation-failed");
  const trace = exportPlayTrace(created.id);
  expect(() => importPlayTrace({ ...trace, dataChecksum: "wrong" })).toThrow("checksum");
});

test("play projection exposes guided options and does not write Speedrunners data", () => {
  const source = join(resolve(import.meta.dir, "../.."), "spec/data/speedrunners/blocks.json");
  const before = readFileSync(source, "utf8");
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 93 });
  expect(created.coverage.id).toBe("play-workbench");
  expect(created.coverage.status).toBe("partial");
  expect(created.legalOptions.actions).toEqual([]);
  const phase = submitPlayCommand(created.id, { kind: "phase" });
  expect(phase.legalOptions.actions.some((action) => action.type === "place-marker")).toBe(false);
  expect(phase.legalOptions.actions.some((action) => action.type === "play-search")).toBe(true);
  expect(readFileSync(source, "utf8")).toBe(before);
});

test("a guided search adds a block, then the next hex mover can move onto it", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 101 });
  submitPlayCommand(created.id, { kind: "phase" });
  const search = getPlaySession(created.id).legalOptions.actions.find((action) => action.type === "play-search") as { cardId: string; pawnId: string; placements: Array<{ dir: number; rotation: number }> };
  expect(search).toBeDefined();
  const placement = search.placements[0]!;
  const placed = submitPlayCommand(created.id, { kind: "action", action: { type: "play-search", cardId: search.cardId, pawnId: search.pawnId, ...placement } });
  expect(placed.result.accepted).toBe(true);
  expect(placed.state.blocks).toHaveLength(2);
  submitPlayCommand(created.id, { kind: "action", action: { type: "pass" } });
  submitPlayCommand(created.id, { kind: "phase" });
  submitPlayCommand(created.id, { kind: "phase" });
  const next = submitPlayCommand(created.id, { kind: "phase" });
  expect(next.state.players[0]!.hand).toHaveLength(next.state.players[0]!.maxHandSize ?? 5);
  submitPlayCommand(created.id, { kind: "phase" });
  const move = getPlaySession(created.id).legalOptions.actions.find((action) => action.type === "move-hex") as { pawnId: string; directions: number[] };
  expect(move).toBeDefined();
  const moved = submitPlayCommand(created.id, { kind: "action", action: { type: "move-hex", pawnId: move.pawnId, dir: move.directions[0]! } });
  expect(moved.result.accepted).toBe(true);
  expect(moved.state.pawns.find((pawn) => pawn.pawnId === move.pawnId)?.q).toBe(1);
});

test("guided step movement projects a path without rolling, then executes through the core boundary", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 5 });
  submitPlayCommand(created.id, { kind: "phase" });
  const search = getPlaySession(created.id).legalOptions.actions.find((action) => action.type === "play-search") as { cardId: string; pawnId: string; placements: Array<{ dir: number; rotation: number }> };
  const placed = submitPlayCommand(created.id, { kind: "action", action: { type: "play-search", cardId: search.cardId, pawnId: search.pawnId, ...search.placements[0]! } });
  const move = placed.legalOptions.actions.find((action) => action.type === "move-steps") as { pawnId: string; targets: Array<{ coord: { q: number; r: number }; spaceId: string }>; maxSelectableSteps: number; movement: { type: string } };
  expect(move).toBeDefined();
  expect(move.maxSelectableSteps).toBe(3);
  const path = [move.targets[0]!];
  const preview = getMovementOptions(created.id, move.pawnId, path);
  expect(preview.path).toEqual(path);
  expect(preview.exactBudgetKnown).toBe(true);
  expect(() => getMovementOptions(created.id, move.pawnId, [{ coord: { q: 99, r: 99 }, spaceId: "none" }])).toThrow("not adjacent");
  const moved = submitPlayCommand(created.id, { kind: "action", action: { type: "move-steps", pawnId: move.pawnId, path } });
  expect(moved.result.accepted).toBe(true);
  expect(moved.state.pawns.find((pawn) => pawn.pawnId === move.pawnId)).toMatchObject({ q: 1, r: 0, spaceId: path[0]!.spaceId });
});

test("guided card movement exposes its printed budget and discards only after acceptance", () => {
  const created = createPlaySession({ playerNames: ["Ada", "Bea"], seed: 5 });
  submitPlayCommand(created.id, { kind: "phase" });
  const search = getPlaySession(created.id).legalOptions.actions.find((action) => action.type === "play-search") as { cardId: string; pawnId: string; placements: Array<{ dir: number; rotation: number }> };
  const placed = submitPlayCommand(created.id, { kind: "action", action: { type: "play-search", cardId: search.cardId, pawnId: search.pawnId, ...search.placements[0]! } });
  const move = placed.legalOptions.actions.find((action) => action.type === "play-move") as { cardId: string; pawnId: string; targets: Array<{ coord: { q: number; r: number }; spaceId: string }>; maxSelectableSteps: number };
  expect(move).toBeDefined();
  const preview = getMovementOptions(created.id, move.pawnId, [move.targets[0]!], move.cardId);
  expect(preview.maxSelectableSteps).toBe(move.maxSelectableSteps);
  const moved = submitPlayCommand(created.id, { kind: "action", action: { type: "play-move", cardId: move.cardId, pawnId: move.pawnId, path: [move.targets[0]!] } });
  expect(moved.result.accepted).toBe(true);
  expect(moved.state.playedCards).toContain(move.cardId);
});

test("Test Lab scenarios are deterministic, named, and retain their fixture in v2 traces", () => {
  expect(listPlayScenarios().map((scenario) => scenario.id)).toEqual(["cleaner-b", "arms-industry", "drone-turret", "drone-probe", "engineering-mk2", "black-clinic", "corporate-scandal", "yakuza-attack", "pink-control", "gynoid-theft", "broadcast-reboot", "copyleft-bonus", "emp-sacrifice", "antro-discard", "sprawl-discard", "internal-arrows", "idoru-marker-victory", "toyeku-neutral", "zero-step-movement", "physical-use-markers", "rolled-movement", "source-search", "trojan-reveal", "virus-control", "lima-flag", "printed-delete", "attachment-slots", "attachment-restrictions", "elimination-prevention", "phase-jetpack", "phase-insider-trading", "phase-electric-sheep", "phase-choices", "source-foundation", "threat-combat", "game-basics", "search-and-move", "combat-and-control", "attachments", "bonus-economy", "effect-execution", "reboot-and-turn"]);
  const created = createPlayScenario("attachments", { playerNames: ["Ada", "Bea"], seed: 9 });
  expect(created.scenario?.title).toBe("Attachments");
  expect(created.activePlayer?.name).toBe("Ada");
  expect(created.players[0]!.hand.map((card) => card.name)).toEqual(expect.arrayContaining(["Stealth Harness", "Shield Mesh", "Block ICE Jammer"]));
  const trace = exportPlayTrace(created.id);
  expect(trace.format).toBe("zaibatsu-speedrunners-trace/v2");
  if (trace.format !== "zaibatsu-speedrunners-trace/v2") throw new Error("expected fixture trace");
  expect(trace.scenarioId).toBe("attachments");
  expect(importPlayTrace(trace).state).toEqual(created.state);
  expect(() => createPlayScenario("unknown-scenario")).toThrow("Unknown Test Lab scenario");
  expect(() => importPlayTrace({ ...trace, scenarioId: "unknown-scenario" })).toThrow("Unknown Test Lab scenario");
});

test("Test Lab fixture actions remain reducer-validated and reset to their fixture", () => {
  const created = createPlayScenario("attachments");
  const attach = created.legalOptions.actions.find((action) => action.type === "attach-pawn") as { cardId: string; targetIds: string[] };
  expect(attach).toBeDefined();
  const applied = submitPlayCommand(created.id, { kind: "action", action: { type: "attach-pawn", cardId: "fixture-grant-stealth-steps", targetId: attach.targetIds[0]! } });
  expect(applied.result.accepted).toBe(true);
  expect(applied.scenario?.checkpoints.some((checkpoint) => checkpoint.complete)).toBe(true);
  const reset = resetPlaySession(created.id);
  expect(reset.state.pawns.find((pawn) => pawn.pawnId === "speedrunner-red")?.attachments).toEqual([]);
});

test("attachments fixture exposes granted movement and block ICE nullification truthfully", () => {
  const created = createPlayScenario("attachments");
  expect(created.legalOptions.actions.some((action) => action.type === "play-icebreak-block")).toBe(true);

  const attached = submitPlayCommand(created.id, {
    kind: "action",
    action: { type: "attach-pawn", cardId: "fixture-grant-stealth-steps", targetId: "speedrunner-red" },
  });
  expect(attached.result.accepted).toBe(true);
  const grantedMove = attached.legalOptions.actions.find((action) => action.type === "move-steps" && action.movementIndex === 1) as { pawnId: string; movementIndex: number; targets: Array<{ coord: { q: number; r: number }; spaceId: string }>; stealth: boolean };
  expect(grantedMove).toBeDefined();
  expect(grantedMove.stealth).toBe(true);

  const preview = getMovementOptions(created.id, grantedMove.pawnId, [grantedMove.targets[0]!], undefined, grantedMove.movementIndex);
  expect(preview.movementIndex).toBe(1);
  expect(preview.stealth).toBe(true);

  const moved = submitPlayCommand(created.id, {
    kind: "action",
    action: { type: "move-steps", pawnId: grantedMove.pawnId, cardId: String(attached.legalOptions.actions.find((action) => action === grantedMove)?.cardId), movementIndex: grantedMove.movementIndex, path: [grantedMove.targets[0]!] },
  });
  expect(moved.result.accepted).toBe(true);
  expect(moved.scenario?.checkpoints[1]?.complete).toBe(true);

  const nullified = submitPlayCommand(created.id, {
    kind: "action",
    action: { type: "attach-block", cardId: "fixture-block-nullify-ice", pawnId: "speedrunner-red", coord: { q: 0, r: 1 } },
  });
  expect(nullified.result.accepted).toBe(true);
  expect(nullified.legalOptions.actions.some((action) => action.type === "play-icebreak-block")).toBe(false);
  expect(nullified.scenario?.checkpoints[2]?.complete).toBe(true);
});

test("Test Lab fixtures expose immediate reducer actions for the supported action families", () => {
  const actions = (scenarioId: string) => createPlayScenario(scenarioId).legalOptions.actions.map((action) => action.type);
  expect(actions("game-basics")).toContain("play-icebreak-block");
  expect(actions("search-and-move")).toContain("play-search");
  expect(actions("combat-and-control")).toEqual(expect.arrayContaining(["play-delete", "play-delete-multi", "play-icebreak-block"]));
  expect(actions("attachments")).toEqual(expect.arrayContaining(["attach-pawn", "attach-enemy"]));
  expect(actions("bonus-economy")).toContain("play-search");
  expect(actions("bonus-economy")).not.toContain("attach-pawn"); // Must first earn the attachment cost.
  expect(actions("effect-execution")).toContain("play-icebreak-block");
  expect(actions("reboot-and-turn")).toContain("play-reboot");
});

test("bonus-economy fixture creates, collects, and spends a bonus counter truthfully", () => {
  const created = createPlayScenario("bonus-economy");
  const search = created.legalOptions.actions.find((action) => action.type === "play-search") as { cardId: string; pawnId: string; placements: Array<{ dir: number; rotation: number }> };
  expect(search).toBeDefined();

  const placed = submitPlayCommand(created.id, {
    kind: "action",
    action: { type: "play-search", cardId: search.cardId, pawnId: search.pawnId, ...(search.placements.find((placement) => placement.dir === 0) ?? search.placements[0]!) },
  });
  expect(placed.result.accepted).toBe(true);
  expect(placed.state.bonusIcons).toHaveLength(1);
  expect(placed.scenario?.checkpoints[0]?.complete).toBe(true);

  const move = placed.legalOptions.actions.find((action) => action.type === "move-hex" && action.pawnId === "speedrunner-yellow") as { pawnId: string; directions: number[] };
  expect(move).toBeDefined();
  const moved = submitPlayCommand(created.id, {
    kind: "action",
    action: { type: "move-hex", pawnId: move.pawnId, dir: move.directions.find((dir) => dir === 0) ?? move.directions[0]! },
  });
  expect(moved.result.accepted).toBe(true);

  const icebreak = moved.legalOptions.actions.find((action) => action.type === "play-icebreak-block") as { cardId: string; pawnId: string; coord: { q: number; r: number } };
  expect(icebreak).toBeDefined();
  const collected = submitPlayCommand(created.id, {
    kind: "action",
    action: { type: "play-icebreak-block", cardId: icebreak.cardId, pawnId: icebreak.pawnId, coord: icebreak.coord },
  });
  expect(collected.result.accepted).toBe(true);
  expect(collected.players[0]!.bonus).toBe(1);
  expect(collected.state.bonusIcons[0]!.collectedBy).toBe("p1");
  expect(collected.scenario?.checkpoints[1]?.complete).toBe(true);

  const attach = collected.legalOptions.actions.find((action) => action.type === "attach-pawn" && action.cardId === "fixture-bonus-gadget") as { cardId: string; targetIds: string[] };
  expect(attach).toBeDefined();
  const spent = submitPlayCommand(created.id, {
    kind: "action",
    action: { type: "attach-pawn", cardId: attach.cardId, targetId: "speedrunner-yellow" },
  });
  expect(spent.result.accepted).toBe(true);
  expect(spent.players[0]!.bonus).toBe(0);
  expect(spent.state.pawns.find((pawn) => pawn.pawnId === "speedrunner-yellow")?.attachments?.[0]?.cardId).toBe("fixture-bonus-gadget");
  expect(spent.scenario?.checkpoints.every((checkpoint) => checkpoint.complete)).toBe(true);
});

test("effect-execution fixture drives typed card and block effects through the reducer", () => {
  const created = createPlayScenario("effect-execution");
  const icebreak = created.legalOptions.actions.find((action) => action.type === "play-icebreak-block") as { cardId: string; pawnId: string; coord: { q: number; r: number } };
  expect(icebreak).toBeDefined();

  const applied = submitPlayCommand(created.id, {
    kind: "action",
    action: { type: "play-icebreak-block", cardId: icebreak.cardId, pawnId: icebreak.pawnId, coord: icebreak.coord },
  });

  expect(applied.result.accepted).toBe(true);
  expect(applied.state.pawns.find((pawn) => pawn.pawnId === "cracker")?.ownerId).toBe("p1");
  expect(applied.state.pawns.find((pawn) => pawn.pawnId === "idoru")?.ownerId).toBe("p1");
  expect(applied.result.events.filter((event) => event.type === "pawn-placed").map((event) => event.elementId)).toEqual(expect.arrayContaining(["cracker", "idoru"]));
  expect(applied.scenario?.checkpoints.every((checkpoint) => checkpoint.complete)).toBe(true);
});

test("game basics fixture can place the last marker and declare a winner", () => {
  const created = createPlayScenario("game-basics");
  const marker = created.legalOptions.actions.find((action) => action.type === "play-icebreak-block") as any;
  expect(marker).toBeDefined();
  const applied = submitPlayCommand(created.id, { kind: "action", action: { type: "play-icebreak-block", pawnId: marker.pawnId, cardId: marker.cardId, coord: marker.coord } });
  expect(applied.result.accepted).toBe(true);
  expect(applied.state.winnerId).toBe(applied.activePlayer?.id);
  expect(applied.scenario?.checkpoints.every((checkpoint) => checkpoint.complete)).toBe(true);
});

test("Test Lab Split Delete is an explicit reducer-validated fixture action", () => {
  const created = createPlayScenario("combat-and-control");
  const split = created.legalOptions.actions.find((action) => action.type === "play-delete-multi") as { pawnId: string; cardId: string; targetIds: string[] };
  expect(split).toBeDefined();
  const applied = submitPlayCommand(created.id, { kind: "action", action: { type: "play-delete-multi", cardId: split.cardId, pawnId: split.pawnId, targetIds: split.targetIds.filter((id) => id !== "speedrunner-red") } });
  expect(applied.result.accepted).toBe(true);
  expect(applied.scenario?.checkpoints[1]?.complete).toBe(true);
});


test("phase card sandbox choices use engine targets, preserve duplicate counts and replay",()=>{
  for(const id of ["phase-jetpack","phase-insider-trading"]) {
    const created=createPlayScenario(id),started=submitPlayCommand(created.id,{kind:"phase"});
    const before=getPlaySession(created.id).state;
    expect(getPlaySession(created.id).state).toEqual(before);
    const action=id==="phase-jetpack"?{optionId:"relocate" as const,...started.legalOptions.choiceTargets![0]}:{optionId:"discard" as const,cardIds:["dj","dj"]};
    const resolved=submitPlayCommand(created.id,{kind:"action",action:{type:"resolve-choice",choiceId:started.state.pendingChoice.id,...action}});
    expect(resolved.result.accepted).toBe(true);expect(resolved.state.phase).toBe("action");
    expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(resolved.state);
    expect(undoPlayCommand(created.id).state).toEqual(started.state);
    expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(started.state);
  }
  const sheep=createPlayScenario("phase-electric-sheep"),result=submitPlayCommand(sheep.id,{kind:"phase"});
  expect(result.result.accepted).toBe(true);expect(result.state.eliminated).toContain(result.state.players[0].pawnId);expect(result.state.players[0].hand).toHaveLength(6);
  expect(importPlayTrace(exportPlayTrace(sheep.id)).state).toEqual(result.state);
});


test("Dummy fixture exposes a defender response and replays pending prevention across turns",()=>{
  const created=createPlayScenario("elimination-prevention");
  const attack=created.legalOptions.actions.find(a=>a.type==="roll-delete")!;
  const rolled=submitPlayCommand(created.id,{kind:"action",action:{type:"roll-delete",pawnId:attack.pawnId as string,cardId:attack.cardId as string}});
  const defender=rolled.state.players[1].pawnId;
  const assigned=submitPlayCommand(created.id,{kind:"action",action:{type:"assign-delete",targetIds:[defender]}});
  expect(assigned.result.accepted).toBe(true);expect(assigned.state.pendingChoice.playerId).toBe("p2");
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(assigned.state);
  const response=assigned.legalOptions.choiceResponses!.find(a=>a.optionId==="prevent")!;
  const resolved=submitPlayCommand(created.id,{kind:"action",action:response});
  expect(resolved.result.accepted).toBe(true);expect(resolved.state.currentPlayer).toBe(0);expect(resolved.state.pawns.some((p:any)=>p.pawnId===defender)).toBe(true);
  expect(resolved.state.players[1].bonus).toBe(1);expect(resolved.events.some(e=>e.type==="elimination-prevented")).toBe(true);
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(resolved.state);expect(undoPlayCommand(created.id).state).toEqual(assigned.state);
});

test("malware fixture filters Operatives through engine options and replays attachment state",()=>{
  for(const cardId of ["worm","under-clocker","hijacker"]) {
    const created=createPlayScenario("attachment-restrictions");
    const option=created.legalOptions.actions.find(action=>action.type==="attach-enemy" && action.cardId===cardId)!;
    expect(option.targetIds).toEqual(["fixture-malware-target"]);
    const before=getPlaySession(created.id).state;
    const rejected=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-enemy",pawnId:option.pawnId as string,cardId,targetId:created.state.players[1].pawnId}});
    expect(rejected.result.accepted).toBe(false);expect(rejected.state).toEqual(before);
    const applied=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-enemy",pawnId:option.pawnId as string,cardId,targetId:"fixture-malware-target"}});
    expect(applied.result.accepted).toBe(true);expect(applied.pawnClasses["fixture-malware-target"]).toEqual(["fixture-subject","malware"]);
    expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(applied.state);
    expect(undoPlayCommand(created.id).state).toEqual(before);
  }
});

test("granted-slot fixture preserves chosen locations, replay, refunds and nested cleanup",()=>{
  const created=createPlayScenario("attachment-slots");let current=created;
  const gadget=current.legalOptions.actions.filter(action=>action.type==="attach-pawn" && action.cardId==="fixture-slot-gadget");
  expect(gadget.map(action=>action.slotRef)).toEqual(["pawn:gadget","pawn:add-on/gadget"]);
  const before=current.state;
  const ambiguous=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-pawn",cardId:"fixture-slot-gadget",targetId:current.state.players[0].pawnId}});
  expect(ambiguous.result.accepted).toBe(false);expect(ambiguous.state).toEqual(before);
  for(const cardId of ["fixture-slot-gadget","fixture-slot-weapon","fixture-slot-module"]) {
    const option=current.legalOptions.actions.find(action=>action.type==="attach-pawn" && action.cardId===cardId && (cardId!=="fixture-slot-gadget" || action.slotRef==="pawn:add-on/gadget"))!;
    current=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-pawn",cardId,targetId:(option.targetIds as string[])[0],slotRef:option.slotRef as string}});
    expect(current.result.accepted).toBe(true);
    expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(current.state);
  }
  const attached=current.state;
  expect(attached.pawns.find((pawn:any)=>pawn.ownerId==="p1").attachments.at(-1).slotRef).toBe("pawn:add-on/weapon/module");
  for(let phase=0;phase<8;phase++) {current=submitPlayCommand(created.id,{kind:"phase"});expect(current.result.accepted).toBe(true);}
  expect(current.state.phase).toBe("action");expect(current.players[0]!.bonus).toBe(10);
  expect(current.scenario?.checkpoints.every(checkpoint=>checkpoint.complete)).toBe(true);
  expect(current.state.pawns.find((pawn:any)=>pawn.ownerId==="p1").attachments).toEqual([]);
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(current.state);
  const undone=undoPlayCommand(created.id);expect(undone.state.phase).toBe("beginning");expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(undone.state);
});


test("source replay rejects prior movement, choice and slot checksums while retaining the frozen corpus",()=>{
 const created=createPlayScenario("source-foundation"),trace=exportPlayTrace(created.id);
 const previousTheft=createHash("sha256").update("source-v13/native-phase-theft\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousTheft})).toThrow(/rules version/);
 const prior=createHash("sha256").update(["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");
 const priorNative=createHash("sha256").update("source-v12/physical-bonus-reserve\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:priorNative})).toThrow(/rules version/);
 expect(created.state.rulesVersion).toBe("source-v21");expect(trace.dataChecksum).not.toBe(prior);
 expect(()=>importPlayTrace({...trace,dataChecksum:prior})).toThrow(/rules version/);
 const previousChoice=createHash("sha256").update("source-v2/physical-slots\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousChoice})).toThrow(/rules version/);
 const previousMovement=createHash("sha256").update("source-v3/search-choice\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousMovement})).toThrow(/rules version/);
 const previousMarkers=createHash("sha256").update("source-v4/rolled-movement\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousMarkers})).toThrow(/rules version/);
 const previousZero=createHash("sha256").update("source-v5/physical-use-markers\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousZero})).toThrow(/rules version/);
 const previousReserve=createHash("sha256").update("source-v11/global-pawn-sacrifice\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousReserve})).toThrow(/rules version/);
 const previousSacrifices=createHash("sha256").update("source-v10/optional-space-discard\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousSacrifices})).toThrow(/rules version/);
 const previousSpaceEffects=createHash("sha256").update("source-v9/internal-arrows-block-discards\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousSpaceEffects})).toThrow(/rules version/);
 const previousBlockDiscards=createHash("sha256").update("source-v8/control-card-markers\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousBlockDiscards})).toThrow(/rules version/);
 const previousCardMarkers=createHash("sha256").update("source-v7/neutral-pawn-defense-spaces\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousCardMarkers})).toThrow(/rules version/);
 const previousDefense=createHash("sha256").update("source-v6/zero-step-movement\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:previousDefense})).toThrow(/rules version/);
 const regression=createPlaySession({playerNames:["A","B"],seed:5});expect(exportPlayTrace(regression.id).dataChecksum).toBe(playDataChecksum);
});

test("printed Delete sandbox queries, payments, free use and public rolls replay identically",()=>{
  const created=createPlayScenario("printed-delete");let current=created;
  const pawnId=current.state.players[0].pawnId;
  for(const cardId of ["weapon-gunhed","ak-12km","fixture-module-adapter","servocanon"]) {
    current=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-pawn",cardId,targetId:pawnId}});expect(current.result.accepted).toBe(true);
  }
  expect(current.pawnDeleteProfiles[pawnId]).toEqual({skulls:3,card:true,freeActivators:1,cancelled:false});expect(current.players[0]!.bonus).toBe(0);
  for(const cardId of [undefined,"dummy"]) {
    current=submitPlayCommand(created.id,{kind:"action",action:{type:"roll-delete",pawnId,...(cardId?{cardId}:{})}});expect(current.result.accepted).toBe(true);expect(current.state.pendingAttack.roll).toHaveLength(3);
    expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(current.state);
    current=submitPlayCommand(created.id,{kind:"action",action:{type:"assign-delete",targetIds:["","",""]}});expect(current.result.accepted).toBe(true);
  }
  expect(current.scenario?.checkpoints.every(checkpoint=>checkpoint.complete)).toBe(true);
  expect(current.legalOptions.actions.filter(action=>action.type==="roll-delete").every(action=>!!action.cardId)).toBe(true);
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(current.state);expect(undoPlayCommand(created.id).state.pendingAttack.roll).toHaveLength(3);
});

test("Virus sandbox transfers the control card, refunds its previous owner and replays cleanup",()=>{
  const created=createPlayScenario("virus-control"),option=created.legalOptions.actions.find(action=>action.type==="attach-enemy" && action.cardId==="virus")!;
  expect(option.targetIds).toEqual([created.state.players[1].pawnId]);expect(option.slotRef).toBe("pawn:add-on/add-on");
  const applied=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-enemy",pawnId:option.pawnId as string,targetId:(option.targetIds as string[])[0],cardId:"virus",slotRef:option.slotRef as string}});
  expect(applied.result.accepted).toBe(true);expect(applied.players[1]!.bonus).toBe(4);expect(applied.scenario?.checkpoints.every(checkpoint=>checkpoint.complete)).toBe(true);
  expect(applied.state.controlCards.find((card:any)=>card.subject.id===created.state.players[1].pawnId).ownerId).toBe("p1");
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(applied.state);expect(undoPlayCommand(created.id).state).toEqual(created.state);
});

test("Lima Flag previews exclude Core entry and preserve state/RNG through rejected movement and replay",()=>{
  const created=createPlayScenario("lima-flag"),pawnId=created.state.players[0].pawnId;
  const preview=getMovementOptions(created.id,pawnId,[],"dummy");expect(preview.nextTargets.some(target=>target.coord.q===0)).toBe(false);expect(preview.nextTargets.some(target=>target.coord.q===2)).toBe(true);expect(getPlaySession(created.id).state).toEqual(created.state);
  const rejected=submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",pawnId,cardId:"dummy",path:[{coord:{q:0,r:0},spaceId:"core"}]}});expect(rejected.result.accepted).toBe(false);expect(rejected.state).toEqual(created.state);
  const moved=submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",pawnId,cardId:"dummy",path:[{coord:{q:2,r:0},spaceId:"a"}]}});expect(moved.result.accepted).toBe(true);expect(moved.scenario?.checkpoints.every(checkpoint=>checkpoint.complete)).toBe(true);
  expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(moved.state);expect(undoPlayCommand(created.id).state).toEqual(created.state);
});


test("Trojan sandbox player views reveal the controller and replay/undo without leaking transport internals",()=>{
  const created=createPlayScenario("trojan-reveal"),before=getPlayPlayerView(created.id,"p1");
  expect(before.view.players[1]!.hand).toEqual({count:2,visibility:"hidden",cards:[]});
  const option=created.legalOptions.actions.find(action=>action.type==="attach-enemy" && action.cardId==="trojan")!;
  const applied=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-enemy",pawnId:option.pawnId as string,targetId:(option.targetIds as string[])[0],cardId:"trojan"}});expect(applied.result.accepted).toBe(true);
  const visible=getPlayPlayerView(created.id,"p1"),spectator=getPlayPlayerView(created.id);
  expect(visible.view.players[1]!.hand).toEqual({count:2,visibility:"face-up",cards:["dummy","dj"]});expect(spectator.view.players[0]!.hand.visibility).toBe("hidden");expect(spectator.view.options).toEqual([]);
  expect(applied.playerView).toEqual(visible.view);expect(applied.scenario?.checkpoints.every(checkpoint=>checkpoint.complete)).toBe(true);
  expect(Object.keys(visible).sort()).toEqual(["events","view"]);for(const key of ["rng","seed","state","setup","recoveryTrace","blockPile","deck"]) expect(key in visible.view).toBe(false);
  const replayed=importPlayTrace(exportPlayTrace(created.id));expect(getPlayPlayerView(replayed.id,"p1")).toEqual(visible);
  expect(undoPlayCommand(created.id).playerView).toEqual(before.view);expect(()=>getPlayPlayerView(created.id,"unknown")).toThrow(/viewer/);
});


test("source Search sandbox commits one cost, reveals before placement and replays both windows",()=>{
 const created=createPlayScenario("source-search"),actor=created.state.players[0].pawnId;
 const search=created.legalOptions.actions.find(action=>action.type==="play-search" && action.cardId==="dj")!;expect(search.revealsBlock).toBe(true);expect(search.placements).toBeUndefined();
 expect(created.playerView.revealedBlock).toBeUndefined();
 const declared=submitPlayCommand(created.id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(declared.result.accepted).toBe(true);expect(declared.state.pendingChoice.kind).toBe("place-block");expect(declared.state.blocks).toHaveLength(1);expect(declared.state.discard).toEqual(["dj"]);expect(declared.legalOptions.actions).toEqual([]);
 expect(getPlayPlayerView(created.id,"p2").view.revealedBlock).toEqual({blockId:"fixture-search-tile",reference:{q:0,r:0}});
 const replayed=importPlayTrace(exportPlayTrace(created.id));expect(replayed.state).toEqual(declared.state);expect(replayed.legalOptions).toEqual(declared.legalOptions);
 const response=declared.legalOptions.choiceResponses[0]!;
 const rejected=submitPlayCommand(created.id,{kind:"action",action:{...response,playerId:"p2"}});expect(rejected.result.accepted).toBe(false);expect(rejected.state).toEqual(declared.state);
 const placed=submitPlayCommand(created.id,{kind:"action",action:response});expect(placed.result.accepted).toBe(true);expect(placed.state.pendingChoice).toBeUndefined();expect(placed.state.blocks).toHaveLength(2);expect(placed.state.discard).toEqual(["dj"]);expect(placed.scenario?.checkpoints.every(checkpoint=>checkpoint.complete)).toBe(true);
 expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(placed.state);expect(undoPlayCommand(created.id).state).toEqual(declared.state);expect(undoPlayCommand(created.id).state).toEqual(created.state);
});


test("rolled movement sandbox previews the committed budget, occupied pass-through, replay and undo",()=>{
 const created=createPlayScenario("rolled-movement"),pawnId=created.state.players[0].pawnId;
 expect(created.legalOptions.actions.some(a=>a.type==="roll-movement")).toBe(true);expect(()=>getMovementOptions(created.id,pawnId,[])).toThrow(/roll movement/);
 const started=submitPlayCommand(created.id,{kind:"action",action:{type:"roll-movement",pawnId}});expect(started.result.accepted).toBe(true);expect(started.state.pendingChoice.kind).toBe("move-path");
 const pending=started.state,choice=pending.pendingChoice,preview=getMovementOptions(created.id,pawnId,[]);expect(preview.maxSelectableSteps).toBe(choice.movement.budget);expect(preview.exactBudgetKnown).toBe(true);expect(preview.roll).toEqual(choice.movement.roll);
 const occupied=getMovementOptions(created.id,pawnId,[{coord:{q:1,r:0},spaceId:"b"}]);expect(occupied.canFinish).toBe(false);expect(occupied.nextTargets.some(t=>t.spaceId==="c")).toBe(true);expect(getPlaySession(created.id).state).toEqual(pending);
 expect(getPlayPlayerView(created.id,"p2").view.movement!.roll).toEqual(choice.movement.roll);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(pending);
 const invalid=submitPlayCommand(created.id,{kind:"action",action:{type:"resolve-choice",choiceId:choice.id,optionId:"move",path:[{coord:{q:1,r:0},spaceId:"b"}]}});expect(invalid.result.accepted).toBe(false);expect(invalid.state).toEqual(pending);
 const finished=submitPlayCommand(created.id,{kind:"action",action:{type:"resolve-choice",choiceId:choice.id,optionId:"move",path:[{coord:{q:1,r:0},spaceId:"b"},{coord:{q:1,r:0},spaceId:"c"}]}});expect(finished.result.accepted).toBe(true);expect(finished.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(finished.legalOptions.actions.filter(a=>a.type==="roll-movement")).toEqual([]);expect(finished.legalOptions.actions.some(a=>a.type==="play-move")).toBe(true);
 expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(finished.state);expect(undoPlayCommand(created.id).state).toEqual(pending);expect(undoPlayCommand(created.id).state).toEqual(created.state);
});


test("physical-use marker sandbox keeps captured uses, resets at the controller beginning and replays",()=>{
 const created=createPlayScenario("physical-use-markers"),target=created.state.players[1].pawnId,actor=created.state.players[0].pawnId;
 expect(created.playerView.useMarkers[0]!.ownerId).toBe("p2");
 let current=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-enemy",pawnId:actor,targetId:target,cardId:"virus"}});expect(current.result.accepted).toBe(true);expect(current.playerView.useMarkers[0]!.ownerId).toBe("p1");expect(current.legalOptions.actions.some(a=>a.type==="move-steps" && a.pawnId===target)).toBe(false);
 const captured=current.state;const rejected=submitPlayCommand(created.id,{kind:"action",action:{type:"move-steps",pawnId:target,path:[{coord:{q:1,r:0},spaceId:"a"}]}});expect(rejected.result.accepted).toBe(false);expect(rejected.state).toEqual(captured);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(captured);
 for(let i=0;i<8;i++) {current=submitPlayCommand(created.id,{kind:"phase"});expect(current.result.accepted).toBe(true);}
 expect(current.playerView.useMarkers).toEqual([]);expect(current.legalOptions.actions.some(a=>a.type==="move-steps" && a.pawnId===target)).toBe(true);expect(current.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(current.state);expect(undoPlayCommand(created.id).playerView.useMarkers).toHaveLength(1);
});


test("zero-step sandbox exposes isolated activations, spends costs and replays undo",()=>{
 const created=createPlayScenario("zero-step-movement"),actor=created.state.players[0].pawnId;
 expect(created.legalOptions.actions.some(a=>a.type==="move-steps")).toBe(true);expect(getMovementOptions(created.id,actor,[]).canFinish).toBe(true);expect(getMovementOptions(created.id,actor,[]).nextTargets).toEqual([]);
 const free=submitPlayCommand(created.id,{kind:"action",action:{type:"move-steps",pawnId:actor,path:[]}});expect(free.result.accepted).toBe(true);expect(free.playerView.useMarkers).toHaveLength(1);expect(free.legalOptions.actions.some(a=>a.type==="move-steps")).toBe(false);
 expect(getMovementOptions(created.id,actor,[],"move-1").canFinish).toBe(true);const paid=submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path:[]}});expect(paid.result.accepted).toBe(true);expect(paid.state.playedCards).toEqual(["move-1"]);expect(paid.players[0]!.hand).toHaveLength(1);expect(paid.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(paid.state);expect(undoPlayCommand(created.id).state).toEqual(free.state);expect(undoPlayCommand(created.id).state).toEqual(created.state);
});


test("Toyeku sandbox reveals its real tile, places neutral Idoru and projects current defense through replay",()=>{
 const created=createPlayScenario("toyeku-neutral"),actor=created.state.players[0].pawnId;const draw=submitPlayCommand(created.id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(draw.result.accepted).toBe(true);expect(draw.playerView.revealedBlock!.blockId).toBe("idoru");
 const placed=submitPlayCommand(created.id,{kind:"action",action:draw.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});expect(placed.result.accepted).toBe(true);expect(placed.state.pawns.find((p:any)=>p.pawnId==="idoru").ownerId).toBe("");expect(placed.playerView.controlCards.find(c=>c.subject.id==="idoru")!.zone).toBe("common");expect(placed.data.pawns.find(p=>p.id==="idoru")!.provisional).toBe(true);
 const path=[{coord:{q:1,r:0},spaceId:"idoru"},{coord:{q:1,r:0},spaceId:"defense"}],preview=getMovementOptions(created.id,actor,path,"dummy");expect(preview.canFinish).toBe(true);expect(getPlaySession(created.id).state).toEqual(placed.state);
 const moved=submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"dummy",path}});expect(moved.result.accepted).toBe(true);expect(moved.pawnDefenseProfiles[actor].dice.find(d=>d.value===1)!.shielded).toBe(false);expect(moved.data.blocks.find(b=>b.id==="idoru")!.iceFaces).toEqual([3,4,6]);expect(moved.data.blocks.find(b=>b.id==="idoru")!.nonPlayableZoneIds).toEqual(["h1"]);expect(moved.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(moved.state);expect(undoPlayCommand(created.id).state).toEqual(placed.state);
});

test("Idoru sandbox uses engine acquisition, exposes card markers and restores immediate victory",()=>{
 const created=createPlayScenario("idoru-marker-victory"),actor=created.state.players[0].pawnId;
 expect(created.legalOptions.actions.some(a=>a.type==="play-icebreak-pawn" && a.targetIds?.includes("idoru"))).toBe(true);
 const gained=submitPlayCommand(created.id,{kind:"action",action:{type:"play-icebreak-pawn",pawnId:actor,targetId:"idoru",cardId:"worm"}});
 expect(gained.result.accepted).toBe(true);expect(gained.state.winnerId).toBe("p1");expect(gained.playerView.controlCardMarkers).toEqual([{playerId:"p1",cardId:"idoru-control",amount:1}]);expect(gained.data.pawns.find(p=>p.id==="idoru")!.iceFaces).toEqual([1,6]);expect(gained.scenario?.checkpoints.every(c=>c.complete)).toBe(true);
 expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(gained.state);expect(undoPlayCommand(created.id).state).toEqual(created.state);
});

test("Sprawl sandbox retains staged private commitments across trace replay and undo",()=>{
 const created=createPlayScenario("sprawl-discard"),actor=created.state.players[0].pawnId;const drawn=submitPlayCommand(created.id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});const placed=submitPlayCommand(created.id,{kind:"action",action:drawn.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});expect(placed.result.accepted).toBe(true);expect(placed.state.pendingBlockDiscards.decisions.map((d:any)=>d.amount)).toEqual([2,1]);
 const p2=placed.state.pendingBlockDiscards.decisions[1];const first=submitPlayCommand(created.id,{kind:"action",action:{type:"resolve-choice",playerId:"p2",choiceId:p2.id,optionId:"discard",cardIds:["worm"]}});expect(first.result.accepted).toBe(true);expect(first.state.discard).toEqual(["dj"]);expect(JSON.stringify(getPlayPlayerView(created.id,"p1").view)).not.toContain("worm");expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(first.state);
 const final=submitPlayCommand(created.id,{kind:"action",action:{type:"resolve-choice",playerId:"p1",choiceId:first.state.pendingChoice.id,optionId:"discard",cardIds:["move-1","move-1"]}});expect(final.result.accepted).toBe(true);expect(final.state.discard).toEqual(["dj","move-1","move-1","worm"]);expect(final.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(undoPlayCommand(created.id).state).toEqual(first.state);
});

test("internal-arrow sandbox previews reject the reverse link until Octagon is attached",()=>{
 const created=createPlayScenario("internal-arrows"),actor=created.state.players[0].pawnId,reverse=[{coord:{q:1,r:0},spaceId:"rabbit"}];expect(getMovementOptions(created.id,actor,[],"move-1").nextTargets.some(t=>t.spaceId==="rabbit")).toBe(false);const before=created.state;expect(submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path:reverse}}).result.accepted).toBe(false);expect(getPlaySession(created.id).state).toEqual(before);
 const attached=submitPlayCommand(created.id,{kind:"action",action:{type:"attach-pawn",cardId:"octagon-dex",targetId:actor}});expect(attached.result.accepted).toBe(true);expect(getMovementOptions(created.id,actor,[],"move-1").nextTargets.some(t=>t.spaceId==="rabbit")).toBe(true);const moved=submitPlayCommand(created.id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path:reverse}});expect(moved.result.accepted).toBe(true);expect(moved.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(importPlayTrace(exportPlayTrace(created.id)).state).toEqual(moved.state);
});

test("Pink sandbox uses Search/control to place one Gynoid and preserves matching-home replay",()=>{
 const s=createPlayScenario("pink-control"),id=s.id,actor=s.state.players[0].pawnId;let current=submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});current=submitPlayCommand(id,{kind:"action",action:current.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});expect(current.state.reserve).toContain("gynoid");expect(current.state.pawns.some((p:any)=>p.pawnId==="gynoid")).toBe(false);const before=current.state;getMovementOptions(id,actor,[],"move-2");expect(getPlaySession(id).state).toEqual(before);current=submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"gynoid"}]}});current=submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(current.result.accepted).toBe(true);expect(current.result.events.find(e=>e.type==="roll")!.roll![0]).toBe(2);expect(current.state.pawns.find((p:any)=>p.pawnId==="gynoid")).toMatchObject({ownerId:"p1",q:1,r:0,spaceId:"gynoid"});expect(current.state.controlCards.find((c:any)=>c.subject.id==="gynoid")).toMatchObject({ownerId:"p1",zone:"control"});expect(importPlayTrace(exportPlayTrace(id)).state).toEqual(current.state);expect(undoPlayCommand(id).state.reserve).toContain("gynoid");
});

test("Gynoid sandbox exposes private count-only decisions and deterministic theft/decline recovery",()=>{
 const s=createPlayScenario("gynoid-theft",{playerNames:["Ada","Bea","Cy"],seed:5}),id=s.id;const opened=submitPlayCommand(id,{kind:"phase"});expect(opened.state.pendingChoice.kind).toBe("steal-card");expect(opened.legalOptions.choiceResponses!.some(a=>a.optionId==="skip")).toBe(true);expect(JSON.stringify(opened.legalOptions.choiceResponses)).not.toContain("move-1");const victim=opened.state.players[1].pawnId,choice=opened.legalOptions.choiceResponses!.find(a=>a.targetId===victim)!,trace=exportPlayTrace(id),after=submitPlayCommand(id,{kind:"action",action:choice});expect(after.result.accepted).toBe(true);expect(after.state.players.map((p:any)=>p.hand.length)).toEqual([2,2,0]);expect(after.result.events.some(e=>e.type==="draw")).toBe(false);for(const who of ["p1","p2"])expect(getPlayPlayerView(id,who).events.find(e=>e.type==="card-stolen")!.cardId).toBeDefined();for(const who of ["p3",""])expect(getPlayPlayerView(id,who).events.find(e=>e.type==="card-stolen")!.cardId).toBeUndefined();expect(undoPlayCommand(id).state).toEqual(opened.state);const resumed=importPlayTrace(trace);expect(submitPlayCommand(resumed.id,{kind:"action",action:choice}).state).toEqual(after.state);const skipped=submitPlayCommand(id,{kind:"action",action:opened.legalOptions.choiceResponses!.find(a=>a.optionId==="skip")!});expect(skipped.state.players.map((p:any)=>p.hand.length)).toEqual([1,3,0]);expect(skipped.state.phase).toBe("action");expect(resetPlaySession(id).state).toEqual(s.state);
});

test("Broadcast sandbox consumes destination options and replays, undoes and resets the paid Reboot",()=>{
 const session=createPlayScenario("broadcast-reboot"),id=session.id,before=JSON.stringify(session.state),checksum=session.dataChecksum;
 const options=session.legalOptions.actions.filter((a:any)=>a.type==="play-reboot-card" && a.cardId==="move-1");expect(options.map((a:any)=>a.spaceId)).toEqual(["core","broadcast"]);expect(options.map((a:any)=>a.label)).toEqual(["Play Uplink: Reboot at Central Core","Play Uplink: Reboot at Clandestine Broadcast"]);expect(JSON.stringify(getPlaySession(id).state)).toBe(before);
 const option=options[1] as any,after=submitPlayCommand(id,{kind:"action",action:{type:option.type,pawnId:option.pawnId,cardId:option.cardId,coord:option.coord,spaceId:option.spaceId}});expect(after.state.pawns.find((p:any)=>p.pawnId===option.pawnId)!.spaceId).toBe("broadcast");expect(after.state.playedCards).toEqual(["move-1"]);expect(after.state.eliminated).toEqual([]);
 const trace=exportPlayTrace(id),replayed=importPlayTrace(trace);expect(replayed.state).toEqual(after.state);expect(trace.dataChecksum).toBe(checksum);expect(undoPlayCommand(id).state).toEqual(session.state);expect(resetPlaySession(replayed.id).state).toEqual(session.state);expect(JSON.stringify(getPlaySession(id).state)).toBe(before);
});
test("Yakuza sandbox exposes engine-owned target and defender windows through pure previews, replay, undo and reset",()=>{
 const initial=createPlayScenario("yakuza-attack"),id=initial.id,actor=initial.state.players[0].pawnId,target=initial.state.players[1].pawnId;
 submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});
 let current=getPlaySession(id);submitPlayCommand(id,{kind:"action",action:current.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});
 submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"dragon"}]}});
 current=submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(current.result.accepted).toBe(true);expect(current.state.pendingChoice.kind).toBe("block-attack");
 const pending=current.state;expect(getPlaySession(id).state).toEqual(pending);expect(getPlaySession(id).legalOptions).toEqual(current.legalOptions);
 const trace=exportPlayTrace(id),attack=current.legalOptions.choiceResponses.find(a=>a.targetId===target)!;
 current=submitPlayCommand(id,{kind:"action",action:attack});expect(current.result.events.find(e=>e.type==="roll")!.roll).toEqual([3]);expect(current.state.pendingChoice).toMatchObject({kind:"prevent-elimination",playerId:"p2"});const threatened=current.state,defenseTrace=exportPlayTrace(id),saved=current.legalOptions.choiceResponses.find(a=>a.optionId==="prevent")!;
 current=submitPlayCommand(id,{kind:"action",action:saved});expect(current.result.events.some(e=>e.type==="roll")).toBe(false);expect(current.result.events.some(e=>e.type==="elimination-prevented")).toBe(true);expect(current.state.pawns.find((p:any)=>p.pawnId===target).attachments).toEqual([]);expect(current.scenario?.checkpoints.every(c=>c.complete)).toBe(true);
 expect(importPlayTrace(exportPlayTrace(id)).state).toEqual(current.state);expect(undoPlayCommand(id).state).toEqual(threatened);const recovered=importPlayTrace(defenseTrace);expect(submitPlayCommand(recovered.id,{kind:"action",action:saved}).state).toEqual(current.state);
 const reopened=importPlayTrace(trace);expect(reopened.state).toEqual(pending);expect(submitPlayCommand(reopened.id,{kind:"action",action:attack}).state).toEqual(threatened);expect(resetPlaySession(id).state).toEqual(initial.state);
});
test("Corporate Scandal sandbox counts Idoru, preserves played payment and restores whole-hand results through replay/undo",()=>{
 const initial=createPlayScenario("corporate-scandal"),id=initial.id,actor=initial.state.players[0].pawnId;
 submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});let current=getPlaySession(id);submitPlayCommand(id,{kind:"action",action:current.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});expect(getPlaySession(id).state.players.map((p:any)=>p.hand.length)).toEqual([4,3]);
 submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"lower-swirl"}]}});const ready=getPlaySession(id),trace=exportPlayTrace(id);getMovementOptions(id,actor,[],"move-1");expect(getPlaySession(id).state).toEqual(ready.state);
 current=submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(current.result.accepted).toBe(true);expect(current.result.events.find(e=>e.type==="roll")!.roll).toEqual([6]);expect(current.state.players.map((p:any)=>p.hand)).toEqual([[],[]]);expect(current.state.playedCards).toEqual(["move-2","worm"]);expect(current.result.events.filter(e=>e.type==="card-discarded")).toHaveLength(5);expect(current.scenario?.checkpoints.every(c=>c.complete)).toBe(true);
 expect(importPlayTrace(exportPlayTrace(id)).state).toEqual(current.state);expect(undoPlayCommand(id).state).toEqual(ready.state);const recovered=importPlayTrace(trace);expect(submitPlayCommand(recovered.id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}}).state).toEqual(current.state);expect(resetPlaySession(id).state).toEqual(initial.state);
 const prior=createHash("sha256").update("source-v14/adjacent-block-attack\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:prior})).toThrow(/rules version/);
});
test("Black Clinic sandbox restores target/cleanup and current hand-space limit through replay, undo, recycling and reset",()=>{
 const initial=createPlayScenario("black-clinic"),id=initial.id,actor=initial.state.players[0].pawnId;submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});let current=getPlaySession(id);submitPlayCommand(id,{kind:"action",action:current.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"clinic"}]}});
 current=submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(current.state.pendingChoice.kind).toBe("block-detach");const pending=current.state,trace=exportPlayTrace(id),choice=current.legalOptions.choiceResponses.find(a=>a.targetId===actor)!;getPlayPlayerView(id,"p2");expect(getPlaySession(id).state).toEqual(pending);expect(current.legalOptions.choiceResponses.some(a=>a.optionId==="skip")).toBe(false);
 current=submitPlayCommand(id,{kind:"action",action:choice});expect(current.result.accepted).toBe(true);expect(current.state.players[0].bonus).toBe(6);expect(current.state.pawns.find((p:any)=>p.pawnId===actor).attachments).toEqual([]);expect(undoPlayCommand(id).state).toEqual(pending);const restored=importPlayTrace(trace);expect(submitPlayCommand(restored.id,{kind:"action",action:choice}).state).toEqual(current.state);submitPlayCommand(id,{kind:"action",action:choice});
 current=submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path:[{coord:{q:1,r:0},spaceId:"hand"}]}});expect(current.playerView.players[0].handSize).toEqual({base:5,attachments:0,spaces:-1,maximum:4});expect(importPlayTrace(exportPlayTrace(id)).state).toEqual(current.state);submitPlayCommand(id,{kind:"phase"});current=submitPlayCommand(id,{kind:"action",action:{type:"recycle"}});expect(current.state.players[0].hand).toHaveLength(4);expect(current.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(resetPlaySession(id).state).toEqual(initial.state);
 const prior=createHash("sha256").update("source-v15/marker-hand-discard\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:prior})).toThrow(/rules version/);
});
test("Engineering War sandbox preserves two entrances, physical control, native use and public Delete assignment through replay/undo",()=>{
 const initial=createPlayScenario("engineering-mk2"),id=initial.id,actor=initial.state.players[0].pawnId,target=initial.state.players[1].pawnId;let current=submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(current.legalOptions.choiceResponses.filter(a=>a.optionId?.startsWith("place:0:")).map(a=>a.optionId)).toEqual(["place:0:2","place:0:5"]);submitPlayCommand(id,{kind:"action",action:current.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:5")!});expect(getPlaySession(id).state.reserve).toContain("drone-mk-2");
 submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"defense"},{coord:{q:1,r:0},spaceId:"drone-mk-2"}]}});current=submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(current.state.controlCards.find((c:any)=>c.subject.id==="drone-mk-2")).toMatchObject({zone:"control",ownerId:"p1"});const controlled=current.state;expect(getMovementOptions(id,"drone-mk-2",[]).maxSelectableSteps).toBe(5);expect(getPlaySession(id).state).toEqual(controlled);
 current=submitPlayCommand(id,{kind:"action",action:{type:"move-steps",pawnId:"drone-mk-2",path:[{coord:{q:1,r:0},spaceId:"defense"},{coord:{q:0,r:0},spaceId:"core"}]}});expect(current.result.accepted).toBe(true);const spent=current.state;current=submitPlayCommand(id,{kind:"action",action:{type:"roll-delete",pawnId:"drone-mk-2",cardId:"move-1"}});expect(current.state.pendingAttack.roll).toEqual([3]);const pending=current.state,trace=exportPlayTrace(id);expect(importPlayTrace(trace).state).toEqual(pending);current=submitPlayCommand(id,{kind:"action",action:{type:"assign-delete",targetIds:[target]}});expect(current.state.eliminated).toContain(target);expect(current.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(undoPlayCommand(id).state).toEqual(pending);expect(undoPlayCommand(id).state).toEqual(spent);const recovered=importPlayTrace(trace);expect(submitPlayCommand(recovered.id,{kind:"action",action:{type:"assign-delete",targetIds:[target]}}).state).toEqual(current.state);expect(resetPlaySession(id).state).toEqual(initial.state);
 const prior=createHash("sha256").update("source-v16/global-pawn-detachment\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:prior})).toThrow(/rules version/);
});
test("Drone Probe sandbox preserves cost-free Search, separate native movement, hidden-safe options and both reveal windows through replay/undo",()=>{
 const initial=createPlayScenario("drone-probe"),id=initial.id,actor=initial.state.players[0].pawnId;let current=submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(current.legalOptions.choiceResponses.filter(a=>a.optionId?.startsWith("place:0:")).map(a=>a.optionId)).toEqual(["place:0:1","place:0:2","place:0:4","place:0:5"]);submitPlayCommand(id,{kind:"action",action:current.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:5")!});submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"left"},{coord:{q:1,r:0},spaceId:"drone-probe"}]}});current=submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});
 const controlled=current.state,hand=current.state.players[0].hand;expect(current.legalOptions.actions.some(a=>a.type==="search" && a.pawnId==="drone-probe")).toBe(true);getMovementOptions(id,"drone-probe",[]);getPlayPlayerView(id,"p1");expect(getPlaySession(id).state).toEqual(controlled);current=submitPlayCommand(id,{kind:"action",action:{type:"search",pawnId:"drone-probe"}});expect(current.state.players[0].hand).toEqual(hand);expect(current.result.events.some(e=>e.type==="card-discarded")).toBe(false);expect(current.state.pendingChoice).toMatchObject({cardId:"",pawnId:"drone-probe",blockId:"engineering-war"});const pending=current.state,trace=exportPlayTrace(id),choice=current.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:5")!;expect(importPlayTrace(trace).state).toEqual(pending);current=submitPlayCommand(id,{kind:"action",action:choice});expect(undoPlayCommand(id).state).toEqual(pending);submitPlayCommand(id,{kind:"action",action:choice});
 current=submitPlayCommand(id,{kind:"action",action:{type:"move-steps",pawnId:"drone-probe",path:[{coord:{q:1,r:0},spaceId:"right"},{coord:{q:2,r:0},spaceId:"defense"},{coord:{q:2,r:0},spaceId:"drone-mk-2"}]}});expect(current.result.accepted).toBe(true);expect(current.playerView.useMarkers.filter(m=>m.pawnId==="drone-probe").map(m=>m.ability)).toEqual(["search","move"]);expect(current.legalOptions.actions.some(a=>a.pawnId==="drone-probe" && ["search","move-steps"].includes(String(a.type)))).toBe(false);expect(current.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(importPlayTrace(exportPlayTrace(id)).state).toEqual(current.state);expect(resetPlaySession(id).state).toEqual(initial.state);
 const prior=createHash("sha256").update("source-v17/engineering-mk2\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:prior})).toThrow(/rules version/);
});

test("Turret sandbox preserves the off-turn controller, public roll, private hand and played ownership through replay and undo",()=>{
 const initial=createPlayScenario("drone-turret"),id=initial.id,actor=initial.state.players[0].pawnId,target=initial.state.players[1].pawnId;
 let s=submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(s.legalOptions.choiceResponses.filter(a=>a.optionId?.startsWith("place:0:")).map(a=>a.optionId)).toEqual(["place:0:2","place:0:5"]);submitPlayCommand(id,{kind:"action",action:s.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:5")!});submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"hand"},{coord:{q:1,r:0},spaceId:"drone-turret"}]}});submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});
 for(let i=0;i<4;i++)s=submitPlayCommand(id,{kind:"phase"});s=submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:target,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"hand"},{coord:{q:1,r:0},spaceId:"drone-turret"}]}});expect(s.abilityControllers).toEqual([{id:"p1",name:"Ada"}]);const before=s.state,options=getPlayPlayerView(id,"p1").view;expect(options.players[1].hand.cards).toEqual([]);expect(getPlaySession(id).state).toEqual(before);const roll=options.options.find(o=>o.action.type==="roll-delete" && o.action.cardId==="move-1")!.action;
 s=submitPlayCommand(id,{kind:"action",action:roll});expect(s.result.accepted).toBe(true);expect(s.state.pendingAttack.playerId).toBe("p1");expect(s.activePlayer!.id).toBe("p2");expect(s.playerView.viewerId).toBe("p1");expect(s.state.playedCardOwners).toEqual(["p2","p1"]);const pending=s.state,trace=exportPlayTrace(id);expect(importPlayTrace(trace).state).toEqual(pending);s=submitPlayCommand(id,{kind:"action",action:{type:"assign-delete",playerId:"p2",targetIds:[target]}});expect(s.result.accepted).toBe(false);expect(s.state).toEqual(pending);s=submitPlayCommand(id,{kind:"action",action:{type:"assign-delete",playerId:"p1",targetIds:[target]}});expect(s.result.accepted).toBe(true);expect(s.state.eliminated).toContain(target);expect(s.playerView.viewerId).toBe("p2");expect(s.scenario?.checkpoints.every(c=>c.complete)).toBe(true);expect(undoPlayCommand(id).state).toEqual(pending);const recovered=importPlayTrace(trace);expect(submitPlayCommand(recovered.id,{kind:"action",action:{type:"assign-delete",playerId:"p1",targetIds:[target]}}).state).toEqual(s.state);expect(resetPlaySession(id).state).toEqual(initial.state);
 const prior=createHash("sha256").update("source-v18/probe-free-search\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:prior})).toThrow(/rules version/);
});

test("Arms Industry sandbox preserves both physical board allocations and one-time collection through replay, undo and reset",()=>{
 const initial=createPlayScenario("arms-industry"),id=initial.id,actor=initial.state.players[0].pawnId;let s=submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(s.bonusPool!.onBoard).toBe(0);const pending=s.state;expect(s.legalOptions.choiceResponses.some(a=>a.optionId==="place:0:0")).toBe(true);expect(getPlaySession(id).state).toEqual(pending);s=submitPlayCommand(id,{kind:"action",action:s.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:0")!});expect(s.bonusPool).toEqual({supply:24,reserve:0,free:22,invested:0,onBoard:2});expect(s.playerView.blocks.find(b=>b.blockId==="arms-industry")!.bonusCounter).toEqual({});const held=s.state,trace=exportPlayTrace(id);expect(importPlayTrace(trace).state).toEqual(held);
 s=submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path:[{coord:{q:1,r:0},spaceId:"hand"}]}});expect(s.playerView.players[0]!.handSize!.maximum).toBe(4);s=submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(s.result.accepted).toBe(true);expect(s.result.events.filter(e=>e.type==="bonus-collected").map(e=>e.element)).toEqual(["bonus-icon","block"]);expect(s.bonusPool).toEqual({supply:24,reserve:0,free:24,invested:0,onBoard:0});expect(s.state.blocks.find((b:any)=>b.blockId==="arms-industry").bonusCounter).toEqual({collectedBy:"p1"});expect(s.scenario?.checkpoints.every(c=>c.complete)).toBe(true);const finished=s.state;undoPlayCommand(id);expect(undoPlayCommand(id).state).toEqual(held);const recovered=importPlayTrace(trace);submitPlayCommand(recovered.id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path:[{coord:{q:1,r:0},spaceId:"hand"}]}});expect(submitPlayCommand(recovered.id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}}).state).toEqual(finished);expect(resetPlaySession(id).state).toEqual(initial.state);
 const prior=createHash("sha256").update("source-v19/any-turn-abilities\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:prior})).toThrow(/rules version/);
});

test("Cleaner B sandbox places, captures, shows printed modifiers and restores through replay, undo and reset",()=>{
 const initial=createPlayScenario("cleaner-b"),id=initial.id,actor=initial.state.players[0].pawnId;expect(initial.state.reserve).toContain("cleaner-b");expect(initial.state.pawns.some((p:any)=>p.pawnId==="cleaner-b")).toBe(false);let s=submitPlayCommand(id,{kind:"action",action:{type:"play-search",pawnId:actor,cardId:"dj"}});expect(s.legalOptions.choiceResponses.filter(a=>a.optionId?.startsWith("place:0:")).map(a=>a.optionId)).toEqual(["place:0:0","place:0:1","place:0:2","place:0:3","place:0:4","place:0:5"]);expect(s.state.pawns.some((p:any)=>p.pawnId==="cleaner-b")).toBe(false);s=submitPlayCommand(id,{kind:"action",action:s.legalOptions.choiceResponses.find(a=>a.optionId==="place:0:4")!});expect(s.state.blocks.find((b:any)=>b.blockId==="cleaner-b")).toMatchObject({q:1,r:0,rotation:4,ownerId:""});expect(s.state.reserve).toContain("cleaner-b");expect(s.state.controlCards.find((c:any)=>c.subject.id==="cleaner-b")).toMatchObject({zone:"common",ownerId:""});const held=s.state,trace=exportPlayTrace(id);expect(importPlayTrace(trace).state).toEqual(held);
 s=submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path:[{coord:{q:1,r:0},spaceId:"hand"}]}});expect(s.playerView.players[0]!.handSize).toMatchObject({spaces:-1,maximum:4});expect(s.result.accepted).toBe(true);const reversed=submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-2",path:[{coord:{q:1,r:0},spaceId:"circuit"},{coord:{q:1,r:0},spaceId:"hand"}]}});expect(reversed.result.accepted).toBe(false);expect(reversed.state).toEqual(s.state);s=submitPlayCommand(id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(s.result.accepted).toBe(true);expect(s.state.pawns.find((p:any)=>p.pawnId==="cleaner-b")).toMatchObject({ownerId:"p1",q:1,r:0,spaceId:"cleaner-b"});expect(s.state.controlCards.find((c:any)=>c.subject.id==="cleaner-b")).toMatchObject({zone:"control",ownerId:"p1"});expect(s.state.reserve).not.toContain("cleaner-b");expect(s.data.blocks.find((b:any)=>b.id==="cleaner-b").spaces.find((space:any)=>space.id==="defense").modifier.dice).toEqual([{value:1,shielded:false},{value:2,shielded:false}]);s=submitPlayCommand(id,{kind:"action",action:{type:"play-move",pawnId:"cleaner-b",cardId:"move-3",path:[{coord:{q:1,r:0},spaceId:"defense"}]}});expect(s.pawnDefenseProfiles["cleaner-b"].dice.filter((d:any)=>!d.shielded).map((d:any)=>d.value)).toEqual([1,2,5,6]);expect(s.scenario?.checkpoints.every(c=>c.complete)).toBe(true);const finished=s.state;undoPlayCommand(id);undoPlayCommand(id);expect(undoPlayCommand(id).state).toEqual(held);const recovered=importPlayTrace(trace);submitPlayCommand(recovered.id,{kind:"action",action:{type:"play-move",pawnId:actor,cardId:"move-1",path:[{coord:{q:1,r:0},spaceId:"hand"}]}});submitPlayCommand(recovered.id,{kind:"action",action:{type:"play-icebreak-block",pawnId:actor,cardId:"worm",coord:{q:1,r:0}}});expect(submitPlayCommand(recovered.id,{kind:"action",action:{type:"play-move",pawnId:"cleaner-b",cardId:"move-3",path:[{coord:{q:1,r:0},spaceId:"defense"}]}}).state).toEqual(finished);expect(resetPlaySession(id).state).toEqual(initial.state);
 const prior=createHash("sha256").update("source-v20/block-bonus-counters\n"+["blocks.json","pawns.json","action-cards.json","control-cards.json","mode.json","modes.json"].map(file=>readFileSync(join(resolve(import.meta.dir,"../.."),"spec/data/speedrunners",file),"utf8")).join("\n")).digest("hex");expect(()=>importPlayTrace({...trace,dataChecksum:prior})).toThrow(/rules version/);
});
