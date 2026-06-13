import { test, expect } from "@playwright/test";

test("onboarding flow renders response + audit in the UI", async ({ page }) => {
  await page.goto("/");
  // Click the primary "Trigger scenario" button in the Live Run screen
  await page.getByRole("button", { name: /trigger scenario/i }).first().click();
  // Wait for the agent response to contain "Maya"
  await expect(page.locator("[data-testid='response-text']")).toContainText("Maya", { timeout: 15000 });
  // Audit table should show the hris.upsert_employee capability
  await expect(page.getByText("hris.upsert_employee").first()).toBeVisible();
});
