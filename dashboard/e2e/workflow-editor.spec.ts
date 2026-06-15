import { test, expect } from "@playwright/test";

test.describe("Workflow editor (rebuilt — V2 cards + schema-tree inspector + Test Flow drawer)", () => {
  test("picker shows both seeded workflows and switching loads the canvas", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /workflow editor/i }).click();
    await expect(page.getByTestId("workflow-editor")).toBeVisible();
    await expect(page.getByTestId("workflow-picker")).toBeVisible();
    await expect(page.getByTestId("picker-onboarding")).toBeVisible();
    await expect(page.getByTestId("picker-offboarding")).toBeVisible();

    // Onboarding is selected by default — trigger + at least one action card.
    await expect(page.getByTestId("trigger-card")).toBeVisible();
    await expect(page.getByTestId("action-card-1")).toBeVisible();

    // Switch to offboarding — trigger card updates.
    await page.getByTestId("picker-offboarding").click();
    await expect(page.getByTestId("trigger-card")).toContainText(/employee.terminated/);
  });

  test("clicking the trigger card → inspector shows the connector dropdown", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /workflow editor/i }).click();
    await page.getByTestId("trigger-card").click();
    const inspector = page.getByTestId("inspector");
    await expect(inspector).toContainText(/connector/i);
    await expect(inspector).toContainText(/comeet/i);
    await expect(page.getByTestId("trigger-sample")).toContainText(/candidateId/);
  });

  test("clicking an action card → inspector shows the schema tree", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /workflow editor/i }).click();
    await page.getByTestId("action-card-1").click();
    const inspector = page.getByTestId("inspector");
    // ats.get_contract input: tenant + candidateId
    await expect(inspector).toContainText(/candidateId/);
    await expect(inspector).toContainText(/Inputs/i);
    await expect(inspector).toContainText(/Output/i);
  });

  test("clicking Test flow opens the drawer + streams audit rows", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /workflow editor/i }).click();
    await page.getByTestId("test-flow-button").click();
    await expect(page.getByTestId("test-flow-drawer")).toBeVisible();
    // The stub Hermes will fire several tool calls; wait for the first row.
    await expect(page.getByTestId("test-row-0")).toBeVisible({ timeout: 10_000 });
  });
});
