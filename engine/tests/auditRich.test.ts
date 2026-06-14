import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";

function app() {
  const store = new InMemoryStore();
  seedFixtures(store);
  return { store, app: buildApp({ store, hermes: {} as any }) };
}

describe("audit — enriched shape", () => {
  it("/tools/execute populates label, integration, actor, status, runId, durationMs, inputs, outputs", async () => {
    const { store, app: a } = app();
    const res = await a.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "hris.upsert_employee", runId: "RUN-123", args: { tenant: "papaya", id: "e1", name: "Maya", role: "Engineer" } },
    });
    expect(res.statusCode).toBe(200);

    const log = store.getAudit("papaya");
    const entry = log.find((e) => e.capability === "hris.upsert_employee");
    expect(entry).toBeTruthy();
    expect(entry!.label).toBe("Update employee record");
    expect(entry!.integration).toBe("HRIS");
    expect(entry!.actor).toBe("pixush");
    expect(entry!.status).toBe("success");
    expect(entry!.runId).toBe("RUN-123");
    expect(typeof entry!.durationMs).toBe("number");
    expect((entry!.inputs as any).name).toBe("Maya");
    expect((entry!.outputs as any).ok).toBe(true);
    expect(entry!.target).toBe("Maya");
    expect(entry!.summary).toMatch(/Upserted employee Maya/);
  });

  it("records an error status when a tool throws", async () => {
    const { store, app: a } = app();
    const res = await a.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "ats.get_contract", args: { tenant: "papaya", candidateId: "does-not-exist" } },
    });
    expect(res.statusCode).toBe(400);

    const entry = store.getAudit("papaya").find((e) => e.capability === "ats.get_contract");
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe("error");
    expect((entry!.outputs as any).error).toMatch(/no contract/i);
  });

  it("user actions on /integrations are audited with actor='user'", async () => {
    const { store, app: a } = app();
    await a.inject({ method: "POST", url: "/integrations/slack/install" });
    await a.inject({ method: "POST", url: "/integrations/slack/enable", payload: { enabled: false } });
    const userActions = store.getAudit("papaya").filter((e) => e.actor === "user");
    expect(userActions.map((e) => e.capability)).toContain("integrations.install");
    expect(userActions.map((e) => e.capability)).toContain("integrations.disable");
    const slackInstall = userActions.find((e) => e.capability === "integrations.install");
    expect(slackInstall!.target).toBe("Slack");
    expect(slackInstall!.integration).toBe("Channels");
  });

  it("/reset is audited as actor='system'", async () => {
    const { store, app: a } = app();
    await a.inject({ method: "POST", url: "/reset", payload: {} });
    const systemActions = store.getAudit("papaya").filter((e) => e.actor === "system");
    expect(systemActions.length).toBeGreaterThanOrEqual(1);
    expect(systemActions[0].capability).toBe("system.reset");
  });

  it("/execute (with stub Hermes) groups tool calls by a single runId", async () => {
    const { StubHermes } = await import("../src/stubHermes.js");
    const PORT = 4101;
    const store = new InMemoryStore();
    seedFixtures(store);
    const a = buildApp({ store, hermes: new StubHermes(`http://127.0.0.1:${PORT}`) });
    await a.listen({ port: PORT, host: "127.0.0.1" });
    try {
      await fetch(`http://127.0.0.1:${PORT}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "Onboard Maya Cohen", context: { tenant: "papaya" } }),
      });
      const log = store.getAudit("papaya");
      const runIds = new Set(log.filter((e) => e.actor === "pixush" && e.runId).map((e) => e.runId));
      expect(runIds.size).toBe(1); // exactly one run id for this execution
      const pixushActions = log.filter((e) => e.actor === "pixush");
      expect(pixushActions.length).toBeGreaterThanOrEqual(6);
      // every action of this run should share the runId
      expect(pixushActions.every((e) => e.runId === [...runIds][0])).toBe(true);
    } finally {
      await a.close();
    }
  });

  it("/tools/execute inherits the in-flight runId when the caller didn't forward one (real Hermes case)", async () => {
    // Simulates the real Hermes hris-tool skill: it makes a fresh HTTP POST to /tools/execute
    // without forwarding `runId`. The engine should still attribute the call to the active run.
    const PORT = 4102;
    const store = new InMemoryStore();
    seedFixtures(store);

    // A "naive" hermes stub that calls /tools/execute WITHOUT runId
    class NaiveHermes {
      constructor(private engineUrl: string) {}
      async chat() {
        await fetch(`${this.engineUrl}/tools/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "ats.get_contract",
            args: { tenant: "papaya", candidateId: "c1" },
            // intentionally NO runId
          }),
        });
        return { content: "ok" };
      }
    }

    const a = buildApp({ store, hermes: new NaiveHermes(`http://127.0.0.1:${PORT}`) as any });
    await a.listen({ port: PORT, host: "127.0.0.1" });
    try {
      await fetch(`http://127.0.0.1:${PORT}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "Onboard Maya Cohen", context: { tenant: "papaya" } }),
      });
      const log = store.getAudit("papaya");
      const trigger = log.find((e) => e.actor === "trigger");
      const action = log.find((e) => e.actor === "pixush" && e.capability === "ats.get_contract");
      expect(trigger).toBeTruthy();
      expect(action).toBeTruthy();
      // even though the naive caller didn't forward runId, the engine attributed it to the run
      expect(action!.runId).toBe(trigger!.runId);
    } finally {
      await a.close();
    }
  });

  it("popActiveRun clears the run after /execute completes so a stray /tools/execute does NOT inherit", async () => {
    const PORT = 4103;
    const store = new InMemoryStore();
    seedFixtures(store);
    class NoopHermes {
      async chat() { return { content: "ok" }; }
    }
    const a = buildApp({ store, hermes: new NoopHermes() as any });
    await a.listen({ port: PORT, host: "127.0.0.1" });
    try {
      // run completes; activeRuns should be empty
      await fetch(`http://127.0.0.1:${PORT}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "first run", context: { tenant: "papaya" } }),
      });
      // a stray tool call AFTER the run finished should NOT inherit the prior runId
      await fetch(`http://127.0.0.1:${PORT}/tools/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ats.get_contract", args: { tenant: "papaya", candidateId: "c1" } }),
      });
      const log = store.getAudit("papaya");
      const stray = log.find((e) => e.actor === "pixush" && e.capability === "ats.get_contract");
      expect(stray!.runId).toBeUndefined();
    } finally {
      await a.close();
    }
  });
});
