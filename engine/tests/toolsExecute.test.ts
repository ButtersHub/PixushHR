import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";

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

  it("routes external-hermes tools (gmail.send_email, whatsapp.send_message) into the side-effect path", async () => {
    const store = new InMemoryStore();
    seedFixtures(store);
    // The fixtures don't install gmail/whatsapp connectors; install them so gateToolCall passes.
    store.setConnectorState("papaya", "gmail",    { installed: true, enabled: true, mode: "mock", config: { mock: {}, prod: {} } });
    store.setConnectorState("papaya", "whatsapp", { installed: true, enabled: true, mode: "mock", config: { mock: {}, prod: {} } });
    const app = buildApp({ store, hermes: {} as any });

    const gmailRes = await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "gmail.send_email", args: { tenant: "papaya", to: "maya@cohen.io", subject: "Welcome", body: "Hi Maya" } },
    });
    expect(gmailRes.statusCode).toBe(200);
    expect(gmailRes.json()).toMatchObject({ ok: true, channel: "email" });

    const waRes = await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "whatsapp.send_message", args: { tenant: "papaya", to: "+972546358808", body: "Hi Daniel" } },
    });
    expect(waRes.statusCode).toBe(200);
    expect(waRes.json()).toMatchObject({ ok: true, channel: "whatsapp" });

    // The Messages screen + Audit reflect the sends with the hermes-native actor.
    const msgs = store.getMessages("papaya");
    expect(msgs.find((m) => m.channel === "email" && m.to === "maya@cohen.io")).toBeDefined();
    expect(msgs.find((m) => m.channel === "whatsapp" && m.to === "+972546358808")).toBeDefined();

    const audit = store.getAudit("papaya");
    const emailEntry = audit.find((a) => a.capability === "email.send_message");
    expect(emailEntry?.actor).toBe("hermes-native");
    expect(emailEntry?.integration).toBe("Gmail");
    const waEntry = audit.find((a) => a.capability === "whatsapp.send_message");
    expect(waEntry?.actor).toBe("hermes-native");
    expect(waEntry?.integration).toBe("WhatsApp");
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

describe("/tools/execute gating", () => {
  it("rejects a tool whose role is disabled", async () => {
    const store = new InMemoryStore();
    seedFixtures(store);
    store.setConnectorState("papaya", "shapes", { installed: true, enabled: false, mode: "mock", config: { mock: {}, prod: {} } });
    const app = buildApp({ store, hermes: {} as any });
    const res = await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "hris.upsert_employee", args: { tenant: "papaya", id: "e1", name: "Maya", role: "Eng" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/not enabled/i);
  });

  it("honors a mock failNext flag with an injected error", async () => {
    const store = new InMemoryStore();
    seedFixtures(store);
    store.setConnectorState("papaya", "teams", { installed: true, enabled: true, mode: "mock", config: { mock: { failNext: true }, prod: {} } });
    const app = buildApp({ store, hermes: {} as any });
    const res = await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "channel.send_message", args: { tenant: "papaya", to: "x", role: "employee", channel: "email", body: "hi" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/injected failure/i);
  });
});
