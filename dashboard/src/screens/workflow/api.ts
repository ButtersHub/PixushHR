import type {
  WorkflowDef,
  WorkflowSummary,
  Capability,
  TriggerCatalog,
  Run,
  AuditEntry,
  IntegrationRow,
} from "./types";

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? "http://localhost:3000";
const TENANT = "papaya";

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`engine ${r.status}${body ? `: ${body}` : ""}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  listWorkflows: () =>
    fetch(`${ENGINE}/workflows?tenant=${TENANT}`).then(jsonOrThrow<WorkflowSummary[]>),

  getWorkflow: (id: string) =>
    fetch(`${ENGINE}/workflows/${id}?tenant=${TENANT}`).then(jsonOrThrow<WorkflowDef>),

  putWorkflow: (def: WorkflowDef) =>
    fetch(`${ENGINE}/workflows/${def.id}?tenant=${TENANT}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(def),
    }).then(jsonOrThrow<{ ok: boolean }>),

  createWorkflow: (seed: { id: string; name: string; trigger: WorkflowDef["trigger"] }) =>
    fetch(`${ENGINE}/workflows?tenant=${TENANT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seed),
    }).then(jsonOrThrow<WorkflowDef>),

  deleteWorkflow: (id: string) =>
    fetch(`${ENGINE}/workflows/${id}?tenant=${TENANT}`, { method: "DELETE" })
      .then(jsonOrThrow<{ ok: boolean }>),

  capabilities: () =>
    fetch(`${ENGINE}/capabilities`).then(jsonOrThrow<Capability[]>),

  triggers: () =>
    fetch(`${ENGINE}/triggers?tenant=${TENANT}`).then(jsonOrThrow<TriggerCatalog[]>),

  integrations: () =>
    fetch(`${ENGINE}/integrations?tenant=${TENANT}`).then(jsonOrThrow<IntegrationRow[]>),

  startTest: (workflowId: string) =>
    fetch(`${ENGINE}/workflows/${workflowId}/test?tenant=${TENANT}`, { method: "POST" })
      .then(jsonOrThrow<{ runId: string }>),

  getRun: (runId: string) =>
    fetch(`${ENGINE}/runs/${runId}`).then(jsonOrThrow<Run>),

  auditForRun: (runId: string) =>
    fetch(`${ENGINE}/audit?tenant=${TENANT}&runId=${runId}`).then(jsonOrThrow<AuditEntry[]>),
};
