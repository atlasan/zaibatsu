const app = document.querySelector("#app");
let session = null;
let selected = null;
let view = { x: 0, y: 0, zoom: 1 };
let error = "";

const api = async (path, options = {}) => {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Local server request failed");
  return payload;
};
const el = (tag, attrs = {}, text = "") => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
};
const blockData = (id) => session.data.blocks.find((block) => block.id === id);
const pawnData = (id) => session.data.pawns.find((pawn) => pawn.id === id);
const player = (id) => session.state.players.find((item) => item.id === id);

function setupScreen() {
  app.replaceChildren();
  const form = el("form", { class: "setup" });
  form.append(el("div", { class: "eyebrow" }, "LOCAL ENGINE SANDBOX"), el("h1", {}, "Zaibatsu Speedrunners"), el("p", { class: "subtle" }, "Create an in-memory rules session. The server executes the mirrored TypeScript engine; no game data is changed."));
  const grid = el("div", { class: "form-grid" });
  const names = el("input", { id: "names", value: "Ada, Bea", autocomplete: "off" });
  const seed = el("input", { id: "seed", value: "1", type: "number", step: "1" });
  grid.append(el("label", { class: "names", for: "names" }, "Player names (2–4, comma-separated)"), names, el("label", { for: "seed" }, "Explicit seed"), seed);
  const message = el("p", { class: "error" });
  form.append(grid, message, el("button", { class: "primary", type: "submit" }, "Create local session"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      session = await api("/api/play/sessions", { method: "POST", body: JSON.stringify({ playerNames: names.value.split(","), seed: Number(seed.value) }) });
      error = ""; selected = null; gameScreen();
    } catch (cause) { message.textContent = cause.message; }
  });
  app.append(form);
}

function gameScreen() {
  app.replaceChildren();
  const header = el("header", { class: "topbar" });
  const title = el("div"); title.append(el("div", { class: "eyebrow" }, "LOCAL-ONLY · SPEEDRUNNERS"), el("h1", {}, "Rules sandbox"));
  const newGame = el("button", { onClick: setupScreen }, "New session");
  header.append(title, newGame);
  const shell = el("div", { class: "shell" });
  const left = el("aside", { class: "side-stack" });
  const center = el("section", { class: "panel board-panel" });
  const right = el("aside", { class: "side-stack right" });
  left.append(phasePanel(), actionPanel(), tracePanel());
  center.append(boardPanel());
  right.append(inspectorPanel(), eventPanel(), snapshotPanel());
  shell.append(left, center, right); app.append(header, shell);
}

function phasePanel() {
  const panel = el("section", { class: "panel phase" });
  const active = player(session.state.players[session.state.currentPlayer].id);
  panel.append(el("h2", {}, "Live phase"), el("div", { class: "phase-state" }, "TURN", el("strong", {}, String(session.state.turn))), el("div", { class: "phase-state" }, "PHASE", el("strong", {}, session.state.phase.toUpperCase())), el("p", { class: "hint" }, `Active player: ${active.name}`));
  const advance = el("button", { class: "primary", disabled: Boolean(session.state.winnerId) }, `Advance from ${session.state.phase}`);
  advance.addEventListener("click", () => command({ kind: "phase" }));
  panel.append(advance);
  if (session.state.winnerId) panel.append(el("p", { class: "hint" }, `${player(session.state.winnerId).name} has won.`));
  return panel;
}

function actionPanel() {
  const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Guided action"));
  const options = session.legalOptions.actions || [];
  if (session.state.phase !== "action") { panel.append(el("p", { class: "empty" }, "Advance to the action phase to submit an action.")); return panel; }
  const select = el("select", { "aria-label": "Action" });
  options.forEach((option, index) => select.append(el("option", { value: String(index) }, option.label)));
  const fields = el("div", { class: "action-fields" });
  const renderFields = () => {
    fields.replaceChildren(); const option = options[Number(select.value)] || {};
    if (option.pawnId) fields.append(field("Pawn", "pawnId", option.pawnId, [option.pawnId]));
    if (option.targetIds?.length) fields.append(field("Target", "targetId", option.targetIds[0], option.targetIds));
    if (option.directions) fields.append(field("Direction", "dir", "0", option.directions));
    if (option.placements?.length) {
      const values = option.placements.map((item) => `${item.dir},${item.rotation}`);
      fields.append(field("Placement", "placement", values[0], values));
    }
    const cards = session.legalOptions.cardsInHand || [];
    if (cards.length && ["play-delete", "play-icebreak-block", "play-icebreak-pawn", "play-search", "attach-pawn", "attach-enemy", "attach-block"].includes(option.type)) fields.append(field("Card", "cardId", cards[0], cards));
    if (option.type === "play-reboot") fields.append(multiField("Four cards to discard", "cardIds", cards));
  };
  select.addEventListener("change", renderFields); renderFields();
  const submit = el("button", { class: "primary" }, "Submit action");
  submit.addEventListener("click", () => {
    const option = options[Number(select.value)] || {}; const action = { type: option.type };
    fields.querySelectorAll("select").forEach((input) => { if (input.name === "dir") action.dir = Number(input.value); else if (input.name === "placement") { const [dir, rotation] = input.value.split(",").map(Number); action.dir = dir; action.rotation = rotation; } else if (input.name === "cardIds") action.cardIds = [...input.selectedOptions].map((choice) => choice.value); else action[input.name] = input.value; });
    if (option.coord) action.coord = option.coord;
    command({ kind: "action", action });
  });
  panel.append(select, fields, submit); if (error) panel.append(el("p", { class: "error" }, error)); return panel;
}

function field(label, name, value, values) { const select = el("select", { name, "aria-label": label }); values.forEach((item) => select.append(el("option", { value: String(item), selected: String(item) === String(value) ? "selected" : "" }, String(item)))); const wrap = el("label", {}, label); wrap.append(select); return wrap; }
function multiField(label, name, values) { const select = el("select", { name, multiple: "multiple", size: "4", "aria-label": label }); values.forEach((item) => select.append(el("option", { value: String(item) }, String(item)))); const wrap = el("label", {}, label); wrap.append(select, el("span", { class: "hint" }, "Choose exactly four cards.")); return wrap; }

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
  (definition?.edges || []).forEach((open, index) => { const pos = [[50,8],[89,29],[89,71],[50,92],[11,71],[11,29]][index]; button.append(el("span", { class: `edge ${open ? "" : "closed"}`, style: { left: `${pos[0]}%`, top: `${pos[1]}%` }, open ? "" : "×")); });
  if (placed.ownerId) button.append(el("span", { class: "control" }, `${player(placed.ownerId)?.name || placed.ownerId} control`));
  session.state.pawns.filter((pawn) => pawn.q === placed.q && pawn.r === placed.r).forEach((pawn, index) => { const owner = player(pawn.ownerId); const token = el("button", { class: "pawn", style: { left: `${41 + index * 18}%`, top: "53%", "--pawn-color": owner?.color || "#aaa" }, "aria-label": `Pawn ${pawnData(pawn.pawnId)?.name || pawn.pawnId}` }, (pawnData(pawn.pawnId)?.name || pawn.pawnId).slice(0, 2).toUpperCase()); token.addEventListener("click", (event) => { event.stopPropagation(); selected = { kind: "pawn", id: pawn.pawnId }; gameScreen(); }); button.append(token); });
  return button;
}

function installPanZoom(viewport, board) { let drag = null; viewport.addEventListener("pointerdown", (event) => { if (event.target !== viewport) return; drag = { x: event.clientX, y: event.clientY }; viewport.classList.add("dragging"); viewport.setPointerCapture(event.pointerId); }); viewport.addEventListener("pointermove", (event) => { if (!drag) return; view.x += event.clientX - drag.x; view.y += event.clientY - drag.y; drag = { x: event.clientX, y: event.clientY }; board.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`; }); viewport.addEventListener("pointerup", () => { drag = null; viewport.classList.remove("dragging"); }); viewport.addEventListener("wheel", (event) => { event.preventDefault(); view.zoom = Math.min(2.2, Math.max(.45, view.zoom + (event.deltaY < 0 ? .1 : -.1))); board.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`; }, { passive: false }); }

function inspectorPanel() { const panel = el("section", { class: "panel inspector" }); panel.append(el("h2", {}, "Inspector")); if (!selected) { panel.append(el("p", { class: "empty" }, "Select a block or pawn on the Cybernet.")); return panel; } const data = selected.kind === "pawn" ? pawnData(selected.id) : (() => { const [q, r] = selected.id.split(",").map(Number); return blockData(session.state.blocks.find((item) => item.q === q && item.r === r)?.blockId); })(); const details = el("dl"); Object.entries(data || {}).filter(([key]) => ["id", "name", "iceValue", "movement", "abilities", "spaces", "assetRefs"].includes(key)).forEach(([key, value]) => { details.append(el("dt", {}, key), el("dd", {}, typeof value === "object" ? JSON.stringify(value) : String(value))); }); panel.append(details); return panel; }
function eventPanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Event / action log")); const list = el("div", { class: "list" }); (session.events?.length ? session.events : [{ type: "ready", message: "Session created." }]).slice().reverse().forEach((event) => list.append(el("div", { class: `log-item ${event.type}` }, `${event.type}${event.message ? ` — ${event.message}` : ""}${event.roll ? ` [${event.roll.join(", ")}]` : ""}`))); panel.append(list); return panel; }
function snapshotPanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Canonical snapshot"), el("pre", { class: "snapshot" }, JSON.stringify(session.state))); return panel; }
function tracePanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Trace")); const download = el("button", {}, "Export trace"); download.addEventListener("click", async () => { const trace = await api(`/api/play/sessions/${session.id}/trace`); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" })); link.download = "speedrunners-trace.json"; link.click(); URL.revokeObjectURL(link.href); }); const file = el("input", { class: "trace-input", type: "file", accept: "application/json" }); const upload = el("button", {}, "Import trace"); upload.addEventListener("click", () => file.click()); file.addEventListener("change", async () => { try { session = await api("/api/play/traces/import", { method: "POST", body: await file.files[0].text() }); error = ""; selected = null; gameScreen(); } catch (cause) { error = cause.message; gameScreen(); } }); const reset = el("button", {}, "Reset"); reset.addEventListener("click", async () => { session = await api(`/api/play/sessions/${session.id}/reset`, { method: "POST", body: JSON.stringify(session.setup) }); error = ""; selected = null; gameScreen(); }); panel.append(el("div", { class: "button-row" }, ""), file); panel.querySelector(".button-row").append(download, upload, reset); return panel; }
async function command(body) { try { const result = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify(body) }); session = result; error = result.result?.error || ""; gameScreen(); } catch (cause) { error = cause.message; gameScreen(); } }
setupScreen();
