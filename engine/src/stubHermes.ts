import type { HermesClient, ChatMessage } from "./hermes.js";

// Simulates the agent deciding to call the hris.upsert_employee tool via the engine skill
// (HTTP callback to /tools/execute), then returning a warm reply. Used for e2e without real Hermes.
export class StubHermes implements HermesClient {
  constructor(private engineUrl: string) {}
  async chat(messages: ChatMessage[]): Promise<string> {
    const task = messages.find((m) => m.role === "user")?.content ?? "";
    await fetch(`${this.engineUrl}/tools/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "hris.upsert_employee",
        args: { tenant: "papaya", id: "e1", name: "Maya Cohen", role: "Engineer", startDate: "2026-07-01" },
      }),
    });
    return `Hi Maya, welcome to Papaya! I've set up your record. (task: ${task.slice(0, 30)})`;
  }
}
