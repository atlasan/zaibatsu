const app = document.querySelector("#app");
let session = null;
let selected = null;
let view = { x: 0, y: 0, zoom: 1 };
let camera = "perspective";
try { camera = localStorage.getItem("zaibatsu-camera") || camera; } catch {}
let error = "";
let selectedActionIndex = 0;
let movementPath = [];
let scenarios = [];
let coverage = null;
let selectedCard = null;
let movementPreview = null;
let busy = false;
let handoff = false;
let reactionProjection = null;
let recycleSelection = new Set();
let connectionLost = false;
const recoveringSessions = new Map();
const SAVE_KEY = "zaibatsu-match-v1";
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

const requestJSON = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(path, { headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000), ...options });
  } catch {
    connectionLost = true;
    throw new Error("The local game server is disconnected. Your last confirmed moves are saved. Reconnect to continue.");
  }
  const payload = await response.json();
  connectionLost = false;
  return { response, payload };
};
const api = async (path, options = {}) => {
  const initialSession = session;
  const prefix = initialSession && `/api/play/sessions/${initialSession.id}`;
  let { response, payload } = await requestJSON(path, options);
  // An expired-session response guarantees the requested operation was not applied.
  // Network errors have uncertain outcomes and are never retried automatically.
  if (payload.code === "session-expired" && prefix && (path === prefix || path.startsWith(`${prefix}/`)) && initialSession.recoveryTrace) {
    if (!recoveringSessions.has(initialSession.id)) {
      const restore = requestJSON("/api/play/traces/import", { method: "POST", body: JSON.stringify(initialSession.recoveryTrace) }).then(restored => {
        if (!restored.response.ok) throw new Error(restored.payload.error || "Saved match could not be restored");
        return restored.payload;
      });
      recoveringSessions.set(initialSession.id, restore);
      restore.catch(() => recoveringSessions.delete(initialSession.id));
    }
    const restored = await recoveringSessions.get(initialSession.id);
    if (session.id !== initialSession.id && session.id !== restored.id) throw new Error("The open match changed during reconnection. Choose the action again.");
    session = restored;
    ({ response, payload } = await requestJSON(`/api/play/sessions/${session.id}${path.slice(prefix.length)}`, options));
  }
  if (!response.ok) throw new Error(payload.error || "Local server request failed");
  return payload;
};

async function reconnect() {
  if (busy) return;
  busy = true;
  try {
    if (session?.recoveryTrace) {
      const restored = await requestJSON("/api/play/traces/import", { method: "POST", body: JSON.stringify(session.recoveryTrace) });
      if (!restored.response.ok) throw new Error(restored.payload.error || "Saved match could not be restored");
      session = restored.payload;
      clearSelection();
      await saveMatch();
    } else {
      const result = await api("/api/play/scenarios");
      scenarios = result.scenarios || [];
      coverage = await api("/api/coverage");
    }
    error = "";
  } catch (cause) { error = cause.message; }
  finally { busy = false; if (session) gameScreen(); else setupScreen(); }
}
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "style") { for (const [property, setting] of Object.entries(value)) { if (property.startsWith("--")) node.style.setProperty(property, setting); else node.style[property] = setting; } }
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (typeof value === "boolean" && !key.startsWith("aria-")) node.toggleAttribute(key, value);
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
const coverageSurface = (id) => coverage?.surfaces?.find((surface) => surface.id === id);
const coverageTone = (status) => status === "implemented" ? "ok" : status === "partial" ? "warn" : "todo";
const coverageLabel = (status) => status === "implemented" ? "implemented" : status === "partial" ? "partial" : "planned";

function coveragePanel(surfaceId, title = "Coverage") {
  const surface = coverageSurface(surfaceId);
  if (!surface) return document.createDocumentFragment();
  const panel = el("section", { class: "panel coverage" });
  panel.append(el("h2", {}, title), el("p", { class: "hint" }, surface.summary));
  const badge = el("span", { class: `coverage-pill ${coverageTone(surface.status)}` }, coverageLabel(surface.status));
  panel.append(badge);
  const list = el("div", { class: "coverage-list" });
  surface.items.forEach((item) => {
    const row = el("div", { class: "coverage-item" });
    row.append(el("strong", {}, item.label), el("span", { class: `coverage-pill ${coverageTone(item.status)}` }, coverageLabel(item.status)), el("small", { class: "hint" }, item.detail));
    list.append(row);
  });
  panel.append(list);
  return panel;
}

function coverageOverview() {
  if (!coverage?.surfaces?.length) return document.createDocumentFragment();
  const panel = el("section", { class: "test-lab setup-lab coverage-overview", "aria-label": "Coverage overview" }, el("h2", {}, "Coverage overview"), el("p", { class: "hint" }, coverage.summary));
  coverage.surfaces.forEach((surface) => {
    const card = el("article", { class: "scenario-card coverage-card" });
    card.append(el("strong", {}, surface.title), el("p", { class: "hint" }, surface.summary), el("span", { class: `coverage-pill ${coverageTone(surface.status)}` }, coverageLabel(surface.status)));
    panel.append(card);
  });
  if (coverage.sharedGaps?.length) {
    const gaps = el("div", { class: "coverage-list" });
    coverage.sharedGaps.forEach((item) => gaps.append(el("div", { class: "coverage-item" }, el("strong", {}, item.label), el("span", { class: `coverage-pill ${coverageTone(item.status)}` }, coverageLabel(item.status)), el("small", { class: "hint" }, item.detail))));
    panel.append(el("h2", {}, "Shared gaps"), gaps);
  }
  const items = coverage.ruleChecklist?.entries ?? [];
  if (items.length) {
    const list = el("div", { class: "coverage-list" });
    const search = el("input", { type: "search", "aria-label": "Find rule or component", placeholder: "Find a rule, card, block, or mode" });
    const draw = () => {
      const query = search.value.toLowerCase();
      list.replaceChildren();
      for (const item of items.filter(item => `${item.title} ${item.id}`.toLowerCase().includes(query))) {
        list.append(el("div", { class: "coverage-item" }, el("strong", {}, item.title), el("span", { class: `coverage-pill ${coverageTone(item.runtime)}` }, coverageLabel(item.runtime)), el("small", { class: "hint" }, `${item.sourceStatus} · ${item.source} · ${item.locator}`), ...item.gaps.map(gap => el("small", { class: "hint" }, gap))));
      }
    };
    search.addEventListener("input", draw); draw();
    const complete = items.filter(item => item.runtime === "implemented").length;
    panel.append(el("details", {}, el("summary", {}, `Rule and component checklist (${complete} completed; ${items.length} entries)`), el("p", {class:"hint"}, "Entries include physical print sheets and documented rule groups. Source verification and engine completion are checked separately."), search, list));
  }
  return panel;
}

function setupScreen() {
  document.body.classList.remove("in-match");
  app.replaceChildren();
  const form = el("form", { class: "setup" });
  form.append(el("div", { class: "eyebrow" }, "LOCAL HOTSEAT · 2–4 PLAYERS"), el("h1", {}, "Zaibatsu Speedrunners"), el("p", { class: "subtle" }, "Build the Cybernet. Move your runners, play cards, and break ICE to take control. First to control four blocks wins."), el("p", { class: "hint" }, "Quick match is an experimental four-marker mode using the current content. Full official Speedrunners content and some printed effects are still being transcribed."));
  const grid = el("div", { class: "form-grid" });
  const names = el("input", { id: "names", value: "Ada, Bea", autocomplete: "off" });
  const seed = el("input", { id: "seed", value: "5", type: "number", step: "1", min: "0" });
  grid.append(el("label", { class: "names", for: "names" }, "Player names (2–4, comma-separated)"), names, el("label", { for: "seed" }, "Explicit seed"), seed);
  const message = el("p", { class: "error", role: "alert" }, error);
  if (connectionLost) form.append(el("button", { type: "button", onClick: reconnect }, "Reconnect"));
  form.append(grid, message, el("button", { class: "primary", type: "submit", "data-testid": "create-standard-session" }, "Start quick match"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      session = await api("/api/play/sessions", { method: "POST", body: JSON.stringify({ playerNames: names.value.split(","), seed: Number(seed.value), modeId: "speedrunners-quick-match" }) });
      clearSelection(); error = ""; handoff = false;
      await command({ kind: "phase" });
    } catch (cause) { message.textContent = cause.message; }
  });
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      const resume = el("button", { type: "button", "data-testid": "resume-match" }, "Resume saved match");
      resume.addEventListener("click", async () => {
        try { session = await api("/api/play/traces/import", { method: "POST", body: saved }); clearSelection(); error = ""; handoff = true; gameScreen(); }
        catch (cause) { message.textContent = cause.message; }
      });
      form.append(resume);
    }
  } catch { /* Storage is optional; exported matches work everywhere. */ }
  const lab = el("section", { class: "test-lab setup-lab", "aria-label": "Test Lab" }, el("h2", {}, "Test Lab"), el("p", { class: "hint" }, "Clearly labeled deterministic fixtures. They never write game data; every action still uses the real reducer."));
  const renderScenarios = () => {
    const list = el("div", { class: "scenario-list" });
    scenarios.forEach((scenario) => {
      const start = el("button", { type: "button", class: "scenario-button", "data-testid": `scenario-${scenario.id}` }, `Open: ${scenario.title}`);
      start.addEventListener("click", async () => {
        try {
          session = await api(`/api/play/scenarios/${scenario.id}`, { method: "POST", body: JSON.stringify({ playerNames: names.value.split(","), seed: Number(seed.value) }) });
          error = ""; clearSelection(); handoff = false; gameScreen();
        } catch (cause) { message.textContent = cause.message; }
      });
      const item = el("article", { class: "scenario-card" }); item.append(el("strong", {}, scenario.title), el("p", { class: "hint" }, scenario.description), start); list.append(item);
    });
    lab.append(list);
  };
  if (scenarios.length) renderScenarios();
  else api("/api/play/scenarios").then((response) => { scenarios = response.scenarios || []; renderScenarios(); }).catch((cause) => { lab.append(el("p", { class: "error" }, cause.message)); });
  const extras = el("details", { class: "setup-extras" }, el("summary", {}, "Test Lab and content coverage"), lab, coverageOverview());
  app.append(form, extras);
}

function gameScreen() {
  document.body.classList.add("in-match");
  app.replaceChildren();
  const header = el("header", { class: "topbar" });
  const title = el("div"); title.append(el("div", { class: "eyebrow" }, session.scenario ? "TEST LAB FIXTURE · LOCAL-ONLY" : "SPEEDRUNNERS · EXPERIMENTAL QUICK MATCH"), el("h1", {}, session.scenario ? session.scenario.title : "Take the Cybernet"));
  const newGame = el("button", { onClick: setupScreen }, "New session");
  header.append(title, newGame);
  if (connectionLost) header.append(el("button", { type: "button", disabled: busy, onClick: reconnect }, "Reconnect"));
  const shell = el("div", { class: "shell" });
  const center = el("section", { class: "panel board-panel" });
  const right = el("aside", { class: "side-stack command-sidebar" });
  const debug = el("details", { class: "panel" }, el("summary", {}, "Rules coverage & diagnostics"), coveragePanel("play-workbench"), snapshotPanel());
  const history = el("details", { class: "panel match-history" }, el("summary", {}, "Match history"), eventPanel(), bonusPanel(), piecePoolsPanel());
  const tools = el("details", { class: "panel", open: Boolean(session.scenario) }, el("summary", {}, "Save, replay & Test Lab"), tracePanel(), scenarioPanel(), playerVisibilityPanel(), debug);
  right.append(...(reactionProjection?[reactionPanel()]:[phasePanel(),abilityHandoffPanel(),actionPanel()]), inspectorPanel(), history, tools);
  center.append(boardPanel());
  shell.append(center, right);
  app.append(header, playerPanel(), shell, handPanel());
  paintPlacementPreview();
  if (session.state.winnerId) app.prepend(el("section", { class: "winner-banner", role: "status" }, el("h1", {}, `${player(session.state.winnerId)?.name} wins!`), el("p", {}, "All control markers now count in Cybernet.")));
  if (handoff && !session.state.winnerId) {
    const curtain = el("section", { class: "handoff", "aria-label": "Player handoff" }, el("div", { class: "panel" }, el("div", { class: "eyebrow" }, `TURN ${session.state.turn}`), el("h1", {}, `Pass to ${player(session.playerView.viewerId)?.name||session.activePlayer.name}`), el("p", { class: "hint" }, "Hands stay private unless an attached card reveals them.")));
    curtain.firstChild.append(el("button", { class: "primary", onClick: () => { handoff = false; gameScreen(); } }, "I'm ready"));
    app.append(curtain);
    shell.inert = true;
    curtain.querySelector("button").focus();
  }
}

function phasePanel() {
  const panel = el("section", { class: "panel phase" });
  if(session.bonusPool){const b=session.bonusPool;panel.append(el("p",{class:"hint","data-testid":"bonus-pool"},`Bonus reserve ${b.reserve}/${b.supply} · on board ${b.onBoard} · invested ${b.invested}`));}
  const active = session.activePlayer;
  panel.append(el("h2", {}, "Your turn"), el("div", { class: "phase-state" }, "TURN", el("strong", {}, String(session.state.turn))), el("div", { class: "phase-state" }, "PHASE", el("strong", {}, session.state.phase.toUpperCase())), el("p", { class: "hint" }, `Active player: ${active?.name || active?.id || "unknown"}`));
  const handSize=session.playerView?.players.find(p=>p.id===active?.id)?.handSize;if(handSize)panel.append(el("p",{class:"hint","data-testid":"hand-size-limit"},`Hand limit at recycling: ${handSize.maximum} (base ${handSize.base}, cards ${handSize.attachments}, spaces ${handSize.spaces}).`));
  const phaseLabel = { beginning: "Start action phase", action: "Finish actions & recycle", recycle: "Resolve end phase", end: "Next player's turn" }[session.state.phase];
  const advance = el("button", { class: "primary", type: "button", disabled: Boolean(session.state.winnerId || session.state.pendingChoice || session.state.pendingAttack || session.state.pendingThreats) }, phaseLabel);
  advance.addEventListener("click", () => command({ kind: "phase" }));
  if (session.scenario || session.state.phase !== "action") panel.append(advance);
  else panel.append(el("details", {}, el("summary", {}, "Turn phase controls"), advance));
  if (session.state.phase === "action") {
    const pass = el("button", { type: "button", disabled: busy || Boolean(session.state.winnerId || session.state.pendingChoice || session.state.pendingAttack || session.state.pendingThreats) }, "End turn");
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
    row.append(el("progress", { max: entry.markersTotal, value: entry.markersPlaced, "aria-label": `${entry.name} block control` }));
  });
  panel.append(el("p", { class: "hint" }, `Deck ${session.counts.deck} · discard ${session.counts.discard} · blocks ${session.counts.blockPile} · eliminated ${session.counts.eliminated}`));
  return panel;
}

function clearSelection() { reactionProjection=null; selected = null; selectedCard = null; selectedActionIndex = 0; movementPath = []; movementPreview = null; recycleSelection = new Set(); }
function chooseAction(index) { selectedActionIndex = index; movementPath = []; movementPreview = null; error = ""; gameScreen(); }
function handPanel() {
  const projection=reactionProjection??session.playerView;
  const visiblePlayer=projection.players.find(entry=>entry.id===projection.viewerId);
  const active={...player(visiblePlayer.id),hand:visiblePlayer.hand.cards.map(id=>({id,name:session.data.cards.find(card=>card.id===id)?.name??id}))};
  const panel = el("section", { class: "panel hand-panel", "aria-label": "Card hand" });
  panel.append(el("div", { class: "hand-title" }, el("h2", {}, `${active.name}'s cards`), el("span", { class: "hint" }, session.state.phase === "recycle" ? "Choose unused cards to discard, or keep your hand" : `${active.hand.length} cards · select one, then choose a use`)));
  if (handoff) return panel;
  for(const opponent of projection.players.filter(entry=>entry.id!==visiblePlayer.id && entry.hand.visibility==="face-up")) panel.append(el("p",{class:"revealed-hand", "data-testid":"revealed-hand"},`${opponent.name} plays face up: ${opponent.hand.cards.map(id=>session.data.cards.find(card=>card.id===id)?.name??id).join(", ")||"Empty hand"}`));
  const list = el("div", { class: "card-tray" });
  active.hand.forEach((entry, index) => {
    const card = session.data.cards.find((card) => card.id === entry.id);
    const isSelected = session.state.phase === "recycle" ? recycleSelection.has(index) : selectedCard === entry.id;
    const button = el("button", { class: `hand-card ${isSelected ? "selected" : ""}`, "data-testid": `hand-card-${index}`, "aria-pressed": isSelected, style: { "--card-angle": `${(index - (active.hand.length - 1) / 2) * 2}deg` } });
    if (card.assetRefs?.[0]) {
      const image = el("img", { class: "card-art", src: `/api/artifact/${card.assetRefs[0]}`, alt: "" });
      image.addEventListener("error", () => image.remove()); button.append(image);
    }
    const stats = el("div", { class: "card-stats" });
    if (card.movement) stats.append(el("span", { class: "move-stat" }, `↗ ${card.movement}`));
    for (const ability of card.activates || []) stats.append(el("span", {}, { search: "⌕", delete: "⚔", icebreaker: "◈", reboot: "↻" }[ability] || ability));
    button.append(stats, el("strong", {}, card.name), el("span", { class: "card-use" }, card.attach ? `${card.attach.slot || card.attach.as} · ${card.attach.cost || 0} bonus` : "Action card"));
    button.addEventListener("click", () => { if (session.state.phase === "recycle") { if (recycleSelection.has(index)) recycleSelection.delete(index); else recycleSelection.add(index); } else { selectedCard = selectedCard === entry.id ? null : entry.id; selectedActionIndex = 0; movementPath = []; movementPreview = null; } gameScreen(); });
    list.append(button);
  });
  panel.append(list);
  if (!active.hand.length) panel.append(el("p", { class: "hint" }, session.state.pendingChoice || session.state.pendingAttack || session.state.pendingThreats ? "No cards in hand. Resolve the pending decision to continue." : "No cards in hand. Finish your turn to recycle."));
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

function piecePoolsPanel() {
  if(!session.state.rulesVersion) return document.createDocumentFragment();
  const panel=el("section",{class:"panel"},el("h2",{},"Piece and control-card zones"));
  for(const [label,ids] of [["Reserve",session.state.reserve||[]],["Eliminated with Reboot",session.state.eliminated||[]],["Removed from match",session.state.outOfGame||[]]]) {
    panel.append(el("strong",{},`${label}: ${ids.length}`),el("p",{class:"hint"},ids.map(pawnLabel).join(", ")||"None"));
  }
  const cards=el("div",{class:"list"});
  for(const card of session.state.controlCards||[]) cards.append(el("div",{class:"hint"},`${card.subject.kind==="pawn"?pawnLabel(card.subject.id):card.subject.id}: ${card.zone==="control"?player(card.ownerId)?.name||card.ownerId:card.zone==="out-of-game"?"removed from match":"common area"}`));
  for(const marker of session.playerView?.controlCardMarkers||[]) cards.append(el("div",{class:"hint control-card-marker"},`${player(marker.playerId)?.name||marker.playerId}: ${marker.amount} marker on ${pawnLabel(session.state.controlCards?.find(c=>c.cardId===marker.cardId)?.subject.id)} control card · counts in Cybernet`));
  panel.append(cards);return panel;
}

function bonusPanel() {
  const panel = el("section", { class: "panel" }, el("h2", {}, "Bonus icons"));
  const icons = session.state.bonusIcons || [];
  if (!icons.length) {
    panel.append(el("p", { class: "empty" }, "No formed bonus icons are on the board."));
    return panel;
  }
  const list = el("div", { class: "list" });
  icons.forEach((icon) => {
    const owner = icon.collectedBy ? player(icon.collectedBy)?.name || icon.collectedBy : "uncollected";
    list.append(el("div", { class: "log-item" }, `${icon.collectedBy ? "Collected" : "Formed"} bonus icon · ${owner} · ${icon.coords.map((coord) => `(${coord.q}, ${coord.r})`).join(" / ")}`));
  });
  panel.append(list, el("p", { class: "hint" }, "A formed icon stays visible here; once collected, it has no further gameplay effect."));
  return panel;
}

function combatPanel(panel) {
  const attack = session.state.pendingAttack;
  const threats = session.state.pendingThreats;
  const coord = attack?.coord || threats.coord;
  const residents = session.state.pawns.filter(p => p.q === coord.q && p.r === coord.r);
  const hostile = (session.state.threats || []).filter(t => t.coord.q === coord.q && t.coord.r === coord.r && t.status !== "eliminated");
  const threatName = id => { const placed = hostile.find(t => t.id === id); return session.data.threats?.find(t => t.id === placed?.threatId)?.name || id; };
  if (attack) {
    if(attack.playerId!==session.activePlayer.id)panel.append(el("p",{class:"hint","data-testid":"attack-controller"},`${player(attack.playerId)?.name} assigns this roll; ${session.activePlayer.name} keeps the turn.`));
    panel.append(el("h3", {}, "Assign your rolled dice"), el("p", { class: "hint" }, "Choose each target after seeing the roll. Repeat a target to concentrate dice."));
    const targets = ["", ...residents.filter(p => !attack.attackerIds.includes(p.pawnId)).map(p => p.pawnId), ...hostile.map(t => t.id)];
    const fields = attack.roll.map((face, i) => field(`Die ${i + 1} · rolled ${face}`, `rolled-${i}`, targets[1] || "", targets, id => !id ? "Leave unused" : residents.some(p => p.pawnId === id) ? pawnLabel(id) : threatName(id)));
    panel.append(el("div", { class: "public-dice", "aria-label": "Attack roll" }, ...attack.roll.map(face => el("span", { class: "public-die" }, face))), ...fields);
    panel.append(el("button", { class: "primary", disabled: busy, onClick: () => command({ kind: "action", action: { type: "assign-delete", playerId:attack.playerId, targetIds: fields.map(f => f.querySelector("select").value) } }) }, "Resolve attack"));
  } else if (threats.stage === "response") {
    panel.append(el("h3", {}, "Threats awakened"), el("p", { class: "hint" }, "Respond with Delete, or accept their fixed attack dice."));
    for (const option of session.legalOptions.actions.filter(a => a.type === "roll-delete")) panel.append(el("button", { disabled: busy, onClick: () => command({ kind: "action", action: { type: option.type, pawnId: option.pawnId, cardId: option.cardId, joint: option.joint } }) }, option.label));
    panel.append(retaliationControls(hostile, residents, threatName));
  } else panel.append(el("h3", {}, "Threats strike back"), retaliationControls(hostile, residents, threatName));
  if (error) panel.append(el("p", { class: "error", role: "alert" }, error));
  return panel;
}

function retaliationControls(hostile, residents, threatName) {
  const panel = el("div", { class: "retaliation" });
  panel.append(el("p", { class: "hint" }, "Assign one die to each of your pawns before concentrating dice or targeting another player's pawn. Attackers take priority."));
  const own = residents.filter(p => p.ownerId === session.activePlayer.id);
  const fields = hostile.map((t, i) => {
    const face = session.data.threats?.find(d => d.id === t.threatId)?.attackDie;
    return field(`${threatName(t.id)} · attack ${face}`, `threat-${i}`, own[i % Math.max(1, own.length)]?.pawnId || residents[0]?.pawnId || "", residents.map(p => p.pawnId), pawnLabel);
  });
  panel.append(...fields, el("button", { disabled: busy, onClick: () => command({ kind: "action", action: { type: "assign-threat-attack", targetIds: fields.map(f => f.querySelector("select").value) } }) }, "Resolve threat attacks"));
  return panel;
}

function phaseChoicePanel(panel) {
  const choice=session.state.pendingChoice;
  const owner=player(choice.playerId);
  const respond=extra=>command({kind:"action",action:{type:"resolve-choice",playerId:choice.playerId,choiceId:choice.id,...extra}});
  if(choice.kind==="block-detach") {
    panel.append(el("h3",{},"Black Clinic: choose a pawn"),el("p",{class:"hint"},`${owner.name} must choose a Cybernet pawn. All of its attached cards discard and their invested counters return to its controller. Pawns with no attachments may be chosen.`));
    for(const response of session.legalOptions.choiceResponses||[]) {const target=session.state.pawns.find(p=>p.pawnId===response.targetId);panel.append(el("button",{disabled:busy,onClick:()=>command({kind:"action",action:response})},`Discard all from ${pawnLabel(response.targetId)} · ${player(target?.ownerId)?.name||"Free pawn"} · ${target?.attachments?.length??0} cards`));}
  } else if(choice.kind==="block-attack") {
    panel.append(el("h3",{},"Yakuza: choose an adjacent pawn"),el("p",{class:"hint"},`${owner.name} may decline or choose a pawn on an adjacent block. The one-skull attack rolls after this choice.`));
    for(const response of session.legalOptions.choiceResponses||[])panel.append(el("button",{disabled:busy,onClick:()=>command({kind:"action",action:response})},response.optionId==="skip"?"Decline Yakuza attack":`Attack ${pawnLabel(response.targetId)} · ${player(session.state.pawns.find(p=>p.pawnId===response.targetId)?.ownerId)?.name||"Free pawn"}`));
  } else if(choice.kind==="steal-card") {
    panel.append(el("h3",{},"Gynoid: steal a random card"),el("p",{class:"hint"},`${owner.name} may choose another pawn or decline. One card is selected at random after the target is chosen.`));
    for(const response of session.legalOptions.choiceResponses||[]) {const target=session.state.pawns.find(p=>p.pawnId===response.targetId);const label=response.optionId==="skip"?"Decline theft":`Steal via ${pawnData(response.targetId)?.name||response.targetId} · ${player(target?.ownerId)?.name||"Controller"}`;panel.append(el("button",{disabled:busy,onClick:()=>command({kind:"action",action:response})},label));}
  } else if(choice.kind==="block-sacrifice") {
    panel.append(el("h3",{},"Electromagnetic Pulse: choose a pawn"),el("p",{class:"hint"},`${owner.name} must sacrifice one controlled pawn. Public selections resolve after every affected player chooses.`));
    for(const d of session.state.pendingBlockSacrifices.decisions)panel.append(el("p",{class:"hint"},`${player(d.playerId)?.name||d.playerId} · ${d.submitted?"selected "+(pawnData(d.pawnId)?.name||d.pawnId):"awaiting selection"}`));
    for(const response of session.legalOptions.choiceResponses||[])panel.append(el("button",{disabled:busy,onClick:()=>command({kind:"action",action:response})},`Sacrifice ${pawnData(response.targetId)?.name||response.targetId}`));
    for(const target of session.legalOptions.unresolvedTargets||[])panel.append(el("p",{class:"hint"},`${pawnData(target.pawnId)?.name||target.pawnId}: ${target.reason}.`));
    panel.append(el("p",{class:"hint"},"Provisional: simultaneous order and retained-pawn eligibility need source rulings."));
  } else if(choice.kind==="space-discard") {
    panel.append(el("h3",{},"Antro: optional attachment discard"),el("p",{class:"hint"},`${owner.name} may choose one matching attachment or decline. Target scope and stop timing remain provisional.`));
    for(const response of session.legalOptions.choiceResponses||[]) {
      const target=session.state.pawns.find(p=>p.pawnId===response.targetId),attachment=target?.attachments?.find(a=>a.instanceId===response.attachmentId);
      panel.append(el("button",{disabled:busy,onClick:()=>command({kind:"action",action:response})},response.optionId==="skip"?"Decline optional discard":`Discard ${cardLabel(attachment?.cardId)} from ${session.data.pawns.find(p=>p.id===response.targetId)?.name||response.targetId} · ${response.attachmentId}`));
    }
  } else if(choice.kind==="block-discard") {
    const batch=session.state.pendingBlockDiscards;panel.append(el("h3",{},"Sprawl: choose hand discards"),el("p",{class:"hint"},`${owner.name}: choose ${choice.amount} physical cards. Selections are revealed after every affected player submits.`));
    for(const d of batch.decisions) panel.append(el("p",{class:"hint"},`${player(d.playerId)?.name||d.playerId} · ${d.amount} required · ${d.submitted?"selection committed":"awaiting selection"}`));
    const selected=new Set(),submit=el("button",{disabled:true,onClick:()=>respond({optionId:"discard",cardIds:[...selected].sort((a,b)=>a-b).map(i=>owner.hand[i].id)})},"Commit selected cards");
    owner.hand.forEach((card,index)=>{const input=el("input",{type:"checkbox","aria-label":`Sprawl discard card ${index+1}: ${card.name}`});input.addEventListener("change",()=>{if(input.checked)selected.add(index);else selected.delete(index);submit.disabled=busy||selected.size!==choice.amount});panel.append(el("label",{class:"phase-card-option"},input,`${index+1}. ${card.name}`))});panel.append(submit,el("p",{class:"hint"},"Provisional: shortfall and global commitment timing still need a ruling."));
  } else if(choice.kind==="move-path") {
    const m=choice.movement;panel.append(el("h3",{},"Choose movement after the roll"),el("p",{class:"hint"},`Roll: ${m.roll.join(", ")} · ${m.budget} steps available. The activation is committed; unused steps are lost.`));
    const fields=el("div"),submit=el("button",{class:"primary",disabled:busy,onClick:()=>respond({optionId:"move",path:movementPath})},"Finish movement");panel.append(fields,submit);
    void renderMovementFields(fields,{type:"resolve-choice",pawnId:choice.pawnId,movementIndex:m.movementIndex}).catch(cause=>{if(fields.isConnected) fields.append(el("p",{class:"error"},cause.message));});
  } else if(choice.kind==="place-block") {
    panel.append(el("h3",{},"Search: place the revealed block"),el("p",{class:"hint"},`${owner.name} revealed ${blockData(choice.blockId)?.name||choice.blockId}. Activation is already paid; choose where to place this block.`));
    const responses=session.legalOptions.choiceResponses||[],select=el("select",{"aria-label":"Revealed block placement"});
    for(const [index,response] of responses.entries()) {const [,dir,rotation]=response.optionId.split(":");select.append(el("option",{value:index},`Edge ${dir} · rotation ${rotation}`));}
    select.addEventListener("change",paintPlacementPreview);panel.append(select,el("button",{disabled:busy||!responses.length,onClick:()=>command({kind:"action",action:responses[Number(select.value)]})},"Place revealed block"));
    if(!responses.length) panel.append(el("p",{class:"hint"},"No supported placement is available. The revealed tile remains pending for source review."));
  } else if(choice.kind==="prevent-elimination") {
    panel.append(el("h3",{},"Prevent pawn elimination"),el("p",{class:"hint"},`${owner.name} decides whether to discard an attached card to protect ${pawnLabel(choice.pawnId)}. This response is allowed during ${session.activePlayer.name}'s turn.`));
    for(const response of session.legalOptions.choiceResponses||[]) {
      const label=response.optionId==="prevent" ? `Discard ${cardLabel(response.cardId)} to prevent elimination` : "Allow elimination";
      panel.append(el("button",{disabled:busy,onClick:()=>command({kind:"action",action:response})},label));
    }
  } else if(choice.kind==="relocate-pawn") {
    panel.append(el("h3",{},"Jetpack: choose a destination"),el("p",{class:"hint"},`${owner.name} must choose an available space. Unresolved threat destinations are excluded.`));
    const targets=session.legalOptions.choiceTargets||[];
    const select=el("select",{"aria-label":"Relocation destination"});
    targets.forEach((target,index)=>select.append(el("option",{value:index},`(${target.coord.q}, ${target.coord.r}) · ${target.spaceId}`)));
    panel.append(el("label",{},"Destination space",select),el("button",{disabled:busy||!targets.length,onClick:()=>respond({optionId:"relocate",...targets[Number(select.value)]})},"Relocate pawn"));
    if(!targets.length) panel.append(el("p",{class:"hint"},"No supported destination is available. This source-review combination needs further rule resolution."));
  } else if(choice.kind==="discard-cards") {
    panel.append(el("h3",{},`Insider Trading: discard ${choice.amount} cards`),el("p",{class:"hint"},`${owner.name} must select exactly ${choice.amount} physical hand cards.`));
    const chosen=new Set();
    const submit=el("button",{disabled:true,onClick:()=>respond({optionId:"discard",cardIds:[...chosen].sort((a,b)=>a-b).map(index=>owner.hand[index].id)})},"Discard selected cards");
    owner.hand.forEach((card,index)=>{
      const input=el("input",{type:"checkbox","aria-label":`Discard card ${index+1}: ${card.name}`});
      input.addEventListener("change",()=>{if(input.checked) chosen.add(index);else chosen.delete(index);submit.disabled=busy||chosen.size!==choice.amount;});
      panel.append(el("label",{class:"phase-card-option"},input,`${index+1}. ${card.name}`));
    });
    panel.append(submit);
  } else {
    const select=el("select",{"aria-label":"Card to discard for Toxin"});
    owner.hand.forEach((card,index)=>select.append(el("option",{value:index},`${index+1}. ${card.name}`)));
    panel.append(el("h3",{},"Toxin: discard or sacrifice"),el("p",{class:"hint"},`${owner.name} must resolve this decision before the action phase.`));
    if (owner.hand.length) panel.append(el("label",{},"Choose one physical card",select));
    panel.append(el("button",{disabled:busy || !owner.hand.length,onClick:()=>respond({optionId:"discard",cardIds:[owner.hand[Number(select.value)].id]})},"Discard selected card"));
    panel.append(el("button",{disabled:busy,onClick:()=>respond({optionId:"sacrifice"})},"Sacrifice pawn"));
  }
  if(error) panel.append(el("p",{class:"error",role:"alert"},error));
  return panel;
}

function actionPanel() {
  const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Actions"));
  if (session.state.pendingChoice) return phaseChoicePanel(panel);
  if (session.state.pendingAttack || session.state.pendingThreats) return combatPanel(panel);
  if (session.state.phase === "recycle") {
    panel.append(el("p", { class: "hint" }, "Your played cards are discarded now; other controllers keep theirs. Choose any unused cards to exchange before refilling your hand."));
    panel.append(el("p", { class: "hint" }, `${recycleSelection.size} unused cards selected for discard.`));
    panel.append(el("button", { class: "primary", disabled: busy, onClick: recycleAndFinishTurn }, recycleSelection.size ? "Discard selected & draw" : "Keep hand & draw"));
    if (error) panel.append(el("p", { class: "error", role: "alert" }, error));
    return panel;
  }
  const options = session.legalOptions.actions || [];
  const selectedPawn = selected?.kind === "pawn" ? session.state.pawns.find((pawn) => pawn.pawnId === selected.id) : null;
  const matchesSelection = (option) => (!selectedCard || option.cardId === selectedCard || option.type === "play-reboot") && (!selectedPawn || (selectedPawn.ownerId === session.activePlayer.id ? !option.pawnId || option.pawnId === selected.id : option.targetIds?.includes(selected.id)));
  if (session.state.phase !== "action") { panel.append(el("p", { class: "empty" }, "Advance to the action phase to submit an action.")); return panel; }
  if (!options.length) { panel.append(el("p", { class: "empty" }, "No reducer-legal actions are available in this state.")); return panel; }
  const select = el("select", { "aria-label": "Action" });
  FAMILY_ORDER.forEach((family) => {
    const familyOptions = options.map((option, index) => ({ option, index })).filter(({ option }) => (option.family || "basics") === family && matchesSelection(option));
    if (!familyOptions.length) return;
    const group = el("optgroup", { label: FAMILY_LABELS[family] || family });
    familyOptions.forEach(({ option, index }) => group.append(el("option", { value: String(index) }, option.label)));
    select.append(group);
  });
  if (!select.options.length) {
    panel.append(el("p", { class: "empty" }, "No available actions for this selection."), el("button", { onClick: () => { clearSelection(); gameScreen(); } }, "Show all actions"));
    return panel;
  }
  const suggested = selectedActionIndex === 0 ? options.findIndex((option) => matchesSelection(option) && option.type === "play-search") : selectedActionIndex;
  select.value = [...select.options].some((choice) => Number(choice.value) === suggested) ? String(suggested) : select.options[0].value;
  selectedActionIndex = Number(select.value);
  const fields = el("div", { class: "action-fields" });
  const renderFields = async () => {
    fields.replaceChildren(); const option = options[Number(select.value)] || {};
    fields.append(el("p", { class: "hint" }, `Family: ${FAMILY_LABELS[option.family || "basics"] || option.family || "basics"}`));
    if (option.pawnId) fields.append(field("Pawn", "pawnId", option.pawnId, [option.pawnId], pawnLabel));
    if (option.type === "move-steps" || option.type === "play-move") {
      if (option.cardId) fields.append(field("Card", "cardId", option.cardId, [option.cardId], cardLabel));
      if (option.movementIndex !== undefined) fields.append(el("p", { class: "hint" }, `Movement option ${option.movementIndex}${option.stealth ? " · stealth-capable" : ""}`));
      await renderMovementFields(fields, option);
      return;
    }
    if (option.type === "move-hex" && option.movementIndex !== undefined) fields.append(el("p", { class: "hint" }, `Movement option ${option.movementIndex}${option.stealth ? " · stealth-capable" : ""}`));
    if (option.targetIds?.length && !option.type.endsWith("delete-multi")) fields.append(field("Target", "targetId", option.targetIds.includes(selected?.id) ? selected.id : option.targetIds[0], option.targetIds, pawnLabel));
    if (option.type.endsWith("delete-multi")) {
      for (let die = 0; die < option.maxTargets; die++) fields.append(field(`Attack die ${die + 1}`, `die-${die}`, die === 0 ? option.targetIds[0] : "", ["", ...option.targetIds], (id) => id ? pawnLabel(id) : "Leave unused"));
      fields.append(el("p", { class: "hint" }, "Assign each die to a target. Repeat a target to concentrate dice."));
    }
    if (option.directions) fields.append(field("Direction", "dir", option.directions[0], option.directions, (dir) => `Direction ${dir}`));
    if(option.type==="roll-movement") fields.append(el("p",{class:"hint"},"Commit this movement activation and roll first. Choose the path after seeing the dice."));
    if(option.revealsBlock) fields.append(el("p",{class:"hint"},"Declare Search to draw and reveal the top tile. Choose its placement after seeing it."));
    if (option.placements?.length) {
      const values = option.placements.map((item) => `${item.dir},${item.rotation}`);
      const placementField = field("Placement", "placement", values[0], values, (value) => { const [dir, rotation] = value.split(","); return `Edge ${dir} · rotation ${rotation}`; });
      placementField.querySelector("select").addEventListener("change", paintPlacementPreview);
      fields.append(placementField, el("p", { class: "hint" }, `Discover ${blockData(session.state.blockPile.at(-1))?.name || "the next block"}. The outlined tile previews its placement.`));
    }
    const cards = session.legalOptions.cardsInHand || [];
    if (option.cardId) fields.append(field("Card", "cardId", option.cardId, [option.cardId], cardLabel));
    if(option.type.includes("reboot") && option.coord) fields.append(el("p",{class:"hint"},`Return to ${blockData(session.state.blocks.find(b=>b.q===option.coord.q && b.r===option.coord.r)?.blockId)?.name || "Core"} · ${option.spaceId}. Only its controller may use Broadcast as a Core.`));
    if (option.type === "play-reboot") fields.append(multiField("Four cards to discard", "cardIds", cards));
  };
  const refreshFields = () => renderFields().then(paintPlacementPreview).catch((cause) => { if (fields.isConnected) fields.append(el("p", { class: "error", role: "alert" }, cause.message)); });
  select.addEventListener("change", () => { selectedActionIndex = Number(select.value); movementPath = []; movementPreview = null; document.querySelectorAll(".space-target").forEach((node) => node.remove()); void refreshFields(); }); void refreshFields();
  const submit = el("button", { class: "primary", type: "button", disabled: busy || Boolean(session.state.winnerId) }, "Execute selected action");
  submit.addEventListener("click", () => {
    const option = options[Number(select.value)] || {}; const action = { type: option.type };
    fields.querySelectorAll("select").forEach((input) => { if (input.name === "movementTarget") return; if (input.name.startsWith("die-")) { if (input.value) (action.targetIds ||= []).push(input.value); } else if (input.name === "dir") action.dir = Number(input.value); else if (input.name === "placement") { const [dir, rotation] = input.value.split(",").map(Number); action.dir = dir; action.rotation = rotation; } else if (input.name === "cardIds") action.cardIds = [...input.selectedOptions].map((choice) => session.legalOptions.cardsInHand[Number(choice.value)]); else action[input.name] = input.value; });
    if (option.coord) action.coord = option.coord;
    if (option.spaceId) action.spaceId = option.spaceId;
    if (option.slotRef) action.slotRef = option.slotRef;
    if (option.joint) action.joint = true;
    if (option.movementIndex !== undefined) action.movementIndex = option.movementIndex;
    if (option.type === "pass") passAndEndTurn();
    else {
      if (option.type === "move-steps" || option.type === "play-move") {
        if (!movementPath.length && !session.state.rulesVersion) { error = "Choose at least one adjacent space."; gameScreen(); return; }
        action.path = movementPath;
      }
      command({ kind: "action", action });
    }
  });
  const families = el("div", { class: "action-families" });
  const shortLabels = { movement: "Move", search: "Search", combat: "Attack", icebreaker: "Icebreaker", attachments: "Attach", reboot: "Reboot" };
  for (const family of FAMILY_ORDER.filter((family) => family !== "basics")) {
    const index = options.findIndex((option) => option.family === family && matchesSelection(option));
    const button = el("button", { type: "button", disabled: index < 0, "aria-pressed": options[selectedActionIndex]?.family === family, class: options[selectedActionIndex]?.family === family ? "active" : "", onClick: () => chooseAction(index) }, shortLabels[family]);
    families.append(button);
  }
  const clear = el("button", { onClick: () => { clearSelection(); gameScreen(); } }, "Show all actions");
  panel.append(el("p", { class: "hint" }, "Select a runner or card, then choose an action. Move through highlighted spaces on the board, or use the path controls below."), families, select, fields, submit, clear); if (error) panel.append(el("p", { class: "error", role: "alert" }, error)); return panel;
}

async function renderMovementFields(fields, option) {
  const detail = el("div", { class: "movement-path" });
  const status = el("p", { class: "hint" });
  const list = el("ol", { class: "path-list" });
  const render = (preview) => {
    movementPreview = { ...preview, optionIndex: selectedActionIndex };
    document.querySelectorAll(".space-target").forEach((node) => node.remove());
    paintMovementTargets();
    list.replaceChildren();
    if (!movementPath.length) list.append(el("li", { class: "empty" }, "Start: current space"));
    movementPath.forEach((step) => list.append(el("li", {}, formatStep(step))));
    const limit = preview.maxSelectableSteps;
    status.textContent = preview.exactBudgetKnown
      ? `${movementPath.length}/${limit} ${preview.roll?"rolled":"fixed"} steps selected.`
      : `${movementPath.length}/${limit} steps selected. The seeded die roll is made on execution; a path beyond that roll is rejected without moving.`;
    if (!movementPath.length && session.state.rulesVersion) status.textContent += " Finish here to spend this activation without moving.";
    if (preview.endError && movementPath.length) status.textContent += ` ${preview.endError}. You can pass through; choose another space to finish.`;
    const execute = fields.parentElement?.querySelector("button.primary");
    if (execute) execute.disabled = busy || !preview.canFinish;
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
    const preview = await api(`/api/play/sessions/${session.id}/movement-options`, { method: "POST", body: JSON.stringify({ pawnId: option.pawnId, path: movementPath, cardId: option.type === "play-move" ? option.cardId : undefined, movementIndex: option.movementIndex }) });
    detail.replaceChildren(); render(preview);
  };
  const preview = await api(`/api/play/sessions/${session.id}/movement-options`, { method: "POST", body: JSON.stringify({ pawnId: option.pawnId, path: movementPath, cardId: option.type === "play-move" ? option.cardId : undefined, movementIndex: option.movementIndex }) });
  if (!fields.isConnected) return;
  fields.append(status, list, detail); render(preview);
}

function formatStep(step) { return `(${step.coord.q}, ${step.coord.r}) · ${step.spaceId}`; }

function field(label, name, value, values, labelFor = (item) => String(item)) { const select = el("select", { name, "aria-label": label }); values.forEach((item) => select.append(el("option", { value: String(item) }, labelFor(item)))); select.value = String(value); const wrap = el("label", {}, label); wrap.append(select); return wrap; }
function multiField(label, name, values) { const select = el("select", { name, multiple: "multiple", size: "4", "aria-label": label }); values.forEach((item, index) => select.append(el("option", { value: String(index) }, `${index + 1}. ${cardLabel(item)}`))); const wrap = el("label", {}, label); wrap.append(select, el("span", { class: "hint" }, "Choose exactly four cards; duplicate copies count separately.")); return wrap; }

function boardPanel() {
  const panel = el("div"); const toolbar = el("div", { class: "board-toolbar" });
  const cameraSwitch = el("div", { class: "camera-switch", "aria-label": "Board view" });
  for (const mode of ["top-down", "perspective"]) {
    const control = el("button", { type: "button", "aria-pressed": camera === mode, class: camera === mode ? "active" : "" }, mode === "top-down" ? "Top-down" : "Perspective");
    control.addEventListener("click", () => { camera = mode; try { localStorage.setItem("zaibatsu-camera", mode); } catch {} gameScreen(); });
    cameraSwitch.append(control);
  }
  const resetView = el("button", {}, "Reset view"); resetView.addEventListener("click", () => { view = { x: 0, y: 0, zoom: 1 }; gameScreen(); });
  const fit = el("button", { type: "button" }, "Fit board");
  fit.addEventListener("click", () => {
    const viewport = document.querySelector(".board-viewport");
    const points = session.state.blocks.map((block) => projectCoord(block.q, block.r));
    const minX = Math.min(...points.map((point) => point[0])) - 110, maxX = Math.max(...points.map((point) => point[0])) + 110;
    const minY = Math.min(...points.map((point) => point[1])) - 120, maxY = Math.max(...points.map((point) => point[1])) + 120;
    const zoom = Math.min(1.4, (viewport.clientWidth - 30) / (maxX - minX), (viewport.clientHeight - 30) / (maxY - minY));
    view = { x: -(minX + maxX) / 2 * zoom, y: -(minY + maxY) / 2 * zoom, zoom };
    gameScreen();
  });
  const undo = el("button", { disabled: session.commandCount === 0 }, "Undo"); undo.addEventListener("click", () => sessionOperation("undo"));
  toolbar.append(el("strong", {}, "Cybernet"), el("span", { class: "hint" }, "Drag to pan · wheel to zoom"), cameraSwitch, undo, fit, resetView);
  const viewport = el("div", { class: `board-viewport ${camera}` }); const board = el("div", { class: "board", style: { transform: boardTransform() } });
  for (const block of session.state.blocks) board.append(tile(block)); viewport.append(board);
  if (session.state.playedCards?.length) {
    viewport.append(el("aside", { class: "played-zone", "aria-label": "Played cards" }, el("strong", {}, "FACE-UP PLAYED CARDS"), ...session.state.playedCards.map((id,index) => el("span", { class: "played-card" }, `${session.state.playedCardOwners?.[index]?player(session.state.playedCardOwners[index])?.name+": ":""}${cardLabel(id)}`))));
  }
  installPanZoom(viewport, board); panel.append(toolbar, viewport); return panel;
}

function projectCoord(q, r) { return [90 * (q - r), -156 * (q + r)]; }
function boardTransform() { return `translate(${view.x}px,${view.y}px) scale(${view.zoom}) rotateX(${camera === "perspective" ? 38 : 0}deg) rotateZ(${camera === "perspective" ? -22 : 0}deg)`; }
function pawnPiece(definition) {
  const art = definition?.artwork;
  if (!art) return el("span", { class: "pawn-figure fallback-figure" }, el("span", { class: "figure-head" }), el("span", { class: "figure-body" }));
  const ns = "http://www.w3.org/2000/svg";
  const frame = document.createElementNS(ns, "svg");
  frame.setAttribute("class", "pawn-figure source-figure");
  frame.setAttribute("viewBox", ` 0 0 ${art.rect.height} ${art.rect.width}`);
  frame.setAttribute("aria-hidden", "true");
  const group = document.createElementNS(ns, "g");
  group.setAttribute("transform", `translate(0 ${art.rect.width}) rotate(-90)`);
  const window = document.createElementNS(ns, "svg");
  window.setAttribute("width", String(art.rect.width)); window.setAttribute("height", String(art.rect.height));
  window.setAttribute("viewBox", `${art.rect.x} ${art.rect.y} ${art.rect.width} ${art.rect.height}`);
  const image = document.createElementNS(ns, "image");
  image.setAttribute("href", `/api/artifact/${art.assetId}`);
  image.setAttribute("width", String(art.width)); image.setAttribute("height", String(art.height));
  window.append(image); group.append(window); frame.append(group);
  return frame;
}
function tile(placed) {
  const definition = blockData(placed.blockId); const [x, y] = projectCoord(placed.q, placed.r);
  const button = el("div", { class: `tile ${selected?.kind === "block" && selected.id === `${placed.q},${placed.r}` ? "selected" : ""}`, style: { left: `${x}px`, top: `${y}px` }, "data-coord": `${placed.q},${placed.r}` });
  const inspect = el("button", { class: "tile-hit", "aria-label": `Block ${definition?.name || placed.blockId}` });
  inspect.addEventListener("click", () => { selected = { kind: "block", id: `${placed.q},${placed.r}` }; gameScreen(); });
  button.append(inspect);
  if(placed.bonusCounter && !placed.bonusCounter.collectedBy)button.append(el("span",{class:"block-bonus-counter",role:"img","aria-label":`Bonus counter on ${definition?.name||placed.blockId}`} ,"1 BONUS"));
  const assetRef = definition?.assetRefs?.[0]; if (assetRef) { const image = el("img", { class: "tile-art", src: `/api/artifact/${encodeURIComponent(assetRef)}`, alt: "", style: { "--rotation": `${placed.rotation * 60}deg` } }); image.addEventListener("error", () => image.remove()); button.append(image); }
  button.append(el("span", { class: "tile-shade" }), el("span", { class: "tile-name" }, definition?.name || placed.blockId), el("span", { class: "ice" }, definition?.iceValue || "—"));
  (definition?.spaces || []).forEach((space) => {
    const [left, top] = spacePosition(definition, space.id, placed.rotation);
    button.append(el("span", { class: "zone", style: { left: `${left}%`, top: `${top}%` }, title: `${space.id}: capacity ${space.capacity || 1}` }, space.id));
  });
  (definition?.edges || []).forEach((open, index) => { const pos = [[75,14],[96,50],[75,86],[25,86],[4,50],[25,14]][(index + placed.rotation) % 6]; button.append(el("span", { class: `edge ${open ? "" : "closed"}`, style: { left: `${pos[0]}%`, top: `${pos[1]}%` } }, open ? "" : "×")); });
  if (placed.ownerId) button.append(el("span", { class: "control" }, `${player(placed.ownerId)?.name || placed.ownerId} control`));
  const residents = session.state.pawns.filter((pawn) => pawn.q === placed.q && pawn.r === placed.r);
  residents.forEach((pawn) => {
    const peers = residents.filter((other) => other.spaceId === pawn.spaceId);
    const index = peers.indexOf(pawn);
    const [left, top] = spacePosition(definition, pawn.spaceId, placed.rotation);
    const owner = player(pawn.ownerId);
    const token = el("button", { class: `pawn ${selected?.kind === "pawn" && selected.id === pawn.pawnId ? "selected" : ""}`, style: { left: `${left + (index - (peers.length - 1) / 2) * 15}%`, top: `${top}%`, "--pawn-color": owner?.color || "#aaa" }, "aria-label": `Pawn ${pawnData(pawn.pawnId)?.name || pawn.pawnId}`, title: `${owner?.name || "Uncontrolled"} · ${pawn.spaceId}` }, el("span", { class: "pawn-base" }), pawnPiece(pawnData(pawn.pawnId)), el("span", { class: "pawn-caption" }, pawnData(pawn.pawnId)?.name || pawn.pawnId));
    token.addEventListener("click", () => { selected = { kind: "pawn", id: pawn.pawnId }; selectedActionIndex = 0; movementPath = []; movementPreview = null; gameScreen(); });
    button.append(token);
  });
  for (const threat of (session.state.threats || []).filter(t => t.coord.q === placed.q && t.coord.r === placed.r)) {
    const [left, top] = spacePosition(definition, threat.spaceId, placed.rotation);
    const def = session.data.threats?.find(t => t.id === threat.threatId);
    button.append(el("span", { class: `threat-token ${threat.status}`, style: { left: `${left}%`, top: `${top}%` }, title: `${def?.name || threat.threatId}: ${threat.status}`, "aria-label": `${def?.name || "Threat"} ${threat.status}` }, threat.status === "eliminated" ? "×" : String(def?.attackDie || "!")));
  }
  return button;
}

function spacePosition(definition, spaceId, rotation = 0) {
  const positions = [[50,50],[33,25],[67,25],[83,50],[67,75],[33,75],[17,50]];
  const zones = definition?.spaces?.find((space) => space.id === spaceId)?.zoneIds || ["h1"];
  const points = zones.map((id) => positions[Number(id.slice(1)) - 1] || positions[0]);
  const left = points.reduce((total, p) => total + p[0], 0) / points.length;
  const top = points.reduce((total, p) => total + p[1], 0) / points.length;
  const angle = rotation * Math.PI / 3;
  return [50 + (left - 50) * Math.cos(angle) - (top - 50) * Math.sin(angle), 50 + (left - 50) * Math.sin(angle) + (top - 50) * Math.cos(angle)];
}

function paintMovementTargets() {
  if (!movementPreview || movementPreview.optionIndex !== selectedActionIndex || busy) return;
  for (const target of movementPreview.nextTargets || []) {
    const tile = document.querySelector(`.tile[data-coord="${target.coord.q},${target.coord.r}"]`);
    const placed = session.state.blocks.find((block) => block.q === target.coord.q && block.r === target.coord.r);
    if (!tile || !placed) continue;
    const [left, top] = spacePosition(blockData(placed.blockId), target.spaceId, placed.rotation);
    const button = el("button", { class: "space-target", style: { left: `${left}%`, top: `${top}%` }, "aria-label": `Move to ${target.spaceId} at ${target.coord.q}, ${target.coord.r}` }, "+");
    button.addEventListener("click", () => { movementPath.push(target); movementPreview = null; gameScreen(); });
    tile.append(button);
  }
}

function paintPlacementPreview() {
  document.querySelectorAll(".placement-preview").forEach((node) => node.remove());
  const pending=session.state.pendingChoice;
  const selector=document.querySelector('select[aria-label="Revealed block placement"]');
  if(pending?.kind==="place-block" && selector) {
    const response=session.legalOptions.choiceResponses?.[Number(selector.value)];if(!response) return;
    const [,direction,orientation]=response.optionId.split(":").map(Number),deltas=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    const ghost=tile({blockId:pending.blockId,q:pending.reference.q+deltas[direction][0],r:pending.reference.r+deltas[direction][1],rotation:orientation});ghost.classList.add("placement-preview");ghost.querySelectorAll("button").forEach(node=>{node.disabled=true;});ghost.setAttribute("aria-label","Revealed Search placement preview");document.querySelector(".board")?.append(ghost);return;
  }
  const option = session.legalOptions.actions[selectedActionIndex];
  const field = document.querySelector('select[name="placement"]');
  if (!option?.placements?.length || !field) return;
  const pawn = session.state.pawns.find((pawn) => pawn.pawnId === option.pawnId);
  if (!pawn) return;
  const [dir, rotation] = field.value.split(",").map(Number);
  const deltas = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  const q = pawn.q + deltas[dir][0], r = pawn.r + deltas[dir][1];
  const ghost = tile({ blockId: session.state.blockPile.at(-1), q, r, rotation });
  ghost.classList.add("placement-preview");
  ghost.querySelectorAll("button").forEach((node) => { node.disabled = true; });
  ghost.setAttribute("aria-label", "Search placement preview");
  document.querySelector(".board")?.append(ghost);
}

function installPanZoom(viewport, board) { let drag = null; viewport.addEventListener("pointerdown", (event) => { if (event.target !== viewport) return; drag = { x: event.clientX, y: event.clientY }; viewport.classList.add("dragging"); viewport.setPointerCapture(event.pointerId); }); viewport.addEventListener("pointermove", (event) => { if (!drag) return; view.x += event.clientX - drag.x; view.y += event.clientY - drag.y; drag = { x: event.clientX, y: event.clientY }; board.style.transform = boardTransform(); }); viewport.addEventListener("pointerup", () => { drag = null; viewport.classList.remove("dragging"); }); viewport.addEventListener("wheel", (event) => { event.preventDefault(); view.zoom = Math.min(2.2, Math.max(.45, view.zoom + (event.deltaY < 0 ? .1 : -.1))); board.style.transform = boardTransform(); }, { passive: false }); }

function inspectorPanel() {
  const panel = el("section", { class: "panel inspector" }, el("h2", {}, "Runner & block details"));
  const unresolved=(session.playerView?.useMarkers||[]).filter(marker=>marker.unresolved);
  if(unresolved.length) panel.append(el("p",{class:"hint","data-testid":"unresolved-use-markers"},`${unresolved.length} discarded-card use marker(s) await a rule ruling; reattachment of that card definition is unavailable.`));
  if (!selected) { panel.append(el("p", { class: "hint" }, "Select a runner to see movement, abilities, defenses, and attached cards. Select a block to see its ICE and spaces.")); return panel; }
  const pawn = selected.kind === "pawn" ? session.state.pawns.find((pawn) => pawn.pawnId === selected.id) : null;
  const placed = selected.kind === "block" ? session.state.blocks.find((block) => block.q + "," + block.r === selected.id) : null;
  const data = pawn ? pawnData(pawn.pawnId) : placed ? blockData(placed.blockId) : null;
  if (!data) return panel;
  const detail = el("dl");
  const row = (label, value) => detail.append(el("dt", {}, label), el("dd", {}, value));
  row("Name", data.name);
  if(data.provisional) row("Rules review","Provisional · full rules pending");
  row("Control", player((pawn || placed).ownerId)?.name || "Uncontrolled");
  if(placed?.bonusCounter)row("Block bonus counter",placed.bonusCounter.collectedBy?`Collected by ${player(placed.bonusCounter.collectedBy)?.name||placed.bonusCounter.collectedBy}`:"1 physical counter held");
  if (pawn) {
    const markers=(session.playerView?.useMarkers||[]).filter(marker=>marker.pawnId===pawn.pawnId);
    const physicalCard=session.state.controlCards?.find(c=>c.subject.kind==="pawn" && c.subject.id===pawn.pawnId);
    const controlMarkers=(session.playerView?.controlCardMarkers||[]).filter(m=>m.cardId===physicalCard?.cardId);
    row("Control markers",controlMarkers.map(m=>`${m.amount} · ${player(m.playerId)?.name||m.playerId} · counts in Cybernet`).join(" / ")||"None");
    row("Pawn ICE",data.iceFaces?.length?data.iceFaces.join(", "):data.iceValue||"None");
    if(data.phaseEffects?.some(e=>e.kind==="steal-random-card"))row("Beginning effect","May steal one random hand card via another pawn, or decline.");
    if(data.special) row("Special instruction",data.special);
    row("Used abilities",markers.map(marker=>`${marker.ability.startsWith("move:")?"move":marker.ability} · ${marker.uses} used${marker.cardId?" · "+cardLabel(marker.cardId):" · control card"}`).join(" / ")||"None");
    row("Classes",(session.pawnClasses?.[pawn.pawnId]||data.class||[]).join(", ")||"None");
    const icebreaker=session.pawnIcebreakerModifiers?.[pawn.pawnId];
    if(icebreaker?.rollDice) row("Extra Icebreaker dice",String(icebreaker.rollDice));
    if(icebreaker?.ignoresBlackIce) row("Black ICE", "Immune while attached");
    const deleteProfile=session.pawnDeleteProfiles?.[pawn.pawnId];
    if(deleteProfile?.skulls) {
      row("Printed attack skulls",String(deleteProfile.skulls));
      row("Delete activators",deleteProfile.cancelled?"Cancelled":[deleteProfile.card?"Matching card":"",deleteProfile.freeActivators===1?"Once per turn":deleteProfile.freeActivators>1?"Free activator stacking unresolved":""].filter(Boolean).join(" / ")||"None");
    }
    row("Location", "(" + pawn.q + ", " + pawn.r + ") · " + pawn.spaceId);
    row("Movement", (data.movement.steps || data.movement.type) + " · " + data.movement.activation.replaceAll("-", " "));
    row("Abilities", (data.abilities || []).map((ability) => ability.ability + " · " + ability.activation.replaceAll("-", " ")).join(" / "));
    row("Defense", session.pawnDefenseProfiles?.[pawn.pawnId]?.error?"Awaiting defense-space source review":(session.pawnDefenseProfiles?.[pawn.pawnId]?.dice || data.defense || []).map((die) => die.value + (die.shielded ? " shielded" : " vulnerable")).join(", "));
    row("Slots", (session.pawnSlots?.[pawn.pawnId]||[]).map(slot=>slot.ref.replace(/^(pawn|legacy):/,"").split("/").join(" → ") + (slot.occupied?" · occupied":" · available")).join(" / ") || "None");
  } else {
    if(data.spaceArrows?.length) row("One-way links",data.spaceArrows.map(a=>`${a.from} → ${a.to}`).join(" / "));
    row("ICE", data.iceValue + (data.iceFaces?.length ? " · faces " + data.iceFaces.join(", ") : ""));
    if(data.nonPlayableZoneIds?.length) row("Non-playable title / art zones",data.nonPlayableZoneIds.join(", "));
    if(data.spaces?.some(s=>s.modifier?.kind==="defense")) row("Defense spaces",data.spaces.filter(s=>s.modifier?.kind==="defense").map(s=>s.id+" · "+(s.modifier.dice?.map(d=>d.value+(d.shielded?" shielded":" vulnerable")).join(", ")||"awaiting source review")).join(" / "));
    row("Spaces", (data.spaces || []).map((space) => space.id + " · " + (space.capacity || 1) + " capacity").join(" / "));
    if (data.effects) row("Printed effects", Object.values(data.effects).map((effect) => typeof effect === "string" ? "Awaiting effect implementation" : effect.text || effect.kind).join(" / "));
  }
  row("Attached", ((pawn || placed).attachments || []).map((att) => cardLabel(att.cardId) + (att.bonusPaid ? " · " + att.bonusPaid + " bonus" : "")).join(" / ") || "None");
  panel.append(detail);
  return panel;
}
function describeEvent(event) { const actor = event.playerId ? player(event.playerId)?.name || event.playerId : ""; if(event.type==="bonus-counter-placed") return event.element==="block"?`A reserve counter was placed on ${blockData(event.elementId)?.name||"the block"}.`:"A reserve counter was placed on the completed bonus icon."; if(event.type==="bonus-awarded") return `${actor||"Player"} collected ${event.amount} bonus counter${event.amount===1?"":"s"} from reserve.`; if(event.type==="pawn-sacrifice-selected") return `${actor||"Controller"} selected ${pawnLabel(event.pawnId)} for sacrifice.`; if (event.type === "phase-advanced") return `${actor || "Turn"}: ${event.fromPhase} → ${event.toPhase}`; if (event.type === "action-accepted") return `${actor || "Player"} completed ${event.actionType || "an action"}.`; if(event.type==="ability-use-marked") return `${actor||"Controller"} marked ${event.cardId?cardLabel(event.cardId):pawnLabel(event.pawnId)} as used.`; if(event.type==="ability-use-cleared") return `${actor||"Controller"} cleared a used ability on ${event.cardId?cardLabel(event.cardId):pawnLabel(event.pawnId)}.`; if(event.type==="ability-marker-retained") return `${cardLabel(event.cardId)} retains an unresolved use marker after discard.`; if(event.type==="control-marker-placed") return `${actor} placed a control marker on ${pawnLabel(session.state.controlCards?.find(c=>c.cardId===event.cardId)?.subject.id)}; it counts in Cybernet.`; if(event.type==="control-marker-returned") return `${actor} recovered a control marker from a control card.`; if (event.type === "roll") return `Roll: ${event.roll?.join(", ") || "—"}.`; if(event.type==="pawn-moved") return `${actor||"Player"} moved ${pawnLabel(event.pawnId)} to ${event.spaceId}.`; if(event.type==="block-drawn") return `${actor||"Player"} revealed ${blockData(event.elementId)?.name||event.elementId}.`; if(event.type==="block-placed") return `${actor||"Player"} placed ${blockData(event.elementId)?.name||event.elementId}.`; if(event.type==="block-attachments-discarded")return `${actor||"Controller"} chose ${pawnLabel(event.pawnId)}: ${event.amount??0} attached cards discarded.`; if(event.type==="block-hand-discarded")return `${actor||"Player"} discarded their whole hand (${event.amount??0} cards) due to ${blockData(event.elementId)?.name||"the block"}.`; if(event.type==="block-attack-targeted")return `${actor||"Controller"} chose ${pawnLabel(event.pawnId)} for ${blockData(event.elementId)?.name||"the block"} attack.`; if(event.type==="card-stolen")return `${actor||"Player"} stole ${event.cardId?cardLabel(event.cardId):"one card"} from ${player(event.fromOwnerId)?.name||"a controller"}.`; if (event.type === "draw") return event.cardId ? `${actor || "Player"} drew ${cardLabel(event.cardId)}.` : `${actor || "Player"} drew a card.`; if (event.type === "bonus-icon-created") return `A bonus icon formed at ${event.elementId || "the board"}.`; if (event.type === "bonus-collected") return `${actor || "Player"} collected a bonus icon.`; if (event.type === "choice-required") return `${actor || "Player"} must resolve a required decision.`; if (event.type === "choice-resolved") return `${actor || "Player"} resolved ${event.cardId?cardLabel(event.cardId):"a required decision"}.`; if (event.type === "card-discarded") return `${cardLabel(event.cardId)} was discarded.`; if (event.type === "pawn-relocated") return `${pawnLabel(event.pawnId)} relocated to (${event.coord.q}, ${event.coord.r}) · ${event.spaceId}.`; if (event.type === "pawn-placed") return event.toOwnerId?`${pawnLabel(event.elementId)} entered the Cybernet under ${player(event.toOwnerId)?.name || event.toOwnerId}.`:`${pawnLabel(event.elementId)} entered the Cybernet free of player control.`; if (event.type === "elimination-prevented") return `${actor || "Controller"} protected ${pawnLabel(event.pawnId)} using ${cardLabel(event.cardId)}.`; if (event.type === "pawn-returned-to-reserve") return `${pawnLabel(event.pawnId)} returned to reserve.`; if (event.type === "control-card-released") return `${pawnLabel(event.pawnId)} control card returned to the common area.`; if (event.type === "elimination") return `${pawnLabel(event.pawnId)} was eliminated.`; if (event.type === "control-changed") { const subject=event.element==="pawn"?pawnLabel(event.elementId):event.element==="block"&&event.elementId!=="markers"?`Block ${event.elementId}`:event.element||"element"; const controller=player(event.toOwnerId)?.name; return controller?`${controller} gained control of ${subject}.`:`Control changed: ${subject}.`; } if (event.type === "winner-declared") return `${actor || "A player"} wins.`; return event.message || "Action was rejected."; }
function eventPanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Event / action log")); const list = el("div", { class: "list", "aria-live": "polite" }); (session.playerEvents?.length ? session.playerEvents : [{ type: "ready", message: "Session created." }]).slice().reverse().forEach((event) => list.append(el("div", { class: `log-item ${event.type}` }, describeEvent(event)))); panel.append(list); return panel; }
function snapshotPanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Trusted operator snapshot (includes hidden cards)"), el("pre", { class: "snapshot" }, JSON.stringify(session.state))); return panel; }
function tracePanel() { const panel = el("section", { class: "panel" }); panel.append(el("h2", {}, "Trace")); const download = el("button", { type: "button" }, "Export trace"); download.addEventListener("click", async () => { const trace = await api(`/api/play/sessions/${session.id}/trace`); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" })); link.download = "speedrunners-trace.json"; link.click(); URL.revokeObjectURL(link.href); }); const file = el("input", { class: "trace-input", type: "file", accept: "application/json" }); const upload = el("button", { type: "button" }, "Import trace"); upload.addEventListener("click", () => file.click()); file.addEventListener("change", async () => { const selectedFile = file.files?.[0]; if (!selectedFile || busy) return; busy=true;app.querySelectorAll("button, select, input").forEach(control=>control.disabled=true);try { session = await api("/api/play/traces/import", { method: "POST", body: await selectedFile.text() }); error = ""; clearSelection(); handoff = !session.scenario; await saveMatch(); } catch (cause) { error = cause.message; } finally {busy=false;gameScreen();} }); const reset = el("button", { type: "button" }, "Reset"); reset.addEventListener("click", () => sessionOperation("reset")); panel.append(el("div", { class: "button-row" }), file); panel.querySelector(".button-row").append(download, upload, reset); return panel; }
async function sessionOperation(operation) {
  if (busy) return;
  busy = true;
  app.querySelectorAll("button, select, input").forEach(control=>control.disabled=true);
  const previousViewer=session.playerView.viewerId;
  try {
    session = await api(`/api/play/sessions/${session.id}/${operation}`, { method: "POST", body: JSON.stringify(session.setup) });
    error = ""; clearSelection();
    if (operation === "reset" && !session.scenario) {
      session = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify({ kind: "phase" }) });
    }
    handoff = !session.scenario && (operation === "reset" || previousViewer!==session.playerView.viewerId);
    await saveMatch();
  } catch (cause) { error = cause.message; }
  finally { busy = false; gameScreen(); }
}
async function saveMatch() {
  if (session.scenario) return;
  try { const trace = session.recoveryTrace || await api(`/api/play/sessions/${session.id}/trace`); localStorage.setItem(SAVE_KEY, JSON.stringify(trace)); }
  catch { /* Explicit export remains available when browser storage is unavailable. */ }
}
async function command(body) {
  if (busy) return;
  busy = true;
  app.querySelectorAll("button, select, input").forEach((control) => control.disabled = true);
  try {
    const previousViewer=session.playerView.viewerId;
    session = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify(body) });
    if(!session.scenario && previousViewer!==session.playerView.viewerId) handoff=true;
    error = session.result?.error || "";
    if (session.result?.accepted) { clearSelection(); await saveMatch(); }
  } catch (cause) { error = cause.message; }
  finally { busy = false; gameScreen(); }
}
async function passAndEndTurn() {
  if (busy || session.state.winnerId) return;
  busy = true;
  app.querySelectorAll("button, select, input").forEach((control) => control.disabled = true);
  try {
    let result = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify({ kind: "action", action: { type: "pass" } }) });
    session = result;
    if (!result.result?.accepted) throw new Error(result.result?.error || "Pass was rejected");
    session = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify({ kind: "phase" }) });
    if (!session.result?.accepted) throw new Error(session.result?.error || "Could not enter recycling");
    error = ""; clearSelection(); await saveMatch();
  } catch (cause) { error = cause.message; }
  finally { busy = false; gameScreen(); }
}
async function recycleAndFinishTurn() {
  if (busy) return;
  const active = player(session.activePlayer.id);
  const cardIds = [...recycleSelection].sort((a,b) => a-b).map((index) => active.hand[index].id);
  busy = true;
  app.querySelectorAll("button, select, input").forEach((control) => control.disabled = true);
  try {
    session = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify({ kind: "action", action: { type: "recycle", cardIds } }) });
    if (!session.result?.accepted) throw new Error(session.result?.error || "Recycling was rejected");
    for (let phase = 0; phase < 2; phase++) {
      session = await api(`/api/play/sessions/${session.id}/command`, { method: "POST", body: JSON.stringify({ kind: "phase" }) });
      if (!session.result?.accepted) throw new Error(session.result?.error || "Turn transition was rejected");
    }
    clearSelection(); error = ""; handoff = !session.scenario; await saveMatch();
  } catch (cause) { error = cause.message; }
  finally { busy = false; gameScreen(); }
}
async function start() {
  try {
    const [scenarioResponse, coverageResponse] = await Promise.all([api("/api/play/scenarios"), api("/api/coverage")]);
    scenarios = scenarioResponse.scenarios || [];
    coverage = coverageResponse;
  } catch (cause) {
    error = cause.message;
  }
  setupScreen();
}

start();

function playerVisibilityPanel() {
  const panel=el("details",{class:"panel"},el("summary",{},"What each player can see"));
  panel.append(el("p",{class:"hint"},"Read-only player views hide draw-pile order. This local operator sandbox also provides trusted replay and diagnostics."));
  const selector=el("select",{"aria-label":"View as player"});
  selector.append(el("option",{value:""},"Spectator"));
  for(const entry of session.players) selector.append(el("option",{value:entry.id},entry.name));
  selector.value=session.playerView.viewerId;
  const result=el("div",{"data-testid":"player-view-preview"});
  const render=projection=>{
    result.replaceChildren();
    for(const entry of projection.players) result.append(el("p",{},`${entry.name}: ${entry.hand.count} cards · ${entry.hand.visibility==="hidden"?"Hidden":entry.hand.visibility==="face-up"?"Face up":"Your hand"}${entry.hand.visibility==="hidden"?"":` · ${entry.hand.cards.map(id=>session.data.cards.find(card=>card.id===id)?.name??id).join(", ")||"Empty hand"}`}`));
    result.append(el("p",{class:"hint"},`${projection.options.length} available action options for this viewer.`));
  };
  render(session.playerView);
  selector.addEventListener("change",async()=>{selector.disabled=true;try { const payload=await api(`/api/play/sessions/${session.id}/player-view?viewer=${encodeURIComponent(selector.value)}`);render(payload.view); } catch(err) {result.replaceChildren(el("p",{},err.message));} finally {selector.disabled=false;} });
  panel.append(selector,result);return panel;
}

function abilityHandoffPanel() {
 const panel=el("section",{class:"panel", "aria-label":"Abilities during another turn"});
 if(!(session.abilityControllers||[]).length)return document.createDocumentFragment();
 panel.append(el("h2",{},"Other permitted abilities"),el("p",{class:"hint"},"A printed pawn permission can allow its controller to act between completed actions. The turn stays with the active player."));
 for(const owner of session.abilityControllers)panel.append(el("button",{disabled:busy,onClick:async()=>{
  const curtain=el("section",{class:"handoff","aria-label":"Ability handoff"},el("div",{class:"panel"},el("h1",{},`Pass to ${owner.name}`),el("p",{class:"hint"},"Only this controller can review their hand and choose a permitted ability.")));
  curtain.firstChild.append(el("button",{class:"primary",onClick:async()=>{try{const response=await api(`/api/play/sessions/${session.id}/player-view?viewer=${encodeURIComponent(owner.id)}`);reactionProjection=response.view;gameScreen();}catch(cause){error=cause.message;gameScreen();}}},"I'm ready to use abilities"),el("button",{onClick:()=>curtain.remove()},"Cancel"));app.append(curtain);
 }},`Let ${owner.name} use permitted abilities`));return panel;
}
function reactionPanel() {
 const projection=reactionProjection,owner=player(projection.viewerId),panel=el("section",{class:"panel","aria-label":"Permitted ability actions"},el("h2",{},`${owner.name}'s permitted abilities`),el("p",{class:"hint"},`${session.activePlayer.name} keeps the turn. Costs and decisions belong to ${owner.name}.`));
 const rolls=projection.options.filter(o=>o.action.type==="roll-delete");
 for(const {action} of rolls)panel.append(el("button",{disabled:busy,onClick:()=>command({kind:"action",action})},action.cardId?`Play ${cardLabel(action.cardId)}: Roll Delete with ${pawnLabel(action.pawnId)}`:`Free Roll Delete with ${pawnLabel(action.pawnId)}`));
 if(!rolls.length)panel.append(el("p",{class:"hint"},"No permitted Delete activation is available. The pawn still needs its printed ability, cost and legal targets."));
 panel.append(el("button",{disabled:busy,onClick:()=>{clearSelection();gameScreen();}},`Return to ${session.activePlayer.name}`));if(error)panel.append(el("p",{class:"error",role:"alert"},error));return panel;
}
