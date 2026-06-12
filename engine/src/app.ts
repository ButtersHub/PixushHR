import Fastify, { FastifyInstance } from "fastify";
import type { InMemoryStore } from "./store.js";
import type { HermesClient } from "./hermes.js";

export interface Deps {
  store: InMemoryStore;
  hermes: HermesClient;
}

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}
