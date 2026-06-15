import { test, expect } from "@playwright/test";

test.describe("Integrations schema side panel", () => {
  test("clicking an action shows its input/output schema", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /integrations/i }).click();
    await page.getByTestId("tab-installed").click();

    // Default master is Shapes (first seeded installed) — use its wired hris.upsert_employee.
    await page.getByTestId("subtab-actions").click();
    await page.getByTestId("integration-action-hris.upsert_employee").click();

    const panel = page.getByTestId("schema-side-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/hris\.upsert_employee/);
    // Input schema field
    await expect(panel).toContainText(/name/);
    // Output schema field
    await expect(panel).toContainText(/employee/);
  });

  test("clicking a trigger shows the trigger side panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /integrations/i }).click();
    await page.getByTestId("tab-installed").click();
    await page.getByTestId("subtab-triggers").click();

    // Shapes triggers include employee.created.
    await page.getByTestId("integration-trigger-employee.created").click();

    const panel = page.getByTestId("trigger-side-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/employee\.created/);
  });
});
