import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";

function app() {
  const store = new InMemoryStore();
  seedFixtures(store);
  return { store, app: buildApp({ store, hermes: {} as any }) };
}

describe("/workflows + /capabilities", () => {
  it("GET /workflows lists the seeded onboarding workflow", async () => {
    const res = await app().app.inject({ method: "GET", url: "/workflows?tenant=papaya" });
    expect(res.json().map((w: any) => w.id)).toContain("onboarding");
    expect(res.json().map((w: any) => w.id)).toContain("offboarding");
  });

  it("GET /workflows/:id returns the full node-graph", async () => {
    const res = await app().app.inject({ method: "GET", url: "/workflows/onboarding?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(res.json().root).toBeTruthy();
    expect(Object.keys(res.json().nodes).length).toBeGreaterThan(0);
  });

  it("PUT /workflows/:id replaces the stored definition", async () => {
    const { store, app: a } = app();
    const def = { id: "onboarding", name: "Onboarding v2", version: 2, trigger: { type: "onboard", connector: "comeet" }, root: "x1", nodes: { x1: { id: "x1", kind: "action", capability: "hris.upsert_employee", input: {} } } };
    const res = await a.inject({ method: "PUT", url: "/workflows/onboarding?tenant=papaya", payload: def });
    expect(res.statusCode).toBe(200);
    expect(store.getWorkflow("papaya", "onboarding")?.name).toBe("Onboarding v2");
  });

  it("PUT rejects a malformed definition", async () => {
    const res = await app().app.inject({ method: "PUT", url: "/workflows/onboarding?tenant=papaya", payload: { id: "onboarding" } });
    expect(res.statusCode).toBe(400);
  });

  it("PUT rejects a trigger without connector", async () => {
    const { app: a } = app();
    const def = { id: "onboarding", name: "X", version: 1, trigger: { type: "onboard" }, root: "n1", nodes: { n1: { id: "n1", kind: "action", capability: "hris.upsert_employee", input: {} } } };
    const res = await a.inject({ method: "PUT", url: "/workflows/onboarding?tenant=papaya", payload: def });
    expect(res.statusCode).toBe(400);
  });

  it("PUT accepts a trigger with type + connector + optional sample", async () => {
    const { store, app: a } = app();
    const def = { id: "onboarding", name: "X", version: 1, trigger: { type: "candidate.hired", connector: "comeet", sample: { candidateId: "c1" } }, root: "n1", nodes: { n1: { id: "n1", kind: "action", capability: "hris.upsert_employee", input: {} } } };
    const res = await a.inject({ method: "PUT", url: "/workflows/onboarding?tenant=papaya", payload: def });
    expect(res.statusCode).toBe(200);
    expect(store.getWorkflow("papaya", "onboarding")?.trigger.connector).toBe("comeet");
    expect((store.getWorkflow("papaya", "onboarding")?.trigger.sample as any)?.candidateId).toBe("c1");
  });

  it("GET /capabilities returns specs with fields", async () => {
    const res = await app().app.inject({ method: "GET", url: "/capabilities" });
    const upsert = res.json().find((c: any) => c.name === "hris.upsert_employee");
    expect(upsert.fields.some((f: any) => f.name === "name" && f.required)).toBe(true);
  });
});
