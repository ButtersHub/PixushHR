import { test, expect } from "@playwright/test";

test("onboarding flow renders response + audit in the UI", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /trigger/i }).click();
  await expect(page.locator("pre")).toContainText("Maya", { timeout: 15000 });
  await expect(page.getByText("hris.upsert_employee")).toBeVisible();
});
