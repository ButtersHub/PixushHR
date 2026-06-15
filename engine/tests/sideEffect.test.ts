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

describe("POST /side-effect", () => {
  it("records an outbound email — Message + audit entry", async () => {
    const { store, app } = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: {
        channel: "email",
        direction: "outbound",
        to: "maya@cohen.io",
        subject: "Welcome to Papaya",
        body: "Hi Maya — welcome aboard!",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    const msgs = store.getMessages("papaya");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].channel).toBe("email");
    expect(msgs[0].to).toBe("maya@cohen.io");

    const audit = store.getAudit("papaya");
    const entry = audit.find((a) => a.capability === "email.send_message");
    expect(entry).toBeDefined();
    expect(entry!.actor).toBe("hermes-native");
    expect(entry!.integration).toBe("Gmail");
  });

  it("records an outbound whatsapp message", async () => {
    const { store, app } = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: {
        channel: "whatsapp",
        direction: "outbound",
        to: "+972546358808",
        body: "Maya starts Monday — full details inside.",
      },
    });
    expect(res.statusCode).toBe(200);
    const audit = store.getAudit("papaya");
    const entry = audit.find((a) => a.capability === "whatsapp.send_message");
    expect(entry).toBeDefined();
    expect(entry!.integration).toBe("WhatsApp");
    expect(entry!.actor).toBe("hermes-native");
  });

  it("records an inbound whatsapp message", async () => {
    const { store, app } = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: {
        channel: "whatsapp",
        direction: "inbound",
        from: "+972546358808",
        body: "When does Maya start?",
      },
    });
    expect(res.statusCode).toBe(200);
    const audit = store.getAudit("papaya");
    const entry = audit.find((a) => a.capability === "whatsapp.message_received");
    expect(entry).toBeDefined();
    expect(entry!.integration).toBe("WhatsApp");
  });

  it("inherits runId from the active run when not provided", async () => {
    const { store, app } = createApp();
    await app.ready();
    store.pushActiveRun("papaya", "run-abc");
    await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: { channel: "email", direction: "outbound", to: "x@y", subject: "S", body: "B" },
    });
    const audit = store.getAudit("papaya");
    expect(audit.at(-1)!.runId).toBe("run-abc");
    store.popActiveRun("papaya", "run-abc");
  });

  it("rejects a malformed payload", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/side-effect", payload: { channel: "telegram", direction: "outbound", body: "x" } });
    expect(res.statusCode).toBe(400);
  });

  it("explicit runId overrides the active-run fallback", async () => {
    const { store, app } = createApp();
    await app.ready();
    store.pushActiveRun("papaya", "run-abc");
    await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: { channel: "email", direction: "outbound", to: "x@y", subject: "S", body: "B", runId: "run-xyz" },
    });
    expect(store.getAudit("papaya").at(-1)!.runId).toBe("run-xyz");
    store.popActiveRun("papaya", "run-abc");
  });
});
