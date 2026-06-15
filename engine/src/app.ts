import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import type { InMemoryStore } from "./store.js";
import type { HermesClient } from "./hermes.js";
import { executeTool, TOOLS, capabilitySpecs, schemaToTree } from "./tools.js";
import { runExecute, runWorkflow } from "./orchestrator.js";
import { randomUUID } from "node:crypto";
import { gateToolCall, CONNECTORS, connectorState, defaultState, roleForConnector, enabledTriggers } from "./integrations.js";
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
  // @fastify/cors v11 defaults `methods` to GET,HEAD,POST — so preflight
  // blocks PUT/PATCH/DELETE. The workflow editor save (PUT /workflows/:id),
  // workflow delete, and a few integration config calls need those verbs.
  // Reflect the request Origin and explicitly allow every verb we use.
  app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  });
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
          // external-hermes tools have no engine-side run function — they're meant to be
          // executed by Hermes's native gateway. If the LLM calls one via the hris-tool skill
          // anyway (typical when Hermes's native channel gateways aren't configured), route the
          // call through the side-effect ingestion path so the Messages + Audit log still
          // reflect a "send" with actor=hermes-native. No real outbound send happens — that
          // only kicks in when the gateway is actually wired.
          const tool = TOOLS[name];
          if (tool?.kind === "external-hermes") {
            return await routeExternalHermesAsSideEffect(name, args, effectiveRunId, tenant);
          }
          return executeTool(store, name, args, { runId: effectiveRunId, actor: "pixush" });
        },
      );
    } catch (err) {
      reply.code(400);
      return { ok: false, error: (err as Error).message };
    }
  });

  /** Maps an external-hermes tool call (`gmail.send_email`, `whatsapp.send_message`) into
   *  the canonical side-effect record. Returns the same { ok, messageId, channel } shape the
   *  tool's outputShape declares so downstream LLM reasoning still receives a useful payload. */
  async function routeExternalHermesAsSideEffect(
    toolName: string,
    args: unknown,
    runIdHint: string | undefined,
    tenant: string,
  ): Promise<{ ok: boolean; messageId: string; channel: "email" | "whatsapp" }> {
    const a = (args ?? {}) as { to?: string; subject?: string; body?: string };
    const channel: "email" | "whatsapp" = toolName === "gmail.send_email" ? "email" : "whatsapp";
    const sideEffectRes = await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: {
        channel,
        direction: "outbound",
        to: a.to,
        subject: a.subject,
        body: a.body ?? "",
        tenant,
        runId: runIdHint,
      },
    });
    const body = sideEffectRes.json() as { ok: boolean; messageId: string };
    return { ok: body.ok, messageId: body.messageId, channel };
  }

  app.get<{ Querystring: { tenant?: string; runId?: string } }>("/audit", async (req) => {
    const tenant = req.query.tenant ?? "papaya";
    const all = store.getAudit(tenant);
    return req.query.runId ? all.filter((e) => e.runId === req.query.runId) : all;
  });

  app.get<{ Querystring: { tenant?: string } }>("/triggers", async (req) => {
    const tenant = req.query.tenant ?? "papaya";
    return enabledTriggers(store, tenant);
  });

  // ── Hermes callback for native-gateway channel sends/receives ────────────
  // Hermes's WhatsApp/Email gateways are self-contained — they don't post webhooks
  // back to us. The agent calls this endpoint via the `record-side-effect` skill
  // after every native send/receive so the audit log + Messages screen stay accurate.
  const sideEffectSchema = z.object({
    channel: z.enum(["email", "whatsapp"]),
    direction: z.enum(["outbound", "inbound"]),
    to: z.string().optional(),
    from: z.string().optional(),
    subject: z.string().optional(),
    body: z.string(),
    runId: z.string().optional(),
    tenant: z.string().optional(),
  });

  app.post("/side-effect", async (req, reply) => {
    const parsed = sideEffectSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: "invalid side-effect payload" };
    }
    const tenant = parsed.data.tenant ?? "papaya";
    const runId = parsed.data.runId ?? store.currentActiveRunId(tenant);
    const integration = parsed.data.channel === "email" ? "Gmail" : "WhatsApp";

    const inbound = parsed.data.direction === "inbound";
    const msg = store.addMessage({
      tenant,
      from: inbound ? (parsed.data.from ?? "external") : "agent",
      to: inbound ? "agent" : (parsed.data.to ?? "—"),
      role: inbound ? "inbound" : "employee",
      channel: parsed.data.channel,
      body: parsed.data.body,
      direction: parsed.data.direction,
    });

    const capability = inbound
      ? `${parsed.data.channel}.message_received`
      : `${parsed.data.channel}.send_message`;
    const target = inbound ? (parsed.data.from ?? "—") : (parsed.data.to ?? "—");
    const bodyPreview = parsed.data.body.length > 60
      ? `${parsed.data.body.slice(0, 60)}…`
      : parsed.data.body;
    const summary = inbound
      ? `Received ${parsed.data.channel} from ${target}: "${bodyPreview}"`
      : parsed.data.subject
        ? `Sent ${parsed.data.channel} to ${target}: "${parsed.data.subject}"`
        : `Sent ${parsed.data.channel} to ${target}`;

    const label = inbound
      ? `Inbound ${parsed.data.channel}`
      : parsed.data.channel === "email" ? "Send welcome email" : "Send WhatsApp";

    store.audit({
      tenant,
      capability,
      label,
      integration,
      target,
      summary,
      actor: "hermes-native",
      status: "success",
      runId,
      inputs: {
        to: parsed.data.to,
        from: parsed.data.from,
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
      outputs: { ok: true, messageId: msg.id },
    });

    return { ok: true, messageId: msg.id };
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
      // Tools belonging to THIS connector (not just the role-port) — the dashboard's
      // schema side panel renders these as the Actions list.
      const ownTools = Object.values(TOOLS).filter((t) => t.connector === def.id);
      const tools = ownTools.map((t) => t.name);
      const capabilities = def.capabilities.map((cap) => {
        const tool = TOOLS[cap.name];
        return {
          ...cap,
          kind: tool?.kind ?? null,
          inputSchema: tool ? schemaToTree(tool.schema) : null,
          outputSchema: tool ? schemaToTree(tool.outputShape) : null,
        };
      });
      return { ...def, ...state, tools, capabilities };
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

  // ── Workflow CRUD (picker) ────────────────────────────────────────────
  const createWorkflowSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    trigger: z.object({
      type: z.string(),
      connector: z.string(),
      sample: z.record(z.unknown()).optional(),
    }),
  });

  app.post<{ Querystring: { tenant?: string }; Body: unknown }>("/workflows", async (req, reply) => {
    const tenant = req.query.tenant ?? "papaya";
    const parsed = createWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: "invalid workflow seed" };
    }
    if (store.getWorkflow(tenant, parsed.data.id)) {
      reply.code(409);
      return { ok: false, error: "workflow already exists" };
    }
    const rootId = "n1";
    const def: import("./workflows/types.js").WorkflowDefinition = {
      id: parsed.data.id,
      name: parsed.data.name,
      version: 1,
      trigger: parsed.data.trigger,
      root: rootId,
      nodes: { [rootId]: { id: rootId, kind: "action", capability: "", input: {} } },
    };
    store.setWorkflow(tenant, def);
    return def;
  });

  app.delete<{ Params: { id: string }; Querystring: { tenant?: string } }>("/workflows/:id", async (req, reply) => {
    const tenant = req.query.tenant ?? "papaya";
    if (!store.getWorkflow(tenant, req.params.id)) {
      reply.code(404);
      return { ok: false, error: "unknown workflow" };
    }
    store.deleteWorkflow(tenant, req.params.id);
    return { ok: true };
  });

  // ── Async test runs (Test Flow drawer) ────────────────────────────────
  app.post<{ Params: { id: string }; Querystring: { tenant?: string } }>("/workflows/:id/test", async (req, reply) => {
    const tenant = req.query.tenant ?? "papaya";
    const wf = store.getWorkflow(tenant, req.params.id);
    if (!wf) { reply.code(404); return { ok: false, error: "unknown workflow" }; }
    const runId = randomUUID();
    store.addRun({ tenant, runId, workflowId: req.params.id, status: "running" });

    const sample = wf.trigger.sample ?? {};
    const task = `Run the ${wf.name} workflow for the trigger payload below. ` +
      `Trigger: ${wf.trigger.type} via ${wf.trigger.connector}. Payload: ${JSON.stringify(sample)}.`;

    // Fire and forget — update Run state when finished. The Test Flow drawer polls
    // /runs/:id and /audit?runId= until status is done|error.
    void runWorkflow(
      { tenant, task, workflowId: req.params.id, source: "test-flow", runId },
      deps.hermes,
      store,
    )
      .then((r) => store.updateRun(runId, { status: "done", response: r.response }))
      .catch((e) => store.updateRun(runId, { status: "error", error: (e as Error).message }));

    return { runId };
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const run = store.getRun(req.params.id);
    if (!run) { reply.code(404); return { ok: false, error: "unknown run" }; }
    return run;
  });

  // ── Dev simulator for inbound WhatsApp/Email Q&A (demo step 10) ──────
  const simulateInboundSchema = z.object({
    channel: z.enum(["whatsapp", "email"]),
    from: z.string(),
    body: z.string(),
  });

  app.post<{ Body: unknown; Querystring: { tenant?: string } }>("/simulate/inbound", async (req, reply) => {
    const parsed = simulateInboundSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { ok: false, error: "invalid inbound payload" };
    }
    const tenant = req.query.tenant ?? "papaya";
    const runId = randomUUID();
    store.addRun({ tenant, runId, workflowId: "inbound-qa", status: "running" });

    // 1) Record the inbound side-effect immediately so the Messages/Audit screens reflect it.
    await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: {
        channel: parsed.data.channel,
        direction: "inbound",
        from: parsed.data.from,
        body: parsed.data.body,
        runId,
        tenant,
      },
    });

    // 2) Fire-and-forget a free-form Hermes run that should reply via the same channel +
    //    record_side_effect to log the outbound. SOUL is updated separately to enforce this.
    const inboundNote =
      `You just received this inbound ${parsed.data.channel} message from ${parsed.data.from}: ` +
      `"${parsed.data.body}". Look up any context you need via your tools (e.g. Maya Cohen's start ` +
      `date is in the HRIS). Then reply via your native ${parsed.data.channel} gateway and call ` +
      `record_side_effect to log your outbound message.`;

    void runWorkflow(
      { tenant, task: inboundNote, workflowId: "inbound-qa", source: "inbound", runId },
      deps.hermes,
      store,
    )
      .then((r) => store.updateRun(runId, { status: "done", response: r.response }))
      .catch((e) => store.updateRun(runId, { status: "error", error: (e as Error).message }));

    return { runId };
  });

  app.get("/capabilities", async () => capabilitySpecs());

  return app;
}
