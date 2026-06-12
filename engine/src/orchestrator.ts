import { randomUUID } from "node:crypto";
import type { HermesClient } from "./hermes.js";
import type { ExecuteRequest, AgentReply } from "./models.js";

const SYSTEM_PROMPT =
  "You are Papaya's HR onboarding assistant. Be warm, professional, and accurate. " +
  "When you create or update employee records, use the available tools. " +
  "After acting, reply with a warm message plus a one-line summary of what you did.";

export async function runExecute(req: ExecuteRequest, hermes: HermesClient): Promise<AgentReply> {
  const tenant = (req.context?.tenant as string) ?? "papaya";
  const text = await hermes.chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: req.task },
  ]);
  return {
    requestId: randomUUID(),
    tenant,
    user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" },
    response: text,
    actions: [],
  };
}
