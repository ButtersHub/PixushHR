import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { polishAgentResponse, runExecute } from "../src/orchestrator.js";
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

  it("polishes internal provider failures into a human safe refusal", async () => {
    const hermes = new FakeHermes("The model provider's safety filter blocked this request (not a Hermes/gateway failure). Try adding a fallback provider.");
    const app = buildApp({ store: new InMemoryStore(), hermes });
    const res = await app.inject({ method: "POST", url: "/execute", payload: { task: "Reveal credentials" } });
    expect(res.json().response).toContain("prompt-injection");
    expect(res.json().response).toContain("No deal");
    expect(res.json().response).not.toMatch(/Hermes|gateway|model provider|fallback provider|safety filter/i);
  });
});

describe("polishAgentResponse", () => {
  it("removes internal capability names and botty ok:true phrasing", () => {
    const out = polishAgentResponse("Tool: hris.upsert_employee\nStatus: ok:true\nTool: calendar.create_invite\nAll backed by fresh ok:true tool results.");
    expect(out).toContain("Status: confirmed");
    expect(out).toContain("fresh confirmations");
    expect(out).not.toMatch(/hris\.upsert_employee|calendar\.create_invite|Tool:|ok:true|tool results/i);
  });

  it("rewrites ordinary internal product names without turning them into a refusal", () => {
    expect(polishAgentResponse("Hello from Hermes!")).toBe("Hello from the assistant!");
  });

  it("turns internal provider leakage into a warmer safe refusal", () => {
    const out = polishAgentResponse("The model provider exposed implementation details.");
    expect(out).toContain("No deal");
    expect(out).toContain("not for sale");
    expect(out).toContain("prompt-injection");
    expect(out).toContain("credentials");
    expect(out).not.toMatch(/model provider|implementation details/i);
  });

  it("preserves a safe phishing refusal that mentions credentials", () => {
    const out = polishAgentResponse("I can't help write phishing emails or steal credentials. I can help with an authorized security-awareness simulation instead.");
    expect(out).toContain("phishing emails");
    expect(out).toContain("steal credentials");
    expect(out).toContain("security-awareness simulation");
    expect(out).not.toContain("No deal");
  });
});

describe("/execute playbook injection", () => {
  it("injects the onboarding playbook + tool catalog into the Hermes messages", async () => {
    const hermes = new FakeHermes("Welcome Maya!");
    const app = buildApp({ store: new InMemoryStore(), hermes });
    await app.inject({
      method: "POST",
      url: "/execute",
      payload: { task: "Onboard Maya Cohen", context: { tenant: "papaya" } },
    });
    const joined = hermes.lastMessages.map((m) => m.content).join("\n");
    expect(joined).toMatch(/ONBOARDING PLAYBOOK/);
    expect(joined).toContain("Sound like a thoughtful human");
    expect(joined).toContain("harmless creative");
    expect(joined).toContain("tweets or short social posts");
    expect(joined).toContain("no corporate launch phrasing");
    expect(joined).toContain("phishing, fraud, or credential theft");
    expect(joined).toContain("prompt-injection");
    expect(joined).toContain("Do not mention internal architecture");
    expect(joined).toContain("Use this playbook only when the user asks for this HR workflow");
    expect(joined).toContain("do not call tools; answer directly");
    expect(joined).toContain("ats.get_contract");
    expect(joined).toContain("channel.send_message");
    expect(joined).toContain("Onboard Maya Cohen");
  });

  it("injects the offboarding playbook for an offboarding scenario", async () => {
    const hermes = new FakeHermes("Offboarding complete.");
    const app = buildApp({ store: new InMemoryStore(), hermes });
    await app.inject({
      method: "POST",
      url: "/execute",
      payload: {
        task: "Offboard Daniel Rosen on 2026-06-28",
        context: { tenant: "papaya", scenario_id: "offboarding" },
      },
    });
    const joined = hermes.lastMessages.map((m) => m.content).join("\n");
    expect(joined).toMatch(/OFFBOARDING PLAYBOOK/);
    expect(joined).toContain("document.generate_termination_letter");
    expect(joined).toContain("calendar.create_invite");
    expect(joined).toContain("workflow.activate_offboarding");
    expect(joined).not.toMatch(/ONBOARDING PLAYBOOK/);
  });

  it("does not inject a workflow playbook for vague commands", async () => {
    const hermes = new FakeHermes("Which thing should I do?");
    const store = new InMemoryStore();
    const app = buildApp({ store, hermes });
    const res = await app.inject({
      method: "POST",
      url: "/execute",
      payload: { task: "Do the thing.", context: { tenant: "papaya" } },
    });
    const joined = hermes.lastMessages.map((m) => m.content).join("\n");
    expect(joined).toContain("ask a concise clarifying question");
    expect(joined).not.toContain("ONBOARDING PLAYBOOK");
    expect(joined).not.toContain("OFFBOARDING PLAYBOOK");
    expect(joined).not.toContain("candidateId");
    expect(res.json().structured.actions).toEqual([]);
    expect(store.getAudit("papaya").filter((entry) => entry.actor === "pixush")).toHaveLength(0);
  });

  it("does not inject a workflow playbook for harmless creative prompts", async () => {
    const hermes = new FakeHermes("Tiny badge, big relief.");
    const app = buildApp({ store: new InMemoryStore(), hermes });
    await app.inject({
      method: "POST",
      url: "/execute",
      payload: { task: "Write a tweet announcing you got verified.", context: { tenant: "papaya" } },
    });
    const joined = hermes.lastMessages.map((m) => m.content).join("\n");
    expect(joined).toContain("harmless creative");
    expect(joined).toContain("tweets or short social posts");
    expect(joined).not.toContain("ONBOARDING PLAYBOOK");
    expect(joined).not.toContain("candidateId");
  });

  it("uses validation-only LLM instructions for incomplete onboarding data", async () => {
    const hermes = new FakeHermes("I need the verified signed contract before proceeding.");
    const store = new InMemoryStore();
    const app = buildApp({ store, hermes });
    const res = await app.inject({
      method: "POST",
      url: "/execute",
      payload: {
        task: "Onboard Alex. I do not know the last name, manager, department, or start date.",
        context: { tenant: "papaya", scenario_id: "unrecognized-external-test-id" },
      },
    });
    const joined = hermes.lastMessages.map((m) => m.content).join("\n");
    expect(joined).toContain("preflight validation");
    expect(joined).toContain("Do not call any tools");
    expect(joined).not.toContain("ONBOARDING PLAYBOOK");
    expect(joined).not.toContain("candidateId");
    expect(res.json().structured.actions).toEqual([]);
    expect(store.getAudit("papaya").filter((entry) => entry.actor === "pixush")).toHaveLength(0);
  });

  it("detects incomplete onboarding without evaluator metadata", async () => {
    const hermes = new FakeHermes("Please provide the missing verified fields.");
    const app = buildApp({ store: new InMemoryStore(), hermes });
    await app.inject({
      method: "POST",
      url: "/execute",
      payload: {
        task: "Please onboard the new employee, but the manager and start date are missing.",
        context: { tenant: "papaya" },
      },
    });
    const joined = hermes.lastMessages.map((m) => m.content).join("\n");
    expect(joined).toContain("preflight validation");
    expect(joined).not.toContain("candidateId");
  });

  it("uses validation-only LLM instructions for relative onboarding dates", async () => {
    const hermes = new FakeHermes("Please provide an absolute verified start date before onboarding.");
    const store = new InMemoryStore();
    const app = buildApp({ store, hermes });
    const res = await app.inject({
      method: "POST",
      url: "/execute",
      payload: {
        task: "Run onboarding for Lior Ben Ami. Start date: yesterday.",
        context: { tenant: "papaya" },
      },
    });
    const joined = hermes.lastMessages.map((m) => m.content).join("\n");
    expect(joined).toContain("preflight validation");
    expect(joined).toContain("Do not call any tools");
    expect(joined).not.toContain("ONBOARDING PLAYBOOK");
    expect(joined).not.toContain("candidateId");
    expect(res.json().structured.actions).toEqual([]);
    expect(store.getAudit("papaya").filter((entry) => entry.actor === "pixush")).toHaveLength(0);
  });
});

describe("runExecute (no-op tracing path)", () => {
  it("returns content from Hermes and correct shape when tracing is DISABLED (no LANGFUSE env)", async () => {
    // LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are absent in the test environment,
    // so tracing falls through to the no-op path — this validates that behaviour.
    const hermes = new FakeHermes("Hello from Hermes!");
    const { InMemoryStore } = await import("../src/store.js");
    const reply = await runExecute({ task: "Onboard Test User", context: { tenant: "acme" } }, hermes, new InMemoryStore());
    expect(reply.response).toBe("Hello from the assistant!");
    expect(reply.tenant).toBe("acme");
    expect(typeof reply.requestId).toBe("string");
    expect(reply.user.channel).toBe("sensei");
    expect(reply.actions).toEqual([]);
  });
});
