import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { StubHermes } from "../src/stubHermes.js";
import { seedFixtures } from "../src/fixtures.js";

function createApp() {
  const store = new InMemoryStore();
  seedFixtures(store);
  return { store, app: buildApp({ store, hermes: new StubHermes("http://localhost:0") }) };
}

describe("workflow CRUD", () => {
  it("POST /workflows creates a new workflow with a default empty root action", async () => {
    const { store, app } = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/workflows?tenant=papaya",
      payload: { id: "demo-wf", name: "Demo", trigger: { type: "manual", connector: "manual" } },
    });
    expect(res.statusCode).toBe(200);
    const wf = res.json();
    expect(wf.id).toBe("demo-wf");
    expect(wf.root).toBeTruthy();
    expect(wf.nodes[wf.root]).toBeDefined();
    expect(store.getWorkflow("papaya", "demo-wf")?.name).toBe("Demo");
  });

  it("POST /workflows rejects malformed seed (missing trigger.connector)", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/workflows?tenant=papaya",
      payload: { id: "bad", name: "B", trigger: { type: "manual" } },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /workflows 409s on duplicate id", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/workflows?tenant=papaya",
      payload: { id: "onboarding", name: "Dup", trigger: { type: "manual", connector: "manual" } },
    });
    expect(res.statusCode).toBe(409);
  });

  it("DELETE /workflows/:id removes it", async () => {
    const { store, app } = createApp();
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/workflows?tenant=papaya",
      payload: { id: "to-delete", name: "X", trigger: { type: "manual", connector: "manual" } },
    });
    expect(store.getWorkflow("papaya", "to-delete")).toBeDefined();
    const res = await app.inject({ method: "DELETE", url: "/workflows/to-delete?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(store.getWorkflow("papaya", "to-delete")).toBeUndefined();
  });

  it("DELETE /workflows/:id on unknown id returns 404", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({ method: "DELETE", url: "/workflows/nope?tenant=papaya" });
    expect(res.statusCode).toBe(404);
  });
});
