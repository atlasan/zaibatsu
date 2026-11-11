import { expect, test } from "@playwright/test";

test("Copyleft allocates physical icon counters before awards, then transfers at empty reserve",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-copyleft-bonus").click();await expect(page.getByTestId("bonus-pool")).toContainText("Bonus reserve 3/24");await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Revealed block placement").selectOption("0");await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByTestId("bonus-pool")).toHaveText("Bonus reserve 0/24 · on board 1 · invested 0");
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const path=await (await downloading).path();await page.getByLabel("Action",{exact:true}).selectOption({label:"Attach Phase-Loop to pawn"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByTestId("bonus-pool")).toContainText("invested 1");await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"portrait"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByTestId("bonus-pool")).toHaveText("Bonus reserve 0/24 · on board 0 · invested 1");await expect(page.getByText("✓ Collect the existing board counter without creating another.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByTestId("bonus-pool")).toContainText("on board 1");await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByTestId("bonus-pool")).toHaveText("Bonus reserve 0/24 · on board 1 · invested 0");await page.getByTestId("bonus-pool").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/copyleft-bonus-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Electromagnetic Pulse exposes both owner selections and preserves public commitments through replay",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-emp-sacrifice").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Revealed block placement").selectOption("0");await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByRole("heading",{name:"Electromagnetic Pulse: choose a pawn",exact:true})).toBeVisible();await page.getByRole("button",{name:"Sacrifice Speedrunner (Blue)",exact:true}).click();await expect(page.getByText("Ada · selected Speedrunner (Blue)",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true})).toBeVisible();
 await expect(page.getByText("No cards in hand. Resolve the pending decision to continue.",{exact:true})).toBeVisible();const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const path=await (await downloading).path();await page.getByRole("button",{name:"Sacrifice Synthetic non-Reboot worker",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/emp-pending-desktop.png",fullPage:true});await page.getByRole("button",{name:"Sacrifice Synthetic non-Reboot worker",exact:true}).click();await expect(page.getByText("✓ Finish both selections and inspect physical cleanup and refunds.",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Electromagnetic Pulse: choose a pawn",exact:true})).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByText("Ada · selected Speedrunner (Blue)",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test("Antro exposes optional physical attachment decisions, refunds and replay",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-antro-discard").click();
 await page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true}).click();await expect(page.locator(".inspector dd").filter({hasText:"Immune while attached"})).toBeVisible();
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Uplink: Move 1"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"add-on"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Antro: optional attachment discard",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:/^Discard Gunhed from/})).toHaveCount(1);await expect(page.getByRole("button",{name:/^Discard Dummy from/})).toHaveCount(1);await expect(page.getByRole("button",{name:/^Discard AK/})).toHaveCount(0);
 await page.getByRole("button",{name:/^Discard Dummy from/}).scrollIntoViewIfNeeded();await expect(page.getByRole("button",{name:/^Discard Gunhed from/})).toBeVisible();await expect(page.getByRole("button",{name:/^Discard Dummy from/})).toBeVisible();await page.screenshot({path:"../../tmp/antro-pending-desktop.png",fullPage:true});
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const path=await (await downloading).path();await page.getByRole("button",{name:/^Discard Gunhed from/}).click();await expect(page.getByText("✓ Inspect refunds and remaining attachment benefits.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Antro: optional attachment discard",exact:true})).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await page.getByRole("button",{name:"Decline optional discard",exact:true}).click();await expect(page.getByRole("heading",{name:"Antro: optional attachment discard",exact:true})).toHaveCount(0);await page.screenshot({path:"../../tmp/antro-discard-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
import { readFileSync } from "node:fs";

test("Sprawl collects physical hand choices privately, then publishes all discards and replays the pending window",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-sprawl-discard").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Revealed block placement").selectOption("0");await page.getByRole("button",{name:"Place revealed block",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Sprawl: choose hand discards",exact:true})).toBeVisible();await page.getByLabel("Sprawl discard card 1: Uplink",{exact:true}).check();await page.getByLabel("Sprawl discard card 2: Uplink",{exact:true}).check();await page.getByRole("button",{name:"Commit selected cards",exact:true}).click();await expect(page.getByText("Ada · 2 required · selection committed",{exact:true})).toBeVisible();await expect(page.getByText("Bea · 1 required · awaiting selection",{exact:true})).toBeVisible();
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const download=await downloading,path=await download.path();await page.getByRole("heading",{name:"Sprawl: choose hand discards",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/sprawl-pending-desktop.png",fullPage:true});
 await page.getByLabel("Sprawl discard card 2: Worm",{exact:true}).check();await page.getByRole("button",{name:"Commit selected cards",exact:true}).click();await expect(page.getByText("✓ Complete both selections and publish exactly three physical discards.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Sprawl: choose hand discards",exact:true})).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByText("Ada · 2 required · selection committed",{exact:true})).toBeVisible();await page.getByLabel("Sprawl discard card 2: Worm",{exact:true}).check();await page.getByRole("button",{name:"Commit selected cards",exact:true}).click();await page.getByText("Match history",{exact:true}).click();await expect(page.locator(".log-item.card-discarded")).toHaveCount(4);await page.screenshot({path:"../../tmp/sprawl-resolved-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("printed internal arrows filter movement previews until Octagon supplies its exception",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-internal-arrows").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Uplink: Move 1"});await expect(page.getByLabel("Next adjacent space",{exact:true}).locator("option").filter({hasText:"rabbit"})).toHaveCount(0);
 await page.getByLabel("Action",{exact:true}).selectOption({label:'Attach Octagon "dex" to pawn'});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Uplink: Move 1"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"rabbit"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Move from shield back to rabbit using the exception.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Block Sprawl",exact:true}).focus();await page.getByRole("button",{name:"Block Sprawl",exact:true}).press("Enter");await expect(page.locator(".inspector dd").filter({hasText:"rabbit → shield"})).toBeVisible();await page.getByText("One-way links",{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/sprawl-internal-arrow-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Idoru's control-card marker is visible, wins immediately and survives replay",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-idoru-marker-victory").click();
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak pawn"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();
 await expect(page.getByText("✓ Place the last marker on her control card and win immediately.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Pawn Idoru",exact:true}).click();await expect(page.locator(".inspector dd").filter({hasText:"1 · Ada · counts in Cybernet"})).toBeVisible();await expect(page.locator(".inspector dd").filter({hasText:/^1, 6$/})).toBeVisible();
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const trace=await downloading,path=await trace.path();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByText("✓ Place the last marker on her control card and win immediately.",{exact:true})).toHaveCount(0);await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByText("✓ Inspect the public allocation and replay the result.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Pawn Idoru",exact:true}).click();await page.getByText("Control markers",{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/idoru-marker-inspector-desktop.png",fullPage:true});await page.getByText("Match history",{exact:true}).click();await expect(page.locator(".log-item.control-marker-placed")).toContainText("placed a control marker on Idoru");await page.screenshot({path:"../../tmp/idoru-marker-victory-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Toxin requires a visible choice before entering the action phase", async ({page}) => {
  await page.goto("/play/");
  await page.getByText("Test Lab and content coverage",{exact:true}).click();
  await page.getByTestId("scenario-phase-choices").click();
  await page.getByRole("button",{name:"Start action phase"}).click();
  await expect(page.getByRole("heading",{name:"Toxin: discard or sacrifice"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Start action phase"})).toBeDisabled();
  await page.getByLabel("Card to discard for Toxin").selectOption("1");
  await page.getByRole("button",{name:"Discard selected card",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Toxin: discard or sacrifice"})).toHaveCount(0);
  await expect(page.getByText("✓ Confirm action phase resumes after marker reset.")).toBeVisible();
});

test("verified source scenario exposes canonical attachments and searchable evidence", async ({page}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/play/");
  await page.getByText("Test Lab and content coverage", {exact:true}).click();
  await page.getByText(/Rule and component checklist/).click();
  await page.getByLabel("Find rule or component").fill("Octagon");
  await expect(page.getByText(/verified · sp-en-action-cards/).first()).toBeVisible();
  await page.getByTestId("scenario-source-foundation").click();
  await expect(page.getByRole("heading",{name:"Verified starter and card rules"})).toBeVisible();
  await page.getByLabel("Action").selectOption({label:'Attach Octagon "dex" to pawn'});
  await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.getByText("✓ Attach Octagon Dex to the Blue Speedrunner.")).toBeVisible();
  await page.getByLabel("Action").selectOption({label:"Play DJ: Move 1"});
  await expect(page.getByRole("button",{name:/^Move to /}).first()).toBeVisible();
  await page.screenshot({path:"../../tmp/source-foundation-desktop.png",fullPage:true});
  expect(errors).toEqual([]);
});

async function standardSession(page: import("@playwright/test").Page) {
  await page.goto("/play/");
  await page.getByLabel("Player names (2–4, comma-separated)").fill("Ada, Bea");
  await page.getByLabel("Explicit seed").fill("5");
  await page.getByTestId("create-standard-session").click();
  await expect(page.getByLabel("Action")).toBeVisible();
}

test("disconnection preserves confirmed moves and reconnect does not replay an uncertain action", async ({page}) => {
  await standardSession(page);
  let disconnected = true;
  let attempts = 0;
  await page.route("**/api/play/sessions/*/command", async route => {
    attempts++;
    if (disconnected) await route.abort("connectionrefused");
    else await route.continue();
  });
  await page.getByLabel("Action").selectOption({label:"Play Uplink: Search"});
  await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.getByText(/The local game server is disconnected/)).toBeVisible();
  expect(attempts).toBe(1);
  await expect(page.locator(".tile:not(.placement-preview)")).toHaveCount(1);
  disconnected = false;
  await page.getByRole("button",{name:"Reconnect",exact:true}).click();
  await expect(page.getByRole("button",{name:"Reconnect",exact:true})).toHaveCount(0);
  expect(attempts).toBe(1);
  await expect(page.locator(".tile:not(.placement-preview)")).toHaveCount(1);
  await page.getByLabel("Action").selectOption({label:"Play Uplink: Search"});
  await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.locator(".tile:not(.placement-preview)")).toHaveCount(2);
  expect(attempts).toBe(2);
});

test("expired host session restores its trace and applies the requested move exactly once", async ({page}) => {
  await standardSession(page);
  let attempts = 0;
  let newId = "";
  await page.route("**/api/play/sessions/*/command", async route => {
    attempts++;
    if (attempts === 1) await route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({code:"session-expired",error:"Play session not found"})});
    else { newId = new URL(route.request().url()).pathname.split("/")[4]!; await route.continue(); }
  });
  await page.getByLabel("Action").selectOption({label:"Play Uplink: Search"});
  await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.locator(".tile:not(.placement-preview)")).toHaveCount(2);
  expect(attempts).toBe(2);
  const restored = await (await page.request.get(`/api/play/sessions/${newId}`)).json();
  expect(restored.recoveryTrace.commands).toHaveLength(2);
  expect(restored.state.blocks).toHaveLength(2);
});

test("standard play shows named players and supports Search, movement, and undo", async ({ page }) => {
  await standardSession(page);
  await expect(page.getByText("Active player: Ada")).toBeVisible();
  await page.getByLabel("Action").selectOption({ label: "Play Uplink: Search" });
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByRole("button", { name: "Block Hacktivism" })).toBeVisible();
  await page.getByLabel("Action").selectOption({ label: "Play Fast Uplink: Move 2" });
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Active player: Ada")).toBeVisible();
});

test("Test Lab attachment fixture displays checkpoints and uses named controls", async ({ page }) => {
  await page.goto("/play/");
  await page.getByText("Test Lab and content coverage", { exact: true }).click();
  await page.getByTestId("scenario-attachments").click();
  await expect(page.getByRole("heading", { name: "Attachments" })).toBeVisible();
  await expect(page.getByText("Fixture checkpoints")).toBeVisible();
  await page.getByLabel("Action").selectOption({ label: "Attach Stealth Harness to pawn" });
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByText("✓ Attach the Stealth Harness to your Red Speedrunner.")).toBeVisible();
});

test("game basics fixture exposes marker placement and winner feedback", async ({ page }) => {
  await page.goto("/play/");
  await page.getByText("Test Lab and content coverage", { exact: true }).click();
  await page.getByTestId("scenario-game-basics").click();
  await expect(page.getByRole("heading", { name: "Game basics" })).toBeVisible();
  await page.getByLabel("Action").selectOption({ label: "Play Uplink: Icebreak block" });
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByRole("heading", { name: "Ada wins!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute selected action" })).toHaveCount(0);
});

test("fixture traces report an actionable checksum failure", async ({ page }) => {
  await page.goto("/play/");
  await page.getByText("Test Lab and content coverage", { exact: true }).click();
  await page.getByTestId("scenario-reboot-and-turn").click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "zaibatsu-speedrunners-trace/v1", setup: { playerNames: ["Ada", "Bea"], seed: 5 }, dataChecksum: "wrong", commands: [] })),
  });
  await expect(page.getByText("Trace data checksum does not match selected Speedrunners corpus")).toBeVisible();
});

test("mobile setup and Test Lab remain keyboard-operable without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play/");
  await page.getByText("Test Lab and content coverage", { exact: true }).click();
  await page.getByTestId("scenario-search-and-move").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Fixture checkpoints")).toBeVisible();
  expect(errors).toEqual([]);
});

test("quick match has card choices, board movement, turn handoff and durable resume", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await standardSession(page);
  await expect(page.getByLabel("Action")).not.toContainText("Place a control marker");
  await page.getByTestId("hand-card-0").click();
  await expect(page.getByTestId("hand-card-0")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByRole("button", { name: "Block Hacktivism", exact: true })).toBeVisible();
  await page.getByLabel("Action").selectOption({ label: "Move Speedrunner (Red) (base: 3 steps)" });
  await expect(page.getByRole("button", { name: /^Move to / }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Move to / }).first().click();
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await page.getByRole("button", { name: "End turn", exact: true }).click();
  await page.getByRole("button", { name: "Keep hand & draw", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pass to Bea" })).toBeVisible();
  await expect(page.getByTestId("hand-card-0")).toHaveCount(0);
  await page.getByRole("button", { name: "I'm ready" }).click();
  await expect(page.getByText("Active player: Bea")).toBeVisible();
  await page.reload();
  await page.getByTestId("resume-match").click();
  await page.getByRole("button", { name: "I'm ready" }).click();
  await expect(page.getByText("Active player: Bea")).toBeVisible();
  await expect(page.getByRole("button", { name: "Block Hacktivism", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "../../tmp/quick-match-desktop.png", fullPage: true });
});

test("reboot can spend four physical copies including duplicate card ids", async ({ page }) => {
  await page.goto("/play/");
  await page.getByText("Test Lab and content coverage", { exact: true }).click();
  await page.getByTestId("scenario-reboot-and-turn").click();
  await page.getByLabel("Action").selectOption({ label: "Play 4 cards: Reboot Speedrunner (Red)" });
  await page.getByLabel("Four cards to discard").selectOption(["0", "1", "2", "3"]);
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByRole("button", { name: "Pawn Speedrunner (Red)", exact: true })).toBeVisible();
});

test("a normal quick match finishes through the last paid Icebreaker and stays won", async ({ page }) => {
  const trace = JSON.parse(readFileSync(new URL("../../../golden/quick-match.trace.json", import.meta.url), "utf8"));
  const last = trace.commands.pop().action;
  await standardSession(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "match.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(trace)) });
  await page.getByRole("button", { name: "I'm ready" }).click();
  const label = `Play ${last.cardId === "move-1" ? "Uplink" : last.cardId === "move-2" ? "Fast Uplink" : "Overclock"}: Icebreak block`;
  await page.getByLabel("Action").selectOption({ label });
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByRole("heading", { name: "Militech wins!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "End turn", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Fit board", exact: true }).click();
  await page.screenshot({ path: "../../tmp/quick-match-victory.png", fullPage: true });
  await page.reload();
  await page.getByTestId("resume-match").click();
  await expect(page.getByRole("heading", { name: "Militech wins!" })).toBeVisible();
});

test("tabletop switches cameras and exchanges unused physical cards", async ({ page }) => {
  await standardSession(page);
  await expect(page.locator(".pawn .source-figure")).toHaveCount(2);
  await page.getByRole("button", {name:"Top-down",exact:true}).click();
  await expect(page.locator(".board-viewport")).toHaveClass(/top-down/);
  await page.getByRole("button", {name:"Perspective",exact:true}).click();
  await expect(page.locator(".board-viewport")).toHaveClass(/perspective/);
  await page.getByRole("button", {name:"End turn",exact:true}).click();
  await page.getByTestId("hand-card-0").click();
  await expect(page.getByRole("button", {name:"Discard selected & draw",exact:true})).toBeVisible();
  await page.getByRole("button", {name:"Discard selected & draw",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Pass to Bea"})).toBeVisible();
});

test("Shadowraiders threat combat offers a response and assigns public rolled dice", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/play/");
  await page.getByText("Test Lab and content coverage", {exact:true}).click();
  await page.getByTestId("scenario-threat-combat").click();
  await expect(page.getByLabel("Guard inactive", {exact:true})).toBeVisible();
  await page.getByLabel("Action").selectOption({label:"Move Speedrunner (Red) (base: 3 steps)"});
  await page.getByRole("button", {name:"Add step",exact:true}).click();
  await page.getByRole("button", {name:"Execute selected action"}).click();
  await expect(page.getByRole("heading", {name:"Threats awakened"})).toBeVisible();
  await expect(page.getByRole("button", {name:"End turn",exact:true})).toBeDisabled();
  await page.getByRole("button", {name:"Play Fast Uplink: Roll Delete",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Assign your rolled dice"})).toBeVisible();
  await expect(page.getByLabel("Attack roll")).toBeVisible();
  await page.locator('select[name="rolled-0"]').selectOption("guard-lab");
  await page.getByRole("button", {name:"Resolve attack",exact:true}).click();
  await expect(page.getByRole("heading", {name:"Assign your rolled dice"})).toHaveCount(0);
  if (await page.getByRole("button", {name:"Resolve threat attacks",exact:true}).count()) await page.getByRole("button", {name:"Resolve threat attacks",exact:true}).click();
  await expect(page.getByRole("button", {name:"End turn",exact:true})).toBeEnabled();
  expect(errors).toEqual([]);
});


test("printed beginning cards expose destination and physical-card decisions",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();
  await page.getByTestId("scenario-phase-jetpack").click();await page.getByRole("button",{name:"Start action phase"}).click();
  await expect(page.getByRole("heading",{name:"Jetpack: choose a destination"})).toBeVisible();
  await expect(page.getByLabel("Relocation destination")).toBeVisible();
  await page.getByRole("button",{name:"Relocate pawn",exact:true}).click();
  await expect(page.getByText("✓ Relocate and refund the paid counter.")).toBeVisible();
  await expect(page.locator(".log-item.pawn-relocated")).toContainText("relocated to");
  await expect(page.locator(".log-item.card-discarded")).toContainText("Jetpack was discarded.");
  await page.screenshot({path:"../../tmp/phase-jetpack-desktop.png",fullPage:true});
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();
  await page.getByTestId("scenario-phase-insider-trading").click();await page.getByRole("button",{name:"Start action phase"}).click();
  const discard=page.getByRole("button",{name:"Discard selected cards",exact:true});await expect(discard).toBeDisabled();
  await page.getByLabel("Discard card 1: DJ",{exact:true}).check();await expect(discard).toBeDisabled();
  await page.getByLabel("Discard card 2: DJ",{exact:true}).check();await expect(discard).toBeEnabled();
  await page.screenshot({path:"../../tmp/phase-insider-trading-desktop.png",fullPage:true});
  await discard.click();await expect(page.getByText("✓ Discard two physical hand cards.")).toBeVisible();
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();
  await page.getByTestId("scenario-phase-electric-sheep").click();await page.getByRole("button",{name:"Start action phase"}).click();
  await expect(page.getByText("✓ Draw three cards after sacrifice.")).toBeVisible();expect(errors).toEqual([]);
});


test("Dummy permits a defender-owned prevention decision during the attacking player's turn",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();
  await page.getByTestId("scenario-elimination-prevention").click();
  await page.getByLabel("Action").selectOption({label:"Play Electric Sheep: Roll Delete"});
  await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.getByRole("heading",{name:"Assign your rolled dice"})).toBeVisible();
  await page.getByRole("button",{name:"Resolve attack",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Prevent pawn elimination"})).toBeVisible();
  await expect(page.getByText(/Bea decides whether to discard/)).toBeVisible();
  await page.screenshot({path:"../../tmp/dummy-prevention-desktop.png",fullPage:true});
  await page.getByRole("button",{name:"Discard Dummy to prevent elimination",exact:true}).click();
  await expect(page.getByText("✓ Discard Dummy and keep the pawn in the Cybernet.")).toBeVisible();
  await expect(page.locator(".log-item.elimination-prevented")).toContainText("Bea protected");
  await page.getByText("Match history",{exact:true}).click();
  await expect(page.getByText("Removed from match: 2",{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});


test("source attachment inspector shows the engine-computed E-Synapse class",async({page})=>{
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-source-foundation").click();
  await page.getByLabel("Action").selectOption({label:"Attach Biochip to pawn"});await page.getByRole("button",{name:"Execute selected action"}).click();
  await page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true}).click();
  await expect(page.locator(".inspector dd").filter({hasText:"operative, e-synapse"})).toBeVisible();
});

test("malware cards offer only eligible targets and expose the gained class",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  for(const name of ["Worm","Under Clocker","Hijacker"]) {
    await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-attachment-restrictions").click();
    await page.getByLabel("Action",{exact:true}).selectOption({label:`Attach ${name} to enemy`});
    await expect(page.getByLabel("Target",{exact:true}).locator("option")).toHaveCount(1);
    await expect(page.getByLabel("Target",{exact:true})).toHaveValue("fixture-malware-target");
    await page.getByRole("button",{name:"Execute selected action"}).click();
    await page.getByRole("button",{name:"Pawn Synthetic non-Operative target",exact:true}).click();
    await expect(page.locator(".inspector dd").filter({hasText:"fixture-subject, malware"})).toBeVisible();
  }
  await page.screenshot({path:"../../tmp/malware-restrictions-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("granted slots expose a physical choice and preserve it through exported replay",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-attachment-slots").click();
  await page.getByLabel("Action",{exact:true}).selectOption({label:"Attach Synthetic gadget to pawn · add-on → gadget slot"});
  await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.getByText("✓ Choose a Gadget slot and attach the synthetic gadget.",{exact:true})).toBeVisible();
  await page.getByLabel("Action",{exact:true}).selectOption({label:"Attach Synthetic weapon carrier to pawn"});await page.getByRole("button",{name:"Execute selected action"}).click();
  await page.getByLabel("Action",{exact:true}).selectOption({label:"Attach Synthetic module to pawn"});await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.getByText("✓ Attach the Weapon and Module chain.",{exact:true})).toBeVisible();
  const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();
  const download=await downloading,path=await download.path();expect(path).not.toBeNull();
  await page.reload();await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-attachment-slots").click();
  await page.locator('input[type="file"]').setInputFiles(path!);
  await expect(page.getByText("✓ Attach the Weapon and Module chain.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true}).click();
  await expect(page.locator(".inspector dd").filter({hasText:"add-on → weapon → module · occupied"})).toBeVisible();
  for(const label of ["Finish actions & recycle","Resolve end phase","Next player's turn","Start action phase","Finish actions & recycle","Resolve end phase","Next player's turn","Start action phase"]) await page.getByRole("button",{name:label,exact:true}).click();
  await expect(page.getByText("✓ Reach Ada's next beginning and inspect dependent-card cleanup.",{exact:true})).toBeVisible();
  await page.getByText("Match history",{exact:true}).click();
  await expect(page.locator(".log-item.card-discarded").filter({hasText:"Synthetic module was discarded."})).toBeVisible();
  await page.screenshot({path:"../../tmp/attachment-slots-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Gunhed weapons add printed dice and permit card activation after the free use",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-printed-delete").click();
  let release=()=>{},held=false;const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/play/sessions/*/command",async route=>{
    const action=route.request().postDataJSON()?.action;
    if(!held && action?.type==="attach-pawn" && action.cardId==="weapon-gunhed") {held=true;await pending;}
    await route.continue();
  });
  for(const name of ["Gunhed","AK-12kM","Synthetic module adapter","Servocanon"]) {
    await page.getByLabel("Action",{exact:true}).selectOption({label:`Attach ${name} to pawn`});await page.getByRole("button",{name:"Execute selected action"}).click();
    if(name==="Gunhed") {
      try {await expect(page.getByLabel("Action",{exact:true})).toBeDisabled();} finally {release();}
      await expect(page.getByText("✓ Attach Gunhed and gain its Weapon slot.",{exact:true})).toBeVisible();
    }
  }
  await expect(page.getByText("✓ Attach AK-12kM, the adapter and Servocanon.",{exact:true})).toBeVisible();
  await page.getByLabel("Action",{exact:true}).selectOption({label:"Roll Delete with Speedrunner (Blue)"});await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.locator('select[name^="rolled-"]')).toHaveCount(3);await page.getByRole("button",{name:"Resolve attack",exact:true}).click();
  await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Dummy: Roll Delete"});await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.locator('select[name^="rolled-"]')).toHaveCount(3);await page.getByRole("button",{name:"Resolve attack",exact:true}).click();
  await expect(page.getByText("✓ Roll again using a matching card after the free activation.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true}).click();
  await expect(page.locator(".inspector dd").filter({hasText:"Matching card / Once per turn"})).toBeVisible();
  await page.screenshot({path:"../../tmp/printed-delete-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Virus captures its synthetic Cleaner target and reports cleanup and refunds",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-virus-control").click();
  await page.getByLabel("Action",{exact:true}).selectOption({label:"Attach Virus to enemy"});await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.getByText("✓ Return four paid counters to Bea.",{exact:true})).toBeVisible();await page.getByText("Match history",{exact:true}).click();
  await expect(page.locator(".log-item.card-discarded").filter({hasText:"Virus was discarded."})).toBeVisible();await expect(page.locator(".log-item.control-changed")).toContainText("Ada");
  await page.screenshot({path:"../../tmp/virus-control-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Lima Flag keeps Central Core out of movement choices while allowing another destination",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-lima-flag").click();
  await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Dummy: Move 2"});
  const choices=page.getByLabel("Next adjacent space",{exact:true});await expect(choices.locator("option")).toHaveCount(2);
  await choices.selectOption(JSON.stringify({coord:{q:2,r:0},spaceId:"a"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.getByText("✓ Keep Lima Flag attached after the legal move.",{exact:true})).toBeVisible();expect(errors).toEqual([]);
});


test("Trojan reveals Bea to Ada and spectators, then undo and replay restore visibility",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-trojan-reveal").click();
  await page.getByText("What each player can see",{exact:true}).click();
  const preview=page.getByTestId("player-view-preview");await expect(preview).toContainText("Bea: 2 cards · Hidden");await expect(preview).not.toContainText("Dummy");
  await page.getByLabel("Action",{exact:true}).selectOption({label:"Attach Trojan to enemy"});await page.getByRole("button",{name:"Execute selected action"}).click();
  await expect(page.getByTestId("revealed-hand")).toContainText("Bea plays face up: Dummy, DJ");
  await page.getByText("What each player can see",{exact:true}).click();await page.getByLabel("View as player").selectOption("");
  await expect(preview).toContainText("Bea: 2 cards · Face up · Dummy, DJ");await expect(preview).toContainText("0 available action options");
  await page.getByLabel("View as player").selectOption("p2");await expect(preview).toContainText("Ada: 0 cards · Hidden");
  const traceDownload=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const trace=await traceDownload,tracePath=await trace.path();
  await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByTestId("revealed-hand")).toHaveCount(0);
  await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(tracePath!);await expect(page.getByTestId("revealed-hand")).toContainText("Dummy, DJ");
  await page.screenshot({path:"../../tmp/trojan-reveal-desktop.png",fullPage:true});expect(errors).toEqual([]);
});


test("source Search reveals before placement and restores the pending decision through replay and undo",async({page})=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-source-search").click();
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await expect(page.getByLabel("Placement",{exact:true})).toHaveCount(0);await expect(page.getByText(/Choose its placement after seeing it/)).toBeVisible();
 await page.getByRole("button",{name:"Execute selected action"}).click();
 await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toBeVisible();await expect(page.getByLabel("Revealed block placement").locator("option")).toHaveCount(6);await expect(page.getByLabel("Revealed Search placement preview",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Finish actions & recycle",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"End turn",exact:true})).toBeDisabled();
 const downloadEvent=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const trace=await downloadEvent,tracePath=await trace.path();
 await page.getByLabel("Revealed block placement").selectOption("2");await page.locator(".command-sidebar").evaluate(node=>{node.scrollTop=0;});await page.screenshot({path:"../../tmp/source-search-pending-desktop.png",fullPage:true});
 await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toHaveCount(0);await expect(page.getByText("✓ Complete placement without paying twice.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toHaveCount(0);
 await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(tracePath!);await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toBeVisible();await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByText("✓ Complete placement without paying twice.",{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});


test("movement rolls before path choice, permits occupied pass-through and restores the roll on replay",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-rolled-movement").click();
 const selector=page.getByLabel("Action",{exact:true});await expect(selector.locator("option").filter({hasText:/^Roll 2d6:/})).toHaveCount(1);const labels=await selector.locator("option").allTextContents();await selector.selectOption({label:labels.find(label=>label.startsWith("Roll 2d6:"))!});await expect(page.getByLabel("Next adjacent space",{exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Execute selected action",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Choose movement after the roll",exact:true})).toBeVisible();await expect(page.getByText(/steps available. The activation is committed/)).toBeVisible();await expect(page.getByRole("button",{name:"Finish movement",exact:true})).toBeEnabled();
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const trace=await downloading,tracePath=await trace.path();
 const next=page.getByLabel("Next adjacent space",{exact:true});await next.selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"b"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await expect(page.getByRole("button",{name:"Finish movement",exact:true})).toBeDisabled();
 await next.selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"c"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await expect(page.getByRole("button",{name:"Finish movement",exact:true})).toBeEnabled();await page.locator(".command-sidebar").evaluate(node=>{node.scrollTop=0;});await page.screenshot({path:"../../tmp/rolled-movement-pending-desktop.png",fullPage:true});
 await page.getByRole("button",{name:"Finish movement",exact:true}).click();await expect(page.getByText("✓ Complete movement with its free use still spent.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Choose movement after the roll",exact:true})).toBeVisible();
 await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(tracePath!);await expect(page.getByRole("heading",{name:"Choose movement after the roll",exact:true})).toBeVisible();await page.getByRole("button",{name:"Finish movement",exact:true}).click();await expect(page.getByRole("heading",{name:"Choose movement after the roll",exact:true})).toHaveCount(0);expect(errors).toEqual([]);
});


test("physical ability markers follow captured control cards and clear at the owner's beginning",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-physical-use-markers").click();
 await page.getByRole("button",{name:"Pawn Speedrunner (Green)",exact:true}).click();await expect(page.locator(".inspector dd").filter({hasText:"move · 1 used · control card"})).toBeVisible();
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Attach Virus to enemy"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Capture the pawn without refreshing its used movement.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Pawn Speedrunner (Green)",exact:true}).click();await expect(page.locator(".inspector dd").filter({hasText:"move · 1 used · control card"})).toBeVisible();
 const downloadEvent=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const trace=await downloadEvent,path=await trace.path();
 await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByText("✓ Keep the used marker through the change of control.",{exact:true})).toBeVisible();
 for(const label of ["Finish actions & recycle","Resolve end phase","Next player's turn","Start action phase","Finish actions & recycle","Resolve end phase","Next player's turn","Start action phase"]) await page.getByRole("button",{name:label,exact:true}).click();
 await expect(page.getByText("✓ Reach Ada's next beginning to clear the controlled marker.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Pawn Speedrunner (Green)",exact:true}).click();await expect(page.locator(".inspector dd").filter({hasText:"move · 1 used · control card"})).toHaveCount(0);
 await page.getByText("Match history",{exact:true}).click();await expect(page.locator(".log-item.ability-use-cleared")).toContainText("cleared a used ability");await page.screenshot({path:"../../tmp/physical-use-markers-desktop.png",fullPage:true});expect(errors).toEqual([]);
});


test("fixed and card movement can spend an activation without leaving the isolated Core",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-zero-step-movement").click();
 const selector=page.getByLabel("Action",{exact:true});await expect(selector.locator("option").filter({hasText:/^Move Speedrunner/})).toHaveCount(1);const labels=await selector.locator("option").allTextContents();await selector.selectOption({label:labels.find(s=>s.startsWith("Move Speedrunner"))!});
 await expect(page.getByText("0/2 fixed steps selected. Finish here to spend this activation without moving.",{exact:true})).toBeVisible();await expect(page.getByLabel("Next adjacent space",{exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Execute selected action",exact:true})).toBeEnabled();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Spend the free movement without leaving Central Core.",{exact:true})).toBeVisible();
 await selector.selectOption({label:"Play Uplink: Move 1"});await expect(page.getByText("0/1 fixed steps selected. Finish here to spend this activation without moving.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Spend a movement card without leaving Central Core.",{exact:true})).toBeVisible();
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const trace=await downloading,path=await trace.path();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByText("✓ Spend a movement card without leaving Central Core.",{exact:true})).toHaveCount(0);await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByText("✓ Keep both costs through replay and undo.",{exact:true})).toBeVisible();await page.locator(".command-sidebar").evaluate(node=>{node.scrollTop=0;});await page.screenshot({path:"../../tmp/zero-step-movement-desktop.png",fullPage:true});expect(errors).toEqual([]);
});


test("Toyeku places Idoru without control and the flat white die updates current defense",async({page})=>{
 // Exercise artwork layering without distributing the optional upstream crop.
 await page.route("**/api/artifact/sp-en-blocks-a4-p01-c01",route=>route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="740"><path fill="#116466" d="M320 0 640 185 640 555 320 740 0 555 0 185Z"/><circle cx="320" cy="370" r="120" fill="#68ccc3"/></svg>'}));
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-toyeku-neutral").click();
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toBeVisible();await page.getByLabel("Revealed block placement").selectOption("0");await page.getByRole("button",{name:"Place revealed block",exact:true}).click();
 await expect(page.getByText("✓ Place Toyeku with Idoru free of player control.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Pawn Idoru",exact:true}).click();await expect(page.locator(".inspector dd").filter({hasText:/^Uncontrolled$/})).toBeVisible();await expect(page.locator(".inspector dd").filter({hasText:"Provisional · full rules pending"})).toBeVisible();
 await page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Dummy: Move 2"});
 for(const spaceId of ["idoru","defense"]) {await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId}));await page.getByRole("button",{name:"Add step",exact:true}).click();}await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Inspect vulnerable defense1 while block ICE stays 3,4,6.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Pawn Speedrunner (Blue)",exact:true}).click();await expect(page.locator(".inspector dd").filter({hasText:/^1 vulnerable, 2 shielded/})).toBeVisible();
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const trace=await downloading,path=await trace.path();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByText("✓ Move the controlled runner onto the white die1 space.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Block Toyeku Company",exact:true}).focus();await page.getByRole("button",{name:"Block Toyeku Company",exact:true}).press("Enter");await expect(page.locator(".inspector dd").filter({hasText:"low · faces 3, 4, 6"})).toBeVisible();await expect(page.locator(".inspector dd").filter({hasText:"defense · 1 vulnerable"})).toBeVisible();await expect(page.locator(".inspector dd").filter({hasText:/^h1$/})).toBeVisible();const tile=page.locator('.tile[data-coord="1,0"]');await expect.poll(()=>tile.locator("img.tile-art").evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);await expect(tile.locator(".tile-hit")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");await page.getByText("Match history",{exact:true}).click();await expect(page.locator(".log-item.pawn-placed")).toContainText("Idoru entered the Cybernet free of player control");await page.screenshot({path:"../../tmp/toyeku-neutral-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Broadcast offers both Core destinations and restores its paid Reboot through replay",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-broadcast-reboot").click();
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Uplink: Reboot at Clandestine Broadcast"});await expect(page.getByLabel("Action",{exact:true}).locator("option").filter({hasText:"Play Uplink: Reboot at Central Core"})).toHaveCount(1);await expect(page.getByText(/Return to Clandestine Broadcast/)).toBeVisible();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Return the retained starter to its large special space.",{exact:true})).toBeVisible();
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const download=await downloading,path=await download.path();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByText("✓ Return the retained starter to its large special space.",{exact:true})).toHaveCount(0);await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByText("✓ Retain the destination through replay and undo.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Block Clandestine Broadcast",exact:true}).focus();await page.getByRole("button",{name:"Block Clandestine Broadcast",exact:true}).press("Enter");await page.screenshot({path:"../../tmp/broadcast-reboot-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Pink District captures one Gynoid onto its matching space after ordinary Search",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-pink-control").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Revealed block placement").selectOption("0");await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByRole("button",{name:"Pawn Gynoid",exact:true})).toHaveCount(0);
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"gynoid"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Capture the block to place and control its one Gynoid.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Pawn Gynoid",exact:true}).click();await expect(page.getByText("May steal one random hand card via another pawn, or decline.",{exact:true})).toBeVisible();await page.screenshot({path:"../../tmp/pink-gynoid-control-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Gynoid's optional random theft restores its pending window and outcome through replay",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-gynoid-theft").click();await page.getByRole("button",{name:"Start action phase",exact:true}).click();await expect(page.getByRole("heading",{name:"Gynoid: steal a random card",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Decline theft",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Start action phase",exact:true})).toBeDisabled();
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const download=await downloading,path=await download.path();await page.getByRole("heading",{name:"Gynoid: steal a random card",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/gynoid-theft-choice-desktop.png",fullPage:true});await page.getByRole("button",{name:/^Steal via .* · Bea$/}).click();await expect(page.getByText("✓ Transfer one random physical card from Bea's hand.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Gynoid: steal a random card",exact:true})).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await page.getByRole("button",{name:/^Steal via .* · Bea$/}).click();await page.getByText("Match history",{exact:true}).click();await expect(page.locator(".log-item.card-stolen")).toContainText("from Bea");await page.screenshot({path:"../../tmp/gynoid-theft-result-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Yakuza target and permitted Dummy response remain playable after recovery and undo",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-yakuza-attack").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Revealed block placement").selectOption("0");await page.getByRole("button",{name:"Place revealed block",exact:true}).click();
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"dragon"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Yakuza: choose an adjacent pawn",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Decline Yakuza attack",exact:true})).toBeVisible();const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const download=await downloading,path=await download.path();await page.getByRole("heading",{name:"Yakuza: choose an adjacent pawn",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/yakuza-target-desktop.png",fullPage:true});
 await page.getByRole("button",{name:/^Attack .* · Bea$/}).click();await expect(page.getByRole("heading",{name:"Prevent pawn elimination",exact:true})).toBeVisible();await expect(page.getByText(/This response is allowed during Ada's turn/)).toBeVisible();let attempts=0;await page.route("**/api/play/sessions/*/command",async route=>{attempts++;if(attempts===1)await route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({code:"session-expired",error:"Play session not found"})});else await route.continue();});await page.getByRole("button",{name:"Discard Dummy to prevent elimination",exact:true}).click();await expect.poll(()=>attempts).toBe(2);await page.unroute("**/api/play/sessions/*/command");await expect(page.getByText("✓ Let Bea decide whether Dummy prevents elimination.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Prevent pawn elimination",exact:true})).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByRole("heading",{name:"Yakuza: choose an adjacent pawn",exact:true})).toBeVisible();await page.getByRole("button",{name:/^Attack .* · Bea$/}).click();await page.getByRole("heading",{name:"Prevent pawn elimination",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/yakuza-defender-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Corporate Scandal's sixth-marker whole-hand discard stays public and restores through replay and undo",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-corporate-scandal").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Revealed block placement").selectOption("0");await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"lower-swirl"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Capture it: the sixth counted marker triggers both whole hands.",{exact:true})).toBeVisible();await expect(page.getByText("✓ Keep the paid Worm out of the discarded hands.",{exact:true})).toBeVisible();
 await page.getByText("Match history",{exact:true}).click();await expect(page.locator(".log-item.block-hand-discarded")).toHaveCount(2);await expect(page.locator(".log-item.block-hand-discarded").filter({hasText:"Ada"})).toContainText("Ada discarded their whole hand (2 cards)");await expect(page.locator(".log-item.card-discarded")).toHaveCount(6);const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const download=await downloading,path=await download.path();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByTestId("hand-card-0")).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByTestId("hand-card-0")).toHaveCount(0);await expect(page.getByText("✓ Keep the paid Worm out of the discarded hands.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Fit board",exact:true}).click();await page.screenshot({path:"../../tmp/corporate-scandal-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Black Clinic clears all chosen attachments, restores the choice and applies the visible hand-space refill limit",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-black-clinic").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Revealed block placement").selectOption("0");await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"clinic"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByRole("heading",{name:"Black Clinic: choose a pawn",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:/^Discard all from .* · Ada · 3 cards$/})).toBeVisible();await page.getByRole("heading",{name:"Black Clinic: choose a pawn",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/black-clinic-choice-desktop.png",fullPage:true});
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const download=await downloading,path=await download.path();await page.getByRole("button",{name:/^Discard all from .* · Ada · 3 cards$/}).click();await expect(page.getByText("✓ Discard Ada's three attachments and recover four invested counters.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Black Clinic: choose a pawn",exact:true})).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await page.getByRole("button",{name:/^Discard all from .* · Ada · 3 cards$/}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Uplink: Move 1"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"hand"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByTestId("hand-size-limit")).toHaveText("Hand limit at recycling: 4 (base 5, cards 0, spaces -1).");await page.getByTestId("hand-size-limit").scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/black-clinic-hand-space-desktop.png",fullPage:true});await page.getByRole("button",{name:"Finish actions & recycle",exact:true}).click();await page.getByRole("button",{name:"Keep hand & draw",exact:true}).click();await expect(page.getByText("✓ Refill Ada's hand to four during recycling.",{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test("Engineering War exposes two entrance rotations, printed native movement and the MK-2's paid public Delete window",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-engineering-mk2").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByLabel("Revealed block placement").locator("option").filter({hasText:"Edge 0"})).toHaveCount(2);await page.getByLabel("Revealed block placement").selectOption({label:"Edge 0 · rotation 5"});await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByRole("button",{name:"Pawn Drone MK-2",exact:true})).toHaveCount(0);
 await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});for(const spaceId of ["defense","drone-mk-2"]){await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId}));await page.getByRole("button",{name:"Add step",exact:true}).click();}await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Capture the block and control its one Drone MK-2.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Pawn Drone MK-2",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Move Drone MK-2 (base: 5 steps)"});for(const step of [{coord:{q:1,r:0},spaceId:"defense"},{coord:{q:0,r:0},spaceId:"core"}]){await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify(step));await page.getByRole("button",{name:"Add step",exact:true}).click();}await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Spend the drone's native movement to reach Central Core.",{exact:true})).toBeVisible();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Uplink: Roll Delete"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByRole("heading",{name:"Assign your rolled dice",exact:true})).toBeVisible();await expect(page.getByLabel("Attack roll",{exact:true})).toHaveText("3");await page.getByRole("heading",{name:"Assign your rolled dice",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/engineering-mk2-public-roll-desktop.png",fullPage:true});
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const download=await downloading,path=await download.path();await page.getByRole("button",{name:"Resolve attack",exact:true}).click();await expect(page.getByText("✓ Assign the drone's paid Delete roll to Bea's runner.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Assign your rolled dice",exact:true})).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await page.getByRole("button",{name:"Resolve attack",exact:true}).click();await expect(page.getByText("✓ Assign the drone's paid Delete roll to Bea's runner.",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Fit board",exact:true}).click();await page.screenshot({path:"../../tmp/engineering-mk2-finished-desktop.png",fullPage:true});expect(errors).toEqual([]);
});
test("Drone Probe exposes free Search from its home, preserves the revealed tile and spends a separate native movement use",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-drone-probe").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByLabel("Revealed block placement").locator("option").filter({hasText:"Edge 0"})).toHaveCount(4);await page.getByLabel("Revealed block placement").selectOption({label:"Edge 0 · rotation 5"});await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByRole("button",{name:"Pawn Drone Probe",exact:true})).toHaveCount(0);await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});for(const spaceId of ["left","drone-probe"]){await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId}));await page.getByRole("button",{name:"Add step",exact:true}).click();}await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByRole("button",{name:"Pawn Drone Probe",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Search with Drone Probe"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toBeVisible();await expect(page.getByText("✓ Use the drone's free Search to reveal Engineering War.",{exact:true})).toBeVisible();await page.getByRole("heading",{name:"Search: place the revealed block",exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:"../../tmp/drone-probe-free-search-desktop.png",fullPage:true});
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const download=await downloading,path=await download.path();await page.getByLabel("Revealed block placement").selectOption({label:"Edge 0 · rotation 5"});await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toBeVisible();await page.getByLabel("Revealed block placement").selectOption({label:"Edge 0 · rotation 5"});await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toHaveCount(0);await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByRole("heading",{name:"Search: place the revealed block",exact:true})).toBeVisible();await page.getByLabel("Revealed block placement").selectOption({label:"Edge 0 · rotation 5"});await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByLabel("Action",{exact:true}).locator("option").filter({hasText:"Search with Drone Probe"})).toHaveCount(0);await page.getByLabel("Action",{exact:true}).selectOption({label:"Move Drone Probe (base: 5 steps)"});for(const step of [{coord:{q:1,r:0},spaceId:"right"},{coord:{q:2,r:0},spaceId:"defense"},{coord:{q:2,r:0},spaceId:"drone-mk-2"}]){await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify(step));await page.getByRole("button",{name:"Add step",exact:true}).click();}await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Spend the drone's independent native movement to enter Engineering War.",{exact:true})).toBeVisible();await expect(page.getByLabel("Action",{exact:true}).locator("option").filter({hasText:"Move Drone Probe (base: 5 steps)"})).toHaveCount(0);await page.getByRole("button",{name:"Fit board",exact:true}).click();await page.screenshot({path:"../../tmp/drone-probe-moved-desktop.png",fullPage:true});expect(errors).toEqual([]);
});

test("Drone Turret hands off private choices, preserves the active turn and restores its off-turn public roll",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-drone-turret").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByLabel("Revealed block placement").locator("option").filter({hasText:"Edge 0"})).toHaveCount(2);await page.getByLabel("Revealed block placement").selectOption({label:"Edge 0 · rotation 5"});await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});for(const spaceId of ["hand","drone-turret"]){await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId}));await page.getByRole("button",{name:"Add step",exact:true}).click();}await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Capture Military Development and control its one Drone Turret.",{exact:true})).toBeVisible();
 for(const name of ["Finish actions & recycle","Resolve end phase","Next player's turn","Start action phase"])await page.getByRole("button",{name,exact:true}).click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Fast Uplink: Move 2"});for(const spaceId of ["hand","drone-turret"]){await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId}));await page.getByRole("button",{name:"Add step",exact:true}).click();}await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await page.getByRole("button",{name:"Let Ada use permitted abilities",exact:true}).click();await expect(page.getByRole("heading",{name:"Pass to Ada",exact:true})).toBeVisible();await page.getByRole("button",{name:"I'm ready to use abilities",exact:true}).click();await expect(page.getByRole("heading",{name:"Ada's permitted abilities",exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Ada's cards",exact:true})).toBeVisible();await page.getByRole("button",{name:"Play Uplink: Roll Delete with Drone Turret",exact:true}).click();await expect(page.getByLabel("Attack roll",{exact:true})).toHaveText("3");await expect(page.getByTestId("attack-controller")).toHaveText("Ada assigns this roll; Bea keeps the turn.");await expect(page.getByRole("button",{name:"Finish actions & recycle",exact:true})).toBeDisabled();await page.locator(".command-sidebar").evaluate(n=>{n.scrollTop=200;});await page.screenshot({path:"../../tmp/drone-turret-off-turn-desktop.png",fullPage:true});
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const path=await(await downloading).path();await page.getByLabel("Die 1 · rolled 3",{exact:true}).selectOption({label:"Speedrunner (Green)"});await page.getByRole("button",{name:"Resolve attack",exact:true}).click();await expect(page.getByText("✓ Assign Ada’s public roll while Bea keeps the turn.",{exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Bea's cards",exact:true})).toBeVisible();await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByTestId("attack-controller")).toBeVisible();await page.getByLabel("Die 1 · rolled 3",{exact:true}).selectOption({label:"Speedrunner (Green)"});await page.getByRole("button",{name:"Resolve attack",exact:true}).click();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByTestId("attack-controller")).toBeVisible();await expect(page.getByLabel("Attack roll",{exact:true})).toHaveText("3");await page.getByLabel("Die 1 · rolled 3",{exact:true}).selectOption({label:"Speedrunner (Green)"});await page.getByRole("button",{name:"Resolve attack",exact:true}).click();await expect(page.getByText("✓ Assign Ada’s public roll while Bea keeps the turn.",{exact:true})).toBeVisible();await expect(page.getByText("Ada: Uplink",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Pawn Speedrunner (Green)",exact:true})).toHaveCount(0);expect(errors).toEqual([]);
});

test("Arms Industry shows and replays its physical held counter, then collects it with the icon at empty reserve",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/play/");await page.getByText("Test Lab and content coverage",{exact:true}).click();await page.getByTestId("scenario-arms-industry").click();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play DJ: Search"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByRole("img",{name:"Bonus counter on Arms Industry",exact:true})).toHaveCount(0);await page.getByLabel("Revealed block placement").selectOption({label:"Edge 0 · rotation 0"});await page.getByRole("button",{name:"Place revealed block",exact:true}).click();await expect(page.getByRole("img",{name:"Bonus counter on Arms Industry",exact:true})).toBeVisible();await expect(page.getByTestId("bonus-pool")).toHaveText("Bonus reserve 0/24 · on board 2 · invested 0");await page.getByRole("button",{name:"Block Arms Industry",exact:true}).click();await expect(page.getByText("1 physical counter held",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Fit board",exact:true}).click();await page.screenshot({path:"../../tmp/arms-industry-held-desktop.png",fullPage:true});
 const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export trace",exact:true}).click();const path=await(await downloading).path();await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Uplink: Move 1"});await page.getByLabel("Next adjacent space",{exact:true}).selectOption(JSON.stringify({coord:{q:1,r:0},spaceId:"hand"}));await page.getByRole("button",{name:"Add step",exact:true}).click();await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByTestId("hand-size-limit")).toContainText("recycling: 4");await page.getByLabel("Action",{exact:true}).selectOption({label:"Play Worm: Icebreak block"});await page.getByRole("button",{name:"Execute selected action",exact:true}).click();await expect(page.getByText("✓ Capture and collect icon then block counter at empty reserve.",{exact:true})).toBeVisible();await expect(page.getByTestId("bonus-pool")).toHaveText("Bonus reserve 0/24 · on board 0 · invested 0");await expect(page.getByRole("img",{name:"Bonus counter on Arms Industry",exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Undo",exact:true}).click();await expect(page.getByRole("img",{name:"Bonus counter on Arms Industry",exact:true})).toBeVisible();await expect(page.locator(".trace-input")).toBeEnabled();await page.locator(".trace-input").setInputFiles(path!);await expect(page.getByTestId("bonus-pool")).toHaveText("Bonus reserve 0/24 · on board 2 · invested 0");await page.getByRole("button",{name:"Block Arms Industry",exact:true}).click();await expect(page.getByText("1 physical counter held",{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
