import { describe, it, expect } from "vitest";
import { onboardingWorkflow } from "../src/workflows/onboarding.js";
import { serializePlaybook } from "../src/workflows/serialize.js";
import { toolCatalog } from "../src/tools.js";

describe("onboardingWorkflow node-graph", () => {
  it("is a node-graph with a root and linear next chain of the 7 capabilities", () => {
    expect(onboardingWorkflow.id).toBe("onboarding");
    expect(onboardingWorkflow.root).toBeTruthy();
    const order: string[] = [];
    let id: string | undefined = onboardingWorkflow.root;
    while (id) {
      const node: import("../src/workflows/types.js").WorkflowNode = onboardingWorkflow.nodes[id];
      expect(node).toBeTruthy();
      if (node.kind === "action") {
        order.push(node.capability);
        id = node.next;
      } else {
        id = node.then;
      }
    }
    expect(order).toEqual([
      "ats.get_contract",
      "hiring_manager.ask",
      "hris.upsert_employee",
      "teams.add_member",
      "calendar.create_invite",
      "content.get_branding",
      "channel.send_message",
    ]);
  });
});

describe("serializePlaybook", () => {
  const allTools = toolCatalog().map((t) => t.name);

  it("renders numbered steps from the graph + the available-tool catalog", () => {
    const out = serializePlaybook(onboardingWorkflow, allTools);
    expect(out).toMatch(/PLAYBOOK/i);
    expect(out).toContain("1.");
    expect(out).toContain("ats.get_contract");
    expect(out).toContain("channel.send_message");
    expect(out).toMatch(/\{name, args\}/);
  });

  it("only lists available tools in the catalog section", () => {
    const out = serializePlaybook(onboardingWorkflow, ["ats.get_contract"]);
    const catalog = out.split("AVAILABLE TOOLS")[1] ?? "";
    expect(catalog).toContain("ats.get_contract");
    expect(catalog).not.toContain("- channel.send_message");
  });

  it("renders a condition's then/else", () => {
    const wf = {
      id: "t", name: "T", version: 1, trigger: { type: "manual" }, root: "c1",
      nodes: {
        c1: { id: "c1", kind: "condition", expr: "manager responded?", then: "a1", else: "a2" },
        a1: { id: "a1", kind: "action", capability: "hris.upsert_employee", input: {} },
        a2: { id: "a2", kind: "action", capability: "channel.send_message", input: {} },
      },
    } as const;
    const out = serializePlaybook(wf as any, ["hris.upsert_employee", "channel.send_message"]);
    expect(out).toMatch(/If manager responded\?/i);
    expect(out).toMatch(/else/i);
  });
});
