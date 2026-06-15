import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";
import { CONNECTORS } from "../src/integrations.js";

describe("seedFixtures", () => {
  it("seeds a signed contract, manager, department, and branding for papaya", () => {
    const s = new InMemoryStore();
    seedFixtures(s);
    const contract = s.getContract("papaya", "c1");
    expect(contract?.name).toBe("Maya Cohen");
    expect(contract?.signed).toBe(true);
    expect(contract?.managerId).toBe("m1");
    expect(s.getManager("papaya", "m1")?.cannedAnswer).toBeTruthy();
    expect(s.getDepartment("papaya", "d1")?.name).toBe("Engineering");
    expect(s.getBranding("papaya")?.companyStory).toBeTruthy();
  });

  it("accepts a custom tenant", () => {
    const s = new InMemoryStore();
    seedFixtures(s, "acme");
    expect(s.getContract("acme", "c1")?.name).toBe("Maya Cohen");
  });
});

describe("seedFixtures — A10", () => {
  it("seeds explicit connector state for every catalog connector", async () => {
    const { InMemoryStore } = await import("../src/store.js");
    const { seedFixtures } = await import("../src/fixtures.js");
    const s = new InMemoryStore();
    seedFixtures(s);
    for (const c of CONNECTORS) {
      expect(s.getConnectorState("papaya", c.id)).toBeTruthy();
    }
    expect(s.getConnectorState("papaya", "shapes")?.enabled).toBe(true);
    expect(s.getConnectorState("papaya", "slack")?.installed).toBe(false);
  });

  it("seeds the onboarding workflow definition", async () => {
    const { InMemoryStore } = await import("../src/store.js");
    const { seedFixtures } = await import("../src/fixtures.js");
    const s = new InMemoryStore();
    seedFixtures(s);
    expect(s.getWorkflow("papaya", "onboarding")?.root).toBeTruthy();
  });

  it("seeds both onboarding + offboarding workflows", () => {
    const s = new InMemoryStore();
    seedFixtures(s);
    const ids = s.listWorkflows("papaya").map((w) => w.id);
    expect(ids).toContain("onboarding");
    expect(ids).toContain("offboarding");
  });

  it("seeds the hiring manager with a demo phone number", () => {
    const s = new InMemoryStore();
    seedFixtures(s);
    expect(s.getManager("papaya", "m1")?.phone).toBe("+972546358808");
  });
});
