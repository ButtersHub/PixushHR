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

describe("mock integration tools", () => {
  async function seeded() {
    const { InMemoryStore } = await import("../src/store.js");
    const { seedFixtures } = await import("../src/fixtures.js");
    const { executeTool } = await import("../src/tools.js");
    const store = new InMemoryStore();
    seedFixtures(store);
    return { store, executeTool };
  }

  it("hiring_manager.ask returns the manager's canned answer", async () => {
    const { store, executeTool } = await seeded();
    const res = await executeTool(store, "hiring_manager.ask", { tenant: "papaya", managerId: "m1", question: "Which team?" });
    expect((res.answer as string)).toContain("Payments");
    expect(store.getAudit("papaya").some((e) => e.capability === "hiring_manager.ask")).toBe(true);
  });

  it("teams.add_member records membership", async () => {
    const { store, executeTool } = await seeded();
    await executeTool(store, "teams.add_member", { tenant: "papaya", employeeId: "e1", teams: ["Payments"] });
    expect(store.getMemberships("papaya")[0].teams).toEqual(["Payments"]);
  });

  it("calendar.create_invite records an invite with no sensitive fields", async () => {
    const { store, executeTool } = await seeded();
    const res = await executeTool(store, "calendar.create_invite", {
      tenant: "papaya", title: "Welcome Maya", date: "2026-07-01", attendees: ["e1", "m1"], location: "Tel Aviv HQ",
    });
    expect(res.ok).toBe(true);
    expect(store.getInvites("papaya")).toHaveLength(1);
    expect(store.getInvites("papaya")[0]).not.toHaveProperty("reason");
  });

  it("content.get_branding returns the branding pack", async () => {
    const { store, executeTool } = await seeded();
    const res = await executeTool(store, "content.get_branding", { tenant: "papaya" });
    expect((res.branding as { companyStory: string }).companyStory).toBeTruthy();
  });

  it("channel.send_message records a message", async () => {
    const { store, executeTool } = await seeded();
    await executeTool(store, "channel.send_message", {
      tenant: "papaya", to: "Maya Cohen", role: "employee", channel: "email", body: "Welcome to Papaya, Maya!",
    });
    const msgs = store.getMessages("papaya");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("Welcome");
    expect(store.getAudit("papaya").some((e) => e.capability === "channel.send_message")).toBe(true);
  });

  it("channel.send_message rejects an unknown channel", async () => {
    const { store, executeTool } = await seeded();
    await expect(executeTool(store, "channel.send_message", {
      tenant: "papaya", to: "x", role: "employee", channel: "carrier-pigeon", body: "hi",
    })).rejects.toThrow(/missing required fields/i);
  });
});
