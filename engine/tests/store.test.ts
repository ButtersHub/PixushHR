import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";

describe("InMemoryStore", () => {
  it("upserts and reads an employee by tenant+id", () => {
    const store = new InMemoryStore();
    store.upsertEmployee("papaya", { id: "e1", name: "Maya", role: "Engineer" });
    expect(store.getEmployee("papaya", "e1")?.name).toBe("Maya");
  });

  it("isolates by tenant", () => {
    const store = new InMemoryStore();
    store.upsertEmployee("papaya", { id: "e1", name: "Maya", role: "Engineer" });
    expect(store.getEmployee("acme", "e1")).toBeUndefined();
  });

  it("records audit entries", () => {
    const store = new InMemoryStore();
    store.audit({ tenant: "papaya", capability: "hris.upsert_employee", target: "e1", summary: "created" });
    const log = store.getAudit("papaya");
    expect(log).toHaveLength(1);
    expect(log[0].capability).toBe("hris.upsert_employee");
    expect(typeof log[0].ts).toBe("string");
  });
});
