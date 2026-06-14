import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { StubHermes } from "../src/stubHermes.js";
import { seedFixtures } from "../src/fixtures.js";
import type { FastifyInstance } from "fastify";

const PORT = 3999;

describe("e2e: engine full loop (execute -> tool callback -> audit)", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const store = new InMemoryStore();
    seedFixtures(store);
    app = buildApp({ store, hermes: new StubHermes(`http://127.0.0.1:${PORT}`) });
    await app.listen({ port: PORT, host: "127.0.0.1" });
  });
  afterAll(async () => { await app.close(); });

  it("runs the full onboarding sequence and records the multi-tool run + a message", async () => {
    const exec = await fetch(`http://127.0.0.1:${PORT}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "Onboard Maya Cohen", context: { tenant: "papaya" } }),
    });
    const body = await exec.json();
    expect(body.response).toContain("Maya");

    const audit = await (await fetch(`http://127.0.0.1:${PORT}/audit?tenant=papaya`)).json();
    const caps = audit.map((e: any) => e.capability);
    expect(caps).toContain("ats.get_contract");
    expect(caps).toContain("hris.upsert_employee");
    expect(caps).toContain("teams.add_member");
    expect(caps).toContain("channel.send_message");

    const messages = await (await fetch(`http://127.0.0.1:${PORT}/messages?tenant=papaya`)).json();
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].body).toMatch(/welcome/i);
  });
});
