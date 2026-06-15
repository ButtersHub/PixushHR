import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import type { HermesClient, ChatMessage, ChatOpts, ChatResult } from "../src/hermes.js";
import { seedFixtures } from "../src/fixtures.js";

class RecordingHermes implements HermesClient {
  public received: { messages: ChatMessage[]; opts?: ChatOpts }[] = [];
  async chat(messages: ChatMessage[], opts?: ChatOpts): Promise<ChatResult> {
    this.received.push({ messages, opts });
    return { content: "Maya starts on 2026-07-01." };
  }
}

function createApp(hermes: HermesClient) {
  const store = new InMemoryStore();
  seedFixtures(store);
  return { store, app: buildApp({ store, hermes }) };
}

describe("POST /simulate/inbound", () => {
  it("records an inbound audit row and starts a Hermes run, returning a runId", async () => {
    const hermes = new RecordingHermes();
    const { store, app } = createApp(hermes);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/simulate/inbound?tenant=papaya",
      payload: { channel: "whatsapp", from: "+972546358808", body: "When does Maya start?" },
    });
    expect(res.statusCode).toBe(200);
    const { runId } = res.json();
    expect(runId).toBeTruthy();

    // Inbound side-effect landed in audit immediately
    const audit = store.getAudit("papaya");
    const inbound = audit.find((a) => a.capability === "whatsapp.message_received");
    expect(inbound).toBeDefined();
    expect(inbound!.runId).toBe(runId);

    // Wait briefly for the background run to fire-and-forget through Hermes
    await new Promise((r) => setTimeout(r, 50));
    expect(hermes.received.length).toBeGreaterThanOrEqual(1);
    const flat = hermes.received[0].messages.map((m) => m.content).join("\n");
    expect(flat).toMatch(/inbound/i);
    expect(flat).toContain("+972546358808");
    expect(flat).toContain("When does Maya start?");
  });

  it("rejects an unsupported channel", async () => {
    const { app } = createApp(new RecordingHermes());
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/simulate/inbound",
      payload: { channel: "sms", from: "+1", body: "hi" },
    });
    expect(res.statusCode).toBe(400);
  });
});
