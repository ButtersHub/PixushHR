import { randomUUID } from "node:crypto";
import type { HermesClient } from "./hermes.js";
import type { ExecuteRequest, AgentReply } from "./models.js";
import { withTrace, startGeneration } from "./tracing.js";
import { onboardingWorkflow } from "./workflows/onboarding.js";
import { serializePlaybook } from "./workflows/serialize.js";
import { availableTools } from "./integrations.js";
import type { InMemoryStore } from "./store.js";

const SYSTEM_PROMPT =
  "You are Papaya's HR onboarding assistant. Be warm, professional, and accurate. " +
  "When you create or update employee records, use the available tools. " +
  "After acting, reply with a warm message plus a one-line summary of what you did.";

export async function runExecute(req: ExecuteRequest, hermes: HermesClient, store: InMemoryStore): Promise<AgentReply> {
  const tenant = (req.context?.tenant as string) ?? "papaya";
  const requestId = randomUUID();
  const def = store.getWorkflow(tenant, "onboarding") ?? onboardingWorkflow;
  const playbook = serializePlaybook(def, availableTools(store, tenant));

  return withTrace(
    {
      traceName: "onboarding-execute",
      metadata: { requestId, tenant },
      tags: [`tenant:${tenant}`, "feature:onboarding"],
    },
    async () => {
      // system persona + injected onboarding playbook/tool-catalog + the user task.
      // Intent detection is minimal for now: onboarding is the demo path (decision #30).
      const messages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "system" as const, content: playbook },
        { role: "user" as const, content: req.task },
      ];

      const gen = startGeneration("hermes-chat", { input: messages });
      const res = await hermes.chat(messages);
      gen?.update({
        output: res.content,
        model: res.model,
        usageDetails: { input: res.usage?.input, output: res.usage?.output },
      }).end();

      return {
        requestId,
        tenant,
        user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
        response: res.content,
        actions: [], // populated when we parse Hermes tool-call results (later phase)
      };
    },
  );
}
