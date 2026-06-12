# Lean End-to-End Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The thinnest path through every main component — **Engine (TS) + Agent service (Hermes) + Dashboard (TS/React)** — running on **docker-compose** (then AWS), exercising one onboarding flow via (a) the Sensei `/execute` text path and (b) an inbound WhatsApp conversation.

**Architecture:** Two services + a dashboard, over HTTP. The **engine** (TypeScript/Fastify) owns the Sensei contract, the in-memory domain store + audit, and the domain tools. The **agent service** is Hermes run as `hermes gateway`, exposing an OpenAI-*compatible* HTTP API; the engine calls it to reason. Hermes reaches our domain tools via a **skill that HTTP-calls the engine's `/tools/execute`** (no MCP). For the demo, WhatsApp is **inbound-triggered** (Hermes channels are reply-only). DynamoDB/S3, the confidentiality send-gate, offboarding, encryption, and real model-auth are **deferred** (in-memory + injected config for the slice).

**Tech Stack:** Engine: Node 20, TypeScript, Fastify, zod, vitest, tsx. Agent: Hermes (Python) + Node 18 (WhatsApp bridge) in Docker. Dashboard: Vite + React + TypeScript. Orchestration: docker-compose.

**Precision note (decisions 47–49):** "OpenAI-compatible" is only the engine↔Hermes *wire format*, NOT a dependency on OpenAI the company. The model Hermes reasons with is separate config. The tool callback is a **Hermes skill → engine HTTP**, not MCP.

---

## Component map

```
engine/          TS/Fastify: /health /execute /tools/execute /audit · store · tools · hermes client
agent/           Hermes config: Dockerfile, .env.example, SOUL.md, skills/hris-tool/{SKILL.md,run.sh}
dashboard/       Vite/React: trigger + response + audit view
docker-compose.yml
```

The old Python `service/` (Plan 1) is removed in Phase 0 — the engine is TS now (decision 43).

---

## Phase 0 — Reset to the new structure

### Task 0: Remove the Python service, create the slice directories

**Files:**
- Delete: `service/` (entire directory)
- Create: `engine/`, `agent/`, `dashboard/` (empty dirs created by later tasks)

- [ ] **Step 1: Remove the Python service**

Run:

```bash
git rm -r service
git commit -m "chore: remove python service (engine is TypeScript now, decision 43)"
```

Expected: `service/` is deleted and the removal is committed.

---

## Phase 1 — Engine (TypeScript, TDD)

### Task 1: Scaffold the TS engine + /health (TDD)

**Files:**
- Create: `engine/package.json`, `engine/tsconfig.json`, `engine/vitest.config.ts`
- Create: `engine/src/app.ts`
- Test: `engine/tests/health.test.ts`

- [ ] **Step 1: Create `engine/package.json`**

```json
{
  "name": "@pixushr/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^5.1.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5",
    "@types/node": "^22.9.0"
  }
}
```

- [ ] **Step 2: Create `engine/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `engine/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: Install deps**

Run:

```bash
cd engine && npm install
```

Expected: `node_modules/` and `package-lock.json` created; no errors.

- [ ] **Step 5: Write the failing test** — `engine/tests/health.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";

describe("health", () => {
  it("GET /health returns ok", async () => {
    const app = buildApp({ store: {} as any, hermes: {} as any });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `cd engine && npm test`
Expected: FAIL — cannot find `../src/app.js`.

- [ ] **Step 7: Create `engine/src/app.ts`**

```ts
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
```

- [ ] **Step 8: Run the test to confirm it passes**

Run: `cd engine && npm test`
Expected: PASS (note: `store.js`/`hermes.js` are only type imports, erased at runtime, so this compiles/runs).

- [ ] **Step 9: Commit**

```bash
git add engine/package.json engine/tsconfig.json engine/vitest.config.ts engine/src/app.ts engine/tests/health.test.ts engine/package-lock.json
git commit -m "feat(engine): scaffold TS engine with /health"
```

(Add `engine/node_modules/` and `dist/` to the root `.gitignore` if not already covered by `node_modules/`.)

---

### Task 2: In-memory store + audit (TDD)

**Files:**
- Create: `engine/src/store.ts`
- Test: `engine/tests/store.test.ts`

- [ ] **Step 1: Write the failing test** — `engine/tests/store.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";

describe("InMemoryStore", () => {
  it("upserts and reads an employee by tenant+id", () => {
    const store = new InMemoryStore();
    store.upsertEmployee("papaya", { id: "e1", name: "Maya", role: "Engineer" });
    expect(store.getEmployee("papaya", "e1")?.name).toBe("Maya");
  });

  it("isolates by tenant", () => {
    const store = new InMemoryStore();
    store.upsertEmployee("papaya", { id: "e1", name: "Maya", role: "Engineer" });
    expect(store.getEmployee("acme", "e1")).toBeUndefined();
  });

  it("records audit entries", () => {
    const store = new InMemoryStore();
    store.audit({ tenant: "papaya", capability: "hris.upsert_employee", target: "e1", summary: "created" });
    const log = store.getAudit("papaya");
    expect(log).toHaveLength(1);
    expect(log[0].capability).toBe("hris.upsert_employee");
    expect(typeof log[0].ts).toBe("string");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd engine && npm test -- store`
Expected: FAIL — cannot find `../src/store.js`.

- [ ] **Step 3: Create `engine/src/store.ts`**

```ts
export interface Employee {
  id: string;
  name: string;
  role: string;
  startDate?: string;
  department?: string;
  managerId?: string;
  employmentType?: string;
}

export interface AuditEntry {
  ts: string;
  tenant: string;
  capability: string;
  target: string;
  summary: string;
}

export class InMemoryStore {
  private employees = new Map<string, Employee>();
  private auditLog: AuditEntry[] = [];

  private key(tenant: string, id: string): string {
    return `${tenant}#employee#${id}`;
  }

  upsertEmployee(tenant: string, emp: Employee): Employee {
    this.employees.set(this.key(tenant, emp.id), emp);
    return emp;
  }

  getEmployee(tenant: string, id: string): Employee | undefined {
    return this.employees.get(this.key(tenant, id));
  }

  audit(entry: Omit<AuditEntry, "ts">): void {
    this.auditLog.push({ ...entry, ts: new Date().toISOString() });
  }

  getAudit(tenant: string): AuditEntry[] {
    return this.auditLog.filter((e) => e.tenant === tenant);
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd engine && npm test -- store`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/src/store.ts engine/tests/store.test.ts
git commit -m "feat(engine): in-memory employee store + audit"
```

---

### Task 3: Domain tool registry — `hris.upsert_employee` (TDD)

**Files:**
- Create: `engine/src/tools.ts`
- Test: `engine/tests/tools.test.ts`

- [ ] **Step 1: Write the failing test** — `engine/tests/tools.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";
import { executeTool, TOOLS } from "../src/tools.js";

describe("tools", () => {
  it("hris.upsert_employee writes the employee and an audit entry", async () => {
    const store = new InMemoryStore();
    const result = await executeTool(store, "hris.upsert_employee", {
      tenant: "papaya",
      id: "e1",
      name: "Maya Cohen",
      role: "Engineer",
      startDate: "2026-07-01",
    });
    expect(result.ok).toBe(true);
    expect(store.getEmployee("papaya", "e1")?.name).toBe("Maya Cohen");
    expect(store.getAudit("papaya")[0].capability).toBe("hris.upsert_employee");
  });

  it("rejects unknown tools", async () => {
    const store = new InMemoryStore();
    await expect(executeTool(store, "nope", {})).rejects.toThrow(/unknown tool/i);
  });

  it("rejects missing required fields", async () => {
    const store = new InMemoryStore();
    await expect(
      executeTool(store, "hris.upsert_employee", { tenant: "papaya", id: "e1" }),
    ).rejects.toThrow(/required/i);
  });

  it("exposes a tool catalog", () => {
    expect(TOOLS["hris.upsert_employee"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd engine && npm test -- tools`
Expected: FAIL — cannot find `../src/tools.js`.

- [ ] **Step 3: Create `engine/src/tools.ts`**

```ts
import { z } from "zod";
import type { InMemoryStore } from "./store.js";

const upsertSchema = z.object({
  tenant: z.string(),
  id: z.string(),
  name: z.string(),
  role: z.string(),
  startDate: z.string().optional(),
  department: z.string().optional(),
  managerId: z.string().optional(),
  employmentType: z.string().optional(),
});

export interface ToolResult {
  ok: boolean;
  [k: string]: unknown;
}

export type ToolFn = (store: InMemoryStore, args: unknown) => Promise<ToolResult>;

export const TOOLS: Record<string, ToolFn> = {
  "hris.upsert_employee": async (store, args) => {
    const parsed = upsertSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`required fields missing: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    }
    const { tenant, ...emp } = parsed.data;
    store.upsertEmployee(tenant, emp);
    store.audit({
      tenant,
      capability: "hris.upsert_employee",
      target: emp.id,
      summary: `upserted employee ${emp.name} (${emp.role})`,
    });
    return { ok: true, employee: emp };
  },
};

export async function executeTool(store: InMemoryStore, name: string, args: unknown): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool(store, args);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd engine && npm test -- tools`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/src/tools.ts engine/tests/tools.test.ts
git commit -m "feat(engine): hris.upsert_employee domain tool with validation"
```

---

### Task 4: `POST /tools/execute` (skill callback) + `GET /audit` (TDD)

**Files:**
- Modify: `engine/src/app.ts`
- Test: `engine/tests/toolsExecute.test.ts`

- [ ] **Step 1: Write the failing test** — `engine/tests/toolsExecute.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";

function appWithStore() {
  const store = new InMemoryStore();
  return { app: buildApp({ store, hermes: {} as any }), store };
}

describe("/tools/execute", () => {
  it("runs a domain tool and returns its result", async () => {
    const { app } = appWithStore();
    const res = await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "hris.upsert_employee", args: { tenant: "papaya", id: "e1", name: "Maya", role: "Eng" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("returns 400 for unknown tools", async () => {
    const { app } = appWithStore();
    const res = await app.inject({ method: "POST", url: "/tools/execute", payload: { name: "nope", args: {} } });
    expect(res.statusCode).toBe(400);
  });

  it("GET /audit returns the tenant audit log", async () => {
    const { app } = appWithStore();
    await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "hris.upsert_employee", args: { tenant: "papaya", id: "e1", name: "Maya", role: "Eng" } },
    });
    const res = await app.inject({ method: "GET", url: "/audit?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd engine && npm test -- toolsExecute`
Expected: FAIL — routes return 404.

- [ ] **Step 3: Add routes to `engine/src/app.ts`** — replace the file with:

```ts
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd engine && npm test -- toolsExecute`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/src/app.ts engine/tests/toolsExecute.test.ts
git commit -m "feat(engine): /tools/execute skill callback + /audit"
```

---

### Task 5: Hermes client + `/execute` orchestrator (TDD with a fake Hermes)

**Files:**
- Create: `engine/src/hermes.ts`, `engine/src/models.ts`, `engine/src/orchestrator.ts`
- Modify: `engine/src/app.ts`
- Test: `engine/tests/orchestrator.test.ts`

- [ ] **Step 1: Create `engine/src/models.ts`**

```ts
export interface ExecuteRequest {
  task: string;
  context?: Record<string, unknown>;
}

export interface ExecuteResponse {
  response: string;
  structured?: Record<string, unknown>;
}

export interface AgentReply {
  requestId: string;
  tenant: string;
  user: { id: string; name: string; role: string; channel: "sensei" | "teams" | "slack" | "email" };
  response: string;
  actions: { capability: string; target: string; summary: string }[];
}
```

- [ ] **Step 2: Create `engine/src/hermes.ts`** (interface + HTTP impl)

```ts
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HermesClient {
  chat(messages: ChatMessage[]): Promise<string>;
}

export class HttpHermesClient implements HermesClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model = "hermes-agent",
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`hermes ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    return body.choices[0]?.message?.content ?? "";
  }
}
```

- [ ] **Step 3: Write the failing test** — `engine/tests/orchestrator.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import type { HermesClient, ChatMessage } from "../src/hermes.js";

class FakeHermes implements HermesClient {
  public lastMessages: ChatMessage[] = [];
  constructor(private reply: string) {}
  async chat(messages: ChatMessage[]): Promise<string> {
    this.lastMessages = messages;
    return this.reply;
  }
}

describe("/execute", () => {
  it("calls Hermes with the task and returns its text as response", async () => {
    const hermes = new FakeHermes("Hi Maya, welcome to Papaya!");
    const app = buildApp({ store: new InMemoryStore(), hermes });
    const res = await app.inject({
      method: "POST",
      url: "/execute",
      payload: { task: "Onboard Maya Cohen", context: { tenant: "papaya" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().response).toContain("Maya");
    expect(res.json().structured.tenant).toBe("papaya");
    // the task reached Hermes
    expect(hermes.lastMessages.some((m) => m.content.includes("Onboard Maya Cohen"))).toBe(true);
  });

  it("defaults tenant to papaya when absent", async () => {
    const app = buildApp({ store: new InMemoryStore(), hermes: new FakeHermes("ok") });
    const res = await app.inject({ method: "POST", url: "/execute", payload: { task: "hi" } });
    expect(res.json().structured.tenant).toBe("papaya");
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `cd engine && npm test -- orchestrator`
Expected: FAIL — `/execute` returns 404.

- [ ] **Step 5: Create `engine/src/orchestrator.ts`**

```ts
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
```

- [ ] **Step 6: Add the `/execute` route to `engine/src/app.ts`** — add these imports and route (keep everything else):

Add imports at the top:

```ts
import { runExecute } from "./orchestrator.js";
import type { ExecuteRequest, ExecuteResponse } from "./models.js";
```

Add inside `buildApp`, before `return app;`:

```ts
  app.post<{ Body: ExecuteRequest }>("/execute", async (req): Promise<ExecuteResponse> => {
    const reply = await runExecute(req.body, deps.hermes);
    return { response: reply.response, structured: reply as unknown as Record<string, unknown> };
  });
```

- [ ] **Step 7: Run the test to confirm it passes**

Run: `cd engine && npm test -- orchestrator`
Expected: PASS (2 tests).

- [ ] **Step 8: Run the FULL engine suite**

Run: `cd engine && npm test`
Expected: PASS — health, store, tools, toolsExecute, orchestrator.

- [ ] **Step 9: Commit**

```bash
git add engine/src/hermes.ts engine/src/models.ts engine/src/orchestrator.ts engine/src/app.ts engine/tests/orchestrator.test.ts
git commit -m "feat(engine): hermes client + /execute orchestrator"
```

---

### Task 6: Server entrypoint (wires real deps from env)

**Files:**
- Create: `engine/src/server.ts`

- [ ] **Step 1: Create `engine/src/server.ts`**

```ts
import { buildApp } from "./app.js";
import { InMemoryStore } from "./store.js";
import { HttpHermesClient } from "./hermes.js";

const port = Number(process.env.PORT ?? 3000);
const hermesUrl = process.env.HERMES_URL ?? "http://localhost:8642";
const hermesKey = process.env.HERMES_API_KEY ?? "dev-key";

const app = buildApp({
  store: new InMemoryStore(),
  hermes: new HttpHermesClient(hermesUrl, hermesKey),
});

app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`engine listening on :${port}, hermes at ${hermesUrl}`);
});
```

- [ ] **Step 2: Verify it starts**

Run: `cd engine && PORT=3000 npm start` (then Ctrl-C). Expected: logs `engine listening on :3000`.

- [ ] **Step 3: Commit**

```bash
git add engine/src/server.ts
git commit -m "feat(engine): server entrypoint wiring env-configured deps"
```

---

## Phase 2 — Agent service (Hermes)

> Hermes is config-heavy, not unit-testable here, so these tasks create exact files + a verifiable startup. Model-auth and the WhatsApp QR link are injected at deploy (decisions 47/49).

### Task 7: Agent container + Hermes config

**Files:**
- Create: `agent/Dockerfile`, `agent/.env.example`, `agent/SOUL.md`

- [ ] **Step 1: Create `agent/SOUL.md`** (minimal persona)

```markdown
# Identity
You are Papaya's HR onboarding & offboarding assistant. You are warm, professional,
empathetic, and precise. You never invent employee facts — you read and write them through
your tools. You keep employee data confidential. When you act, you confirm what you did in a
short, friendly summary.
```

- [ ] **Step 2: Create `agent/.env.example`**

```bash
# Hermes API server (engine calls this)
API_SERVER_ENABLED=true
API_SERVER_KEY=change-me-dev-key
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642

# Model the agent reasons with. base_url + api_key = real provider auth (wired at deploy).
HERMES_MODEL=openai/gpt-4o
# base_url and api_key injected at deploy (decision 47/#4)

# Memory off for deterministic, stateless runs
HERMES_SKIP_MEMORY=true

# Engine callback URL (used by the hris-tool skill)
ENGINE_URL=http://engine:3000

# WhatsApp (inbound-only; link a phone at deploy)
WHATSAPP_ENABLED=true
WHATSAPP_MODE=bot
```

- [ ] **Step 3: Create `agent/Dockerfile`**

```dockerfile
FROM python:3.12-slim

# Node 18+ for the Hermes WhatsApp bridge
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg git \
 && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

# Install Hermes (pin a version at integration time)
RUN pip install --no-cache-dir hermes-agent

WORKDIR /root/.hermes
COPY SOUL.md /root/.hermes/SOUL.md
COPY skills/ /root/.hermes/skills/

EXPOSE 8642
CMD ["hermes", "gateway"]
```

- [ ] **Step 4: Commit**

```bash
git add agent/Dockerfile agent/.env.example agent/SOUL.md
git commit -m "feat(agent): hermes container, env template, SOUL.md"
```

> **Integration note for the executor:** confirm the exact pip package name and any `hermes` CLI init step against the Hermes docs when first building the image; pin the version. If the package name differs, update the `pip install` line — do not guess silently.

### Task 8: The engine-callback skill (no MCP)

**Files:**
- Create: `agent/skills/hris-tool/SKILL.md`, `agent/skills/hris-tool/run.sh`

- [ ] **Step 1: Create `agent/skills/hris-tool/SKILL.md`**

```markdown
---
name: hris-tool
description: Execute a PixushHR domain tool (e.g. hris.upsert_employee) by calling the engine.
---

Use this skill to run a domain tool against the HR system. Provide the tool `name` and its
`args` as JSON. Example: name="hris.upsert_employee", args={"tenant":"papaya","id":"e1",
"name":"Maya Cohen","role":"Engineer","startDate":"2026-07-01"}.

Run: `bash run.sh '<name>' '<args-json>'` — it returns the tool result JSON.
```

- [ ] **Step 2: Create `agent/skills/hris-tool/run.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
NAME="$1"
ARGS="$2"
ENGINE_URL="${ENGINE_URL:-http://engine:3000}"
curl -sS -X POST "$ENGINE_URL/tools/execute" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$NAME\", \"args\": $ARGS}"
```

- [ ] **Step 3: Make it executable + commit**

```bash
chmod +x agent/skills/hris-tool/run.sh
git add agent/skills/hris-tool/SKILL.md agent/skills/hris-tool/run.sh
git commit -m "feat(agent): hris-tool skill calling engine /tools/execute (no MCP)"
```

> **Integration note:** the exact skill-file format (frontmatter keys, how the agent invokes a skill script + passes args) must be confirmed against Hermes' "Build a Hermes Plugin"/skills docs when wiring; adjust `SKILL.md` to match. The HTTP callback contract (`POST /tools/execute {name, args}`) is fixed by the engine (Task 4).

---

## Phase 3 — Dashboard (TS/React)

### Task 9: Minimal dashboard — trigger + response + audit

**Files:**
- Create: `dashboard/` via Vite, then `dashboard/src/App.tsx`, `dashboard/.env.example`

- [ ] **Step 1: Scaffold Vite React-TS**

Run:

```bash
npm create vite@latest dashboard -- --template react-ts
cd dashboard && npm install
```

Expected: a Vite React-TS app in `dashboard/`.

- [ ] **Step 2: Create `dashboard/.env.example`**

```bash
VITE_ENGINE_URL=http://localhost:3000
```

- [ ] **Step 3: Replace `dashboard/src/App.tsx`**

```tsx
import { useState } from "react";

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? "http://localhost:3000";

interface AuditEntry { ts: string; capability: string; target: string; summary: string }

export default function App() {
  const [task, setTask] = useState("Onboard Maya Cohen (id e1, Engineer, start 2026-07-01)");
  const [response, setResponse] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);

  async function trigger() {
    setBusy(true);
    try {
      const r = await fetch(`${ENGINE}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, context: { tenant: "papaya" } }),
      });
      const body = await r.json();
      setResponse(body.response ?? "");
      const a = await fetch(`${ENGINE}/audit?tenant=papaya`);
      setAudit(await a.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 760, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>PixushHR — Lean Slice</h1>
      <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3} style={{ width: "100%" }} />
      <button onClick={trigger} disabled={busy} style={{ marginTop: 8 }}>
        {busy ? "Running…" : "Trigger /execute"}
      </button>

      <h2>Response</h2>
      <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: 12 }}>{response}</pre>

      <h2>Audit ({audit.length})</h2>
      <ul>
        {audit.map((e, i) => (
          <li key={i}><code>{e.capability}</code> → {e.target}: {e.summary} <small>({e.ts})</small></li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Verify it builds**

Run: `cd dashboard && npm run build`
Expected: a successful production build (no type errors).

- [ ] **Step 5: Commit**

```bash
git add dashboard
git commit -m "feat(dashboard): minimal trigger + response + audit view"
```

> **CORS note for the executor:** when wiring compose (Task 10), enable permissive CORS on the engine for the dashboard origin (add `@fastify/cors` to the engine and register it in `app.ts`). Add this as a small follow-up commit during Task 10.

---

## Phase 4 — Compose + deploy

### Task 10: docker-compose for local end-to-end

**Files:**
- Create: `engine/Dockerfile`, `dashboard/Dockerfile`, `docker-compose.yml`
- Modify: `engine/src/app.ts` (+ `@fastify/cors`)

- [ ] **Step 1: Add CORS to the engine**

Run: `cd engine && npm install @fastify/cors`. Then in `engine/src/app.ts`, after creating `app`, register it:

```ts
import cors from "@fastify/cors";
// ... inside buildApp, right after `const app = Fastify(...)`:
app.register(cors, { origin: true });
```

Run `cd engine && npm test` → still green. Commit: `git add engine && git commit -m "feat(engine): enable CORS for dashboard"`.

- [ ] **Step 2: Create `engine/Dockerfile`**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]
```

- [ ] **Step 3: Create `dashboard/Dockerfile`**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 4: Create `docker-compose.yml`** (repo root)

```yaml
services:
  engine:
    build: ./engine
    environment:
      PORT: "3000"
      HERMES_URL: "http://agent:8642"
      HERMES_API_KEY: "change-me-dev-key"
    ports: ["3000:3000"]

  agent:
    build: ./agent
    env_file: ./agent/.env
    environment:
      ENGINE_URL: "http://engine:3000"
    ports: ["8642:8642"]
    depends_on: [engine]

  dashboard:
    build: ./dashboard
    environment:
      VITE_ENGINE_URL: "http://localhost:3000"
    ports: ["8080:80"]
    depends_on: [engine]
```

- [ ] **Step 5: Commit**

```bash
cp agent/.env.example agent/.env   # fill secrets at deploy; .env is gitignored
echo "agent/.env" >> .gitignore
git add engine/Dockerfile dashboard/Dockerfile docker-compose.yml .gitignore
git commit -m "feat: docker-compose for engine + agent + dashboard"
```

### Task 11: Local end-to-end verification

- [ ] **Step 1: Bring it up**

Run: `docker compose up --build`. Expected: all three services start; engine logs listening; agent logs the gateway on 8642.

- [ ] **Step 2: Sensei-path smoke (text)**

Run:

```bash
curl -s -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{"task":"Onboard Maya Cohen (id e1, Engineer, start 2026-07-01)","context":{"tenant":"papaya"}}'
curl -s "http://localhost:3000/audit?tenant=papaya"
```

Expected: a warm response string; the audit shows an `hris.upsert_employee` entry (proves the agent reasoned → called the skill → engine ran the tool). Open `http://localhost:8080` and click Trigger — same result in the UI.

- [ ] **Step 3: WhatsApp-path smoke (inbound)**

Link a phone: `docker compose exec agent hermes whatsapp` and scan the QR (WhatsApp → Linked Devices). Then from the linked phone, message the bot: "Hi, I'm Maya Cohen starting July 1 as an Engineer." Expected: the agent replies with a warm welcome and the dashboard audit shows the `hris.upsert_employee` entry.

### Task 12: AWS deploy

- [ ] **Step 1: Provision + install Docker**

Provision a Lightsail/EC2 Ubuntu instance, open ports 3000/8080 (and 8642 if you want direct agent access). SSH in and install Docker + compose plugin:

```bash
curl -fsSL https://get.docker.com | sh
```

- [ ] **Step 2: Ship + configure**

Clone the repo (or copy it) to the box, `cp agent/.env.example agent/.env`, fill in `API_SERVER_KEY`, the model provider `base_url`/`api_key` (the real OpenAI-with-auth), and any WhatsApp settings. Set the dashboard `VITE_ENGINE_URL` to the instance's public URL.

- [ ] **Step 3: Run + link**

```bash
docker compose up -d --build
docker compose exec agent hermes whatsapp   # scan QR to link
```

Expected: the slice is live on AWS — `/execute` works against the public engine URL, the dashboard loads, and the inbound WhatsApp flow replies. **This is the manual end-to-end test target.**

---

## Done criteria

- `cd engine && npm test` green (health, store, tools, toolsExecute, orchestrator).
- `docker compose up` brings up engine + agent + dashboard.
- Text path: `POST /execute` → warm response + an `hris.upsert_employee` audit entry (agent → skill → engine tool).
- WhatsApp path: inbound message → agent reply + audit entry.
- Deployed and manually testable on AWS.

## Deferred (next, widening passes)

Real model-auth specifics · the confidentiality send-gate (decisions 44–46) · offboarding workflow · DynamoDB/S3 (replace in-memory) · the typed `WorkflowDefinition` engine + playbook serializer · self-test Sensei suite · the full dashboard (§12 of the spec) + design system (§13).
