import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";
import { executeTool, TOOLS, toolCatalog } from "../src/tools.js";

describe("tools", () => {
  it("hris.upsert_employee writes the employee and an audit entry", async () => {
    const store = new InMemoryStore();
    const result = await executeTool(store, "hris.upsert_employee", {
      tenant: "papaya",
      id: "e1",
      name: "Maya Cohen",
      role: "Engineer",
      startDate: "2026-07-01",
    });
    expect(result.ok).toBe(true);
    expect(store.getEmployee("papaya", "e1")?.name).toBe("Maya Cohen");
    expect(store.getAudit("papaya")[0].capability).toBe("hris.upsert_employee");
  });

  it("rejects unknown tools", async () => {
    const store = new InMemoryStore();
    await expect(executeTool(store, "nope", {})).rejects.toThrow(/unknown tool/i);
  });

  it("rejects missing required fields", async () => {
    const store = new InMemoryStore();
    await expect(
      executeTool(store, "hris.upsert_employee", { tenant: "papaya", id: "e1" }),
    ).rejects.toThrow(/required/i);
  });

  it("exposes a tool catalog", () => {
    expect(TOOLS["hris.upsert_employee"]).toBeDefined();
  });
});

describe("tool registry", () => {
  it("toolCatalog exposes name/integration/purpose for each tool", () => {
    const cat = toolCatalog();
    const upsert = cat.find((t) => t.name === "hris.upsert_employee");
    expect(upsert?.integration).toBe("HRIS");
    expect(upsert?.purpose).toBeTruthy();
  });

  it("ats.get_contract returns the seeded contract and audits", async () => {
    const { InMemoryStore } = await import("../src/store.js");
    const { seedFixtures } = await import("../src/fixtures.js");
    const { executeTool } = await import("../src/tools.js");
    const store = new InMemoryStore();
    seedFixtures(store);
    const res = await executeTool(store, "ats.get_contract", { tenant: "papaya", candidateId: "c1" });
    expect(res.ok).toBe(true);
    expect((res.contract as { name: string }).name).toBe("Maya Cohen");
    expect(store.getAudit("papaya").some((e) => e.capability === "ats.get_contract")).toBe(true);
  });

  it("ats.get_contract throws for an unknown candidate", async () => {
    const { InMemoryStore } = await import("../src/store.js");
    const { executeTool } = await import("../src/tools.js");
    await expect(executeTool(new InMemoryStore(), "ats.get_contract", { tenant: "papaya", candidateId: "nope" }))
      .rejects.toThrow(/contract/i);
  });
});
