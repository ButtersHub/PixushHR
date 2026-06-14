import type { WorkflowDefinition, WorkflowNode, ActionNode, InputBinding } from "./types.js";

// Walks the node-graph from `root` (depth-first through next / then-else) and renders a concise
// numbered NL playbook + the available-tool catalog (decision #30, soft-first).
export function serializePlaybook(wf: WorkflowDefinition, availableTools: string[]): string {
  const lines: string[] = [];
  let n = 0;
  const seen = new Set<string>();

  function walk(id: string | undefined, indent: string): void {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const node: WorkflowNode | undefined = wf.nodes[id];
    if (!node) return;
    if (node.kind === "action") {
      n += 1;
      lines.push(`${indent}${n}. Call \`${node.capability}\`${node.audience ? ` (audience: ${node.audience})` : ""}`);
      const argsLine = renderArgs(node);
      if (argsLine) lines.push(`${indent}   args: ${argsLine}`);
      walk(node.next, indent);
    } else {
      lines.push(`${indent}If ${node.expr}:`);
      walk(node.then, indent + "   ");
      if (node.else) {
        lines.push(`${indent}else:`);
        walk(node.else, indent + "   ");
      }
    }
  }

  walk(wf.root, "");

  const catalog = availableTools.map((t) => `- ${t}`).join("\n");

  return [
    `${wf.name.toUpperCase()} PLAYBOOK`,
    `Trigger: ${wf.trigger.type}`,
    ``,
    `Follow these steps in order. For each step, call exactly one tool via the hris-tool skill`,
    `by sending a JSON {name, args} payload, then use the result to inform the next step.`,
    `Each step's \`args\` line tells you exactly what to pass:`,
    `  - literal "x"   → use the value verbatim`,
    `  - ref step.N    → take it from a previous step's output`,
    `  - <you compose> → fill it yourself (e.g. a warm message body)`,
    ...lines,
    ``,
    `AVAILABLE TOOLS`,
    catalog,
    ``,
    `Always include "tenant" in args (use "papaya" unless told otherwise). After completing all`,
    `steps, reply with a warm, professional welcome message plus a one-line recap of what you did.`,
  ].join("\n");
}

// Renders an action node's input bindings into a compact JSON-ish hint the LLM can parse.
function renderArgs(node: ActionNode): string {
  const entries = Object.entries(node.input ?? {});
  if (entries.length === 0) return "";
  return `{ ${entries.map(([k, b]) => `${k}: ${renderBinding(b)}`).join(", ")} }`;
}

function renderBinding(b: InputBinding): string {
  switch (b.kind) {
    case "literal":
      return JSON.stringify(b.value);
    case "ref":
      return `<ref ${b.from}>`;
    case "agent":
      return `<you compose>`;
  }
}
