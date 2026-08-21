const app = document.querySelector("#app");
const state = { assets: [], drafts: [], selectedAssetId: null, sessionName: "action-card-drafts", notice: "Loading source-linked action-card assets...", validation: [], deckValidation: [], visions: {}, copyGroupCandidates: {} };

const escape = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const expansionFor = (asset) => asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners";
const displayExpansion = (value) => value === "shadowraiders" ? "Shadowraiders" : "Speedrunners";
const titleFor = (asset) => `${displayExpansion(expansionFor(asset))} / page ${asset.page} / ${asset.assetId.split("-").at(-1)}`;
const selectedAsset = () => state.assets.find((asset) => asset.assetId === state.selectedAssetId) ?? state.assets[0];
const selectedDraft = () => state.drafts.find((draft) => draft.actionCard.assetRefs.includes(state.selectedAssetId));
const api = async (path, options = {}) => { const response = await fetch(path, options); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? data.errors?.join(" ") ?? "Request failed"); return data; };
const unique = (values) => [...new Set(values)];

function blankDraft(asset) {
  const expansion = expansionFor(asset);
  return {
    id: `${asset.assetId}-draft`, resourceType: "action-card", title: titleFor(asset), status: "draft",
    source: { assetId: asset.assetId },
    actionCard: { id: `${expansion}-card-${asset.assetId.split("-").slice(-2).join("-")}`, name: "Untranscribed action card", expansion, copies: 1, assetRefs: [asset.assetId], provisional: true },
    transcription: { printedText: "", reviewerConfirmed: false, duplicateGroupConfirmed: false },
    provenance: { primaryArtifactId: asset.artifactId, page: asset.page, locator: `cut action card ${asset.assetId.split("-").at(-1)}`, notes: "" },
    annotations: [],
  };
}

function normalizeDraft(draft) {
  if (!draft?.actionCard) return draft;
  draft.resourceType = "action-card";
  draft.actionCard.assetRefs = unique((draft.actionCard.assetRefs ?? []).filter((assetId) => state.assets.some((asset) => asset.assetId === assetId)));
  if (!draft.actionCard.assetRefs.length && draft.source?.assetId) draft.actionCard.assetRefs = [draft.source.assetId];
  draft.actionCard.copies = draft.actionCard.assetRefs.length;
  draft.actionCard.provisional ??= true;
  draft.transcription ??= { printedText: "", reviewerConfirmed: false, duplicateGroupConfirmed: false };
  draft.provenance.notes ??= "";
  return draft;
}

function ensureDraft() {
  const asset = selectedAsset();
  if (!asset) return null;
  let draft = selectedDraft();
  if (!draft) { draft = blankDraft(asset); state.drafts.push(draft); }
  return normalizeDraft(draft);
}

async function applyVision(asset) {
  const draft = selectedDraft();
  if (!asset || !draft) return;
  if (draft.transcription.vision) { state.notice = "HexVision is already applied to this draft; review or reset the draft to replace it."; render(); return; }
  try {
    const data = await api(`/api/vision/${encodeURIComponent(asset.assetId)}`);
    if (!data.vision) { state.notice = `No HexVision evidence is available for ${asset.assetId}`; render(); return; }
    loadVisionReview(draft, data.vision, asset.assetId);
    state.notice = `Loaded review-only HexVision evidence for ${asset.assetId}; accept fields explicitly`;
    render();
  } catch { /* OCR/vision evidence is optional. */ }
}

function loadVisionReview(draft, vision, assetId) {
  draft.transcription.vision = { confidence: vision.confidence ?? 0, reviewRequired: true, reasons: vision.reasons ?? [], proposals: vision.proposals ?? {}, acceptedFields: [], rejectedFields: [], copyGroupCandidates: state.copyGroupCandidates[assetId] ?? [] };
}

async function applyVisionBulk() {
  try {
    readDraft();
    const catalog = Object.keys(state.visions).length ? { visions: state.visions, copyGroupCandidates: state.copyGroupCandidates } : await api("/api/action-card-visions");
    state.visions = catalog.visions ?? {}; state.copyGroupCandidates = catalog.copyGroupCandidates ?? {};
    let created = 0, skipped = 0, unavailable = 0;
    for (const asset of state.assets) {
      if (state.drafts.some((draft) => draft.actionCard.assetRefs.includes(asset.assetId))) { skipped++; continue; }
      const vision = state.visions[asset.assetId];
      if (!vision) { unavailable++; continue; }
      const draft = blankDraft(asset); loadVisionReview(draft, vision, asset.assetId); state.drafts.push(draft); created++;
    }
    state.notice = `HexVision bulk review drafts: ${created} created, ${skipped} existing drafts skipped, ${unavailable} unavailable`;
  } catch (error) { state.notice = error.message; }
  render();
}

function acceptVisionField(draft, field) {
  const vision = draft.transcription.vision; const proposal = vision?.proposals ?? {}; const attach = proposal.attach ?? {}; const card = draft.actionCard;
  if (field === "name" && (proposal.titleCandidate || proposal.nameCandidate)) card.name = proposal.titleCandidate || proposal.nameCandidate;
  if (field === "class" && proposal.classes?.length) card.class = proposal.classes;
  if (field === "activates" && proposal.activates?.length) card.activates = proposal.activates;
  if (field === "movements" && proposal.movements?.length) card.movements = proposal.movements;
  if (field === "cost" && Number.isInteger(proposal.costCandidate)) card.attach = { ...(card.attach ?? {}), cost: proposal.costCandidate };
  if (field === "attach" && Object.keys(attach).length) { card.attach = { ...(card.attach ?? {}), ...(attach.slot?.[0] ? { slot: attach.slot[0] } : {}), ...(attach.as?.[0] ? { as: attach.as[0] } : {}) }; card.type ??= attach.type; }
  if (field === "custom-text" && proposal.customTextCandidate) draft.annotations = unique([...(draft.annotations ?? []), `Accepted HexVision text evidence: ${proposal.customTextCandidate}`]);
  vision.acceptedFields = unique([...(vision.acceptedFields ?? []), field]); vision.rejectedFields = (vision.rejectedFields ?? []).filter((item) => item !== field);
  state.notice = `Accepted HexVision ${field} candidate; verify it against the source`;
}

function rejectVisionField(draft, field) {
  const vision = draft.transcription.vision; if (!vision) return;
  vision.rejectedFields = unique([...(vision.rejectedFields ?? []), field]); vision.acceptedFields = (vision.acceptedFields ?? []).filter((item) => item !== field);
  state.notice = `Kept HexVision ${field} as rejected review evidence`;
}

function assetGroups() {
  return ["speedrunners", "shadowraiders"].map((expansion) => {
    const assets = state.assets.filter((asset) => expansionFor(asset) === expansion);
    return `<section class="asset-group"><h3>${displayExpansion(expansion)}<span>${assets.length}</span></h3>${assets.map((asset) => `<button class="asset ${asset.assetId === state.selectedAssetId ? "selected" : ""}" data-asset="${asset.assetId}"><span class="minihex"></span><span>${escape(asset.assetId.split("-").slice(-2).join(" / "))}</span><small>p${asset.page}</small></button>`).join("")}</section>`;
  }).join("");
}

function sourceGroup(draft) {
  const card = draft.actionCard;
  const allowed = state.assets.filter((asset) => expansionFor(asset) === card.expansion && !card.assetRefs.includes(asset.assetId));
  const suggestions = (draft.transcription.vision?.copyGroupCandidates ?? []).filter((assetId) => !card.assetRefs.includes(assetId));
  return `<fieldset><legend>Physical copy group</legend><p class="hint rule-hint">Each selected source image is one physical copy. Group only identical printed cards; the deck count is calculated from this list.</p><div class="source-chips">${card.assetRefs.map((assetId) => `<span><code>${escape(assetId)}</code><button type="button" data-remove-copy="${escape(assetId)}" ${card.assetRefs.length === 1 ? "disabled" : ""}>remove</button></span>`).join("")}</div><div class="copy-add"><select id="copy-source"><option value="">Choose another matching physical card...</option>${allowed.map((asset) => `<option value="${asset.assetId}">${escape(asset.assetId)} (p${asset.page})</option>`).join("")}</select><button type="button" id="add-copy" class="secondary">Add copy</button></div>${suggestions.length ? `<p class="hint">Vision similarity suggestions (never automatic): ${suggestions.map((assetId) => `<button type="button" class="secondary" data-accept-copy-suggestion="${escape(assetId)}">add ${escape(assetId)}</button>`).join(" ")}</p>` : ""}<p class="derived">${card.copies} physical ${card.copies === 1 ? "copy" : "copies"} in this card record</p></fieldset>`;
}

function visionPreview(draft) {
  const vision = draft.transcription.vision; if (!vision) return "";
  const proposal = vision.proposals ?? {}; const candidates = proposal.candidates ?? [
    ...(proposal.titleCandidate || proposal.nameCandidate ? [{ field: "name", value: proposal.titleCandidate || proposal.nameCandidate, zone: "title", confidence: vision.confidence, reason: "Vision title proposal" }] : []),
    ...(proposal.activates?.length ? [{ field: "activates", value: proposal.activates, zone: "action-strip", confidence: vision.confidence, reason: "Vision action proposal" }] : []),
  ];
  const reviewed = (field) => (vision.acceptedFields ?? []).includes(field) ? "accepted" : (vision.rejectedFields ?? []).includes(field) ? "rejected" : "unresolved";
  return `<section class="diagnostics vision-review"><h3>Vision candidate review</h3><p class="hint">All candidates are source-zone evidence. Accepting copies only the named field into the draft; unrecognized evidence remains review-only.</p>${vision.reasons?.length ? `<ul>${vision.reasons.map((reason) => `<li>${escape(reason)}</li>`).join("")}</ul>` : ""}<div class="vision-candidates">${candidates.length ? candidates.map((candidate) => `<article><strong>${escape(candidate.field)}</strong> <small>${escape(candidate.zone ?? "source")} · ${Math.round((candidate.confidence ?? vision.confidence ?? 0) * 100)}% · ${escape(reviewed(candidate.field))}</small><code>${escape(typeof candidate.value === "string" ? candidate.value : JSON.stringify(candidate.value))}</code><p class="hint">${escape(candidate.reason ?? "HexVision candidate")}</p><button type="button" class="secondary" data-accept-vision="${escape(candidate.field)}">Accept candidate</button><button type="button" class="secondary" data-reject-vision="${escape(candidate.field)}">Reject</button></article>`).join("") : "<p>No typed candidates were available; retain manual source review.</p>"}</div></section>`;
}

function renderInspector(draft) {
  const card = draft.actionCard; const transcription = draft.transcription; const attach = card.attach ?? {};
  const activates = new Set(card.activates ?? []);
  const vision = transcription.vision ? `<p class="hint">Vision confidence: ${Math.round(transcription.vision.confidence * 100)}%. Review is required before this can leave draft status.</p>` : "";
  return `<div class="inspector-head"><div><span class="eyebrow">ACTION CARD / SOURCE REVIEW</span><h2>Card data</h2></div><span class="draft-state">${escape(draft.status)}</span></div>
  <form id="editor-form"><div class="form-grid"><label>Card id<input name="card-id" value="${escape(card.id)}"></label><label>Name<input name="card-name" value="${escape(card.name)}"></label><label>Expansion<select name="expansion"><option value="speedrunners" ${card.expansion === "speedrunners" ? "selected" : ""}>Speedrunners</option><option value="shadowraiders" ${card.expansion === "shadowraiders" ? "selected" : ""}>Shadowraiders</option></select></label><label>Status<select name="status"><option value="draft" ${draft.status === "draft" ? "selected" : ""}>draft</option><option value="review" ${draft.status === "review" ? "selected" : ""}>review</option><option value="verified" ${draft.status === "verified" ? "selected" : ""}>verified</option></select></label></div>
  ${sourceGroup(draft)}
  <fieldset><legend>Normalized gameplay data</legend><div class="form-grid"><label>Movement<input name="movement" type="number" min="1" value="${card.movement ?? ""}"></label><label>Rule summary<textarea name="summary" rows="3" placeholder="Concise gameplay paraphrase; do not paste the full card layout.">${escape(card.summary ?? "")}</textarea></label></div><label>Activates</label><div class="corners">${["search", "delete", "reboot", "icebreaker"].map((name) => `<label><input type="checkbox" data-activate="${name}" ${activates.has(name) ? "checked" : ""}> ${name}</label>`).join("")}</div><div class="form-grid"><label>Attach as<select name="attach-as"><option value="">none</option>${["pawn", "enemy", "block"].map((value) => `<option value="${value}" ${attach.as === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Attach slot<select name="attach-slot"><option value="">none</option>${["add-on", "gadget", "weapon", "armor", "module", "mission"].map((value) => `<option value="${value}" ${attach.slot === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Classes<input name="attach-class" value="${escape((attach.class ?? []).join(", "))}" placeholder="comma separated"></label><label>Cost<input name="attach-cost" type="number" min="0" value="${attach.cost ?? ""}"></label></div></fieldset>
  <fieldset><legend>Printed source review</legend><textarea name="printed-text" rows="9" placeholder="Transcribe the printed card text for review. This remains in the editor session, not the runtime record.">${escape(transcription.printedText)}</textarea>${vision}<label class="toggle"><input type="checkbox" name="confirm-text" ${transcription.reviewerConfirmed ? "checked" : ""}> I confirmed the transcription against this source card</label><label class="toggle"><input type="checkbox" name="confirm-duplicates" ${transcription.duplicateGroupConfirmed ? "checked" : ""}> I confirmed this physical-copy group</label></fieldset>
  <div class="form-grid"><label>Source locator<input name="locator" value="${escape(draft.provenance.locator)}"></label><label>Notes<input name="notes" value="${escape(draft.provenance.notes ?? "")}"></label></div><label class="toggle"><input type="checkbox" name="provisional" ${card.provisional ? "checked" : ""}> Keep as provisional until review is complete</label></form>${visionPreview(draft)}<section class="diagnostics"><h3>Validation</h3>${state.validation.length ? `<ul>${state.validation.map((error) => `<li>${escape(error)}</li>`).join("")}</ul>` : "<p>Source text is review evidence. The gameplay record exports only normalized fields and the concise summary.</p>"}${state.deckValidation.length ? `<h3>Deck readiness</h3><ul>${state.deckValidation.map((error) => `<li>${escape(error)}</li>`).join("")}</ul>` : ""}</section>`;
}

function render() {
  const asset = selectedAsset(); const draft = selectedDraft();
  app.innerHTML = `<header class="topbar"><div><span class="eyebrow">LOCAL CONTENT AUTHORING</span><h1>Zaibatsu <em>Action Card Editor</em></h1></div><div class="status"><span class="pulse"></span>${escape(state.notice)}</div><a class="editor-link" href="/">Block editor</a></header><section class="workspace card-workspace"><aside class="assets panel"><div class="panel-title"><h2>Action card sources</h2><span>${state.assets.length}</span></div><input id="asset-filter" aria-label="Filter action card assets" placeholder="Filter source cards"><div id="asset-list" class="asset-list">${assetGroups()}</div></aside><section class="canvas panel"><div class="canvas-title"><div><span class="eyebrow">${asset ? escape(asset.artifactId) : "no source"}</span><h2>${asset ? escape(titleFor(asset)) : "Select a card"}</h2></div><div class="canvas-actions"><button id="new-draft" class="secondary" ${asset ? "" : "disabled"}>${draft ? "Reset card" : "Create card"}</button><button id="apply-vision" class="secondary" ${draft && !draft.transcription.vision ? "" : "disabled"}>${draft?.transcription.vision ? "HexVision loaded" : "Apply HexVision"}</button></div></div>${asset ? `<div class="card-stage"><img src="/api/artifact/${encodeURIComponent(asset.assetId)}" alt="${escape(titleFor(asset))}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'missing-art',textContent:'Run the artifact refresh to load this local source image.'}))"></div><div class="asset-meta">assetId <code>${escape(asset.assetId)}</code> / source <code>${escape(asset.artifactId)}</code> / page ${asset.page}</div>` : ""}</section><section class="inspector panel">${draft ? renderInspector(draft) : "<div class=\"empty\"><h2>Start a card</h2><p>Select an action-card source and create a source-linked draft. Block placement tools are intentionally kept out of this editor.</p></div>"}</section></section><footer class="commandbar"><div><label>Session <input id="session-name" value="${escape(state.sessionName)}" aria-label="Session name"></label><button id="save">Save session</button><button id="load">Load session</button></div><div><button id="apply-vision-all" class="secondary">Apply HexVision to fresh</button><button id="validate" class="secondary">Validate</button><button id="validate-deck" class="secondary">Check deck</button><button id="export" class="accent">Export card patch + report</button><button id="export-deck" class="accent">Export deck review</button></div></footer>`;
  bind();
  syncStructuredCardFields(draft);
  syncAttachmentAbilityControls(draft);
}

function syncStructuredCardFields(draft) {
  const form = document.querySelector("#editor-form"); if (!form || form.querySelector("[name=card-structure-json]")) return;
  const card = draft.actionCard; const structured = { movements: card.movements ?? [], effects: card.effects ?? [], attach: card.attach ?? {} };
  form.insertAdjacentHTML("beforeend", `<fieldset><legend>Current game structure</legend><p class="hint">Use typed basics above, then author advanced movement options, direct effects, and attachment behavior here. This is validated before export. Fields are preserved for review even where the engine has not resolved the mechanic yet.</p><div class="form-grid"><label>Card type<select name="card-type"><option value="">none</option>${["add-on", "gadget", "weapon", "armor", "module", "mission", "action", "movement", "event"].map((value) => `<option value="${value}" ${card.type === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Card classes<input name="card-class" value="${escape((card.class ?? []).join(", "))}" placeholder="comma separated"></label></div><label>Advanced structure (JSON)<textarea name="card-structure-json" rows="12" spellcheck="false" aria-label="Advanced card structure JSON">${escape(JSON.stringify(structured, null, 2))}</textarea></label></fieldset>`);
}

function syncAttachmentAbilityControls(draft) {
  const form = document.querySelector("#editor-form"); if (!form || form.querySelector("[data-attach-remove]")) return;
  const attach = draft.actionCard.attach ?? {}; const abilities = ["move", "search", "delete", "icebreaker", "reboot"];
  const choices = (attribute, selected) => abilities.map((ability) => `<label><input type="checkbox" ${attribute}="${ability}" ${selected?.includes(ability) ? "checked" : ""}> ${ability}</label>`).join("");
  form.insertAdjacentHTML("beforeend", `<fieldset><legend>Attachment ability changes</legend><p class="hint">Grant abilities to the attached target, or disable its printed ability. If both are selected, removal wins. Resolver coverage: Move is live; Reboot remains innate-only; all other stored changes stay visibly review-only until their resolver coverage is confirmed.</p><div class="form-grid"><div><label>Grants</label><div class="corners">${choices("data-attach-grant", attach.grants)}</div></div><div><label>Disables / removes</label><div class="corners">${choices("data-attach-remove", attach.removes)}</div></div></div></fieldset>`);
}

function readDraft() {
  const draft = ensureDraft(); if (!draft) return null;
  const form = document.querySelector("#editor-form"); if (!form) return draft;
  const get = (name) => form.querySelector(`[name="${name}"]`);
  const card = draft.actionCard;
  card.id = get("card-id").value.trim(); card.name = get("card-name").value.trim(); card.expansion = get("expansion").value;
  card.summary = get("summary").value.trim() || undefined; const movement = get("movement").value.trim(); card.movement = movement ? Number(movement) : undefined;
  card.activates = [...form.querySelectorAll("[data-activate]")].filter((input) => input.checked).map((input) => input.dataset.activate);
  const attachAs = get("attach-as").value; const attachSlot = get("attach-slot").value; const attachClasses = get("attach-class").value.split(",").map((value) => value.trim()).filter(Boolean); const attachCost = get("attach-cost").value.trim();
  const grants = [...form.querySelectorAll("[data-attach-grant]")].filter((input) => input.checked).map((input) => input.dataset.attachGrant); const removes = [...form.querySelectorAll("[data-attach-remove]")].filter((input) => input.checked).map((input) => input.dataset.attachRemove);
  card.attach = attachAs || attachSlot || attachClasses.length || attachCost || grants.length || removes.length ? { ...(attachAs ? { as: attachAs } : {}), ...(attachSlot ? { slot: attachSlot } : {}), ...(attachClasses.length ? { class: attachClasses } : {}), ...(attachCost ? { cost: Number(attachCost) } : {}), ...(grants.length ? { grants } : {}), ...(removes.length ? { removes } : {}) } : undefined;
  card.type = get("card-type")?.value || undefined; card.class = get("card-class")?.value.split(",").map((value) => value.trim()).filter(Boolean) || undefined;
  const structure = get("card-structure-json")?.value.trim();
  if (structure) { try { const parsed = JSON.parse(structure); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(); card.movements = parsed.movements ?? undefined; card.effects = parsed.effects ?? undefined; card.attach = { ...(parsed.attach ?? {}), ...(card.attach ?? {}) }; if (!Object.keys(card.attach).length) card.attach = undefined; } catch { throw new Error("Advanced card structure must be valid JSON with movements, effects, and attach fields."); } }
  if (card.attach) { if (grants.length) card.attach.grants = grants; else delete card.attach.grants; if (removes.length) card.attach.removes = removes; else delete card.attach.removes; }
  card.copies = card.assetRefs.length; card.provisional = get("provisional").checked; draft.status = get("status").value;
  draft.transcription.printedText = get("printed-text").value.trim(); draft.transcription.reviewerConfirmed = get("confirm-text").checked; draft.transcription.duplicateGroupConfirmed = get("confirm-duplicates").checked;
  draft.provenance.locator = get("locator").value.trim(); draft.provenance.notes = get("notes").value.trim(); return normalizeDraft(draft);
}

async function validate() { const draft = readDraft(); if (!draft) return; try { const data = await api("/api/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: draft }) }); state.validation = [...data.errors]; state.notice = state.validation.length ? `${state.validation.length} issue${state.validation.length === 1 ? "" : "s"} to resolve` : "Card is valid for export"; } catch (error) { state.validation = [error.message]; state.notice = "Validation failed"; } render(); }
async function validateDeck() { try { readDraft(); const data = await api("/api/action-card-deck/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents: state.drafts }) }); state.deckValidation = [...data.errors]; state.notice = state.deckValidation.length ? `${state.deckValidation.length} deck issue${state.deckValidation.length === 1 ? "" : "s"} to resolve` : "Current action-card deck drafts are ready for review export"; } catch (error) { state.deckValidation = [error.message]; state.notice = "Deck validation failed"; } render(); }
async function save() { const draft = readDraft(); if (draft) await validate(); const name = document.querySelector("#session-name")?.value.trim(); if (!/^[a-z0-9-]+$/.test(name)) { state.notice = "Session name uses lowercase letters, digits, and hyphens."; render(); return; } state.sessionName = name; const session = { sessionVersion: 4, projectId: "zaibatsu-action-card-editor", assetManifestPath: "spec/assets/manifest.json", documents: state.drafts, history: [] }; try { await api("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, session }) }); state.notice = "Card session saved locally"; } catch (error) { state.notice = error.message; } render(); }
async function load() { const name = document.querySelector("#session-name")?.value.trim(); try { const session = await api(`/api/sessions/${encodeURIComponent(name)}`); state.drafts = (session.documents ?? []).filter((document) => document.resourceType === "action-card").map(normalizeDraft); state.selectedAssetId = state.drafts[0]?.source.assetId ?? state.selectedAssetId; state.sessionName = name; state.validation = []; state.notice = "Card session loaded"; } catch (error) { state.notice = error.message; } render(); }
async function exportPatch() { const draft = readDraft(); if (!draft) return; await validate(); if (state.validation.length) return; try { const data = await api("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${state.sessionName}-${draft.actionCard.id}`, document: draft }) }); state.notice = `Exported ${data.patch}`; } catch (error) { state.notice = error.message; } render(); }
async function exportDeck() { try { readDraft(); const data = await api("/api/action-card-deck/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: state.sessionName, documents: state.drafts }) }); state.notice = `Exported ${data.outputs.length} expansion deck review patch${data.outputs.length === 1 ? "" : "es"}`; state.deckValidation = []; } catch (error) { state.notice = error.message; } render(); }

function bind() {
  document.querySelectorAll("[data-asset]").forEach((button) => button.addEventListener("click", () => { readDraft(); state.selectedAssetId = button.dataset.asset; state.validation = []; state.notice = "Selected action-card source"; render(); }));
  document.querySelector("#new-draft")?.addEventListener("click", () => { const asset = selectedAsset(); state.drafts = state.drafts.filter((draft) => !draft.actionCard.assetRefs.includes(asset.assetId)); state.drafts.push(blankDraft(asset)); state.validation = []; state.notice = "Fresh action-card draft created"; render(); });
  document.querySelector("#apply-vision")?.addEventListener("click", () => { readDraft(); void applyVision(selectedAsset()); });
  document.querySelector("#apply-vision-all")?.addEventListener("click", () => void applyVisionBulk()); document.querySelector("#validate")?.addEventListener("click", validate); document.querySelector("#validate-deck")?.addEventListener("click", validateDeck); document.querySelector("#save")?.addEventListener("click", save); document.querySelector("#load")?.addEventListener("click", load); document.querySelector("#export")?.addEventListener("click", exportPatch); document.querySelector("#export-deck")?.addEventListener("click", exportDeck);
  document.querySelector("#asset-filter")?.addEventListener("input", (event) => { const query = event.target.value.toLowerCase(); document.querySelectorAll(".asset").forEach((item) => item.hidden = !item.textContent.toLowerCase().includes(query)); });
  document.querySelector("#add-copy")?.addEventListener("click", () => { const draft = readDraft(); const source = document.querySelector("#copy-source").value; if (!source || !draft) return; draft.actionCard.assetRefs = unique([...draft.actionCard.assetRefs, source]); draft.actionCard.copies = draft.actionCard.assetRefs.length; state.notice = "Added a physical copy to this card group"; render(); });
  document.querySelectorAll("[data-remove-copy]").forEach((button) => button.addEventListener("click", () => { const draft = readDraft(); if (!draft || draft.actionCard.assetRefs.length === 1) return; draft.actionCard.assetRefs = draft.actionCard.assetRefs.filter((assetId) => assetId !== button.dataset.removeCopy); draft.actionCard.copies = draft.actionCard.assetRefs.length; if (!draft.actionCard.assetRefs.includes(state.selectedAssetId)) state.selectedAssetId = draft.actionCard.assetRefs[0]; state.notice = "Removed a physical copy from this card group"; render(); }));
  document.querySelectorAll("[data-accept-vision]").forEach((button) => button.addEventListener("click", () => { const draft = readDraft(); if (!draft) return; acceptVisionField(draft, button.dataset.acceptVision); render(); }));
  document.querySelectorAll("[data-reject-vision]").forEach((button) => button.addEventListener("click", () => { const draft = readDraft(); if (!draft) return; rejectVisionField(draft, button.dataset.rejectVision); render(); }));
  document.querySelectorAll("[data-accept-copy-suggestion]").forEach((button) => button.addEventListener("click", () => { const draft = readDraft(); const source = button.dataset.acceptCopySuggestion; if (!draft || !source) return; const sibling = state.drafts.find((item) => item !== draft && item.actionCard.assetRefs.includes(source)); if (sibling && (sibling.transcription.printedText || sibling.transcription.vision?.acceptedFields?.length)) { state.notice = `Cannot merge ${source}: it has reviewed draft data. Remove or merge it manually.`; render(); return; } state.drafts = state.drafts.filter((item) => item === draft || !item.actionCard.assetRefs.includes(source)); draft.actionCard.assetRefs = unique([...draft.actionCard.assetRefs, source]); draft.actionCard.copies = draft.actionCard.assetRefs.length; draft.transcription.duplicateGroupConfirmed = false; state.notice = `Added suggested copy ${source}; confirm the physical-copy group after source review`; render(); }));
}

async function start() { try { const [data, catalog] = await Promise.all([api("/api/action-card-assets"), api("/api/action-card-visions")]); state.assets = data.assets; state.visions = catalog.visions ?? {}; state.copyGroupCandidates = catalog.copyGroupCandidates ?? {}; state.selectedAssetId = state.assets[0]?.assetId ?? null; state.notice = `${state.assets.length} individual action-card sources ready`; } catch (error) { state.notice = error.message; } render(); }
start();
