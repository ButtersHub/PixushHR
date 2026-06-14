import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";

describe("/messages and /reset", () => {
  it("GET /messages returns tenant-scoped messages", async () => {
    const store = new InMemoryStore();
    const app = buildApp({ store, hermes: {} as any });
    await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "channel.send_message", args: { tenant: "papaya", to: "Maya", role: "employee", channel: "email", body: "Welcome" } },
    });
    const res = await app.inject({ method: "GET", url: "/messages?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].body).toBe("Welcome");
  });

  it("POST /reset clears state and re-seeds fixtures", async () => {
    const store = new InMemoryStore();
    seedFixtures(store);
    const app = buildApp({ store, hermes: {} as any });
    await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "channel.send_message", args: { tenant: "papaya", to: "Maya", role: "employee", channel: "email", body: "hi" } },
    });
    const res = await app.inject({ method: "POST", url: "/reset" });
    expect(res.statusCode).toBe(200);
    expect(store.getMessages("papaya")).toHaveLength(0);
    expect(store.getContract("papaya", "c1")?.name).toBe("Maya Cohen");
  });
});
