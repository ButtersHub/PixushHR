import type { WorkflowDefinition } from "./onboarding.js";

type CatalogEntry = { name: string; integration: string; purpose: string };

// Renders a WorkflowDefinition + tool catalog into a concise NL playbook the agent follows
// (decision #30, soft-first). Injected by the orchestrator as a system message.
export function serializePlaybook(wf: WorkflowDefinition, catalog: CatalogEntry[]): string {
  const steps = wf.steps
    .map((s, i) => `${i + 1}. ${s.intent} — call \`${s.capability}\``)
    .join("\n");

  const tools = catalog
    .map((t) => `- ${t.name} (${t.integration}): ${t.purpose}`)
    .join("\n");

  return [
    `ONBOARDING PLAYBOOK`,
    `Trigger: ${wf.trigger}`,
    ``,
    `Follow these steps in order. For each step, call exactly one tool via the hris-tool skill`,
    `by sending a JSON {name, args} payload, then use the result to inform the next step:`,
    steps,
    ``,
    `AVAILABLE TOOLS`,
    tools,
    ``,
    `Always include "tenant" in args (use "papaya" unless told otherwise). After completing all`,
    `steps, reply with a warm, professional welcome message plus a one-line recap of what you did.`,
  ].join("\n");
}
