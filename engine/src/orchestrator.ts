import { randomUUID } from "node:crypto";
import type { HermesClient } from "./hermes.js";
import type { ExecuteRequest, AgentReply } from "./models.js";
import { withTrace, startGeneration } from "./tracing.js";

const SYSTEM_PROMPT =
  "You are Papaya's HR onboarding assistant. Be warm, professional, and accurate. " +
  "When you create or update employee records, use the available tools. " +
  "After acting, reply with a warm message plus a one-line summary of what you did.";

export async function runExecute(req: ExecuteRequest, hermes: HermesClient): Promise<AgentReply> {
  const tenant = (req.context?.tenant as string) ?? "papaya";
  const requestId = randomUUID();

  return withTrace(
    {
      traceName: "onboarding-execute",
      metadata: { requestId, tenant },
      tags: [`tenant:${tenant}`, "feature:onboarding"],
    },
    async () => {
      // NOTE: input is only the messages array (not the full req) to avoid capturing
      // sensitive context fields — deliberate masking per Langfuse best practice.
      const messages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
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
