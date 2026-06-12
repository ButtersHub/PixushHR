import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import type { HermesClient, ChatMessage } from "../src/hermes.js";

class FakeHermes implements HermesClient {
  public lastMessages: ChatMessage[] = [];
  constructor(private reply: string) {}
  async chat(messages: ChatMessage[]): Promise<string> {
    this.lastMessages = messages;
    return this.reply;
  }
}

describe("/execute", () => {
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
