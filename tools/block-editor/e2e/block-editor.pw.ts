import { expect, test } from "@playwright/test";

test("Copyleft typed reserve awards survive source authoring save and load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p02-c03"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.getByRole("button",{name:"Prefill 7 zones",exact:true}).click();await page.locator("#in-cybernet-kind").selectOption("gain-bonus-all-players");await page.locator("#in-cybernet-amount").fill("1");await page.locator("#session-name").fill("copyleft-reserve-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p02-c03").block.effects.inCybernet).toEqual({kind:"gain-bonus-all-players",amount:1});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p02-c03"]').click();await expect(page.locator("#in-cybernet-kind")).toHaveValue("gain-bonus-all-players");await expect(page.locator("#in-cybernet-target")).toHaveValue("");await page.locator("#in-cybernet-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/copyleft-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Electromagnetic Pulse threshold and placement effect survive authoring save and load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p02-c02"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.getByRole("button",{name:"Prefill 7 zones",exact:true}).click();await page.locator("#in-cybernet-kind").selectOption("sacrifice-per-player");await page.locator("#in-cybernet-amount").fill("1");await page.locator("#in-cybernet-minimum-pawns").fill("2");await page.locator("#session-name").fill("emp-threshold-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p02-c02").block.effects.inCybernet).toEqual({kind:"sacrifice-per-player",amount:1,minimumControlledPawns:2});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p02-c02"]').click();await expect(page.locator("#in-cybernet-kind")).toHaveValue("sacrifice-per-player");await expect(page.locator("#in-cybernet-minimum-pawns")).toHaveValue("2");await page.locator("#in-cybernet-minimum-pawns").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/emp-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Antro effect spaces and acting Icebreaker modifiers survive authoring save and load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});
 await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p02-c01"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.getByRole("button",{name:"+ Add gameplay space",exact:true}).click();await page.getByRole("button",{name:"h7 placement hex",exact:true}).click();await page.locator("#space-type").selectOption("effect");await page.locator("#space-effect-family").selectOption("add-on");await page.locator("#session-name").fill("antro-effect-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p02-c01").block.spaces[0].effect).toEqual({kind:"discard-attachment",cardType:"add-on",scope:"cybernet",optional:true});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p02-c01"]').click();await expect(page.locator("#space-effect-family")).toHaveValue("add-on");
 await page.goto("/action-cards/");await page.locator('[data-asset="sp-en-action-cards-p04-c01"]').click();await page.getByRole("button",{name:"Create card",exact:true}).click();await page.getByRole("combobox",{name:"Attach as",exact:true}).selectOption("pawn");await page.getByRole("combobox",{name:"Attach slot",exact:true}).selectOption("gadget");await page.getByLabel("Extra acting dice",{exact:true}).fill("1");await page.getByLabel("Acting pawn ignores Black ICE",{exact:true}).check();const validated=page.waitForResponse(r=>r.url().endsWith("/api/validate"));await page.getByRole("button",{name:"Validate",exact:true}).click();await validated;await expect(page.locator(".status")).toContainText(/issue|valid/);await expect(page.getByLabel("Extra acting dice",{exact:true})).toHaveValue("1");await expect(page.getByLabel("Acting pawn ignores Black ICE",{exact:true})).toBeChecked();await page.getByLabel("Extra acting dice",{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/phase-loop-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("one-way internal links can be authored, saved and removed independently of exit directions",async({page})=>{
 await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p01-c03"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.getByRole("button",{name:"Prefill 7 zones",exact:true}).click();await page.getByLabel("One-way link from",{exact:true}).selectOption("h2");await page.getByLabel("One-way link to",{exact:true}).selectOption("h3");await page.getByRole("button",{name:"Add one-way link",exact:true}).click();await expect(page.getByText("h2 → h3",{exact:false})).toBeVisible();await page.getByLabel("Session",{exact:true}).fill("internal-arrow-authoring");await page.getByRole("button",{name:"Save session",exact:true}).click();await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p01-c03"]').click();await expect(page.getByRole("button",{name:"Remove one-way link 1",exact:true})).toBeVisible();await page.getByRole("button",{name:"Remove one-way link 1",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/internal-arrow-editor-desktop.png",fullPage:true});await page.getByRole("button",{name:"Remove one-way link 1",exact:true}).click();await expect(page.getByRole("button",{name:"Remove one-way link 1",exact:true})).toHaveCount(0);
});

test("block editor fits the source, projects HexVision geometry, and keeps zone actions stable", async ({ page }) => {
  const layoutResponse=await page.request.get("/api/block-layout/sp-en-blocks-a4-p01-c01");
  const sourceLayout=await layoutResponse.json();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator('[data-asset="sp-en-blocks-a4-p01-c01"]').click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("button", { name: "Prefill 7 zones" }).click();
  await expect(page.locator(".zone-space")).toHaveCount(7);
  await page.locator(".inspector").evaluate((element) => { element.scrollTop = 160; });
  const inspectorBefore = await page.locator(".inspector").evaluate((element) => element.scrollTop);
  await page.locator(".zone-space").nth(3).evaluate((element: HTMLButtonElement) => element.click());
  await page.waitForTimeout(50);
  await expect.poll(() => page.locator(".inspector").evaluate((element, before) => Math.abs(element.scrollTop - before) <= 16, inspectorBefore)).toBe(true);
  const before = await page.locator(".hex-stage").evaluate((element) => ({ scrollTop: element.scrollTop, overflow: getComputedStyle(element).overflow, appScroll: document.querySelector("#app")?.scrollTop }));
  await page.getByLabel("h1 placement hex").click();
  const after = await page.locator(".hex-stage").evaluate((element) => { const commandbar = document.querySelector(".commandbar")!.getBoundingClientRect(); return { scrollTop: element.scrollTop, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflow: getComputedStyle(element).overflow, appScroll: document.querySelector("#app")?.scrollTop, documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, commandbarBottom: commandbar.bottom }; });
  expect(before.overflow).toBe("hidden");
  expect(after.overflow).toBe("hidden");
  expect(after.scrollTop).toBe(before.scrollTop);
  expect(after.appScroll).toBe(before.appScroll);
  expect(after.documentHeight).toBe(after.viewportHeight);
  expect(after.commandbarBottom).toBe(after.viewportHeight);
  const outerPoints = await page.locator(".outer-guide").getAttribute("points");
  expect(outerPoints).toBe(sourceLayout.layout.outerHex.vertices.map((point:{x:number;y:number})=>`${point.x},${point.y}`).join(" "));
  if(sourceLayout.vision && sourceLayout.imageSize) {expect(outerPoints).toContain("99.");expect(outerPoints).not.toContain("93,25");}
  await expect(page.getByText("Legacy category:")).toBeVisible();
});

test("bulk HexVision action reports existing draft skips", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("button", { name: "Apply HexVision to all" }).click();
  await expect(page.locator(".status")).toContainText("existing drafts skipped");
});

test("action-card Vision stays review-only until an author accepts a field", async ({ page }) => {
  // This is an author-approval UI test, independent of ignored OCR caches.
  await page.route("**/api/vision/*",route=>route.fulfill({json:{vision:{confidence:0.8,reasons:["Synthetic UI test evidence"],proposals:{candidates:[{field:"name",value:"Synthetic reviewed card",zone:"title",confidence:0.8,reason:"Review gate fixture"}]}}}}));
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/action-cards/");
  await page.getByRole("button", { name: "Create card" }).click();
  await expect(page.locator('textarea[name="card-structure-json"]')).toHaveCount(0);
  await page.getByLabel("Card type").selectOption("add-on");
  await page.getByLabel("Card classes").fill("cyborg");
  await page.locator('[data-row-type="movement:0"]').selectOption("fixed");
  await page.locator('[data-row-amount="movement:0"]').fill("3");
  await page.locator('[data-activate="search"]').check();
  await page.getByRole("button", { name: "Apply HexVision", exact: true }).click();
  await expect(page.getByText("Vision candidate review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept candidate" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Apply HexVision to fresh" }).click();
  await expect(page.locator(".status")).toContainText("existing drafts skipped");
});


test("phase effect editor retains card amounts and threat-policy fields after form refresh",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/action-cards/");await page.getByRole("button",{name:"Create card"}).click();
  await page.getByLabel("Discard this attachment to prevent pawn elimination").check();
  await page.getByLabel("Target classes",{exact:true}).fill("cleaner, bot");
  await page.getByLabel("Forbidden target classes",{exact:true}).fill("operative");
  await page.locator('[data-phase-kind="sacrifice-and-draw"][data-phase-trigger="begin-turn"]').check();
  await page.locator('[data-phase-amount="begin-turn-sacrifice-and-draw"]').fill("3");
  await page.locator('[data-phase-kind="discard-cards"][data-phase-trigger="end-action"]').check();
  await page.locator('[data-phase-amount="end-action-discard-cards"]').fill("2");
  await page.locator('[data-phase-kind="discard-and-relocate"][data-phase-trigger="begin-turn"]').check();
  await page.locator('[data-phase-threat="begin-turn-discard-and-relocate"]').selectOption("normal-movement");
  await page.getByRole("button",{name:"Validate",exact:true}).click();
  await expect(page.getByLabel("Discard this attachment to prevent pawn elimination")).toBeChecked();
  await expect(page.getByLabel("Target classes",{exact:true})).toHaveValue("cleaner, bot");
  await expect(page.getByLabel("Forbidden target classes",{exact:true})).toHaveValue("operative");
  await expect(page.locator('[data-phase-amount="begin-turn-sacrifice-and-draw"]')).toHaveValue("3");
  await expect(page.locator('[data-phase-amount="end-action-discard-cards"]')).toHaveValue("2");
  await expect(page.locator('[data-phase-threat="begin-turn-discard-and-relocate"]')).toHaveValue("normal-movement");
  await expect(page.locator('[data-phase-kind="discard-and-relocate"][data-phase-trigger="begin-turn"]')).toBeChecked();
  expect(errors).toEqual([]);
});

test("printed Delete editor retains a strength-only card and a free activation badge",async({page})=>{
  await page.goto("/action-cards/");await page.getByRole("button",{name:"Create card",exact:true}).click();
  await page.getByRole("combobox",{name:"Attach as",exact:true}).selectOption("pawn");await page.getByRole("combobox",{name:"Attach slot",exact:true}).selectOption("module");
  await page.getByLabel("Printed Delete skulls",{exact:true}).fill("1");await page.getByRole("button",{name:"Validate",exact:true}).click();
  await expect(page.getByLabel("Printed Delete skulls",{exact:true})).toHaveValue("1");await expect(page.getByRole("combobox",{name:"Printed Delete activation",exact:true})).toHaveValue("");
  await page.getByRole("combobox",{name:"Printed Delete activation",exact:true}).selectOption("once-per-turn");await page.getByRole("button",{name:"Validate",exact:true}).click();
  await expect(page.getByLabel("Printed Delete skulls",{exact:true})).toHaveValue("1");await expect(page.getByRole("combobox",{name:"Printed Delete activation",exact:true})).toHaveValue("once-per-turn");
});

test("Malware editor retains a typed Core entry restriction and attachment takeover",async({page})=>{
  await page.goto("/action-cards/");await page.getByRole("button",{name:"Create card",exact:true}).click();
  await page.getByRole("combobox",{name:"Attach as",exact:true}).selectOption("enemy");await page.getByRole("combobox",{name:"Attach slot",exact:true}).selectOption("add-on");
  await page.getByLabel("Cannot move onto Central Core",{exact:true}).check();await page.getByRole("button",{name:"Validate",exact:true}).click();
  await expect(page.getByLabel("Cannot move onto Central Core",{exact:true})).toBeChecked();
  await page.getByLabel("Cannot move onto Central Core",{exact:true}).uncheck();await page.getByLabel("Target classes",{exact:true}).fill("cleaner");
  await page.locator('[data-effect-kind="0"]').selectOption("gain-target-control");await page.locator('[data-effect-trigger="0"]').selectOption("on-attach");
  await page.getByRole("button",{name:"Validate",exact:true}).click();
  await expect(page.locator('[data-effect-kind="0"]')).toHaveValue("gain-target-control");await expect(page.locator('[data-effect-trigger="0"]')).toHaveValue("on-attach");
});


test("Trojan editor retains the controller hand reveal field",async({page})=>{
  await page.goto("/action-cards/");await page.getByRole("button",{name:"Create card",exact:true}).click();
  await page.getByRole("combobox",{name:"Attach as",exact:true}).selectOption("enemy");await page.getByRole("combobox",{name:"Attach slot",exact:true}).selectOption("add-on");
  await page.getByLabel("Controller plays with hand face up",{exact:true}).check();await page.getByRole("button",{name:"Validate",exact:true}).click();
  await expect(page.getByLabel("Controller plays with hand face up",{exact:true})).toBeChecked();
});


test("block editor preserves explicit title zones, defense faces and neutral placement through save and load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;
 page.on("request",request=>{if(request.url().endsWith("/api/sessions") && request.method()==="POST") saved=request.postDataJSON().session;});
 await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p01-c01"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator('[data-non-playable="h1"]').check();await page.getByRole("button",{name:"+ Add gameplay space",exact:true}).click();await page.getByRole("button",{name:"h4 placement hex",exact:true}).click();await page.locator("#space-modifier-kind").selectOption("defense");await page.getByLabel("Defense face 1",{exact:true}).selectOption("vulnerable");
 await expect(page.getByLabel("Defense face 1",{exact:true})).toHaveValue("vulnerable");await page.getByRole("button",{name:"+ Add gameplay space",exact:true}).click();await page.getByRole("button",{name:"h5 placement hex",exact:true}).click();await page.locator("#space-type").selectOption("pawn");await page.locator("#space-pawn-id").fill("idoru");await page.locator("#in-cybernet-kind").selectOption("place-neutral-pawn");await page.locator("#in-cybernet-target").fill("idoru");
 await page.locator("#session-name").fill("defense-face-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();const block=saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p01-c01").block;expect(block.nonPlayableZoneIds).toEqual(["h1"]);expect(block.spaces.find((s:any)=>s.modifier).modifier).toEqual({kind:"defense",dice:[{value:1,shielded:false}]});expect(block.effects.inCybernet).toEqual({kind:"place-neutral-pawn",target:"idoru"});
 await page.getByRole("button",{name:"Load session",exact:true}).click();await expect(page.getByText("Session migrated and loaded",{exact:true})).toBeVisible();await page.locator('[data-asset="sp-en-blocks-a4-p01-c01"]').click();await page.locator(`[data-space="${block.spaces[0].id}"]`).click();await expect(page.getByLabel("Defense face 1",{exact:true})).toHaveValue("vulnerable");await expect(page.locator('[data-non-playable="h1"]')).toBeChecked();await page.getByLabel("Defense face 1",{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/block-defense-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Broadcast controller Core authoring survives save and load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p03-c01"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#under-control-kind").selectOption("controller-core");await page.locator("#under-control-target").fill("broadcast");await page.locator("#session-name").fill("broadcast-core-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p03-c01").block.effects.underControl).toEqual({kind:"controller-core",target:"broadcast"});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p03-c01"]').click();await expect(page.locator("#under-control-kind")).toHaveValue("controller-core");await expect(page.locator("#under-control-target")).toHaveValue("broadcast");await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/broadcast-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("card edits made during validation survive the delayed response and stop stale export",async({page})=>{
 let release!:()=>void,received!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{received=resolve;});
 let exports=0;await page.route("**/api/export",async route=>{exports++;await route.fulfill({json:{patch:"unexpected-stale-export"}});});
 await page.route("**/api/validate",async route=>{received();await held;await route.continue();});
 await page.goto("/action-cards/");await page.getByRole("button",{name:"Create card",exact:true}).click();
 await page.getByRole("combobox",{name:"Attach as",exact:true}).selectOption("pawn");await page.getByRole("combobox",{name:"Attach slot",exact:true}).selectOption("module");await page.getByLabel("Printed Delete skulls",{exact:true}).fill("1");await page.getByRole("button",{name:"Export card patch + report",exact:true}).click();await started;
 await page.getByRole("combobox",{name:"Printed Delete activation",exact:true}).selectOption("once-per-turn");release();await expect(page.getByText("Card changed during validation. Validate again.",{exact:true})).toBeVisible();await expect(page.getByRole("combobox",{name:"Printed Delete activation",exact:true})).toHaveValue("once-per-turn");
 const response=page.waitForResponse(r=>r.url().endsWith("/api/validate"));await page.getByRole("button",{name:"Validate",exact:true}).click();await response;await expect(page.getByText("Card changed during validation. Validate again.",{exact:true})).toHaveCount(0);await expect(page.getByRole("combobox",{name:"Printed Delete activation",exact:true})).toHaveValue("once-per-turn");expect(exports).toBe(0);
});

test("Pink controlled-placement authoring retains the matching pawn through save and load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p03-c03"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#under-control-kind").selectOption("place-controlled-pawn");await page.locator("#under-control-target").fill("gynoid");await page.locator("#session-name").fill("pink-controlled-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p03-c03").block.effects.underControl).toEqual({kind:"place-controlled-pawn",target:"gynoid"});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p03-c03"]').click();await expect(page.locator("#under-control-kind")).toHaveValue("place-controlled-pawn");await expect(page.locator("#under-control-target")).toHaveValue("gynoid");await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/pink-gynoid-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Yakuza attack authoring retains scope, optionality and skull amount through save/load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p04-c01"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#under-control-kind").selectOption("attack-pawn");await page.locator("#under-control-amount").fill("1");await page.locator("#under-control-scope").selectOption("adjacent-blocks");await page.locator("#under-control-optional").check();await page.locator("#session-name").fill("yakuza-attack-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p04-c01").block.effects.underControl).toEqual({kind:"attack-pawn",amount:1,scope:"adjacent-blocks",optional:true});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p04-c01"]').click();await expect(page.locator("#under-control-kind")).toHaveValue("attack-pawn");await expect(page.locator("#under-control-scope")).toHaveValue("adjacent-blocks");await expect(page.locator("#under-control-optional")).toBeChecked();await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/yakuza-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Corporate Scandal marker threshold persists through editor save/load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p04-c02"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#under-control-kind").selectOption("discard-hands-above-markers");await page.locator("#under-control-marker-threshold").fill("5");await page.locator("#session-name").fill("corporate-scandal-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p04-c02").block.effects.underControl).toEqual({kind:"discard-hands-above-markers",markerThreshold:5});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p04-c02"]').click();await expect(page.locator("#under-control-kind")).toHaveValue("discard-hands-above-markers");await expect(page.locator("#under-control-marker-threshold")).toHaveValue("5");await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/corporate-scandal-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Black Clinic global mandatory pawn choice survives editor save/load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p04-c03"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#under-control-kind").selectOption("discard-pawn-attachments");await page.locator("#under-control-scope").selectOption("cybernet");await page.locator("#under-control-optional").uncheck();await page.locator("#session-name").fill("black-clinic-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p04-c03").block.effects.underControl).toEqual({kind:"discard-pawn-attachments",scope:"cybernet"});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p04-c03"]').click();await expect(page.locator("#under-control-kind")).toHaveValue("discard-pawn-attachments");await expect(page.locator("#under-control-scope")).toHaveValue("cybernet");await expect(page.locator("#under-control-optional")).not.toBeChecked();await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/black-clinic-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Engineering War controlled Drone MK-2 target persists through editor save/load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p05-c01"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#under-control-kind").selectOption("place-controlled-pawn");await page.locator("#under-control-target").fill("drone-mk-2");await page.locator("#session-name").fill("engineering-mk2-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p05-c01").block.effects.underControl).toEqual({kind:"place-controlled-pawn",target:"drone-mk-2"});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p05-c01"]').click();await expect(page.locator("#under-control-kind")).toHaveValue("place-controlled-pawn");await expect(page.locator("#under-control-target")).toHaveValue("drone-mk-2");await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/engineering-mk2-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Combat Prototypes controlled Drone Probe target persists through editor save/load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p05-c02"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#under-control-kind").selectOption("place-controlled-pawn");await page.locator("#under-control-target").fill("drone-probe");await page.locator("#session-name").fill("drone-probe-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p05-c02").block.effects.underControl).toEqual({kind:"place-controlled-pawn",target:"drone-probe"});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p05-c02"]').click();await expect(page.locator("#under-control-kind")).toHaveValue("place-controlled-pawn");await expect(page.locator("#under-control-target")).toHaveValue("drone-probe");await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/drone-probe-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Military Development controlled Turret target persists through editor save/load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p05-c03"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#under-control-kind").selectOption("place-controlled-pawn");await page.locator("#under-control-target").fill("drone-turret");await page.locator("#session-name").fill("drone-turret-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p05-c03").block.effects.underControl).toEqual({kind:"place-controlled-pawn",target:"drone-turret"});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p05-c03"]').click();await expect(page.locator("#under-control-target")).toHaveValue("drone-turret");await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/drone-turret-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Arms Industry physical counter effect pair survives editor save and load",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));let saved:any;page.on("request",r=>{if(r.url().endsWith("/api/sessions") && r.method()==="POST")saved=r.postDataJSON().session;});await page.goto("/");await page.locator('[data-asset="sp-en-blocks-a4-p06-c01"]').click();await page.getByRole("button",{name:"Create draft",exact:true}).click();await page.locator("#in-cybernet-kind").selectOption("place-block-bonus");await page.locator("#in-cybernet-amount").fill("1");await page.locator("#under-control-kind").selectOption("collect-block-bonus");await page.locator("#session-name").fill("arms-industry-review");await page.getByRole("button",{name:"Save session",exact:true}).click();await expect(page.getByText("Session saved",{exact:true})).toBeVisible();expect(saved.documents.find((d:any)=>d.source.assetId==="sp-en-blocks-a4-p06-c01").block.effects).toEqual({inCybernet:{kind:"place-block-bonus",amount:1},underControl:{kind:"collect-block-bonus"}});await page.getByRole("button",{name:"Load session",exact:true}).click();await page.locator('[data-asset="sp-en-blocks-a4-p06-c01"]').click();await expect(page.locator("#in-cybernet-kind")).toHaveValue("place-block-bonus");await expect(page.locator("#under-control-kind")).toHaveValue("collect-block-bonus");await page.locator("#under-control-kind").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/arms-industry-editor-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
