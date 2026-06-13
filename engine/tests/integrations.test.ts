import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";
import { CONNECTORS, defaultState, roleEnabled, availableTools, gateToolCall } from "../src/integrations.js";

describe("integration registry", () => {
  it("catalog has seeded and non-seeded connectors with role-ports", () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(ids).toContain("shapes");
    expect(ids).toContain("slack");
    expect(CONNECTORS.find((c) => c.id === "shapes")?.role).toBe("HRIS");
    expect(CONNECTORS.find((c) => c.id === "shapes")?.seeded).toBe(true);
    expect(CONNECTORS.find((c) => c.id === "slack")?.seeded).toBe(false);
  });

  it("defaultState installs+enables seeded connectors only", () => {
    const shapes = CONNECTORS.find((c) => c.id === "shapes")!;
    const slack = CONNECTORS.find((c) => c.id === "slack")!;
    expect(defaultState(shapes)).toMatchObject({ installed: true, enabled: true, mode: "mock" });
    expect(defaultState(slack)).toMatchObject({ installed: false, enabled: false });
  });

  it("roleEnabled is true for a seeded role by default, false when disabled", () => {
    const s = new InMemoryStore();
    expect(roleEnabled(s, "papaya", "HRIS")).toBe(true);
    expect(roleEnabled(s, "papaya", "TaskBoard")).toBe(false);
    s.setConnectorState("papaya", "shapes", { installed: true, enabled: false, mode: "mock", config: { mock: {}, prod: {} } });
    expect(roleEnabled(s, "papaya", "HRIS")).toBe(false);
  });

  it("availableTools excludes tools of disabled roles", () => {
    const s = new InMemoryStore();
    expect(availableTools(s, "papaya")).toContain("hris.upsert_employee");
    s.setConnectorState("papaya", "shapes", { installed: true, enabled: false, mode: "mock", config: { mock: {}, prod: {} } });
    expect(availableTools(s, "papaya")).not.toContain("hris.upsert_employee");
  });

  it("gateToolCall passes for an enabled role", () => {
    const s = new InMemoryStore();
    expect(() => gateToolCall(s, "papaya", "channel.send_message")).not.toThrow();
  });

  it("gateToolCall consumes failNext and throws an injected error", () => {
    const s = new InMemoryStore();
    s.setConnectorState("papaya", "teams", { installed: true, enabled: true, mode: "mock", config: { mock: { failNext: true }, prod: {} } });
    expect(() => gateToolCall(s, "papaya", "channel.send_message")).toThrow(/injected failure/i);
    expect(() => gateToolCall(s, "papaya", "channel.send_message")).not.toThrow();
  });
});
