import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { StubHermes } from "../src/stubHermes.js";
import { seedFixtures } from "../src/fixtures.js";

function createApp() {
  const store = new InMemoryStore();
  seedFixtures(store);
  const port = 0; // not actually bound — StubHermes's HTTP calls will fail, but the run still completes
  return { store, app: buildApp({ store, hermes: new StubHermes(`http://localhost:${port}`) }) };
}

async function waitForDone(app: any, runId: string, attempts = 60): Promise<any> {
  for (let i = 0; i < attempts; i++) {
    const res = await app.inject({ method: "GET", url: `/runs/${runId}` });
    const run = res.json();
    if (run.status === "done" || run.status === "error") return run;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("run did not finish in time");
}

describe("async workflow test runs", () => {
  it("POST /workflows/:id/test returns a runId immediately", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/workflows/onboarding/test?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("POST /workflows/:id/test for an unknown workflow returns 404", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/workflows/does-not-exist/test?tenant=papaya" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /runs/:id transitions running → done (or error) for a started test run", async () => {
    const { app } = createApp();
    await app.ready();
    const { runId } = (await app.inject({ method: "POST", url: "/workflows/onboarding/test?tenant=papaya" })).json();
    const done = await waitForDone(app, runId);
    expect(["done", "error"]).toContain(done.status);
    expect(done.endedAt).toBeTypeOf("number");
  });

  it("GET /runs/:id 404s for an unknown runId", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/runs/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /audit?runId= filters to one run's entries", async () => {
    const { app } = createApp();
    await app.ready();
    const { runId } = (await app.inject({ method: "POST", url: "/workflows/onboarding/test?tenant=papaya" })).json();
    await waitForDone(app, runId);
    const res = await app.inject({ method: "GET", url: `/audit?tenant=papaya&runId=${runId}` });
    expect(res.statusCode).toBe(200);
    const entries = res.json();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.runId).toBe(runId);
  });
});
