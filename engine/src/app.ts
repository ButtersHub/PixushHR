import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { InMemoryStore } from "./store.js";
import type { HermesClient } from "./hermes.js";
import { executeTool } from "./tools.js";
import { runExecute } from "./orchestrator.js";
import { gateToolCall } from "./integrations.js";
import { seedFixtures } from "./fixtures.js";
import type { ExecuteRequest, ExecuteResponse } from "./models.js";

export interface Deps {
  store: InMemoryStore;
  hermes: HermesClient;
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
