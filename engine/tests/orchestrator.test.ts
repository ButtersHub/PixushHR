import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { runExecute } from "../src/orchestrator.js";
import type { HermesClient, ChatMessage, ChatResult } from "../src/hermes.js";

class FakeHermes implements HermesClient {
  public lastMessages: ChatMessage[] = [];
  constructor(private reply: string) {}
  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    this.lastMessages = messages;
    return { content: this.reply };
  }
}

class ThrowingHermes implements HermesClient {
  async chat(): Promise<ChatResult> {
    throw new Error("hermes down");
  }
}

describe("/execute", () => {
  it("returns 502 with error body when Hermes throws", async () => {
    const app = buildApp({ store: new InMemoryStore(), hermes: new ThrowingHermes() });
    const res = await app.inject({
      method: "POST",
      url: "/execute",
      payload: { task: "Onboard Maya Cohen" },
    });
    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("calls Hermes with the task and returns its text as response", async () => {
    const hermes = new FakeHermes("Hi Maya, welcome to Papaya!");
    const app = buildApp({ store: new InMemoryStore(), hermes });
    const res = await app.inject({
      method: "POST",
      url: "/execute",
      payload: { task: "Onboard Maya Cohen", context: { tenant: "papaya" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().response).toContain("Maya");
    expect(res.json().structured.tenant).toBe("papaya");
    // the task reached Hermes
    expect(hermes.lastMessages.some((m) => m.content.includes("Onboard Maya Cohen"))).toBe(true);
  });

  it("defaults tenant to papaya when absent", async () => {
    const app = buildApp({ store: new InMemoryStore(), hermes: new FakeHermes("ok") });
    const res = await app.inject({ method: "POST", url: "/execute", payload: { task: "hi" } });
    expect(res.json().structured.tenant).toBe("papaya");
  });
});

describe("runExecute (no-op tracing path)", () => {
  it("returns content from Hermes and correct shape when tracing is DISABLED (no LANGFUSE env)", async () => {
    // LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are absent in the test environment,
    // so tracing falls through to the no-op path — this validates that behaviour.
    const hermes = new FakeHermes("Hello from Hermes!");
    const reply = await runExecute({ task: "Onboard Test User", context: { tenant: "acme" } }, hermes);
    expect(reply.response).toBe("Hello from Hermes!");
    expect(reply.tenant).toBe("acme");
    expect(typeof reply.requestId).toBe("string");
    expect(reply.user.channel).toBe("sensei");
    expect(reply.actions).toEqual([]);
  });
});
