import { expect, test } from "@playwright/test";

async function standardSession(page: import("@playwright/test").Page) {
  await page.goto("/play/");
  await page.getByLabel("Player names (2–4, comma-separated)").fill("Ada, Bea");
  await page.getByLabel("Explicit seed").fill("5");
  await page.getByTestId("create-standard-session").click();
}

test("standard play shows named players and supports Search, movement, and undo", async ({ page }) => {
  await standardSession(page);
  await expect(page.getByText("Active player: Ada")).toBeVisible();
  await page.getByRole("button", { name: "Start action phase" }).click();
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
  await page.getByTestId("scenario-attachments").click();
  await expect(page.getByRole("heading", { name: "Attachments" })).toBeVisible();
  await expect(page.getByText("Fixture checkpoints")).toBeVisible();
  await page.getByLabel("Action").selectOption({ label: "Attach Accelerator to pawn" });
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByText("✓ Attach Accelerator to your Red Speedrunner.")).toBeVisible();
});

test("game basics fixture exposes marker placement and winner feedback", async ({ page }) => {
  await page.goto("/play/");
  await page.getByTestId("scenario-game-basics").click();
  await expect(page.getByRole("heading", { name: "Game basics" })).toBeVisible();
  await page.getByLabel("Action").selectOption({ label: "Place a control marker" });
  await page.getByRole("button", { name: "Execute selected action" }).click();
  await expect(page.getByText("wins.")).toBeVisible();
});

test("fixture traces report an actionable checksum failure", async ({ page }) => {
  await page.goto("/play/");
  await page.getByTestId("scenario-reboot-and-turn").click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad-trace.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "zaibatsu-speedrunners-trace/v1", setup: { playerNames: ["Ada", "Bea"], seed: 5 }, dataChecksum: "wrong", commands: [] })),
  });
  await expect(page.getByText("Trace data checksum does not match local Speedrunners data")).toBeVisible();
});

test("mobile setup and Test Lab remain keyboard-operable without page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play/");
  await page.getByTestId("scenario-search-and-move").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Fixture checkpoints")).toBeVisible();
  expect(errors).toEqual([]);
});
