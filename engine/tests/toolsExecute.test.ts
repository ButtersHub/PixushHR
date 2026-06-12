import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";

function appWithStore() {
  const store = new InMemoryStore();
  return { app: buildApp({ store, hermes: {} as any }), store };
}

describe("/tools/execute", () => {
  it("runs a domain tool and returns its result", async () => {
    const { app } = appWithStore();
    const res = await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "hris.upsert_employee", args: { tenant: "papaya", id: "e1", name: "Maya", role: "Eng" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("returns 400 for unknown tools", async () => {
    const { app } = appWithStore();
    const res = await app.inject({ method: "POST", url: "/tools/execute", payload: { name: "nope", args: {} } });
    expect(res.statusCode).toBe(400);
  });

  it("GET /audit returns the tenant audit log", async () => {
    const { app } = appWithStore();
    await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "hris.upsert_employee", args: { tenant: "papaya", id: "e1", name: "Maya", role: "Eng" } },
    });
    const res = await app.inject({ method: "GET", url: "/audit?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});
