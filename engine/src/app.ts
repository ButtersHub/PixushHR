import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { InMemoryStore } from "./store.js";
import type { HermesClient } from "./hermes.js";
import { executeTool, TOOLS } from "./tools.js";
import { runExecute } from "./orchestrator.js";
import { gateToolCall, CONNECTORS, connectorState, defaultState, roleForConnector } from "./integrations.js";
import { seedFixtures } from "./fixtures.js";
import type { ExecuteRequest, ExecuteResponse } from "./models.js";

export interface Deps {
  store: InMemoryStore;
  hermes: HermesClient;
}

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

  app.post<{ Body: { name: string; args: unknown } }>("/tools/execute", async (req, reply) => {
    const { name, args } = req.body;
    const tenant = ((args as { tenant?: string })?.tenant) ?? "papaya";
    try {
      gateToolCall(store, tenant, name);
      return await executeTool(store, name, args);
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
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/integrations/:id/uninstall", async (req, reply) => {
    const def = CONNECTORS.find((c) => c.id === req.params.id);
    if (!def) { reply.code(404); return { ok: false, error: "unknown connector" }; }
    store.setConnectorState("papaya", def.id, { ...connectorState(store, "papaya", def), installed: false, enabled: false });
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { enabled: boolean } }>("/integrations/:id/enable", async (req, reply) => {
    const def = CONNECTORS.find((c) => c.id === req.params.id);
    if (!def) { reply.code(404); return { ok: false, error: "unknown connector" }; }
    store.setConnectorState("papaya", def.id, { ...connectorState(store, "papaya", def), enabled: req.body.enabled });
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

  return app;
}
