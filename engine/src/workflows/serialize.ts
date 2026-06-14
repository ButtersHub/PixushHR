import type { WorkflowDefinition, WorkflowNode } from "./types.js";

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
    `by sending a JSON {name, args} payload, then use the result to inform the next step:`,
    ...lines,
    ``,
    `AVAILABLE TOOLS`,
    catalog,
    ``,
    `Always include "tenant" in args (use "papaya" unless told otherwise). After completing all`,
    `steps, reply with a warm, professional welcome message plus a one-line recap of what you did.`,
  ].join("\n");
}
