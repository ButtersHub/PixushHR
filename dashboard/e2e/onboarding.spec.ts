import { test, expect } from "@playwright/test";

test("onboarding runs the multi-tool workflow and surfaces it in the UI", async ({ page }) => {
  await page.goto("/");

  // Trigger the onboarding scenario on the Live Run screen.
  await page.getByRole("button", { name: /trigger scenario/i }).first().click();

  // Warm agent response mentions the new hire.
  await expect(page.locator("[data-testid='response-text']")).toContainText("Maya", { timeout: 15000 });

  // The tool-call trace shows a multi-step run across systems.
  const trace = page.locator("[data-testid='trace-list']");
  await expect(trace.getByText("ats.get_contract").first()).toBeVisible();
  await expect(trace.getByText("teams.add_member").first()).toBeVisible();
  await expect(trace.getByText("channel.send_message").first()).toBeVisible();

  // Audit screen shows the multi-tool run.
  await page.getByRole("button", { name: /audit log/i }).click();
  await expect(page.getByText("hris.upsert_employee").first()).toBeVisible();

  // Messages screen shows the warm welcome.
  await page.getByRole("button", { name: /messages/i }).click();
  await expect(page.locator("[data-testid='messages-list']")).toContainText(/welcome/i);
});
