import { randomUUID } from "node:crypto";
import type { ChatResult, HermesClient } from "./hermes.js";
import type { ExecuteRequest, AgentReply } from "./models.js";
import {
  clearToolTraceParent,
  registerToolTraceParent,
  startGeneration,
  withTrace,
} from "./tracing.js";
import { onboardingWorkflow } from "./workflows/onboarding.js";
import { offboardingWorkflow } from "./workflows/offboarding.js";
import { serializePlaybook } from "./workflows/serialize.js";
import { availableTools } from "./integrations.js";
import type { InMemoryStore } from "./store.js";

function workflowIdFor(req: ExecuteRequest): "onboarding" | "offboarding" {
  const scenario = String(req.context?.scenario_id ?? "").toLowerCase();
  if (scenario === "offboarding" || scenario === "offboard") return "offboarding";
  if (scenario === "onboarding" || scenario === "onboard") return "onboarding";
  return /\b(offboard|offboarding|termination|last working day)\b/i.test(req.task)
    ? "offboarding"
    : "onboarding";
}

function systemPrompt(workflowId: "onboarding" | "offboarding"): string {
  if (workflowId === "offboarding") {
    return "You are Papaya's HR offboarding assistant. Be warm, respectful, accurate, and discreet. " +
      "Use the available tools for every requested business action. Keep termination reasons out of " +
      "logistics-only communications. Only confirm actions backed by fresh ok:true tool results.";
  }
  return "You are Papaya's HR onboarding assistant. Be warm, professional, and accurate. " +
    "Use the available tools for every requested business action. Only confirm actions backed by " +
    "fresh ok:true tool results.";
}

export async function runExecute(req: ExecuteRequest, hermes: HermesClient, store: InMemoryStore): Promise<AgentReply> {
  const tenant = (req.context?.tenant as string) ?? "papaya";
  const requestId = randomUUID();
  const workflowId = workflowIdFor(req);
  const fallback = workflowId === "offboarding" ? offboardingWorkflow : onboardingWorkflow;
  const def = store.getWorkflow(tenant, workflowId) ?? fallback;
  const playbook = serializePlaybook(def, availableTools(store, tenant));

  // Emit a "run.started" trigger audit so the Audit log shows what initiated the agent run.
  const source = (req.context?.source as string) ?? "sensei";
  store.audit({
    tenant,
    actor: "trigger",
    status: "success",
    capability: "run.started",
    label: "Run started",
    integration: source === "sensei" ? "Sensei" : "Trigger",
    target: req.task.slice(0, 80),
    summary: `Started by ${source}: ${req.task.slice(0, 60)}${req.task.length > 60 ? "…" : ""}`,
    runId: requestId,
    inputs: { task: req.task, context: req.context ?? {} },
  });

  // Track this run as in-flight so the real Hermes's tool callbacks (which don't forward runId)
  // can be associated with the right flow. See InMemoryStore.currentActiveRunId.
  store.pushActiveRun(tenant, requestId);
  try {
    return await withTrace(
    {
      traceName: `${workflowId}-execute`,
      metadata: { requestId, tenant },
      tags: [`tenant:${tenant}`, `feature:${workflowId}`],
    },
    async () => {
      const messages = [
        { role: "system" as const, content: systemPrompt(workflowId) },
        { role: "system" as const, content: playbook },
        { role: "user" as const, content: req.task },
      ];

      const gen = startGeneration("hermes-chat", { input: messages });
      registerToolTraceParent(requestId, gen);
      let res: ChatResult;
      try {
        res = await hermes.chat(messages, { runId: requestId });
        gen?.update({
          output: res.content,
          model: res.model,
          usageDetails: { input: res.usage?.input, output: res.usage?.output },
        });
      } catch (error) {
        gen?.update({ level: "ERROR", statusMessage: (error as Error).message });
        throw error;
      } finally {
        clearToolTraceParent(requestId);
        gen?.end();
      }

      const actions = store.getAudit(tenant)
        .filter((entry) => entry.runId === requestId && entry.actor === "pixush" && entry.status === "success")
        .map(({ capability, target, summary }) => ({ capability, target, summary }));

      return {
        requestId,
        tenant,
        user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
        response: res.content,
        actions,
      };
    },
  );
  } finally {
    store.popActiveRun(tenant, requestId);
  }
}
