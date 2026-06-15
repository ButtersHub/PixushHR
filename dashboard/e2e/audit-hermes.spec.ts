import { test, expect } from "@playwright/test";

test("hermes-native actor renders a Hermes badge in the audit log", async ({ page, request }) => {
  // Drive a /side-effect call so the audit has a hermes-native row, then check the UI.
  const ENGINE = "http://localhost:3000";
  const r = await request.post(`${ENGINE}/side-effect`, {
    data: {
      channel: "whatsapp",
      direction: "outbound",
      to: "+972546358808",
      body: "Welcome from Pixush — Maya starts Monday.",
    },
  });
  expect(r.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: /audit log/i }).click();
  await expect(page.locator("text=Hermes").first()).toBeVisible();
  await expect(page.locator("text=Send WhatsApp").first()).toBeVisible();
});

test("simulate-inbound affordance on Live Run returns a runId", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /live run/i }).click();
  await page.getByTestId("simulate-inbound").click();
  await expect(page.getByTestId("simulate-runid")).toBeVisible({ timeout: 5_000 });
});
