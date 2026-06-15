import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import type { InMemoryStore } from "./store.js";
import type { HermesClient } from "./hermes.js";
import { executeTool, TOOLS, capabilitySpecs } from "./tools.js";
import { runExecute } from "./orchestrator.js";
import { gateToolCall, CONNECTORS, connectorState, defaultState, roleForConnector } from "./integrations.js";
import { seedFixtures } from "./fixtures.js";
import type { ExecuteRequest, ExecuteResponse } from "./models.js";
import { traceToolCall } from "./tracing.js";

export interface Deps {
  store: InMemoryStore;
  hermes: HermesClient;
}

const inputBindingSchema = z.union([
  z.object({ kind: z.literal("literal"), value: z.unknown() }),
  z.object({ kind: z.literal("ref"), from: z.string() }),
  z.object({ kind: z.literal("agent") }),
]);
const nodeSchema = z.union([
  z.object({ id: z.string(), kind: z.literal("action"), capability: z.string(), input: z.record(inputBindingSchema), audience: z.string().optional(), next: z.string().optional() }),
  z.object({ id: z.string(), kind: z.literal("condition"), expr: z.string(), then: z.string(), else: z.string().optional() }),
]);
const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number(),
  trigger: z.object({
    type: z.string(),
    connector: z.string(),
    sample: z.record(z.unknown()).optional(),
  }),
  root: z.string(),
  nodes: z.record(nodeSchema),
});

function roleRecords(store: InMemoryStore, tenant: string, role: string): unknown[] {
  switch (role) {
    case "HRIS": return store.listEmployees(tenant);
    case "ATS": return store.listContracts(tenant);
    case "Channels": return store.getMessages(tenant);
    case "Calendar": return store.getInvites(tenant);
    case "TaskBoard": return store.getMemberships(tenant);
    case "Content": { const b = store.getBranding(tenant); return b ? [b] : []; }
    default: return [];
  }
}

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });
  const { store } = deps;

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: { name: string; args: unknown; runId?: string } }>("/tools/execute", async (req, reply) => {
    const { name, args, runId } = req.body;
    const tenant = ((args as { tenant?: string })?.tenant) ?? "papaya";
    // If the caller didn't pass runId (e.g. the real Hermes hris-tool skill, which doesn't
    // know about it), fall back to the most-recently-started in-flight run for the tenant —
    // so every tool call made during one /execute request inherits the trigger's runId.
    const effectiveRunId = runId ?? store.currentActiveRunId(tenant);
    try {
      return await traceToolCall(
        { runId: effectiveRunId, tenant, name, input: args },
        async () => {
          gateToolCall(store, tenant, name);
          return executeTool(store, name, args, { runId: effectiveRunId, actor: "pixush" });
        },
      );
    } catch (err) {
      reply.code(400);
      return { ok: false, error: (err as Error).message };
    }
  });

  app.get<{ Querystring: { tenant?: string } }>("/audit", async (req) => {
    const tenant = req.query.tenant ?? "papaya";
    return store.getAudit(tenant);
  });

  app.get<{ Querystring: { tenant?: string } }>("/messages", async (req) => {
    const tenant = req.query.tenant ?? "papaya";
    return store.getMessages(tenant);
  });

  app.post("/reset", async () => {
    store.reset();
    seedFixtures(store);
    store.audit({
      tenant: "papaya",
      capability: "system.reset",
      label: "Reset workspace",
      integration: "System",
      target: "papaya",
      summary: "Cleared all data and reseeded synthetic fixtures",
      actor: "system",
      status: "success",
    });
    return { ok: true };
  });

  app.get<{ Querystring: { tenant?: string } }>("/integrations", async (req) => {
    const tenant = req.query.tenant ?? "papaya";
    return CONNECTORS.map((def) => {
      const state = connectorState(store, tenant, def);
      const tools = Object.values(TOOLS).filter((t) => t.integration === def.role).map((t) => t.name);
      return { ...def, ...state, tools };
    });
  });

  app.post<{ Params: { id: string } }>("/integrations/:id/install", async (req, reply) => {
    const def = CONNECTORS.find((c) => c.id === req.params.id);
    if (!def) { reply.code(404); return { ok: false, error: "unknown connector" }; }
    store.setConnectorState("papaya", def.id, { ...defaultState(def), installed: true, enabled: true });
    store.audit({
      tenant: "papaya", actor: "user", status: "success",
      capability: "integrations.install", label: "Install integration",
      integration: def.role, target: def.name,
      summary: `Installed ${def.name}`, inputs: { id: def.id },
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/integrations/:id/uninstall", async (req, reply) => {
    const def = CONNECTORS.find((c) => c.id === req.params.id);
    if (!def) { reply.code(404); return { ok: false, error: "unknown connector" }; }
    store.setConnectorState("papaya", def.id, { ...connectorState(store, "papaya", def), installed: false, enabled: false });
    store.audit({
      tenant: "papaya", actor: "user", status: "success",
      capability: "integrations.uninstall", label: "Uninstall integration",
      integration: def.role, target: def.name,
      summary: `Uninstalled ${def.name}`, inputs: { id: def.id },
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { enabled: boolean } }>("/integrations/:id/enable", async (req, reply) => {
    const def = CONNECTORS.find((c) => c.id === req.params.id);
    if (!def) { reply.code(404); return { ok: false, error: "unknown connector" }; }
    store.setConnectorState("papaya", def.id, { ...connectorState(store, "papaya", def), enabled: req.body.enabled });
    store.audit({
      tenant: "papaya", actor: "user", status: "success",
      capability: req.body.enabled ? "integrations.enable" : "integrations.disable",
      label: req.body.enabled ? "Enable integration" : "Disable integration",
      integration: def.role, target: def.name,
      summary: `${req.body.enabled ? "Enabled" : "Disabled"} ${def.name}`,
      inputs: { id: def.id, enabled: req.body.enabled },
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { mode?: "mock" | "prod"; mock?: Record<string, unknown>; prod?: Record<string, unknown> } }>("/integrations/:id/config", async (req, reply) => {
    const def = CONNECTORS.find((c) => c.id === req.params.id);
    if (!def) { reply.code(404); return { ok: false, error: "unknown connector" }; }
    const cur = connectorState(store, "papaya", def);
    store.setConnectorState("papaya", def.id, {
      ...cur,
      mode: req.body.mode ?? cur.mode,
      config: {
        mock: { ...cur.config.mock, ...(req.body.mock ?? {}) },
        prod: { ...cur.config.prod, ...(req.body.prod ?? {}) },
      },
    });
    store.audit({
      tenant: "papaya", actor: "user", status: "success",
      capability: "integrations.configure", label: "Configure integration",
      integration: def.role, target: def.name,
      summary: req.body.mode ? `Set ${def.name} mode to ${req.body.mode}` : `Updated ${def.name} config`,
      inputs: req.body,
    });
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { tenant?: string } }>("/integrations/:id/data", async (req, reply) => {
    const role = roleForConnector(req.params.id);
    if (!role) { reply.code(404); return { ok: false, error: "unknown connector" }; }
    return roleRecords(store, req.query.tenant ?? "papaya", role);
  });

  app.post<{ Body: ExecuteRequest }>("/execute", async (req, reply) => {
    try {
      const agentReply = await runExecute(req.body, deps.hermes, store);
      return { response: agentReply.response, structured: agentReply as unknown as Record<string, unknown> };
    } catch (err) {
      reply.code(502);
      return { error: `agent error: ${(err as Error).message}` };
    }
  });

  app.get<{ Querystring: { tenant?: string } }>("/workflows", async (req) => {
    return store.listWorkflows(req.query.tenant ?? "papaya").map((w) => ({ id: w.id, name: w.name, version: w.version }));
  });

  app.get<{ Params: { id: string }; Querystring: { tenant?: string } }>("/workflows/:id", async (req, reply) => {
    const wf = store.getWorkflow(req.query.tenant ?? "papaya", req.params.id);
    if (!wf) { reply.code(404); return { ok: false, error: "unknown workflow" }; }
    return wf;
  });

  app.put<{ Params: { id: string }; Querystring: { tenant?: string }; Body: unknown }>("/workflows/:id", async (req, reply) => {
    const parsed = workflowSchema.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { ok: false, error: "invalid workflow definition" }; }
    store.setWorkflow(req.query.tenant ?? "papaya", parsed.data as import("./workflows/types.js").WorkflowDefinition);
    return { ok: true };
  });

  app.get("/capabilities", async () => capabilitySpecs());

  return app;
}
