const app = document.querySelector("#app");

const MOVEMENT_TYPES = ["fixed", "d6", "2d6", "hex"];
const CARD_TYPES = ["add-on", "gadget", "weapon", "armor", "module", "mission", "action", "movement", "event"];
const ACTIVATE_ABILITIES = ["search", "delete", "reboot", "icebreaker"];
const GRANTABLE_ABILITIES = ["move", "search", "delete", "icebreaker", "reboot"];
const ATTACH_AS = ["pawn", "enemy", "block"];
const CARD_SLOTS = ["add-on", "gadget", "weapon", "armor", "module", "mission"];
const CARD_EFFECT_KINDS = ["gain-control-card", "place-pawn", "area-attack", "all-players", "modify-ice", "draw-cards", "gain-bonus", "sacrifice-pawn", "custom"];
const CARD_EFFECT_TRIGGERS = ["on-play", "begin-turn", "end-turn", "on-control", "on-icebreak", "continuous"];
const ATTACH_EFFECT_TRIGGERS = ["on-attach", "begin-turn", "end-turn", "on-control", "on-icebreak", "continuous"];
const BLOCK_SPACE_SHAPES = ["circle", "hex"];

const state = {
  assets: [],
  drafts: [],
  selectedAssetId: null,
  sessionName: "action-card-drafts",
  notice: "Loading source-linked action-card assets...",
  validation: [],
  deckValidation: [],
  visions: {},
  copyGroupCandidates: {},
  coverage: null,
};

const escape = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const expansionFor = (asset) => asset.assetId.startsWith("sh-") ? "shadowraiders" : "speedrunners";
const displayExpansion = (value) => value === "shadowraiders" ? "Shadowraiders" : "Speedrunners";
const titleFor = (asset) => `${displayExpansion(expansionFor(asset))} / page ${asset.page} / ${asset.assetId.split("-").at(-1)}`;
const selectedAsset = () => state.assets.find((asset) => asset.assetId === state.selectedAssetId) ?? state.assets[0];
const selectedDraft = () => state.drafts.find((draft) => draft.actionCard.assetRefs.includes(state.selectedAssetId));
const unique = (values) => [...new Set(values)];
const boolAttr = (value) => value ? "checked" : "";
const maybe = (value) => value === undefined || value === null ? "" : String(value);

const api = async (path, options = {}) => {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? data.errors?.join(" ") ?? "Request failed");
  return data;
};
const coverageSurface = (id) => state.coverage?.surfaces?.find((surface) => surface.id === id);
const statusClass = (status) => status === "implemented" ? "ok" : status === "partial" ? "warn" : "todo";
const statusLabel = (status) => status === "implemented" ? "implemented" : status === "partial" ? "partial" : "planned";

function coverageMarkup(id) {
  const surface = coverageSurface(id);
  if (!surface) return "";
  return `<section class="diagnostics coverage-panel"><h3>${escape(surface.title)} <span class="coverage-status ${statusClass(surface.status)}">${statusLabel(surface.status)}</span></h3><p>${escape(surface.summary)}</p><ul class="coverage-list">${surface.items.map((item) => `<li><strong>${escape(item.label)}</strong><span class="coverage-status ${statusClass(item.status)}">${statusLabel(item.status)}</span><small>${escape(item.detail)}</small></li>`).join("")}</ul></section>`;
}

function blankDraft(asset) {
  const expansion = expansionFor(asset);
  return {
    id: `${asset.assetId}-draft`,
    resourceType: "action-card",
    title: titleFor(asset),
    status: "draft",
    source: { assetId: asset.assetId },
    actionCard: {
      id: `${expansion}-card-${asset.assetId.split("-").slice(-2).join("-")}`,
      name: "Untranscribed action card",
      expansion,
      copies: 1,
      assetRefs: [asset.assetId],
      provisional: true,
    },
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
  draft.transcription.vision ??= undefined;
  draft.provenance.notes ??= "";
  return draft;
}

function ensureDraft() {
  const asset = selectedAsset();
  if (!asset) return null;
  let draft = selectedDraft();
  if (!draft) {
    draft = blankDraft(asset);
    state.drafts.push(draft);
  }
  return normalizeDraft(draft);
}

async function applyVision(asset) {
  const draft = selectedDraft();
  if (!asset || !draft) return;
  if (draft.transcription.vision) {
    state.notice = "HexVision is already applied to this draft; review or reset the draft to replace it.";
    render();
    return;
  }
  try {
    const data = await api(`/api/vision/${encodeURIComponent(asset.assetId)}`);
    if (!data.vision) {
      state.notice = `No HexVision evidence is available for ${asset.assetId}`;
      render();
      return;
    }
    loadVisionReview(draft, data.vision, asset.assetId);
    state.notice = `Loaded review-only HexVision evidence for ${asset.assetId}; accept fields explicitly`;
    render();
  } catch {
    state.notice = `HexVision could not be loaded for ${asset.assetId}`;
    render();
  }
}

function loadVisionReview(draft, vision, assetId) {
  draft.transcription.vision = {
    confidence: vision.confidence ?? 0,
    reviewRequired: true,
    reasons: vision.reasons ?? [],
    proposals: vision.proposals ?? {},
    acceptedFields: [],
    rejectedFields: [],
    copyGroupCandidates: state.copyGroupCandidates[assetId] ?? [],
  };
}

async function applyVisionBulk() {
  try {
    readDraft();
    const catalog = Object.keys(state.visions).length ? { visions: state.visions, copyGroupCandidates: state.copyGroupCandidates } : await api("/api/action-card-visions");
    state.visions = catalog.visions ?? {};
    state.copyGroupCandidates = catalog.copyGroupCandidates ?? {};
    let created = 0, skipped = 0, unavailable = 0;
    for (const asset of state.assets) {
      if (state.drafts.some((draft) => draft.actionCard.assetRefs.includes(asset.assetId))) {
        skipped++;
        continue;
      }
      const vision = state.visions[asset.assetId];
      if (!vision) {
        unavailable++;
        continue;
      }
      const draft = blankDraft(asset);
      loadVisionReview(draft, vision, asset.assetId);
      state.drafts.push(draft);
      created++;
    }
    state.notice = `HexVision bulk review drafts: ${created} created, ${skipped} existing drafts skipped, ${unavailable} unavailable`;
  } catch (error) {
    state.notice = error.message;
  }
  render();
}

function acceptVisionField(draft, field) {
  const vision = draft.transcription.vision;
  const proposal = vision?.proposals ?? {};
  const attach = proposal.attach ?? {};
  const card = draft.actionCard;
  if (field === "name" && (proposal.titleCandidate || proposal.nameCandidate)) card.name = proposal.titleCandidate || proposal.nameCandidate;
  if (field === "class" && proposal.classes?.length) card.class = proposal.classes;
  if (field === "activates" && proposal.activates?.length) card.activates = proposal.activates;
  if (field === "movements" && proposal.movements?.length) card.movements = proposal.movements;
  if (field === "cost" && Number.isInteger(proposal.costCandidate)) card.attach = { ...(card.attach ?? {}), cost: proposal.costCandidate };
  if (field === "attach" && Object.keys(attach).length) {
    card.attach = {
      ...(card.attach ?? {}),
      ...(attach.slot?.[0] ? { slot: attach.slot[0] } : {}),
      ...(attach.as?.[0] ? { as: attach.as[0] } : {}),
      ...(attach.class?.length ? { class: attach.class } : {}),
    };
    card.type ??= attach.type;
  }
  if (field === "custom-text" && proposal.customTextCandidate) draft.annotations = unique([...(draft.annotations ?? []), `Accepted HexVision text evidence: ${proposal.customTextCandidate}`]);
  vision.acceptedFields = unique([...(vision.acceptedFields ?? []), field]);
  vision.rejectedFields = (vision.rejectedFields ?? []).filter((item) => item !== field);
  state.notice = `Accepted HexVision ${field} candidate; verify it against the source`;
}

function rejectVisionField(draft, field) {
  const vision = draft.transcription.vision;
  if (!vision) return;
  vision.rejectedFields = unique([...(vision.rejectedFields ?? []), field]);
  vision.acceptedFields = (vision.acceptedFields ?? []).filter((item) => item !== field);
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

function reviewedState(vision, field) {
  if ((vision.acceptedFields ?? []).includes(field)) return "accepted";
  if ((vision.rejectedFields ?? []).includes(field)) return "rejected";
  return "unresolved";
}

function visionPreview(draft) {
  const vision = draft.transcription.vision;
  if (!vision) return "";
  const proposal = vision.proposals ?? {};
  const candidates = proposal.candidates ?? [
    ...(proposal.titleCandidate || proposal.nameCandidate ? [{ field: "name", value: proposal.titleCandidate || proposal.nameCandidate, zone: "title", confidence: vision.confidence, reason: "Vision title proposal" }] : []),
    ...(proposal.activates?.length ? [{ field: "activates", value: proposal.activates, zone: "action-strip", confidence: vision.confidence, reason: "Vision action proposal" }] : []),
  ];
  return `<section class="diagnostics vision-review"><h3>Vision candidate review</h3><p class="hint">All candidates are source-zone evidence. Accepting copies only the named field into the draft; unrecognized evidence remains review-only.</p>${vision.reasons?.length ? `<ul>${vision.reasons.map((reason) => `<li>${escape(reason)}</li>`).join("")}</ul>` : ""}<div class="vision-candidates">${candidates.length ? candidates.map((candidate) => `<article><strong>${escape(candidate.field)}</strong> <small>${escape(candidate.zone ?? "source")} · ${Math.round((candidate.confidence ?? vision.confidence ?? 0) * 100)}% · ${escape(reviewedState(vision, candidate.field))}</small><code>${escape(typeof candidate.value === "string" ? candidate.value : JSON.stringify(candidate.value))}</code><p class="hint">${escape(candidate.reason ?? "HexVision candidate")}</p><button type="button" class="secondary" data-accept-vision="${escape(candidate.field)}">Accept candidate</button><button type="button" class="secondary" data-reject-vision="${escape(candidate.field)}">Reject</button></article>`).join("") : "<p>No typed candidates were available; retain manual source review.</p>"}</div></section>`;
}

function checkboxGroup(attribute, values, selected, labeler = (value) => value) {
  return values.map((value) => `<label><input type="checkbox" ${attribute}="${value}" ${selected?.includes(value) ? "checked" : ""}> ${escape(labeler(value))}</label>`).join("");
}

function movementRows(rows = [], attribute) {
  const values = rows.length ? rows : [{}];
  return values.map((row, index) => `<div class="structured-row"><div class="structured-row-head"><strong>${attribute === "movement" ? "Legacy action strip option" : attribute === "grant-movement" ? "Granted movement option" : "Movement option"} ${index + 1}</strong>${values.length > 1 ? `<button type="button" class="secondary" data-remove-row="${attribute}:${index}">remove</button>` : ""}</div><div class="form-grid"><label>Type<select data-row-type="${attribute}:${index}"><option value="">none</option>${MOVEMENT_TYPES.map((type) => `<option value="${type}" ${row.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label><label>Amount<input data-row-amount="${attribute}:${index}" type="number" min="1" value="${maybe(row.amount)}"></label></div><label class="toggle"><input data-row-stealth="${attribute}:${index}" type="checkbox" ${boolAttr(row.stealth)}> Stealth</label></div>`).join("");
}

function effectRows(rows = []) {
  const values = rows.length ? rows : [{}];
  return values.map((row, index) => `<div class="structured-row"><div class="structured-row-head"><strong>Direct play effect ${index + 1}</strong>${values.length > 1 ? `<button type="button" class="secondary" data-remove-row="effect:${index}">remove</button>` : ""}</div><div class="form-grid"><label>Kind<select data-effect-kind="${index}"><option value="">none</option>${CARD_EFFECT_KINDS.map((kind) => `<option value="${kind}" ${row.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label><label>Trigger<select data-effect-trigger="${index}"><option value="">none</option>${CARD_EFFECT_TRIGGERS.map((trigger) => `<option value="${trigger}" ${row.trigger === trigger ? "selected" : ""}>${trigger}</option>`).join("")}</select></label><label>Amount<input data-effect-amount="${index}" type="number" value="${maybe(row.amount)}"></label><label>Target<input data-effect-target="${index}" value="${escape(row.target ?? "")}"></label></div><label>Effect text<input data-effect-text="${index}" value="${escape(row.text ?? "")}"></label></div>`).join("");
}

function abilityUseRows(rows = []) {
  const values = rows.length ? rows : [{}];
  return values.map((row, index) => `<div class="structured-row"><div class="structured-row-head"><strong>Granted ability use ${index + 1}</strong>${values.length > 1 ? `<button type="button" class="secondary" data-remove-row="ability-use:${index}">remove</button>` : ""}</div><div class="form-grid"><label>Ability<select data-use-ability="${index}"><option value="">none</option>${GRANTABLE_ABILITIES.map((ability) => `<option value="${ability}" ${row.ability === ability ? "selected" : ""}>${ability}</option>`).join("")}</select></label><label>Per turn<input data-use-per-turn="${index}" type="number" min="1" value="${maybe(row.perTurn)}"></label><label>Dice<select data-use-dice="${index}"><option value="">none</option><option value="d6" ${row.dice === "d6" ? "selected" : ""}>d6</option></select></label><label>Activation<select data-use-activation="${index}"><option value="">none</option><option value="card" ${row.activation === "card" ? "selected" : ""}>card</option><option value="once-per-turn" ${row.activation === "once-per-turn" ? "selected" : ""}>once-per-turn</option></select></label></div></div>`).join("");
}

function readCommaList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseMovementRows(attribute) {
  const rows = [...document.querySelectorAll(`[data-row-type^="${attribute}:"]`)].map((input) => {
    const [, index] = input.dataset.rowType.split(":");
    const type = input.value;
    const amount = document.querySelector(`[data-row-amount="${attribute}:${index}"]`)?.value.trim();
    const stealth = document.querySelector(`[data-row-stealth="${attribute}:${index}"]`)?.checked;
    if (!type) return null;
    return {
      type,
      ...(amount ? { amount: Number(amount) } : {}),
      ...(stealth ? { stealth: true } : {}),
    };
  }).filter(Boolean);
  return rows.length ? rows : undefined;
}

function parseEffectRows() {
  const rows = [...document.querySelectorAll("[data-effect-kind]")].map((input) => {
    const index = input.dataset.effectKind;
    const kind = input.value;
    const amount = document.querySelector(`[data-effect-amount="${index}"]`)?.value.trim();
    const target = document.querySelector(`[data-effect-target="${index}"]`)?.value.trim();
    const trigger = document.querySelector(`[data-effect-trigger="${index}"]`)?.value;
    const text = document.querySelector(`[data-effect-text="${index}"]`)?.value.trim();
    if (!kind) return null;
    return {
      kind,
      ...(amount ? { amount: Number(amount) } : {}),
      ...(target ? { target } : {}),
      ...(trigger ? { trigger } : {}),
      ...(text ? { text } : {}),
    };
  }).filter(Boolean);
  return rows.length ? rows : undefined;
}

function parseAbilityUseRows() {
  const rows = [...document.querySelectorAll("[data-use-ability]")].map((input) => {
    const index = input.dataset.useAbility;
    const ability = input.value;
    const perTurn = document.querySelector(`[data-use-per-turn="${index}"]`)?.value.trim();
    const dice = document.querySelector(`[data-use-dice="${index}"]`)?.value;
    const activation = document.querySelector(`[data-use-activation="${index}"]`)?.value;
    if (!ability) return null;
    return {
      ability,
      ...(perTurn ? { perTurn: Number(perTurn) } : {}),
      ...(dice ? { dice } : {}),
      ...(activation ? { activation } : {}),
    };
  }).filter(Boolean);
  return rows.length ? rows : undefined;
}

function renderInspector(draft) {
  const card = draft.actionCard;
  const transcription = draft.transcription;
  const attach = card.attach ?? {};
  const vision = transcription.vision ? `<p class="hint">Vision confidence: ${Math.round(transcription.vision.confidence * 100)}%. Review is required before this can leave draft status.</p>` : "";
  const attachActive = Boolean(attach.as || attach.slot || attach.class?.length || attach.grants?.length || attach.removes?.length || attach.grantsMovement?.length || attach.grantsStealth || attach.grantsSlot?.length || attach.abilityUses?.length || attach.iceModifier?.faces?.length || attach.iceModifier?.deltaDice !== undefined || attach.iceModifier?.black || attach.drawModifier !== undefined || attach.handModifier !== undefined || attach.blockSpace?.shape || attach.effectText || attach.effectTrigger || attach.cost !== undefined);
  const structuredPreview = {
    movements: card.movements ?? [],
    effects: card.effects ?? [],
    attach: attachActive ? attach : {},
  };
  return `<div class="inspector-head"><div><span class="eyebrow">ACTION CARD / SOURCE REVIEW</span><h2>Card data</h2></div><span class="draft-state">${escape(draft.status)}</span></div>
  <form id="editor-form">
    <fieldset>
      <legend>Identity</legend>
      <div class="form-grid">
        <label>Card id<input name="card-id" value="${escape(card.id)}"></label>
        <label>Name<input name="card-name" value="${escape(card.name)}"></label>
        <label>Expansion<select name="expansion"><option value="speedrunners" ${card.expansion === "speedrunners" ? "selected" : ""}>Speedrunners</option><option value="shadowraiders" ${card.expansion === "shadowraiders" ? "selected" : ""}>Shadowraiders</option></select></label>
        <label>Status<select name="status"><option value="draft" ${draft.status === "draft" ? "selected" : ""}>draft</option><option value="review" ${draft.status === "review" ? "selected" : ""}>review</option><option value="verified" ${draft.status === "verified" ? "selected" : ""}>verified</option></select></label>
        <label>Card type<select name="card-type"><option value="">none</option>${CARD_TYPES.map((value) => `<option value="${value}" ${card.type === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Card classes<input name="card-class" value="${escape((card.class ?? []).join(", "))}" placeholder="comma separated"></label>
      </div>
    </fieldset>
    ${sourceGroup(draft)}
    <fieldset>
      <legend>Action part</legend>
      <div class="form-grid">
        <label>Legacy fixed movement<input name="movement" type="number" min="1" value="${maybe(card.movement)}"></label>
        <label>Activates</label>
      </div>
      <div class="corners">${checkboxGroup("data-activate", ACTIVATE_ABILITIES, card.activates)}</div>
      <div class="structured-stack">
        ${movementRows(card.movements ?? [], "movement")}
      </div>
      <div class="button-row"><button type="button" class="secondary" data-add-row="movement">Add movement option</button></div>
    </fieldset>
    <fieldset>
      <legend>Direct play effects</legend>
      <p class="hint">These are one-shot effects on play, separate from the attachment part.</p>
      <div class="structured-stack">
        ${effectRows(card.effects ?? [])}
      </div>
      <div class="button-row"><button type="button" class="secondary" data-add-row="effect">Add direct effect</button></div>
    </fieldset>
    <fieldset>
      <legend>Attachment part</legend>
      <div class="form-grid">
        <label>Attach as<select name="attach-as"><option value="">none</option>${ATTACH_AS.map((value) => `<option value="${value}" ${attach.as === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Attach slot<select name="attach-slot"><option value="">none</option>${CARD_SLOTS.map((value) => `<option value="${value}" ${attach.slot === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Target classes<input name="attach-class" value="${escape((attach.class ?? []).join(", "))}" placeholder="comma separated"></label>
        <label>Cost<input name="attach-cost" type="number" min="0" value="${maybe(attach.cost)}"></label>
        <label>Draw modifier<input name="attach-draw" type="number" value="${maybe(attach.drawModifier)}"></label>
        <label>Hand modifier<input name="attach-hand" type="number" value="${maybe(attach.handModifier)}"></label>
        <label>Block-space shape<select name="attach-block-shape"><option value="">none</option>${BLOCK_SPACE_SHAPES.map((value) => `<option value="${value}" ${attach.blockSpace?.shape === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Effect trigger<select name="attach-effect-trigger"><option value="">none</option>${ATTACH_EFFECT_TRIGGERS.map((value) => `<option value="${value}" ${attach.effectTrigger === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      </div>
      <label>Effect text<textarea name="attach-effect-text" rows="3" placeholder="Source-reviewed effect wording or concise authored note">${escape(attach.effectText ?? "")}</textarea></label>
      <label class="toggle"><input name="attach-grants-stealth" type="checkbox" ${boolAttr(attach.grantsStealth)}> Grants stealth capability</label>
      <div class="structured-grid">
        <fieldset>
          <legend>Grants</legend>
          <div class="corners">${checkboxGroup("data-attach-grant", GRANTABLE_ABILITIES, attach.grants)}</div>
        </fieldset>
        <fieldset>
          <legend>Removes</legend>
          <div class="corners">${checkboxGroup("data-attach-remove", GRANTABLE_ABILITIES, attach.removes)}</div>
        </fieldset>
        <fieldset>
          <legend>Granted slots</legend>
          <div class="corners">${checkboxGroup("data-attach-slot-grant", CARD_SLOTS, attach.grantsSlot)}</div>
        </fieldset>
        <fieldset>
          <legend>ICE modifier</legend>
          <div class="ice-faces">${[1, 2, 3, 4, 5, 6].map((face) => `<label><input type="checkbox" data-ice-face="${face}" ${attach.iceModifier?.faces?.includes(face) ? "checked" : ""}> ${face}</label>`).join("")}</div>
          <div class="form-grid">
            <label>Delta dice<input name="attach-ice-delta" type="number" value="${maybe(attach.iceModifier?.deltaDice)}"></label>
            <label class="toggle"><input name="attach-ice-black" type="checkbox" ${boolAttr(attach.iceModifier?.black)}> Black ICE</label>
          </div>
        </fieldset>
      </div>
      <fieldset>
        <legend>Granted movement</legend>
        <div class="structured-stack">${movementRows(attach.grantsMovement ?? [], "grant-movement")}</div>
        <div class="button-row"><button type="button" class="secondary" data-add-row="grant-movement">Add granted movement</button></div>
      </fieldset>
      <fieldset>
        <legend>Granted ability uses</legend>
        <div class="structured-stack">${abilityUseRows(attach.abilityUses ?? [])}</div>
        <div class="button-row"><button type="button" class="secondary" data-add-row="ability-use">Add granted ability use</button></div>
      </fieldset>
    </fieldset>
    <fieldset>
      <legend>Normalized gameplay summary</legend>
      <label>Rule summary<textarea name="summary" rows="3" placeholder="Concise gameplay paraphrase; do not paste the full card layout.">${escape(card.summary ?? "")}</textarea></label>
    </fieldset>
    <fieldset>
      <legend>Printed source review</legend>
      <textarea name="printed-text" rows="9" placeholder="Transcribe the printed card text for review. This remains in the editor session, not the runtime record.">${escape(transcription.printedText)}</textarea>
      ${vision}
      <label class="toggle"><input type="checkbox" name="confirm-text" ${boolAttr(transcription.reviewerConfirmed)}> I confirmed the transcription against this source card</label>
      <label class="toggle"><input type="checkbox" name="confirm-duplicates" ${boolAttr(transcription.duplicateGroupConfirmed)}> I confirmed this physical-copy group</label>
    </fieldset>
    <fieldset>
      <legend>Provenance</legend>
      <div class="form-grid">
        <label>Source locator<input name="locator" value="${escape(draft.provenance.locator)}"></label>
        <label>Notes<input name="notes" value="${escape(draft.provenance.notes ?? "")}"></label>
      </div>
    </fieldset>
    <label class="toggle"><input type="checkbox" name="provisional" ${boolAttr(card.provisional)}> Keep as provisional until review is complete</label>
    <fieldset>
      <legend>Derived structure preview</legend>
      <p class="hint">Read-only preview of the normalized structured card data that will be validated and exported.</p>
      <pre class="json-preview">${escape(JSON.stringify(structuredPreview, null, 2))}</pre>
    </fieldset>
  </form>
  ${visionPreview(draft)}
  <section class="diagnostics"><h3>Validation</h3>${state.validation.length ? `<ul>${state.validation.map((error) => `<li>${escape(error)}</li>`).join("")}</ul>` : "<p>Source text is review evidence. The gameplay record exports normalized fields plus the concise summary.</p>"}${state.deckValidation.length ? `<h3>Deck readiness</h3><ul>${state.deckValidation.map((error) => `<li>${escape(error)}</li>`).join("")}</ul>` : ""}</section>${coverageMarkup("action-card-editor")}${coverageMarkup("play-workbench")}`;
}

function render() {
  const asset = selectedAsset();
  const draft = selectedDraft();
  app.innerHTML = `<header class="topbar"><div><span class="eyebrow">LOCAL CONTENT AUTHORING</span><h1>Zaibatsu <em>Action Card Editor</em></h1></div><div class="status"><span class="pulse"></span>${escape(state.notice)}</div><a class="editor-link" href="/">Block editor</a></header><section class="workspace card-workspace"><aside class="assets panel"><div class="panel-title"><h2>Action card sources</h2><span>${state.assets.length}</span></div><input id="asset-filter" aria-label="Filter action card assets" placeholder="Filter source cards"><div id="asset-list" class="asset-list">${assetGroups()}</div>${coverageMarkup("action-card-editor")}</aside><section class="canvas panel"><div class="canvas-title"><div><span class="eyebrow">${asset ? escape(asset.artifactId) : "no source"}</span><h2>${asset ? escape(titleFor(asset)) : "Select a card"}</h2></div><div class="canvas-actions"><button id="new-draft" class="secondary" ${asset ? "" : "disabled"}>${draft ? "Reset card" : "Create card"}</button><button id="apply-vision" class="secondary" ${draft && !draft.transcription.vision ? "" : "disabled"}>${draft?.transcription.vision ? "HexVision loaded" : "Apply HexVision"}</button></div></div>${asset ? `<div class="card-stage"><img src="/api/artifact/${encodeURIComponent(asset.assetId)}" alt="${escape(titleFor(asset))}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'missing-art',textContent:'Run the artifact refresh to load this local source image.'}))"></div><div class="asset-meta">assetId <code>${escape(asset.assetId)}</code> / source <code>${escape(asset.artifactId)}</code> / page ${asset.page}</div>` : ""}</section><section class="inspector panel">${draft ? renderInspector(draft) : "<div class=\"empty\"><h2>Start a card</h2><p>Select an action-card source and create a source-linked draft. Block placement tools are intentionally kept out of this editor.</p></div>"}</section></section><footer class="commandbar"><div><label>Session <input id="session-name" value="${escape(state.sessionName)}" aria-label="Session name"></label><button id="save">Save session</button><button id="load">Load session</button></div><div><button id="apply-vision-all" class="secondary">Apply HexVision to fresh</button><button id="validate" class="secondary">Validate</button><button id="validate-deck" class="secondary">Check deck</button><button id="export" class="accent">Export card patch + report</button><button id="export-deck" class="accent">Export deck review</button></div></footer>`;
  bind();
}

function readDraft() {
  const draft = ensureDraft();
  if (!draft) return null;
  const form = document.querySelector("#editor-form");
  if (!form) return draft;
  const get = (name) => form.querySelector(`[name="${name}"]`);
  const card = draft.actionCard;
  card.id = get("card-id").value.trim();
  card.name = get("card-name").value.trim();
  card.expansion = get("expansion").value;
  card.type = get("card-type").value || undefined;
  card.class = readCommaList(get("card-class").value);
  if (!card.class.length) delete card.class;
  card.summary = get("summary").value.trim() || undefined;
  const legacyMovement = get("movement").value.trim();
  card.movement = legacyMovement ? Number(legacyMovement) : undefined;
  card.activates = [...form.querySelectorAll("[data-activate]")].filter((input) => input.checked).map((input) => input.dataset.activate);
  if (!card.activates.length) delete card.activates;
  card.movements = parseMovementRows("movement");
  card.effects = parseEffectRows();

  const attachAs = get("attach-as").value;
  const attachSlot = get("attach-slot").value;
  const attachClass = readCommaList(get("attach-class").value);
  const attachCost = get("attach-cost").value.trim();
  const drawModifier = get("attach-draw").value.trim();
  const handModifier = get("attach-hand").value.trim();
  const blockShape = get("attach-block-shape").value;
  const effectText = get("attach-effect-text").value.trim();
  const effectTrigger = get("attach-effect-trigger").value;
  const grantsStealth = get("attach-grants-stealth").checked;
  const grants = [...form.querySelectorAll("[data-attach-grant]")].filter((input) => input.checked).map((input) => input.dataset.attachGrant);
  const removes = [...form.querySelectorAll("[data-attach-remove]")].filter((input) => input.checked).map((input) => input.dataset.attachRemove);
  const grantsSlot = [...form.querySelectorAll("[data-attach-slot-grant]")].filter((input) => input.checked).map((input) => input.dataset.attachSlotGrant);
  const grantsMovement = parseMovementRows("grant-movement");
  const abilityUses = parseAbilityUseRows();
  const iceFaces = [...form.querySelectorAll("[data-ice-face]")].filter((input) => input.checked).map((input) => Number(input.dataset.iceFace));
  const iceDelta = get("attach-ice-delta").value.trim();
  const iceBlack = get("attach-ice-black").checked;

  const attach = {
    ...(attachAs ? { as: attachAs } : {}),
    ...(attachSlot ? { slot: attachSlot } : {}),
    ...(attachClass.length ? { class: attachClass } : {}),
    ...(grants.length ? { grants } : {}),
    ...(removes.length ? { removes } : {}),
    ...(grantsMovement ? { grantsMovement } : {}),
    ...(grantsStealth ? { grantsStealth: true } : {}),
    ...(grantsSlot.length ? { grantsSlot } : {}),
    ...(abilityUses ? { abilityUses } : {}),
    ...((iceFaces.length || iceDelta || iceBlack) ? { iceModifier: { ...(iceFaces.length ? { faces: iceFaces } : {}), ...(iceDelta ? { deltaDice: Number(iceDelta) } : {}), ...(iceBlack ? { black: true } : {}) } } : {}),
    ...(drawModifier ? { drawModifier: Number(drawModifier) } : {}),
    ...(handModifier ? { handModifier: Number(handModifier) } : {}),
    ...(blockShape ? { blockSpace: { shape: blockShape } } : {}),
    ...(effectText ? { effectText } : {}),
    ...(effectTrigger ? { effectTrigger } : {}),
    ...(attachCost ? { cost: Number(attachCost) } : {}),
  };
  card.attach = Object.keys(attach).length ? attach : undefined;

  card.copies = card.assetRefs.length;
  card.provisional = get("provisional").checked;
  draft.status = get("status").value;
  draft.transcription.printedText = get("printed-text").value.trim();
  draft.transcription.reviewerConfirmed = get("confirm-text").checked;
  draft.transcription.duplicateGroupConfirmed = get("confirm-duplicates").checked;
  draft.provenance.locator = get("locator").value.trim();
  draft.provenance.notes = get("notes").value.trim();
  return normalizeDraft(draft);
}

async function validate() {
  const draft = readDraft();
  if (!draft) return;
  try {
    const data = await api("/api/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document: draft }) });
    state.validation = [...data.errors];
    state.notice = state.validation.length ? `${state.validation.length} issue${state.validation.length === 1 ? "" : "s"} to resolve` : "Card is valid for export";
  } catch (error) {
    state.validation = [error.message];
    state.notice = "Validation failed";
  }
  render();
}

async function validateDeck() {
  try {
    readDraft();
    const data = await api("/api/action-card-deck/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents: state.drafts }) });
    state.deckValidation = [...data.errors];
    state.notice = state.deckValidation.length ? `${state.deckValidation.length} deck issue${state.deckValidation.length === 1 ? "" : "s"} to resolve` : "Current action-card deck drafts are ready for review export";
  } catch (error) {
    state.deckValidation = [error.message];
    state.notice = "Deck validation failed";
  }
  render();
}

async function save() {
  const draft = readDraft();
  if (draft) await validate();
  const name = document.querySelector("#session-name")?.value.trim();
  if (!/^[a-z0-9-]+$/.test(name)) {
    state.notice = "Session name uses lowercase letters, digits, and hyphens.";
    render();
    return;
  }
  state.sessionName = name;
  const session = { sessionVersion: 4, projectId: "zaibatsu-action-card-editor", assetManifestPath: "spec/assets/manifest.json", documents: state.drafts, history: [] };
  try {
    await api("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, session }) });
    state.notice = "Card session saved locally";
  } catch (error) {
    state.notice = error.message;
  }
  render();
}

async function load() {
  const name = document.querySelector("#session-name")?.value.trim();
  try {
    const session = await api(`/api/sessions/${encodeURIComponent(name)}`);
    state.drafts = (session.documents ?? []).filter((document) => document.resourceType === "action-card").map(normalizeDraft);
    state.selectedAssetId = state.drafts[0]?.source.assetId ?? state.selectedAssetId;
    state.sessionName = name;
    state.validation = [];
    state.deckValidation = [];
    state.notice = "Card session loaded";
  } catch (error) {
    state.notice = error.message;
  }
  render();
}

async function exportPatch() {
  const draft = readDraft();
  if (!draft) return;
  await validate();
  if (state.validation.length) return;
  try {
    const data = await api("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${state.sessionName}-${draft.actionCard.id}`, document: draft }) });
    state.notice = `Exported ${data.patch}`;
  } catch (error) {
    state.notice = error.message;
  }
  render();
}

async function exportDeck() {
  try {
    readDraft();
    const data = await api("/api/action-card-deck/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: state.sessionName, documents: state.drafts }) });
    state.notice = `Exported ${data.outputs.length} expansion deck review patch${data.outputs.length === 1 ? "" : "es"}`;
    state.deckValidation = [];
  } catch (error) {
    state.notice = error.message;
  }
  render();
}

function cloneRow(template) {
  if (template.length) return JSON.parse(JSON.stringify(template));
  return {};
}

function editStructuredRow(kind, index, remove = false) {
  const draft = readDraft();
  if (!draft) return;
  const card = draft.actionCard;
  if (kind === "movement") {
    const rows = card.movements ?? [cloneRow([])];
    if (remove) card.movements = rows.filter((_, rowIndex) => rowIndex !== index);
    else card.movements = [...rows, cloneRow([])];
    if (!card.movements.length) delete card.movements;
  } else if (kind === "effect") {
    const rows = card.effects ?? [cloneRow([])];
    if (remove) card.effects = rows.filter((_, rowIndex) => rowIndex !== index);
    else card.effects = [...rows, cloneRow([])];
    if (!card.effects.length) delete card.effects;
  } else if (kind === "grant-movement") {
    const rows = card.attach?.grantsMovement ?? [cloneRow([])];
    card.attach = { ...(card.attach ?? {}), grantsMovement: remove ? rows.filter((_, rowIndex) => rowIndex !== index) : [...rows, cloneRow([])] };
    if (!card.attach.grantsMovement.length) delete card.attach.grantsMovement;
    if (!Object.keys(card.attach).length) delete card.attach;
  } else if (kind === "ability-use") {
    const rows = card.attach?.abilityUses ?? [cloneRow([])];
    card.attach = { ...(card.attach ?? {}), abilityUses: remove ? rows.filter((_, rowIndex) => rowIndex !== index) : [...rows, cloneRow([])] };
    if (!card.attach.abilityUses.length) delete card.attach.abilityUses;
    if (!Object.keys(card.attach).length) delete card.attach;
  }
  render();
}

function bind() {
  document.querySelectorAll("[data-asset]").forEach((button) => button.addEventListener("click", () => {
    readDraft();
    state.selectedAssetId = button.dataset.asset;
    state.validation = [];
    state.deckValidation = [];
    state.notice = "Selected action-card source";
    render();
  }));
  document.querySelector("#new-draft")?.addEventListener("click", () => {
    const asset = selectedAsset();
    state.drafts = state.drafts.filter((draft) => !draft.actionCard.assetRefs.includes(asset.assetId));
    state.drafts.push(blankDraft(asset));
    state.validation = [];
    state.deckValidation = [];
    state.notice = "Fresh action-card draft created";
    render();
  });
  document.querySelector("#apply-vision")?.addEventListener("click", () => {
    readDraft();
    void applyVision(selectedAsset());
  });
  document.querySelector("#apply-vision-all")?.addEventListener("click", () => void applyVisionBulk());
  document.querySelector("#validate")?.addEventListener("click", validate);
  document.querySelector("#validate-deck")?.addEventListener("click", validateDeck);
  document.querySelector("#save")?.addEventListener("click", save);
  document.querySelector("#load")?.addEventListener("click", load);
  document.querySelector("#export")?.addEventListener("click", exportPatch);
  document.querySelector("#export-deck")?.addEventListener("click", exportDeck);
  document.querySelector("#asset-filter")?.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll(".asset").forEach((item) => item.hidden = !item.textContent.toLowerCase().includes(query));
  });
  document.querySelector("#add-copy")?.addEventListener("click", () => {
    const draft = readDraft();
    const source = document.querySelector("#copy-source").value;
    if (!source || !draft) return;
    draft.actionCard.assetRefs = unique([...draft.actionCard.assetRefs, source]);
    draft.actionCard.copies = draft.actionCard.assetRefs.length;
    state.notice = "Added a physical copy to this card group";
    render();
  });
  document.querySelectorAll("[data-remove-copy]").forEach((button) => button.addEventListener("click", () => {
    const draft = readDraft();
    if (!draft || draft.actionCard.assetRefs.length === 1) return;
    draft.actionCard.assetRefs = draft.actionCard.assetRefs.filter((assetId) => assetId !== button.dataset.removeCopy);
    draft.actionCard.copies = draft.actionCard.assetRefs.length;
    if (!draft.actionCard.assetRefs.includes(state.selectedAssetId)) state.selectedAssetId = draft.actionCard.assetRefs[0];
    state.notice = "Removed a physical copy from this card group";
    render();
  }));
  document.querySelectorAll("[data-accept-vision]").forEach((button) => button.addEventListener("click", () => {
    const draft = readDraft();
    if (!draft) return;
    acceptVisionField(draft, button.dataset.acceptVision);
    render();
  }));
  document.querySelectorAll("[data-reject-vision]").forEach((button) => button.addEventListener("click", () => {
    const draft = readDraft();
    if (!draft) return;
    rejectVisionField(draft, button.dataset.rejectVision);
    render();
  }));
  document.querySelectorAll("[data-accept-copy-suggestion]").forEach((button) => button.addEventListener("click", () => {
    const draft = readDraft();
    const source = button.dataset.acceptCopySuggestion;
    if (!draft || !source) return;
    const sibling = state.drafts.find((item) => item !== draft && item.actionCard.assetRefs.includes(source));
    if (sibling && (sibling.transcription.printedText || sibling.transcription.vision?.acceptedFields?.length)) {
      state.notice = `Cannot merge ${source}: it has reviewed draft data. Remove or merge it manually.`;
      render();
      return;
    }
    state.drafts = state.drafts.filter((item) => item === draft || !item.actionCard.assetRefs.includes(source));
    draft.actionCard.assetRefs = unique([...draft.actionCard.assetRefs, source]);
    draft.actionCard.copies = draft.actionCard.assetRefs.length;
    draft.transcription.duplicateGroupConfirmed = false;
    state.notice = `Added suggested copy ${source}; confirm the physical-copy group after source review`;
    render();
  }));
  document.querySelectorAll("[data-add-row]").forEach((button) => button.addEventListener("click", () => editStructuredRow(button.dataset.addRow, 0, false)));
  document.querySelectorAll("[data-remove-row]").forEach((button) => button.addEventListener("click", () => {
    const [kind, index] = button.dataset.removeRow.split(":");
    editStructuredRow(kind, Number(index), true);
  }));
}

async function start() {
  try {
    const [data, catalog, coverage] = await Promise.all([api("/api/action-card-assets"), api("/api/action-card-visions"), api("/api/coverage")]);
    state.assets = data.assets;
    state.visions = catalog.visions ?? {};
    state.copyGroupCandidates = catalog.copyGroupCandidates ?? {};
    state.coverage = coverage;
    state.selectedAssetId = state.assets[0]?.assetId ?? null;
    state.notice = `${state.assets.length} individual action-card sources ready`;
  } catch (error) {
    state.notice = error.message;
  }
  render();
}

start();
