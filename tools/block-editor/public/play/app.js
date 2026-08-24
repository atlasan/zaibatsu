const app = document.querySelector("#app");
let session = null;
let selected = null;
let view = { x: 0, y: 0, zoom: 1 };
let error = "";
let selectedActionIndex = 0;
let movementPath = [];
let scenarios = [];
const FAMILY_ORDER = ["basics", "movement", "search", "combat", "icebreaker", "attachments", "reboot"];
const FAMILY_LABELS = {
  basics: "Basics / turn flow",
  movement: "Movement",
  search: "Search / placement",
  combat: "Combat",
  icebreaker: "Icebreaker / control",
  attachments: "Attachments",
  reboot: "Reboot",
};

const api = async (path, options = {}) => {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Local server request failed");
  return payload;
};
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (typeof value === "boolean") node.toggleAttribute(key, value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child instanceof Node) node.append(child);
    else if (child !== undefined && child !== null && child !== "") node.append(String(child));
  }
  return node;
};
const blockData = (id) => session.data.blocks.find((block) => block.id === id);
const pawnData = (id) => session.data.pawns.find((pawn) => pawn.id === id);
const player = (id) => session.players.find((item) => item.id === id);
const cardLabel = (id) => session.data.cards.find((card) => card.id === id)?.name || id;
const pawnLabel = (id) => pawnData(id)?.name || id;

function setupScreen() {
  app.replaceChildren();
  const form = el("form", { class: "setup" });
  form.append(el("div", { class: "eyebrow" }, "LOCAL ENGINE SANDBOX"), el("h1", {}, "Zaibatsu Speedrunners"), el("p", { class: "subtle" }, "Create an in-memory rules session. The server executes the mirrored TypeScript engine; no game data is changed. This tester covers the current implemented subset, not a full shipped client."));
  const grid = el("div", { class: "form-grid" });
  const names = el("input", { id: "names", value: "Ada, Bea", autocomplete: "off" });
  const seed = el("input", { id: "seed", value: "1", type: "number", step: "1" });
  grid.append(el("label", { class: "names", for: "names" }, "Player names (2–4, comma-separated)"), names, el("label", { for: "seed" }, "Explicit seed"), seed);
  const message = el("p", { class: "error" });
  form.append(grid, message, el("button", { class: "primary", type: "submit", "data-testid": "create-standard-session" }, "Create standard session"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      session = await api("/api/play/sessions", { method: "POST", body: JSON.stringify({ playerNames: names.value.split(","), seed: Number(seed.value) }) });
      error = ""; selected = null; selectedActionIndex = 0; gameScreen();
    } catch (cause) { message.textContent = cause.message; }
  });
  const lab = el("section", { class: "test-lab setup-lab", "aria-label": "Test Lab" }, el("h2", {}, "Test Lab"), el("p", { class: "hint" }, "Clearly labeled deterministic fixtures. They never write game data; every action still uses the real reducer."));
  const renderScenarios = () => {
    const list = el("div", { class: "scenario-list" });
    scenarios.forEach((scenario) => {
      const start = el("button", { type: "button", class: "scenario-button", "data-testid": `scenario-${scenario.id}` }, `Open: ${scenario.title}`);
      start.addEventListener("click", async () => {
        try {
          session = await api(`/api/play/scenarios/${scenario.id}`, { method: "POST", body: JSON.stringify({ playerNames: names.value.split(","), seed: Number(seed.value) }) });
          error = ""; selected = null; selectedActionIndex = 0; movementPath = []; gameScreen();
        } catch (cause) { message.textContent = cause.message; }
      });
      const item = el("article", { class: "scenario-card" }); item.append(el("strong", {}, scenario.title), el("p", { class: "hint" }, scenario.description), start); list.append(item);
    });
    lab.append(list);
  };
  if (scenarios.length) renderScenarios();
  else api("/api/play/scenarios").then((response) => { scenarios = response.scenarios || []; renderScenarios(); }).catch((cause) => { lab.append(el("p", { class: "error" }, cause.message)); });
  app.append(form, lab);
}

function gameScreen() {
  app.replaceChildren();
  const header = el("header", { class: "topbar" });
  const title = el("div"); title.append(el("div", { class: "eyebrow" }, session.scenario ? "TEST LAB FIXTURE · LOCAL-ONLY" : "LOCAL-ONLY · SPEEDRUNNERS"), el("h1", {}, session.scenario ? session.scenario.title : "Rules sandbox"));
  const newGame = el("button", { onClick: setupScreen }, "New session");
  header.append(title, newGame);
  const shell = el("div", { class: "shell" });
  const left = el("aside", { class: "side-stack" });
  const center = el("section", { class: "panel board-panel" });
  const right = el("aside", { class: "side-stack right" });
  left.append(playerPanel(), phasePanel(), actionPanel(), scenarioPanel(), tracePanel());
  center.append(boardPanel());
  right.append(inspectorPanel(), eventPanel(), snapshotPanel());
  shell.append(left, center, right); app.append(header, shell);
}

function phasePanel() {
  const panel = el("section", { class: "panel phase" });
  const active = session.activePlayer;
  panel.append(el("h2", {}, "Live phase"), el("div", { class: "phase-state" }, "TURN", el("strong", {}, String(session.state.turn))), el("div", { class: "phase-state" }, "PHASE", el("strong", {}, session.state.phase.toUpperCase())), el("p", { class: "hint" }, `Active player: ${active?.name || active?.id || "unknown"}`));
  const phaseLabel = { beginning: "Start action phase", action: "Finish action (draw cards)", recycle: "Resolve end phase", end: "Next player's turn" }[session.state.phase];
  const advance = el("button", { class: "primary", type: "button", disabled: Boolean(session.state.winnerId) }, phaseLabel);
  advance.addEventListener("click", () => command({ kind: "phase" }));
  panel.append(advance);
  if (session.state.phase === "action") {
    const pass = el("button", { type: "button" }, "Pass & end turn");
    pass.addEventListener("click", passAndEndTurn);
    panel.append(pass);
  }
  if (session.state.winnerId) panel.append(el("p", { class: "hint" }, `${player(session.state.winnerId)?.name || session.state.winnerId} has won.`));
  return panel;
}

function playerPanel() {
  const panel = el("section", { class: "panel players" }, el("h2", {}, "Players"));
  session.players.forEach((entry) => {
    const row = el("div", { class: `player-row ${entry.id === session.activePlayer?.id ? "active" : ""}` });
    row.append(el("span", { class: "player-dot", style: { background: entry.color } }), el("strong", {}, entry.name), el("span", { class: "hint" }, `${entry.markersPlaced}/${entry.markersTotal} markers · ${entry.bonus} bonus`));
    panel.append(row);
    if (entry.id === session.activePlayer?.id) panel.append(el("div", { class: "hand" }, el("span", { class: "hint" }, "Hand"), ...(entry.hand.length ? entry.hand.map((card) => el("span", { class: "card-chip" }, card.name)) : [el("span", { class: "empty" }, "No cards")])));
  });
  panel.append(el("p", { class: "hint" }, `Deck ${session.counts.deck} · discard ${session.counts.discard} · blocks ${session.counts.blockPile} · eliminated ${session.counts.eliminated}`));
  return panel;
}

function scenarioPanel() {
  if (!session.scenario) return document.createDocumentFragment();
  const panel = el("section", { class: "panel test-lab" }, el("h2", {}, "Fixture checkpoints"), el("p", { class: "hint" }, session.scenario.description));
  const list = el("ol", { class: "checkpoint-list" });
  session.scenario.checkpoints.forEach((checkpoint) => list.append(el("li", { class: checkpoint.complete ? "complete" : "" }, checkpoint.complete ? "✓ " : "○ ", checkpoint.label)));
  panel.append(list, el("p", { class: "hint" }, "Fixture traces export as v2 and replay the same starting scenario."));
  return panel;
}

function actionPanel() {
  const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Guided action"));
  const options = session.legalOptions.actions || [];
  if (session.state.phase !== "action") { panel.append(el("p", { class: "empty" }, "Advance to the action phase to submit an action.")); return panel; }
  if (!options.length) { panel.append(el("p", { class: "empty" }, "No reducer-legal actions are available in this state.")); return panel; }
  const select = el("select", { "aria-label": "Action" });
  FAMILY_ORDER.forEach((family) => {
    const familyOptions = options.map((option, index) => ({ option, index })).filter(({ option }) => (option.family || "basics") === family);
    if (!familyOptions.length) return;
    const group = el("optgroup", { label: FAMILY_LABELS[family] || family });
    familyOptions.forEach(({ option, index }) => group.append(el("option", { value: String(index) }, option.label)));
    select.append(group);
  });
  const suggested = selectedActionIndex === 0 && options[0]?.type === "pass" ? options.findIndex((option) => option.type === "play-search" || option.type === "move-hex" || option.type === "place-marker") : selectedActionIndex;
  select.value = String(Math.min(suggested >= 0 ? suggested : 0, Math.max(0, options.length - 1)));
  const fields = el("div", { class: "action-fields" });
  const renderFields = async () => {
    fields.replaceChildren(); const option = options[Number(select.value)] || {};
    fields.append(el("p", { class: "hint" }, `Family: ${FAMILY_LABELS[option.family || "basics"] || option.family || "basics"}`));
    if (option.pawnId) fields.append(field("Pawn", "pawnId", option.pawnId, [option.pawnId], pawnLabel));
    if (option.type === "move-steps" || option.type === "play-move") {
      if (option.cardId) fields.append(field("Card", "cardId", option.cardId, [option.cardId], cardLabel));
      await renderMovementFields(fields, option);
      return;
    }
    if (option.targetIds?.length && option.type !== "delete-multi") fields.append(field("Target", "targetId", option.targetIds[0], option.targetIds, pawnLabel));
    if (option.type === "delete-multi") fields.append(multiField(`Targets (up to ${option.maxTargets})`, "targetIds", option.targetIds));
    if (option.directions) fields.append(field("Direction", "dir", option.directions[0], option.directions, (dir) => `Direction ${dir}`));
    if (option.placements?.length) {
      const values = option.placements.map((item) => `${item.dir},${item.rotation}`);
      fields.append(field("Placement", "placement", values[0], values, (value) => { const [dir, rotation] = value.split(","); return `Edge ${dir} · rotation ${rotation}`; }));
    }
    const cards = session.legalOptions.cardsInHand || [];
    if (cards.length && ["play-delete", "play-icebreak-block", "play-icebreak-pawn", "play-search", "attach-pawn", "attach-enemy", "attach-block"].includes(option.type)) fields.append(field("Card", "cardId", option.cardId ?? cards[0], option.cardId ? [option.cardId] : cards, cardLabel));
    if (option.type === "play-reboot") fields.append(multiField("Four cards to discard", "cardIds", cards));
  };
  select.addEventListener("change", () => { selectedActionIndex = Number(select.value); movementPath = []; void renderFields(); }); void renderFields();
  const submit = el("button", { class: "primary", type: "button" }, "Execute selected action");
  submit.addEventListener("click", () => {
    const option = options[Number(select.value)] || {}; const action = { type: option.type };
    fields.querySelectorAll("select").forEach((input) => { if (input.name === "movementTarget") return; if (input.name === "dir") action.dir = Number(input.value); else if (input.name === "placement") { const [dir, rotation] = input.value.split(",").map(Number); action.dir = dir; action.rotation = rotation; } else if (input.name === "cardIds" || input.name === "targetIds") action[input.name] = [...input.selectedOptions].map((choice) => choice.value); else action[input.name] = input.value; });
    if (option.coord) action.coord = option.coord;
    if (option.type === "pass") passAndEndTurn();
    else {
      if (option.type === "move-steps" || option.type === "play-move") {
        if (!movementPath.length) { error = "Choose at least one adjacent space."; gameScreen(); return; }
        action.path = movementPath;
        movementPath = [];
      }
      command({ kind: "action", action });
    }
  });
  panel.append(el("p", { class: "hint" }, "Choose an engine-legal action by family, then choose its targets or placement. The browser never resolves rules locally; it only submits reducer-backed commands."), select, fields, submit); if (error) panel.append(el("p", { class: "error" }, error)); return panel;
}

async function renderMovementFields(fields, option) {
  const detail = el("div", { class: "movement-path" });
  const status = el("p", { class: "hint" });
  const list = el("ol", { class: "path-list" });
  const render = (preview) => {
    list.replaceChildren();
    if (!movementPath.length) list.append(el("li", { class: "empty" }, "Start: current space"));
    movementPath.forEach((step) => list.append(el("li", {}, formatStep(step))));
    const limit = preview.maxSelectableSteps;
    status.textContent = preview.exactBudgetKnown
      ? `${movementPath.length}/${limit} fixed steps selected.`
      : `${movementPath.length}/${limit} steps selected. The seeded die roll is made on execution; a path beyond that roll is rejected without moving.`;
    const choices = preview.nextTargets || [];
    if (choices.length) {
      const target = field("Next adjacent space", "movementTarget", JSON.stringify(choices[0]), choices.map((item) => JSON.stringify(item)));
      const select = target.querySelector("select");
      [...select.options].forEach((choice) => { choice.textContent = formatStep(JSON.parse(choice.value)); });
      const add = el("button", { type: "button" }, "Add step");
      add.addEventListener("click", async () => {
        try {
          movementPath.push(JSON.parse(select.value));
          await refresh();
        } catch (cause) { error = cause.message; gameScreen(); }
      });
      detail.append(target, add);
    }
    if (movementPath.length) {
      const remove = el("button", { type: "button" }, "Remove last step");
      remove.addEventListener("click", async () => { movementPath.pop(); await refresh(); });
      detail.append(remove);
    }
  };
  const refresh = async () => {
    const preview = await api(`/api/play/sessions/${session.id}/movement-options`, { method: "POST", body: JSON.stringify({ pawnId: option.pawnId, path: movementPath, cardId: option.cardId }) });
    detail.replaceChildren(); render(preview); gameScreen();
  };
  const preview = await api(`/api/play/sessions/${session.id}/movement-options`, { method: "POST", body: JSON.stringify({ pawnId: option.pawnId, path: movementPath, cardId: option.cardId }) });
  fields.append(status, list, detail); render(preview);
}

function formatStep(step) { return `(${step.coord.q}, ${step.coord.r}) · ${step.spaceId}`; }

function field(label, name, value, values, labelFor = (item) => String(item)) { const select = el("select", { name, "aria-label": label }); values.forEach((item) => select.append(el("option", { value: String(item) }, labelFor(item)))); select.value = String(value); const wrap = el("label", {}, label); wrap.append(select); return wrap; }
function multiField(label, name, values) { const select = el("select", { name, multiple: "multiple", size: "4", "aria-label": label }); values.forEach((item) => select.append(el("option", { value: String(item) }, name === "cardIds" ? cardLabel(item) : pawnLabel(item)))); const wrap = el("label", {}, label); wrap.append(select, el("span", { class: "hint" }, "Choose exactly four cards.")); return wrap; }

function boardPanel() {
  const panel = el("div"); const toolbar = el("div", { class: "board-toolbar" });
  const resetView = el("button", {}, "Reset view"); resetView.addEventListener("click", () => { view = { x: 0, y: 0, zoom: 1 }; gameScreen(); });
  const undo = el("button", { disabled: session.commandCount === 0 }, "Undo"); undo.addEventListener("click", async () => { try { session = await api(`/api/play/sessions/${session.id}/undo`, { method: "POST", body: "{}" }); error = ""; gameScreen(); } catch (cause) { error = cause.message; gameScreen(); } });
  toolbar.append(el("strong", {}, "Cybernet"), el("span", { class: "hint" }, "Drag to pan · wheel to zoom"), undo, resetView);
  const viewport = el("div", { class: "board-viewport" }); const board = el("div", { class: "board", style: { transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})` } });
  for (const block of session.state.blocks) board.append(tile(block)); viewport.append(board); installPanZoom(viewport, board); panel.append(toolbar, viewport); return panel;
}

function tile(placed) {
  const definition = blockData(placed.blockId); const size = 150; const x = Math.sqrt(3) * (placed.q + placed.r / 2) * size; const y = 1.5 * placed.r * size;
  const button = el("button", { class: `tile ${selected?.kind === "block" && selected.id === `${placed.q},${placed.r}` ? "selected" : ""}`, style: { left: `${x}px`, top: `${y}px` }, "aria-label": `Block ${definition?.name || placed.blockId}` });
  button.addEventListener("click", () => { selected = { kind: "block", id: `${placed.q},${placed.r}` }; gameScreen(); });
  const assetRef = definition?.assetRefs?.[0]; if (assetRef) { const image = el("img", { class: "tile-art", src: `/api/artifact/${encodeURIComponent(assetRef)}`, alt: "", style: { "--rotation": `${placed.rotation * 60}deg` } }); image.addEventListener("error", () => image.remove()); button.append(image); }
  button.append(el("span", { class: "tile-shade" }), el("span", { class: "tile-name" }, definition?.name || placed.blockId), el("span", { class: "ice" }, definition?.iceValue || "—"));
  const positions = [[50,50],[33,25],[67,25],[83,50],[67,75],[33,75],[17,50]];
  positions.forEach(([left, top], index) => button.append(el("span", { class: "zone", style: { left: `${left}%`, top: `${top}%` } }, `h${index + 1}`)));
  (definition?.edges || []).forEach((open, index) => { const pos = [[50,8],[89,29],[89,71],[50,92],[11,71],[11,29]][index]; button.append(el("span", { class: `edge ${open ? "" : "closed"}`, style: { left: `${pos[0]}%`, top: `${pos[1]}%` } }, open ? "" : "×")); });
  if (placed.ownerId) button.append(el("span", { class: "control" }, `${player(placed.ownerId)?.name || placed.ownerId} control`));
  session.state.pawns.filter((pawn) => pawn.q === placed.q && pawn.r === placed.r).forEach((pawn, index) => { const owner = player(pawn.ownerId); const token = el("button", { class: "pawn", style: { left: `${41 + index * 18}%`, top: "53%", "--pawn-color": owner?.color || "#aaa" }, "aria-label": `Pawn ${pawnData(pawn.pawnId)?.name || pawn.pawnId}` }, (pawnData(pawn.pawnId)?.name || pawn.pawnId).slice(0, 2).toUpperCase()); token.addEventListener("click", (event) => { event.stopPropagation(); selected = { kind: "pawn", id: pawn.pawnId }; gameScreen(); }); button.append(token); });
  return button;
}

function installPanZoom(viewport, board) { let drag = null; viewport.addEventListener("pointerdown", (event) => { if (event.target !== viewport) return; drag = { x: event.clientX, y: event.clientY }; viewport.classList.add("dragging"); viewport.setPointerCapture(event.pointerId); }); viewport.addEventListener("pointermove", (event) => { if (!drag) return; view.x += event.clientX - drag.x; view.y += event.clientY - drag.y; drag = { x: event.clientX, y: event.clientY }; board.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`; }); viewport.addEventListener("pointerup", () => { drag = null; viewport.classList.remove("dragging"); }); viewport.addEventListener("wheel", (event) => { event.preventDefault(); view.zoom = Math.min(2.2, Math.max(.45, view.zoom + (event.deltaY < 0 ? .1 : -.1))); board.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`; }, { passive: false }); }

function inspectorPanel() { const panel = el("section", { class: "panel inspector" }); panel.append(el("h2", {}, "Inspector")); if (!selected) { panel.append(el("p", { class: "empty" }, "Select a block or pawn on the Cybernet.")); return panel; } const data = selected.kind === "pawn" ? pawnData(selected.id) : (() => { const [q, r] = selected.id.split(",").map(Number); return blockData(session.state.blocks.find((item) => item.q === q && item.r === r)?.blockId); })(); const details = el("dl"); Object.entries(data || {}).filter(([key]) => ["id", "name", "iceValue", "movement", "abilities", "spaces", "assetRefs"].includes(key)).forEach(([key, value]) => { details.append(el("dt", {}, key), el("dd", {}, typeof value === "object" ? JSON.stringify(value) : String(value))); }); panel.append(details); return panel; }
function describeEvent(event) { const actor = event.playerId ? player(event.playerId)?.name || event.playerId : ""; if (event.type === "phase-advanced") return `${actor || "Turn"}: ${event.fromPhase} → ${event.toPhase}`; if (event.type === "action-accepted") return `${actor || "Player"} completed ${event.actionType || "an action"}.`; if (event.type === "roll") return `Roll: ${event.roll?.join(", ") || "—"}.`; if (event.type === "draw") return `${actor || "Player"} drew ${cardLabel(event.cardId)}.`; if (event.type === "elimination") return `${pawnLabel(event.pawnId)} was eliminated.`; if (event.type === "control-changed") return `Control changed: ${event.element || "element"} ${event.elementId || ""}.`; if (event.type === "winner-declared") return `${actor || "A player"} wins.`; return event.message || "Action was rejected."; }
function eventPanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Event / action log")); const list = el("div", { class: "list", "aria-live": "polite" }); (session.events?.length ? session.events : [{ type: "ready", message: "Session created." }]).slice().reverse().forEach((event) => list.append(el("div", { class: `log-item ${event.type}` }, describeEvent(event)))); panel.append(list); return panel; }
function snapshotPanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Canonical snapshot"), el("pre", { class: "snapshot" }, JSON.stringify(session.state))); return panel; }
function tracePanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Trace")); const download = el("button", { type: "button" }, "Export trace"); download.addEventListener("click", async () => { const trace = await api(`/api/play/sessions/${session.id}/trace`); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" })); link.download = "speedrunners-trace.json"; link.click(); URL.revokeObjectURL(link.href); }); const file = el("input", { class: "trace-input", type: "file", accept: "application/json" }); const upload = el("button", { type: "button" }, "Import trace"); upload.addEventListener("click", () => file.click()); file.addEventListener("change", async () => { const selectedFile = file.files?.[0]; if (!selectedFile) return; try { session = await api("/api/play/traces/import", { method: "POST", body: await selectedFile.text() }); error = ""; selected = null; selectedActionIndex = 0; gameScreen(); } catch (cause) { error = cause.message; gameScreen(); } }); const reset = el("button", { type: "button" }, "Reset"); reset.addEventListener("click", async () => { session = await api(`/api/play/sessions/${session.id}/reset`, { method: "POST", body: JSON.stringify(session.setup) }); error = ""; selected = null; selectedActionIndex = 0; gameScreen(); }); panel.append(el("div", { class: "button-row" }), file); panel.querySelector(".button-row").append(download, upload, reset); return panel; }
async function command(body) { try { const result = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify(body) }); session = result; error = result.result?.error || ""; gameScreen(); } catch (cause) { error = cause.message; gameScreen(); } }
async function passAndEndTurn() { try { let result = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify({ kind: "action", action: { type: "pass" } }) }); if (!result.result?.accepted) throw new Error(result.result?.error || "Pass was rejected"); for (let phase = 0; phase < 3; phase++) { result = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify({ kind: "phase" }) }); if (!result.result?.accepted) throw new Error(result.result?.error || "Phase transition was rejected"); } session = result; error = ""; selectedActionIndex = 0; gameScreen(); } catch (cause) { error = cause.message; gameScreen(); } }
setupScreen();
