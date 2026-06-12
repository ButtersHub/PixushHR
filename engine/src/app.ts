import Fastify, { FastifyInstance } from "fastify";
import type { InMemoryStore } from "./store.js";
import type { HermesClient } from "./hermes.js";
import { executeTool } from "./tools.js";

export interface Deps {
  store: InMemoryStore;
  hermes: HermesClient;
}

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: false });
  const { store } = deps;

  app.get("/health", async () => ({ status: "ok" }));

  app.post<{ Body: { name: string; args: unknown } }>("/tools/execute", async (req, reply) => {
    const { name, args } = req.body;
    try {
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

  return app;
}
