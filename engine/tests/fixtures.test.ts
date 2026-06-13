import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";

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
