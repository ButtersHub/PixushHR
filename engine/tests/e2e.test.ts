import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { StubHermes } from "../src/stubHermes.js";
import type { FastifyInstance } from "fastify";

const PORT = 3999;

describe("e2e: engine full loop (execute -> tool callback -> audit)", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = buildApp({ store: new InMemoryStore(), hermes: new StubHermes(`http://127.0.0.1:${PORT}`) });
    await app.listen({ port: PORT, host: "127.0.0.1" });
  });
  afterAll(async () => { await app.close(); });

  it("onboards via /execute and records the tool call in the audit", async () => {
    const exec = await fetch(`http://127.0.0.1:${PORT}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "Onboard Maya Cohen", context: { tenant: "papaya" } }),
    });
    const body = await exec.json();
    expect(body.response).toContain("Maya");

    const audit = await (await fetch(`http://127.0.0.1:${PORT}/audit?tenant=papaya`)).json();
    expect(audit.some((e: any) => e.capability === "hris.upsert_employee")).toBe(true);
  });
});
