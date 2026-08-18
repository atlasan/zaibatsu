import { expect, test } from "@playwright/test";

test("block editor fits the source, projects HexVision geometry, and keeps zone actions stable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator('[data-asset="sp-en-blocks-a4-p01-c01"]').click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("button", { name: "Prefill 7 zones" }).click();
  await expect(page.locator(".zone-space")).toHaveCount(7);
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
