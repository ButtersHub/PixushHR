import type { WorkflowDefinition, WorkflowNode, ActionNode, InputBinding } from "./types.js";
import { TOOLS } from "../tools.js";

// Map an external-hermes connector id to the channel value the record_side_effect callback expects.
// Hermes's native gateway name (e.g. "gmail") doesn't always match the channel id ("email").
const CONNECTOR_TO_CHANNEL: Record<string, string> = {
  gmail: "email",
  whatsapp: "whatsapp",
};

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
      const audiencePart = node.audience ? ` (audience: ${node.audience})` : "";
      const tool = TOOLS[node.capability];
      if (tool?.kind === "external-hermes") {
        const channel = CONNECTOR_TO_CHANNEL[tool.connector] ?? tool.connector;
        const gatewayLabel = tool.connector === "gmail"
          ? "your built-in Email/Gmail tool (e.g. send_email / hermes-email)"
          : "your built-in WhatsApp tool (e.g. send_whatsapp_message / hermes-whatsapp)";
        lines.push(`${indent}${n}. Send a ${tool.connector} message via ${gatewayLabel}${audiencePart}.`);
        lines.push(`${indent}   DO NOT call this via the hris-tool skill — \`${node.capability}\` is not an engine tool.`);
        lines.push(`${indent}   Use your own native ${tool.connector} send tool directly.`);
        const argsLine = renderArgs(node);
        if (argsLine) lines.push(`${indent}   args (compose these yourself, do NOT send a name as the recipient): ${argsLine}`);
        const recordFields = channel === "email"
          ? "{ channel: 'email', direction: 'outbound', to, subject, body }"
          : `{ channel: '${channel}', direction: 'outbound', to, body }`;
        lines.push(`${indent}   After the send completes, call the \`record-side-effect\` skill (via the hris-tool callback pattern) with:`);
        lines.push(`${indent}     ${recordFields}`);
        lines.push(`${indent}   Do not skip the callback — it is how the audit log gets the entry.`);
      } else {
        lines.push(`${indent}${n}. Call \`${node.capability}\`${audiencePart}`);
        const argsLine = renderArgs(node);
        if (argsLine) lines.push(`${indent}   args: ${argsLine}`);
      }
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

  // The AVAILABLE TOOLS catalog only lists engine-tool capabilities (the ones the LLM can
  // actually invoke via the hris-tool skill). External-hermes capabilities like
  // gmail.send_email / whatsapp.send_message live in the native gateway and must be called
  // via the agent's built-in tools — listing them here only confuses the LLM into routing
  // them through hris-tool, which fails.
  const catalog = availableTools
    .filter((t) => TOOLS[t]?.kind !== "external-hermes")
    .map((t) => `- ${t}`)
    .join("\n");

  return [
    `${wf.name.toUpperCase()} PLAYBOOK`,
    `Trigger: ${wf.trigger.type} (${wf.trigger.connector})`,
    ``,
    `Use this playbook only when the user asks for this HR workflow or a concrete business action.`,
    `For general questions, harmless creative prompts, or public-profile prompts, do not call tools; answer directly in the requested format.`,
    ``,
    `Follow every step in order. For each step, call exactly one tool via the hris-tool skill`,
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
    `Always include "tenant" in args (use "papaya" unless told otherwise). A step is complete only`,
    `after its tool returns a fresh ok:true result. Never claim an action that lacks that result.`,
    `In the final answer, do not mention internal tool names, capability names, JSON, schemas, Hermes, gateways, or model/provider details. Write like a human HR teammate.`,
    wf.id === "offboarding"
      ? `Keep the termination reason only in the employee letter and HRIS record; never put it in the calendar invite or logistics message. Make the employee communication warm, respectful, and practical. After all steps, provide an auditable recap that explicitly states the reason remained confidential and was shared only on a need-to-know basis.`
      : `After all steps, reply with a warm welcome message and an auditable recap.`,
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
