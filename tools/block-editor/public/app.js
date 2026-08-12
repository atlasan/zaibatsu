const app = document.querySelector("#app");

const GRID_RADIUS = 2;
const GRID_X_STEP = 14.98;
const GRID_Y_STEP = 11.25;
const GRID_HEX_X = 8.65;
const GRID_HEX_Y = 7.5;
const GRID_DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const state = { assets: [], drafts: [], selectedAssetId: null, sessionName: "block-drafts", notice: "Loading source-linked block assets...", validation: [] };

const escape = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const titleFor = (asset) => `${asset.assetId.startsWith("sp-") ? "Speedrunners" : "Shadowraiders"} · page ${asset.page} · ${asset.assetId.split("-").at(-1)}`;
const selectedAsset = () => state.assets.find((asset) => asset.assetId === state.selectedAssetId) ?? state.assets[0];
const validCell = (cell) => Number.isInteger(cell?.q) && Number.isInteger(cell?.r) && Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(-cell.q - cell.r)) <= GRID_RADIUS;
const cellKey = (cell) => `${cell.q},${cell.r}`;
const axialDistance = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
const gridToPercent = (cell) => ({ x: 50 + GRID_X_STEP * (cell.q + cell.r / 2), y: 50 + GRID_Y_STEP * cell.r });
const locationForCell = (cell) => gridToPercent(cell);
const allGridCells = () => Array.from({ length: GRID_RADIUS * 2 + 1 }, (_, qIndex) => qIndex - GRID_RADIUS).flatMap((q) => Array.from({ length: GRID_RADIUS * 2 + 1 }, (_, rIndex) => rIndex - GRID_RADIUS).map((r) => ({ q, r }))).filter(validCell);
const fallbackCell = (index = 0) => allGridCells()[index % allGridCells().length] ?? { q: 0, r: 0 };

function gridFromLocation(location, index = 0) {
  if (!location || !Number.isFinite(location.x) || !Number.isFinite(location.y)) return fallbackCell(index);
  let closest = fallbackCell(index);
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of allGridCells()) {
    const point = gridToPercent(candidate);
    const next = ((point.x - location.x) / GRID_X_STEP) ** 2 + ((point.y - location.y) / GRID_Y_STEP) ** 2;
    if (next < distance) { closest = candidate; distance = next; }
  }
  return closest;
}

function nextAdjacentCell(anchor) {
  return GRID_DIRECTIONS.map(([q, r]) => ({ q: anchor.q + q, r: anchor.r + r })).find(validCell) ?? anchor;
}

function footprintFor(space = {}, index = 0) {
  const type = space.type ?? "normal";
  const existing = space.footprint?.cells?.filter(validCell) ?? [];
  const anchor = existing[0] ?? gridFromLocation(space.location, index);
  if (type === "double") {
    const cells = existing.length === 2 && axialDistance(existing[0], existing[1]) === 1 ? existing : [anchor, nextAdjacentCell(anchor)];
    return { shape: "pill", cells };
  }
  if (type === "special") return { shape: "large", cells: existing.length ? existing : [anchor] };
  return { shape: "hex", cells: [anchor] };
}

function normalizeDraft(draft) {
  if (!draft) return draft;
  draft.block.bonusCorners ??= [false, false, false, false, false, false];
  draft.block.bonusFragments = draft.block.bonusCorners.filter(Boolean).length;
  draft.block.spaces ??= [];
  draft.block.spaces.forEach((space, index) => {
    space.footprint = footprintFor(space, index);
    space.location = locationForCell(space.footprint.cells[0]);
  });
  return draft;
}

const selectedDraft = () => normalizeDraft(state.drafts.find((draft) => draft.source.assetId === state.selectedAssetId));
const blankDraft = (asset) => ({
  id: `${asset.assetId}-draft`, resourceType: "block", title: titleFor(asset), status: "draft",
  source: { assetId: asset.assetId },
  block: { id: `${asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners"}-draft-${asset.assetId.split("-").slice(-2).join("-")}`, name: "Untranscribed block", expansion: asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners", iceValue: "none", bonusFragments: 0, bonusCorners: [false, false, false, false, false, false], edges: [false, false, false, false, false, false], boundarySpaces: [[], [], [], [], [], []], spaces: [], assetRefs: [asset.assetId], provisional: true },
  provenance: { primaryArtifactId: asset.artifactId, page: asset.page, locator: `cut block ${asset.assetId.split("-").at(-1)}`, notes: "" }, annotations: []
});
const ensureDraft = () => {
  const asset = selectedAsset(); if (!asset) return null;
  let draft = selectedDraft();
  if (!draft) { draft = blankDraft(asset); state.drafts.push(draft); }
  return draft;
};
const api = async (path, options = {}) => { const response = await fetch(path, options); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? data.errors?.join(" ") ?? "Request failed"); return data; };

function render() {
  const asset = selectedAsset(); const draft = selectedDraft();
  const speed = state.assets.filter((item) => item.assetId.startsWith("sp-"));
  const shadow = state.assets.filter((item) => item.assetId.startsWith("sh-"));
  app.innerHTML = `
    <header class="topbar"><div><span class="eyebrow">LOCAL CONTENT AUTHORING</span><h1>Zaibatsu <em>Block Editor</em></h1></div><div class="status"><span class="pulse"></span>${escape(state.notice)}</div></header>
    <section class="workspace">
      <aside class="assets panel"><div class="panel-title"><h2>Cut blocks</h2><span>${state.assets.length}</span></div><input id="asset-filter" aria-label="Filter block assets" placeholder="Filter source assets"><div id="asset-list" class="asset-list">${renderAssetGroup("Speedrunners", speed)}${renderAssetGroup("Shadowraiders", shadow)}</div></aside>
      <section class="canvas panel"><div class="canvas-title"><div><span class="eyebrow">${asset ? escape(asset.artifactId) : "no asset"}</span><h2>${asset ? escape(titleFor(asset)) : "Select a block"}</h2></div><button id="new-draft" class="secondary" ${asset ? "" : "disabled"}>${draft ? "Reset draft" : "Create draft"}</button></div>
        ${asset ? `<div class="hex-stage"><div class="tile-canvas"><img src="/api/artifact/${encodeURIComponent(asset.assetId)}" alt="${escape(titleFor(asset))}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'missing-art',textContent:'Run the artifact refresh to load this local source image.'}))">${draft ? renderLayoutOverlay(draft) : ""}</div><div class="mask-note">full block crop · scroll to inspect · source page ${asset.page}</div></div>` : ""}
        <div class="asset-meta">assetId <code>${asset ? escape(asset.assetId) : "—"}</code> · source <code>${asset ? escape(asset.artifactId) : "—"}</code></div>
      </section>
      <section class="inspector panel">${draft ? renderInspector(draft) : `<div class="empty"><h2>Start a draft</h2><p>Select a block and create its source-linked draft. Nothing is written to canonical game data.</p></div>`}</section>
    </section>
    <footer class="commandbar"><div><label>Session <input id="session-name" value="${escape(state.sessionName)}" aria-label="Session name"></label><button id="save">Save session</button><button id="load">Load session</button></div><div><button id="validate" class="secondary">Validate</button><button id="export" class="accent">Export patch + report</button></div></footer>
  `;
  bind();
}

function renderAssetGroup(name, assets) { return `<section class="asset-group"><h3>${name}<span>${assets.length}</span></h3>${assets.map((asset) => `<button class="asset ${asset.assetId === state.selectedAssetId ? "selected" : ""}" data-asset="${asset.assetId}"><span class="minihex"></span><span>${escape(asset.assetId.split("-").slice(-2).join(" · "))}</span><small>p${asset.page}</small></button>`).join("")}</section>`; }

function typeRule(type) {
  return ({ normal: "normal · 1 pawn · one hex", double: "double · 2 pawns · pill of two adjacent hexes", special: "large / special · unlimited pawns · one or more connected hexes", pawn: "pawn home · unlimited pawns · one hex", effect: "effect · 1 pawn · one hex" })[type] ?? type;
}

function renderSpaces(block) {
  if (!block.spaces.length) return `<p class="empty-spaces">No spaces yet. Add each printed location, then drag its hex footprint over the source art.</p>`;
  return block.spaces.map((space, index) => {
    const footprint = footprintFor(space, index); const anchor = footprint.cells[0];
    return `<article class="space-card" data-space-row="${index}"><div class="space-card-head"><strong>Space ${index + 1}</strong><span>${escape(typeRule(space.type))}</span><button type="button" data-remove-space="${index}" class="icon-button" aria-label="Remove space">×</button></div><div class="space-fields"><label>id<input data-space-id value="${escape(space.id)}" placeholder="id"></label><label>rule type<select data-space-type>${["normal", "double", "special", "pawn", "effect"].map((type) => `<option value="${type}" ${space.type === type ? "selected" : ""}>${type === "special" ? "large / special" : type}</option>`).join("")}</select></label><label>q<input data-space-q type="number" min="-2" max="2" step="1" value="${anchor.q}"></label><label>r<input data-space-r type="number" min="-2" max="2" step="1" value="${anchor.r}"></label></div><div class="space-footprint-tools"><span class="shape-badge">${footprint.shape} · ${footprint.cells.length} hex${footprint.cells.length === 1 ? "" : "es"}</span>${space.type === "special" ? `<button type="button" class="compact secondary" data-grow-space="${index}">+ hex</button>${footprint.cells.length > 1 ? `<button type="button" class="compact secondary" data-shrink-space="${index}">− hex</button>` : ""}` : ""}</div></article>`;
  }).join("");
}

function hexPoints(cell) {
  const point = gridToPercent(cell);
  return [[point.x, point.y - GRID_HEX_Y], [point.x + GRID_HEX_X, point.y - GRID_HEX_Y / 2], [point.x + GRID_HEX_X, point.y + GRID_HEX_Y / 2], [point.x, point.y + GRID_HEX_Y], [point.x - GRID_HEX_X, point.y + GRID_HEX_Y / 2], [point.x - GRID_HEX_X, point.y - GRID_HEX_Y / 2]].map(([x, y]) => `${x},${y}`).join(" ");
}

function footprintCenter(cells) {
  return cells.reduce((sum, cell) => { const point = gridToPercent(cell); return { x: sum.x + point.x / cells.length, y: sum.y + point.y / cells.length }; }, { x: 0, y: 0 });
}

function renderLayoutOverlay(draft) {
  const block = draft.block;
  const edgePositions = [[75, 12.5], [96, 50], [75, 87.5], [25, 87.5], [4, 50], [25, 12.5]];
  const cornerPositions = [[50, 2], [96, 25], [96, 75], [50, 98], [4, 75], [4, 25]];
  const grid = `<svg class="grid-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${allGridCells().map((cell) => `<polygon points="${hexPoints(cell)}"></polygon>`).join("")}</svg>`;
  const entrances = edgePositions.map(([x, y], index) => `<button class="entrance ${block.edges[index] ? "active" : ""}" data-canvas-edge="${index}" style="left:${x}%;top:${y}%" title="Entrance E${index + 1}: edge from corner V${index + 1} to V${index === 5 ? 1 : index + 2}">E${index + 1}</button>`).join("");
  const bonuses = cornerPositions.map(([x, y], index) => `<button class="bonus ${block.bonusCorners[index] ? "active" : ""}" data-canvas-bonus="${index}" style="left:${x}%;top:${y}%" title="Bonus corner V${index + 1}">V${index + 1}</button>`).join("");
  const spaces = block.spaces.map((space, index) => {
    const footprint = footprintFor(space, index); const center = footprintCenter(footprint.cells);
    return `<div class="space-footprint type-${space.type}">${footprint.cells.map((cell, cellIndex) => { const point = gridToPercent(cell); return `<button class="space-hex" data-canvas-space="${index}" data-cell-index="${cellIndex}" style="left:${point.x}%;top:${point.y}%" title="${escape(space.id)} · ${escape(typeRule(space.type))}"></button>`; }).join("")}<span class="space-label" data-space-label="${index}" style="left:${center.x}%;top:${center.y}%">${escape(space.id || "?")}</span></div>`;
  }).join("");
  return `<div class="layout-overlay">${grid}${entrances}${bonuses}${spaces}</div>`;
}

function renderInspector(draft) {
  const block = draft.block;
  return `<div class="inspector-head"><div><span class="eyebrow">STRUCTURED DRAFT</span><h2>Block data</h2></div><span class="draft-state">${escape(draft.status)}</span></div>
  <form id="editor-form"><div class="form-grid"><label>Block id<input name="block-id" value="${escape(block.id)}"></label><label>Name<input name="block-name" value="${escape(block.name)}"></label><label>Expansion<select name="expansion"><option value="speedrunners" ${block.expansion === "speedrunners" ? "selected" : ""}>Speedrunners</option><option value="shadowraiders" ${block.expansion === "shadowraiders" ? "selected" : ""}>Shadowraiders</option></select></label><label>ICE<select name="ice"><option value="none" ${block.iceValue === "none" ? "selected" : ""}>none</option><option value="low" ${block.iceValue === "low" ? "selected" : ""}>low</option><option value="medium" ${block.iceValue === "medium" ? "selected" : ""}>medium</option><option value="high" ${block.iceValue === "high" ? "selected" : ""}>high</option><option value="black" ${block.iceValue === "black" ? "selected" : ""}>black</option></select></label></div>
  <fieldset><legend>Entrances / connections</legend><p class="hint rule-hint">The source is pointy-top: V1 is top, then clockwise. E1 spans V1→V2; toggle an E button on the image and name the spaces exposed there.</p><div class="edges">${block.edges.map((edge, index) => `<label class="edge"><input type="checkbox" data-edge="${index}" ${edge ? "checked" : ""}><span>E${index + 1}</span><input data-boundary="${index}" value="${escape(block.boundarySpaces[index].join(", "))}" placeholder="boundary space ids"></label>`).join("")}</div></fieldset>
  <fieldset><legend>Bonus corners</legend><p class="hint rule-hint">V1–V6 follow the same clockwise source order. Each marked corner is exactly one bonus fragment.</p><div class="corners">${block.bonusCorners.map((bonus, index) => `<label><input type="checkbox" data-bonus="${index}" ${bonus ? "checked" : ""}> V${index + 1}</label>`).join("")}</div><p class="derived">${block.bonusFragments} bonus fragment${block.bonusFragments === 1 ? "" : "s"}</p></fieldset>
  <fieldset><legend>Placed spaces</legend><p class="hint rule-hint">The faint source-grid is a pointy-hex layout. A double is always a pill of two adjacent hexes. A large/special space is unlimited and may cover one or more connected hexes. Drag a footprint to snap it to the grid.</p><button type="button" id="add-space" class="secondary compact">+ Add normal hex</button><div class="space-list">${renderSpaces(block)}</div></fieldset>
  <div class="form-grid"><label>Source locator<input name="locator" value="${escape(draft.provenance.locator)}"></label><label>Notes<input name="notes" value="${escape(draft.provenance.notes ?? "")}"></label></div>
  <label class="toggle"><input type="checkbox" name="provisional" ${block.provisional ? "checked" : ""}> Keep as provisional until reviewed against the source</label></form><section class="diagnostics"><h3>Validation</h3>${state.validation.length ? `<ul>${state.validation.map((error) => `<li>${escape(error)}</li>`).join("")}</ul>` : "<p>Not validated yet.</p>"}</section>`;
}

function translatedFootprint(space, type, anchor, index) {
  const source = footprintFor({ ...space, type }, index);
  const origin = source.cells[0];
  const moved = source.cells.map((cell) => ({ q: cell.q + anchor.q - origin.q, r: cell.r + anchor.r - origin.r }));
  return footprintFor({ ...space, type, footprint: { ...source, cells: moved } }, index);
}

function readDraft() {
  const draft = ensureDraft(); if (!draft) return null;
  const form = document.querySelector("#editor-form"); if (!form) return draft;
  const get = (name) => form.querySelector(`[name="${name}"]`);
  draft.block.id = get("block-id").value.trim(); draft.block.name = get("block-name").value.trim(); draft.block.expansion = get("expansion").value; draft.block.iceValue = get("ice").value;
  draft.block.edges = [...form.querySelectorAll("[data-edge]")].map((input) => input.checked);
  draft.block.boundarySpaces = [...form.querySelectorAll("[data-boundary]")].map((input) => input.value.split(",").map((value) => value.trim()).filter(Boolean));
  draft.provenance.locator = get("locator").value.trim(); draft.provenance.notes = get("notes").value.trim(); draft.block.provisional = get("provisional").checked;
  draft.block.bonusCorners = [...form.querySelectorAll("[data-bonus]")].map((input) => input.checked);
  draft.block.bonusFragments = draft.block.bonusCorners.filter(Boolean).length;
  const priorSpaces = draft.block.spaces;
  draft.block.spaces = [...form.querySelectorAll("[data-space-row]")].map((row, index) => {
    const prior = priorSpaces[index] ?? {}; const type = row.querySelector("[data-space-type]").value;
    const anchor = { q: Number(row.querySelector("[data-space-q]").value), r: Number(row.querySelector("[data-space-r]").value) };
    const footprint = translatedFootprint(prior, type, anchor, index);
    return { id: row.querySelector("[data-space-id]").value.trim(), type, footprint, location: locationForCell(footprint.cells[0]) };
  });
  draft.block.assetRefs = [draft.source.assetId]; return draft;
}

async function validate() { const draft = readDraft(); if (!draft) return; try { const data = await api("/api/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: draft }) }); state.validation = [...data.errors]; state.notice = state.validation.length ? `${state.validation.length} issue${state.validation.length === 1 ? "" : "s"} to resolve` : "Draft is valid for export"; } catch (error) { state.validation = [error.message]; state.notice = "Validation failed"; } render(); }
async function save() { const draft = readDraft(); if (draft) await validate(); const name = document.querySelector("#session-name")?.value.trim(); if (!/^[a-z0-9-]+$/.test(name)) { state.notice = "Session name uses lowercase letters, digits, and hyphens."; render(); return; } state.sessionName = name; const session = { sessionVersion: 1, projectId: "zaibatsu-block-editor", assetManifestPath: "spec/assets/manifest.json", documents: state.drafts, history: [] }; try { await api("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, session }) }); state.notice = "Session saved locally"; } catch (error) { state.notice = error.message; } render(); }
async function load() { const name = document.querySelector("#session-name")?.value.trim(); try { const session = await api(`/api/sessions/${encodeURIComponent(name)}`); state.drafts = (session.documents ?? []).map(normalizeDraft); state.selectedAssetId = state.drafts[0]?.source.assetId ?? state.selectedAssetId; state.sessionName = name; state.validation = []; state.notice = "Session loaded"; } catch (error) { state.notice = error.message; } render(); }
async function exportPatch() { const draft = readDraft(); if (!draft) return; await validate(); if (state.validation.length) return; try { const data = await api("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${state.sessionName}-${draft.block.id}`, document: draft }) }); state.notice = `Exported ${data.patch}`; } catch (error) { state.notice = error.message; } render(); }

function moveFootprintToGrid(index, target) {
  const draft = readDraft(); const space = draft?.block.spaces[index]; if (!space) return false;
  const source = footprintFor(space, index); const origin = source.cells[0];
  const cells = source.cells.map((cell) => ({ q: cell.q + target.q - origin.q, r: cell.r + target.r - origin.r }));
  if (!cells.every(validCell)) return false;
  space.footprint = { ...source, cells }; space.location = locationForCell(cells[0]); return true;
}

function gridFromPointer(event, tile) {
  const rect = tile.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width * 100; const y = (event.clientY - rect.top) / rect.height * 100;
  return allGridCells().reduce((closest, candidate) => { const point = gridToPercent(candidate); const candidateDistance = ((point.x - x) / GRID_X_STEP) ** 2 + ((point.y - y) / GRID_Y_STEP) ** 2; return candidateDistance < closest.distance ? { cell: candidate, distance: candidateDistance } : closest; }, { cell: fallbackCell(), distance: Number.POSITIVE_INFINITY }).cell;
}

function growSpace(index) {
  const draft = readDraft(); const space = draft?.block.spaces[index]; if (!space || space.type !== "special") return;
  const footprint = footprintFor(space, index); const occupied = new Set(footprint.cells.map(cellKey));
  const next = footprint.cells.flatMap((cell) => GRID_DIRECTIONS.map(([q, r]) => ({ q: cell.q + q, r: cell.r + r }))).find((cell) => validCell(cell) && !occupied.has(cellKey(cell)));
  if (!next) { state.notice = "Large space already fills the editable source grid"; render(); return; }
  space.footprint = { shape: "large", cells: [...footprint.cells, next] }; space.location = locationForCell(space.footprint.cells[0]); state.notice = "Expanded large space by one hex"; render();
}

function bind() {
  document.querySelectorAll("[data-asset]").forEach((button) => button.addEventListener("click", () => { readDraft(); state.selectedAssetId = button.dataset.asset; state.validation = []; state.notice = "Selected source block"; render(); }));
  document.querySelector("#new-draft")?.addEventListener("click", () => { const asset = selectedAsset(); state.drafts = state.drafts.filter((draft) => draft.source.assetId !== asset.assetId); state.drafts.push(blankDraft(asset)); state.validation = []; state.notice = "Fresh draft created"; render(); });
  document.querySelector("#validate")?.addEventListener("click", validate); document.querySelector("#save")?.addEventListener("click", save); document.querySelector("#load")?.addEventListener("click", load); document.querySelector("#export")?.addEventListener("click", exportPatch);
  document.querySelector("#asset-filter")?.addEventListener("input", (event) => { const query = event.target.value.toLowerCase(); document.querySelectorAll(".asset").forEach((item) => item.hidden = !item.textContent.toLowerCase().includes(query)); });
  document.querySelectorAll("[data-canvas-edge]").forEach((button) => button.addEventListener("click", () => { const draft = readDraft(); const index = Number(button.dataset.canvasEdge); draft.block.edges[index] = !draft.block.edges[index]; state.notice = `Entrance E${index + 1} ${draft.block.edges[index] ? "opened" : "closed"}`; render(); }));
  document.querySelectorAll("[data-canvas-bonus]").forEach((button) => button.addEventListener("click", () => { const draft = readDraft(); const index = Number(button.dataset.canvasBonus); draft.block.bonusCorners[index] = !draft.block.bonusCorners[index]; draft.block.bonusFragments = draft.block.bonusCorners.filter(Boolean).length; state.notice = `Bonus V${index + 1} ${draft.block.bonusCorners[index] ? "marked" : "cleared"}`; render(); }));
  document.querySelector("#add-space")?.addEventListener("click", () => { const draft = readDraft(); const number = draft.block.spaces.length + 1; const cell = fallbackCell(number - 1); draft.block.spaces.push({ id: `space-${number}`, type: "normal", footprint: { shape: "hex", cells: [cell] }, location: locationForCell(cell) }); state.notice = "Placed a normal single-hex space"; render(); });
  document.querySelectorAll("[data-remove-space]").forEach((button) => button.addEventListener("click", () => { const draft = readDraft(); draft.block.spaces.splice(Number(button.dataset.removeSpace), 1); state.notice = "Removed placed space"; render(); }));
  document.querySelectorAll("[data-grow-space]").forEach((button) => button.addEventListener("click", () => growSpace(Number(button.dataset.growSpace))));
  document.querySelectorAll("[data-shrink-space]").forEach((button) => button.addEventListener("click", () => { const draft = readDraft(); const space = draft.block.spaces[Number(button.dataset.shrinkSpace)]; const footprint = footprintFor(space, Number(button.dataset.shrinkSpace)); if (footprint.cells.length > 1) { space.footprint = { shape: "large", cells: footprint.cells.slice(0, -1) }; state.notice = "Reduced large space by one hex"; } render(); }));
  document.querySelectorAll("[data-canvas-space]").forEach((node) => node.addEventListener("pointerdown", (event) => { event.preventDefault(); const index = Number(node.dataset.canvasSpace); const tile = document.querySelector(".tile-canvas"); node.setPointerCapture(event.pointerId); const move = (pointer) => { if (moveFootprintToGrid(index, gridFromPointer(pointer, tile))) { const draft = selectedDraft(); const cells = footprintFor(draft.block.spaces[index], index).cells; document.querySelectorAll(`[data-canvas-space="${index}"]`).forEach((cellNode, cellIndex) => { const point = gridToPercent(cells[cellIndex]); cellNode.style.left = `${point.x}%`; cellNode.style.top = `${point.y}%`; }); const center = footprintCenter(cells); const label = document.querySelector(`[data-space-label="${index}"]`); if (label) { label.style.left = `${center.x}%`; label.style.top = `${center.y}%`; } } }; node.addEventListener("pointermove", move); node.addEventListener("pointerup", () => { state.notice = `Moved ${selectedDraft().block.spaces[index].id} on the source grid`; render(); }, { once: true }); }));
}

async function start() { try { const data = await api("/api/assets"); state.assets = data.assets; state.selectedAssetId = state.assets[0]?.assetId ?? null; state.notice = `${state.assets.length} individual source blocks ready`; } catch (error) { state.notice = error.message; } render(); }
start();