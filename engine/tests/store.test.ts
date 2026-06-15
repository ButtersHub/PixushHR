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

  it("records audit entries with id, ts, actor, and status", () => {
    const store = new InMemoryStore();
    store.audit({
      tenant: "papaya", capability: "hris.upsert_employee", target: "e1", summary: "created",
      actor: "pixush", status: "success",
    });
    const log = store.getAudit("papaya");
    expect(log).toHaveLength(1);
    expect(log[0].capability).toBe("hris.upsert_employee");
    expect(log[0].actor).toBe("pixush");
    expect(log[0].status).toBe("success");
    expect(typeof log[0].ts).toBe("string");
    expect(typeof log[0].id).toBe("string");
  });
});

describe("store — A10 connector state + workflows", () => {
  it("stores and reads connector state tenant-scoped", () => {
    const s = new InMemoryStore();
    s.setConnectorState("papaya", "slack", { installed: true, enabled: true, mode: "mock", config: { mock: {}, prod: {} } });
    expect(s.getConnectorState("papaya", "slack")?.installed).toBe(true);
    expect(s.getConnectorState("acme", "slack")).toBeUndefined();
  });

  it("stores and reads a workflow definition", () => {
    const s = new InMemoryStore();
    const def = { id: "wf1", name: "Test", version: 1, trigger: { type: "manual", connector: "manual" }, root: "n1", nodes: {} };
    s.setWorkflow("papaya", def as any);
    expect(s.getWorkflow("papaya", "wf1")?.name).toBe("Test");
    expect(s.listWorkflows("papaya").map((w) => w.id)).toEqual(["wf1"]);
  });

  it("reset clears connector state and workflows", () => {
    const s = new InMemoryStore();
    s.setConnectorState("papaya", "slack", { installed: true, enabled: true, mode: "mock", config: { mock: {}, prod: {} } });
    s.setWorkflow("papaya", { id: "wf1", name: "T", version: 1, trigger: { type: "manual", connector: "manual" }, root: "n1", nodes: {} } as any);
    s.reset();
    expect(s.getConnectorState("papaya", "slack")).toBeUndefined();
    expect(s.listWorkflows("papaya")).toHaveLength(0);
  });

  describe("runs", () => {
    it("addRun + getRun roundtrip with startedAt stamped", () => {
      const s = new InMemoryStore();
      const run = s.addRun({ tenant: "papaya", runId: "r1", workflowId: "onboarding", status: "running" });
      expect(run.startedAt).toBeTypeOf("number");
      expect(s.getRun("r1")?.status).toBe("running");
      expect(s.getRun("r1")?.workflowId).toBe("onboarding");
    });

    it("updateRun transitions running → done and stamps endedAt", () => {
      const s = new InMemoryStore();
      s.addRun({ tenant: "papaya", runId: "r1", workflowId: "x", status: "running" });
      s.updateRun("r1", { status: "done", response: "All set." });
      const run = s.getRun("r1")!;
      expect(run.status).toBe("done");
      expect(run.response).toBe("All set.");
      expect(run.endedAt).toBeTypeOf("number");
    });

    it("updateRun on running stays running with no endedAt", () => {
      const s = new InMemoryStore();
      s.addRun({ tenant: "papaya", runId: "r1", workflowId: "x", status: "running" });
      s.updateRun("r1", { status: "running" });
      expect(s.getRun("r1")?.endedAt).toBeUndefined();
    });

    it("updateRun on unknown runId is a no-op", () => {
      const s = new InMemoryStore();
      expect(() => s.updateRun("does-not-exist", { status: "done" })).not.toThrow();
    });

    it("reset() clears runs", () => {
      const s = new InMemoryStore();
      s.addRun({ tenant: "papaya", runId: "r1", workflowId: "x", status: "running" });
      s.reset();
      expect(s.getRun("r1")).toBeUndefined();
    });
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
