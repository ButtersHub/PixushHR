import { test, expect } from "@playwright/test";

test("integrations catalog renders connectors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /integrations/i }).click();
  await expect(page.locator("[data-testid='catalog']")).toBeVisible();
  await expect(page.getByText("Slack").first()).toBeVisible();
  await expect(page.getByText("Shapes").first()).toBeVisible();
});

test("workflow editor renders the onboarding graph", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /workflow editor/i }).click();
  const canvas = page.locator("[data-testid='workflow-canvas']");
  await expect(canvas).toBeVisible();
  // V2 cards show the friendly label, not the tool id.
  await expect(canvas.getByText("Get signed contract")).toBeVisible();
  await expect(canvas.getByText("Send message")).toBeVisible();
});
