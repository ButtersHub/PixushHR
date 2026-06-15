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

describe("GET /triggers", () => {
  it("returns triggers from installed+enabled connectors", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/triggers?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    const triggers = res.json();
    expect(Array.isArray(triggers)).toBe(true);
    const candidateHired = triggers.find((t: any) => t.name === "candidate.hired");
    expect(candidateHired).toBeDefined();
    expect(candidateHired.connector).toBe("comeet");
    expect(candidateHired.label).toBe("Candidate hired");
  });

  it("excludes triggers from disabled connectors", async () => {
    const { store, app } = createApp();
    await app.ready();
    await app.inject({
      method: "POST",
      url: "/integrations/comeet/enable",
      payload: { enabled: false },
    });
    const res = await app.inject({ method: "GET", url: "/triggers?tenant=papaya" });
    const triggers = res.json();
    expect(triggers.find((t: any) => t.connector === "comeet")).toBeUndefined();
    // Triggers from other enabled connectors still surface
    expect(triggers.length).toBeGreaterThan(0);
  });

  it("each trigger carries connector + name + label", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/triggers?tenant=papaya" });
    const triggers = res.json();
    for (const t of triggers) {
      expect(t.connector).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
  });
});
