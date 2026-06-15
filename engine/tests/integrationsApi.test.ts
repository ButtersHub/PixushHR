import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";

function app() {
  const store = new InMemoryStore();
  seedFixtures(store);
  return buildApp({ store, hermes: {} as any });
}

describe("/integrations API", () => {
  it("GET /integrations returns catalog with state and tools", async () => {
    const res = await app().inject({ method: "GET", url: "/integrations?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    const shapes = list.find((c: any) => c.id === "shapes");
    expect(shapes.installed).toBe(true);
    expect(shapes.tools).toContain("hris.upsert_employee");
    expect(list.find((c: any) => c.id === "slack").installed).toBe(false);
  });

  it("POST install + enable + config mutate state", async () => {
    const a = app();
    await a.inject({ method: "POST", url: "/integrations/slack/install" });
    await a.inject({ method: "POST", url: "/integrations/slack/config", payload: { mode: "prod", mock: { failNext: true } } });
    const res = await a.inject({ method: "GET", url: "/integrations?tenant=papaya" });
    const slack = res.json().find((c: any) => c.id === "slack");
    expect(slack.installed).toBe(true);
    expect(slack.mode).toBe("prod");
    expect(slack.config.mock.failNext).toBe(true);
  });

  it("GET /integrations/:id/data returns the role's records", async () => {
    const a = app();
    await a.inject({ method: "POST", url: "/tools/execute", payload: { name: "channel.send_message", args: { tenant: "papaya", to: "Maya", role: "employee", channel: "email", body: "hi" } } });
    const res = await a.inject({ method: "GET", url: "/integrations/teams/data?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(1);
  });

  it("404s an unknown connector", async () => {
    const res = await app().inject({ method: "POST", url: "/integrations/nope/install" });
    expect(res.statusCode).toBe(404);
  });

  it("each capability row surfaces kind + inputSchema + outputSchema for wired tools", async () => {
    const res = await app().inject({ method: "GET", url: "/integrations?tenant=papaya" });
    const comeet = res.json().find((c: any) => c.id === "comeet");
    const getContract = comeet.capabilities.find((c: any) => c.name === "ats.get_contract");
    expect(getContract.kind).toBe("engine-tool");
    expect(getContract.inputSchema).toMatchObject({ kind: "object" });
    expect(getContract.outputSchema).toMatchObject({ kind: "object" });
    // Non-wired capabilities have null schemas
    const getCandidate = comeet.capabilities.find((c: any) => c.name === "ats.get_candidate");
    expect(getCandidate.inputSchema).toBeNull();
    expect(getCandidate.outputSchema).toBeNull();
  });
});
