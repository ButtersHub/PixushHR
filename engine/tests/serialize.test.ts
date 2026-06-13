import { describe, it, expect } from "vitest";
import { onboardingWorkflow } from "../src/workflows/onboarding.js";
import { serializePlaybook } from "../src/workflows/serialize.js";
import { toolCatalog } from "../src/tools.js";

describe("onboardingWorkflow definition", () => {
  it("is a linear ordered sequence of capabilities", () => {
    expect(onboardingWorkflow.id).toBe("onboarding");
    const caps = onboardingWorkflow.steps.map((s) => s.capability);
    expect(caps).toEqual([
      "ats.get_contract",
      "hiring_manager.ask",
      "hris.upsert_employee",
      "teams.add_member",
      "calendar.create_invite",
      "content.get_branding",
      "channel.send_message",
    ]);
  });

  it("each step carries an intent and audience", () => {
    for (const step of onboardingWorkflow.steps) {
      expect(step.intent.length).toBeGreaterThan(0);
      expect(["employee", "manager", "hr", "team"]).toContain(step.audience);
    }
  });
});

describe("serializePlaybook", () => {
  it("renders numbered steps, every capability, and the tool catalog", () => {
    const out = serializePlaybook(onboardingWorkflow, toolCatalog());
    expect(out).toMatch(/PLAYBOOK/i);
    for (const step of onboardingWorkflow.steps) {
      expect(out).toContain(step.capability);
    }
    expect(out).toContain("1.");
    expect(out).toContain("Retrieve the signed contract");
    expect(out).toMatch(/\{name, args\}/);
  });
});
