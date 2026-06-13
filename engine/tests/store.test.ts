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

describe("store — phase A domain", () => {
  it("stores and reads a contract", () => {
    const s = new InMemoryStore();
    s.addContract("papaya", {
      candidateId: "c1", name: "Maya Cohen", role: "Engineer", startDate: "2026-07-01",
      department: "Engineering", managerId: "m1", employmentType: "Full-time", signed: true,
    });
    expect(s.getContract("papaya", "c1")?.name).toBe("Maya Cohen");
  });

  it("stores and reads a manager and branding", () => {
    const s = new InMemoryStore();
    s.addManager("papaya", { id: "m1", name: "Daniel Levi", department: "Engineering", cannedAnswer: "Payments squad." });
    s.setBranding("papaya", { companyStory: "story", cultureVideoUrl: "url", welcomeNote: "note" });
    expect(s.getManager("papaya", "m1")?.cannedAnswer).toContain("Payments");
    expect(s.getBranding("papaya")?.companyStory).toBe("story");
  });

  it("appends messages and returns them tenant-scoped with ids", () => {
    const s = new InMemoryStore();
    const m = s.addMessage({ tenant: "papaya", from: "agent", to: "Maya Cohen", role: "employee", channel: "email", body: "Welcome" });
    expect(m.id).toBeTruthy();
    expect(m.ts).toBeTruthy();
    expect(s.getMessages("papaya")).toHaveLength(1);
    expect(s.getMessages("acme")).toHaveLength(0);
  });

  it("records invites and memberships", () => {
    const s = new InMemoryStore();
    const inv = s.addInvite("papaya", { title: "Welcome", date: "2026-07-01", attendees: ["e1"], location: "HQ" });
    expect(inv.id).toBeTruthy();
    s.addMembership({ tenant: "papaya", employeeId: "e1", teams: ["Payments"] });
    expect(s.getMemberships("papaya")[0].teams).toEqual(["Payments"]);
  });

  it("reset clears all collections", () => {
    const s = new InMemoryStore();
    s.upsertEmployee("papaya", { id: "e1", name: "X", role: "Eng" });
    s.addMessage({ tenant: "papaya", from: "agent", to: "X", role: "employee", channel: "email", body: "hi" });
    s.reset();
    expect(s.getEmployee("papaya", "e1")).toBeUndefined();
    expect(s.getMessages("papaya")).toHaveLength(0);
  });
});
