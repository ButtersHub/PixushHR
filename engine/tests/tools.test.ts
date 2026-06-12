import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";
import { executeTool, TOOLS } from "../src/tools.js";

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
