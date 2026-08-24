import { expect, test } from "@playwright/test";

test("block editor fits the source, projects HexVision geometry, and keeps zone actions stable", async ({ page }) => {
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
  expect(outerPoints).toContain("99.");
  expect(outerPoints).not.toContain("93,25");
  await expect(page.getByText("Legacy category:")).toBeVisible();
});

test("bulk HexVision action reports existing draft skips", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("button", { name: "Apply HexVision to all" }).click();
  await expect(page.locator(".status")).toContainText("existing drafts skipped");
});

test("action-card Vision stays review-only until an author accepts a field", async ({ page }) => {
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
