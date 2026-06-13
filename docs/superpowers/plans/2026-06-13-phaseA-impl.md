# Phase A — Onboarding Multi-Step Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `/execute` ("Onboard <hire>") drives the agent through the full onboarding sequence — extract contract → ask hiring manager → populate HRIS → add to Teams → schedule first day → share branding → send a warm welcome — across mock integrations over synthetic data, visible in the trace, Messages screen, and Audit screen.

**Architecture:** Engine (TS/Fastify) gains canonical domain models + synthetic fixtures, a tool **registry** of mock integration capabilities (each validates → mutates store → audits), a typed `WorkflowDefinition` for onboarding, and an NL playbook serializer the orchestrator injects so Hermes follows the steps and calls one tool per step via the existing `/tools/execute` HTTP callback. The dashboard adds Messages and Audit screens and a tool-call trace on Live Run. Storage stays in-memory; this is the happy-path linear workflow (conditions/escalation/confidentiality deferred to Phase B). Integrations are modelled as a registry now so Phase A10's config UI layers on without a rewrite.

**Tech Stack:** TypeScript, Fastify, zod, vitest (engine); React, Vite, Tailwind + vendored design system, Playwright (dashboard).

---

## File Structure

**Engine — create:**
- `engine/src/fixtures.ts` — `seedFixtures(store, tenant)`: seeds departments, manager, signed contract, branding.
- `engine/src/workflows/onboarding.ts` — typed `WorkflowDefinition` for onboarding (ordered steps: intent + capability + audience).
- `engine/src/workflows/serialize.ts` — `serializePlaybook(wf, catalog)`: renders the definition + tool catalog to an NL playbook string.
- `engine/tests/fixtures.test.ts`, `engine/tests/serialize.test.ts`, `engine/tests/messages.test.ts`.

**Engine — modify:**
- `engine/src/store.ts` — add `Contract`/`Manager`/`Department`/`BrandingPack`/`Message`/`CalendarInvite`/`TeamMembership` types, maps, getters/setters, `reset()`.
- `engine/src/tools.ts` — `ToolDef` registry shape, five new mock tools, `toolCatalog()`, shared `parseArgs` helper.
- `engine/src/orchestrator.ts` — inject the serialized playbook into the Hermes messages.
- `engine/src/app.ts` — `GET /messages`, `POST /reset`.
- `engine/src/server.ts` — `seedFixtures` at startup.
- `engine/src/stubHermes.ts` — drive the full tool sequence.
- `engine/tests/e2e.test.ts`, `engine/tests/tools.test.ts` — extend.

**Dashboard — create:**
- `dashboard/src/screens/MessagesScreen.tsx`, `dashboard/src/screens/AuditScreen.tsx`.

**Dashboard — modify:**
- `dashboard/src/screens/LiveRunScreen.tsx` — tool-call trace card (TraceRow).
- `dashboard/src/shell/AppShell.tsx` — wire the two new screens.
- `dashboard/e2e/onboarding.spec.ts` — assert the multi-tool run + a message.

**Out of scope (this plan):** A10 (configurable-integrations registry UI + workflow editor) — a separate follow-up plan, built after A1–A9 run. Also deferred to Phase B: conditions/escalation, offboarding, confidentiality send-gate hardening.

---

## Task 1: Domain models + store extensions

**Files:**
- Modify: `engine/src/store.ts`
- Test: `engine/tests/store.test.ts` (extend)

- [ ] **Step 1: Write failing tests for the new store surface**

Append to `engine/tests/store.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";

describe("store — phase A domain", () => {
  it("stores and reads a contract", () => {
    const s = new InMemoryStore();
    s.addContract("papaya", {
      candidateId: "c1", name: "Maya Cohen", role: "Engineer", startDate: "2026-07-01",
      department: "Engineering", managerId: "m1", employmentType: "Full-time", signed: true,
    });
    expect(s.getContract("papaya", "c1")?.name).toBe("Maya Cohen");
  });

  it("stores and reads a manager and branding", () => {
    const s = new InMemoryStore();
    s.addManager("papaya", { id: "m1", name: "Daniel Levi", department: "Engineering", cannedAnswer: "Payments squad." });
    s.setBranding("papaya", { companyStory: "story", cultureVideoUrl: "url", welcomeNote: "note" });
    expect(s.getManager("papaya", "m1")?.cannedAnswer).toContain("Payments");
    expect(s.getBranding("papaya")?.companyStory).toBe("story");
  });

  it("appends messages and returns them tenant-scoped with ids", () => {
    const s = new InMemoryStore();
    const m = s.addMessage({ tenant: "papaya", from: "agent", to: "Maya Cohen", role: "employee", channel: "email", body: "Welcome" });
    expect(m.id).toBeTruthy();
    expect(m.ts).toBeTruthy();
    expect(s.getMessages("papaya")).toHaveLength(1);
    expect(s.getMessages("acme")).toHaveLength(0);
  });

  it("records invites and memberships", () => {
    const s = new InMemoryStore();
    const inv = s.addInvite("papaya", { title: "Welcome", date: "2026-07-01", attendees: ["e1"], location: "HQ" });
    expect(inv.id).toBeTruthy();
    s.addMembership({ tenant: "papaya", employeeId: "e1", teams: ["Payments"] });
    expect(s.getMemberships("papaya")[0].teams).toEqual(["Payments"]);
  });

  it("reset clears all collections", () => {
    const s = new InMemoryStore();
    s.upsertEmployee("papaya", { id: "e1", name: "X", role: "Eng" });
    s.addMessage({ tenant: "papaya", from: "agent", to: "X", role: "employee", channel: "email", body: "hi" });
    s.reset();
    expect(s.getEmployee("papaya", "e1")).toBeUndefined();
    expect(s.getMessages("papaya")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix engine test -- store`
Expected: FAIL — `addContract`, `getContract`, `addManager`, `setBranding`, `addMessage`, `getMessages`, `addInvite`, `addMembership`, `getMemberships`, `reset` not defined.

- [ ] **Step 3: Implement the store extensions**

Replace the full contents of `engine/src/store.ts` with:

```typescript
import { randomUUID } from "node:crypto";

export interface Employee {
  id: string;
  name: string;
  role: string;
  startDate?: string;
  department?: string;
  managerId?: string;
  employmentType?: string;
}

export interface Contract {
  candidateId: string;
  name: string;
  role: string;
  startDate: string;
  department: string;
  managerId: string;
  employmentType: string;
  signed: boolean;
}

export interface Manager {
  id: string;
  name: string;
  department: string;
  cannedAnswer: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface BrandingPack {
  companyStory: string;
  cultureVideoUrl: string;
  welcomeNote: string;
}

export interface Message {
  id: string;
  tenant: string;
  from: "agent" | "employee";
  to: string;
  role: string;
  channel: "email" | "teams" | "slack";
  body: string;
  ts: string;
}

export interface CalendarInvite {
  id: string;
  tenant: string;
  title: string;
  date: string;
  attendees: string[];
  location: string;
}

export interface TeamMembership {
  tenant: string;
  employeeId: string;
  teams: string[];
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
  private contracts = new Map<string, Contract>();
  private managers = new Map<string, Manager>();
  private departments = new Map<string, Department>();
  private branding = new Map<string, BrandingPack>();
  private messages: Message[] = [];
  private invites: CalendarInvite[] = [];
  private memberships: TeamMembership[] = [];
  private auditLog: AuditEntry[] = [];

  private key(tenant: string, kind: string, id: string): string {
    return `${tenant}#${kind}#${id}`;
  }

  upsertEmployee(tenant: string, emp: Employee): Employee {
    this.employees.set(this.key(tenant, "employee", emp.id), emp);
    return emp;
  }

  getEmployee(tenant: string, id: string): Employee | undefined {
    return this.employees.get(this.key(tenant, "employee", id));
  }

  addContract(tenant: string, c: Contract): Contract {
    this.contracts.set(this.key(tenant, "contract", c.candidateId), c);
    return c;
  }

  getContract(tenant: string, candidateId: string): Contract | undefined {
    return this.contracts.get(this.key(tenant, "contract", candidateId));
  }

  addManager(tenant: string, m: Manager): Manager {
    this.managers.set(this.key(tenant, "manager", m.id), m);
    return m;
  }

  getManager(tenant: string, id: string): Manager | undefined {
    return this.managers.get(this.key(tenant, "manager", id));
  }

  addDepartment(tenant: string, d: Department): Department {
    this.departments.set(this.key(tenant, "department", d.id), d);
    return d;
  }

  getDepartment(tenant: string, id: string): Department | undefined {
    return this.departments.get(this.key(tenant, "department", id));
  }

  setBranding(tenant: string, b: BrandingPack): BrandingPack {
    this.branding.set(tenant, b);
    return b;
  }

  getBranding(tenant: string): BrandingPack | undefined {
    return this.branding.get(tenant);
  }

  addMessage(msg: Omit<Message, "id" | "ts">): Message {
    const full: Message = { ...msg, id: randomUUID(), ts: new Date().toISOString() };
    this.messages.push(full);
    return full;
  }

  getMessages(tenant: string): Message[] {
    return this.messages.filter((m) => m.tenant === tenant);
  }

  addInvite(tenant: string, invite: Omit<CalendarInvite, "id" | "tenant">): CalendarInvite {
    const full: CalendarInvite = { ...invite, id: randomUUID(), tenant };
    this.invites.push(full);
    return full;
  }

  getInvites(tenant: string): CalendarInvite[] {
    return this.invites.filter((i) => i.tenant === tenant);
  }

  addMembership(m: TeamMembership): TeamMembership {
    this.memberships.push(m);
    return m;
  }

  getMemberships(tenant: string): TeamMembership[] {
    return this.memberships.filter((m) => m.tenant === tenant);
  }

  audit(entry: Omit<AuditEntry, "ts">): void {
    this.auditLog.push({ ...entry, ts: new Date().toISOString() });
  }

  getAudit(tenant: string): AuditEntry[] {
    return this.auditLog.filter((e) => e.tenant === tenant);
  }

  reset(): void {
    this.employees.clear();
    this.contracts.clear();
    this.managers.clear();
    this.departments.clear();
    this.branding.clear();
    this.messages = [];
    this.invites = [];
    this.memberships = [];
    this.auditLog = [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix engine test -- store`
Expected: PASS (all store tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add engine/src/store.ts engine/tests/store.test.ts
git commit -m "feat(engine): extend store with onboarding domain models"
```

---

## Task 2: Synthetic fixtures

**Files:**
- Create: `engine/src/fixtures.ts`
- Test: `engine/tests/fixtures.test.ts`

- [ ] **Step 1: Write the failing test**

Create `engine/tests/fixtures.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";

describe("seedFixtures", () => {
  it("seeds a signed contract, manager, department, and branding for papaya", () => {
    const s = new InMemoryStore();
    seedFixtures(s);
    const contract = s.getContract("papaya", "c1");
    expect(contract?.name).toBe("Maya Cohen");
    expect(contract?.signed).toBe(true);
    expect(contract?.managerId).toBe("m1");
    expect(s.getManager("papaya", "m1")?.cannedAnswer).toBeTruthy();
    expect(s.getDepartment("papaya", "d1")?.name).toBe("Engineering");
    expect(s.getBranding("papaya")?.companyStory).toBeTruthy();
  });

  it("accepts a custom tenant", () => {
    const s = new InMemoryStore();
    seedFixtures(s, "acme");
    expect(s.getContract("acme", "c1")?.name).toBe("Maya Cohen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- fixtures`
Expected: FAIL — cannot find module `../src/fixtures.js`.

- [ ] **Step 3: Implement the fixtures**

Create `engine/src/fixtures.ts`:

```typescript
import type { InMemoryStore } from "./store.js";

// Synthetic onboarding fixtures. Loaded at startup and on POST /reset.
export function seedFixtures(store: InMemoryStore, tenant = "papaya"): void {
  store.addDepartment(tenant, { id: "d1", name: "Engineering" });

  store.addManager(tenant, {
    id: "m1",
    name: "Daniel Levi",
    department: "Engineering",
    cannedAnswer:
      "Maya joins the Payments squad. Her buddy is Noa Bar-On and her first project is the " +
      "reconciliation service. Please seat her near the Payments pod.",
  });

  store.addContract(tenant, {
    candidateId: "c1",
    name: "Maya Cohen",
    role: "Engineer",
    startDate: "2026-07-01",
    department: "Engineering",
    managerId: "m1",
    employmentType: "Full-time",
    signed: true,
  });

  store.setBranding(tenant, {
    companyStory:
      "Papaya Global makes paying people anywhere in the world simple, compliant, and human.",
    cultureVideoUrl: "https://papaya.example/culture",
    welcomeNote: "We're genuinely glad you're joining us.",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test -- fixtures`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/fixtures.ts engine/tests/fixtures.test.ts
git commit -m "feat(engine): synthetic onboarding fixtures"
```

---

## Task 3: Tool registry shape + `ats.get_contract`

**Files:**
- Modify: `engine/src/tools.ts`
- Test: `engine/tests/tools.test.ts` (extend)

This task converts the flat `TOOLS` record into a `ToolDef` registry (name + integration role-port + purpose + run) so the serializer (Task 8) and Phase A10 derive from it, then adds the first new tool.

- [ ] **Step 1: Write the failing tests**

Append to `engine/tests/tools.test.ts`:

```typescript
import { toolCatalog } from "../src/tools.js";

describe("tool registry", () => {
  it("toolCatalog exposes name/integration/purpose for each tool", () => {
    const cat = toolCatalog();
    const upsert = cat.find((t) => t.name === "hris.upsert_employee");
    expect(upsert?.integration).toBe("HRIS");
    expect(upsert?.purpose).toBeTruthy();
  });

  it("ats.get_contract returns the seeded contract and audits", async () => {
    const { InMemoryStore } = await import("../src/store.js");
    const { seedFixtures } = await import("../src/fixtures.js");
    const { executeTool } = await import("../src/tools.js");
    const store = new InMemoryStore();
    seedFixtures(store);
    const res = await executeTool(store, "ats.get_contract", { tenant: "papaya", candidateId: "c1" });
    expect(res.ok).toBe(true);
    expect((res.contract as { name: string }).name).toBe("Maya Cohen");
    expect(store.getAudit("papaya").some((e) => e.capability === "ats.get_contract")).toBe(true);
  });

  it("ats.get_contract throws for an unknown candidate", async () => {
    const { InMemoryStore } = await import("../src/store.js");
    const { executeTool } = await import("../src/tools.js");
    await expect(executeTool(new InMemoryStore(), "ats.get_contract", { tenant: "papaya", candidateId: "nope" }))
      .rejects.toThrow(/contract/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix engine test -- tools`
Expected: FAIL — `toolCatalog` not exported; `ats.get_contract` unknown.

- [ ] **Step 3: Rewrite `tools.ts` with the registry + first new tool**

Replace the full contents of `engine/src/tools.ts` with:

```typescript
import { z } from "zod";
import type { InMemoryStore } from "./store.js";

export interface ToolResult {
  ok: boolean;
  [k: string]: unknown;
}

export type ToolFn = (store: InMemoryStore, args: unknown) => Promise<ToolResult>;

// Role-port "integration" groups a tool under a capability area (decisions #13–15, #44).
// Phase A10's integration registry will derive installed/enabled tools from these.
export interface ToolDef {
  name: string;
  integration: "HRIS" | "ATS" | "Channels" | "TaskBoard" | "Calendar" | "Content";
  purpose: string;
  run: ToolFn;
}

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new Error(
      `missing required fields: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

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

const getContractSchema = z.object({ tenant: z.string(), candidateId: z.string() });

export const TOOLS: Record<string, ToolDef> = {
  "hris.upsert_employee": {
    name: "hris.upsert_employee",
    integration: "HRIS",
    purpose: "Create or update the employee record in the HRIS (Shapes).",
    run: async (store, args) => {
      const { tenant, ...emp } = parseArgs(upsertSchema, args);
      store.upsertEmployee(tenant, emp);
      store.audit({
        tenant,
        capability: "hris.upsert_employee",
        target: emp.id,
        summary: `upserted employee ${emp.name} (${emp.role})`,
      });
      return { ok: true, employee: emp };
    },
  },

  "ats.get_contract": {
    name: "ats.get_contract",
    integration: "ATS",
    purpose: "Retrieve the signed contract for a candidate from the ATS (Comeet).",
    run: async (store, args) => {
      const { tenant, candidateId } = parseArgs(getContractSchema, args);
      const contract = store.getContract(tenant, candidateId);
      if (!contract) throw new Error(`no contract found for candidate ${candidateId}`);
      store.audit({
        tenant,
        capability: "ats.get_contract",
        target: candidateId,
        summary: `retrieved signed contract for ${contract.name}`,
      });
      return { ok: true, contract };
    },
  },
};

export function toolCatalog(): { name: string; integration: string; purpose: string }[] {
  return Object.values(TOOLS).map(({ name, integration, purpose }) => ({ name, integration, purpose }));
}

export async function executeTool(store: InMemoryStore, name: string, args: unknown): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool.run(store, args);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix engine test -- tools`
Expected: PASS — old tests (`hris.upsert_employee`, unknown tool, `/required/i`, `TOOLS[...]` defined) and new registry/`ats.get_contract` tests all green.

- [ ] **Step 5: Commit**

```bash
git add engine/src/tools.ts engine/tests/tools.test.ts
git commit -m "feat(engine): tool registry shape + ats.get_contract"
```

---

## Task 4: Remaining mock integration tools

**Files:**
- Modify: `engine/src/tools.ts`
- Test: `engine/tests/tools.test.ts` (extend)

Adds `hiring_manager.ask`, `teams.add_member`, `calendar.create_invite`, `content.get_branding`, `channel.send_message`.

- [ ] **Step 1: Write the failing tests**

Append to `engine/tests/tools.test.ts`:

```typescript
describe("mock integration tools", () => {
  async function seeded() {
    const { InMemoryStore } = await import("../src/store.js");
    const { seedFixtures } = await import("../src/fixtures.js");
    const { executeTool } = await import("../src/tools.js");
    const store = new InMemoryStore();
    seedFixtures(store);
    return { store, executeTool };
  }

  it("hiring_manager.ask returns the manager's canned answer", async () => {
    const { store, executeTool } = await seeded();
    const res = await executeTool(store, "hiring_manager.ask", { tenant: "papaya", managerId: "m1", question: "Which team?" });
    expect((res.answer as string)).toContain("Payments");
    expect(store.getAudit("papaya").some((e) => e.capability === "hiring_manager.ask")).toBe(true);
  });

  it("teams.add_member records membership", async () => {
    const { store, executeTool } = await seeded();
    await executeTool(store, "teams.add_member", { tenant: "papaya", employeeId: "e1", teams: ["Payments"] });
    expect(store.getMemberships("papaya")[0].teams).toEqual(["Payments"]);
  });

  it("calendar.create_invite records an invite with no sensitive fields", async () => {
    const { store, executeTool } = await seeded();
    const res = await executeTool(store, "calendar.create_invite", {
      tenant: "papaya", title: "Welcome Maya", date: "2026-07-01", attendees: ["e1", "m1"], location: "Tel Aviv HQ",
    });
    expect(res.ok).toBe(true);
    expect(store.getInvites("papaya")).toHaveLength(1);
    // structural confidentiality: invite carries no reason field
    expect(store.getInvites("papaya")[0]).not.toHaveProperty("reason");
  });

  it("content.get_branding returns the branding pack", async () => {
    const { store, executeTool } = await seeded();
    const res = await executeTool(store, "content.get_branding", { tenant: "papaya" });
    expect((res.branding as { companyStory: string }).companyStory).toBeTruthy();
  });

  it("channel.send_message records a message", async () => {
    const { store, executeTool } = await seeded();
    await executeTool(store, "channel.send_message", {
      tenant: "papaya", to: "Maya Cohen", role: "employee", channel: "email", body: "Welcome to Papaya, Maya!",
    });
    const msgs = store.getMessages("papaya");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("Welcome");
    expect(store.getAudit("papaya").some((e) => e.capability === "channel.send_message")).toBe(true);
  });

  it("channel.send_message rejects an unknown channel", async () => {
    const { store, executeTool } = await seeded();
    await expect(executeTool(store, "channel.send_message", {
      tenant: "papaya", to: "x", role: "employee", channel: "carrier-pigeon", body: "hi",
    })).rejects.toThrow(/missing required fields/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix engine test -- tools`
Expected: FAIL — the five tools are unknown.

- [ ] **Step 3: Add the tools to the registry**

In `engine/src/tools.ts`, add these schemas after the `getContractSchema` declaration:

```typescript
const askSchema = z.object({ tenant: z.string(), managerId: z.string(), question: z.string() });
const teamsSchema = z.object({ tenant: z.string(), employeeId: z.string(), teams: z.array(z.string()).min(1) });
// NOTE: deliberately NO `reason`/sensitive fields — structural confidentiality (decision #46),
// hardened in Phase B. The invite tool only ever accepts logistics.
const inviteSchema = z.object({
  tenant: z.string(),
  title: z.string(),
  date: z.string(),
  attendees: z.array(z.string()).min(1),
  location: z.string(),
});
const brandingSchema = z.object({ tenant: z.string() });
const sendSchema = z.object({
  tenant: z.string(),
  to: z.string(),
  role: z.string(),
  channel: z.enum(["email", "teams", "slack"]),
  body: z.string(),
});
```

Then add these entries inside the `TOOLS` object (after the `ats.get_contract` entry):

```typescript
  "hiring_manager.ask": {
    name: "hiring_manager.ask",
    integration: "Channels",
    purpose: "Ask the hiring manager a question and get their answer (the collect-info step).",
    run: async (store, args) => {
      const { tenant, managerId, question } = parseArgs(askSchema, args);
      const mgr = store.getManager(tenant, managerId);
      if (!mgr) throw new Error(`no manager found: ${managerId}`);
      store.audit({
        tenant,
        capability: "hiring_manager.ask",
        target: managerId,
        summary: `asked ${mgr.name}: ${question.slice(0, 60)}`,
      });
      return { ok: true, answer: mgr.cannedAnswer };
    },
  },

  "teams.add_member": {
    name: "teams.add_member",
    integration: "Channels",
    purpose: "Add the new hire to one or more Microsoft Teams.",
    run: async (store, args) => {
      const { tenant, employeeId, teams } = parseArgs(teamsSchema, args);
      store.addMembership({ tenant, employeeId, teams });
      store.audit({
        tenant,
        capability: "teams.add_member",
        target: employeeId,
        summary: `added to teams: ${teams.join(", ")}`,
      });
      return { ok: true, employeeId, teams };
    },
  },

  "calendar.create_invite": {
    name: "calendar.create_invite",
    integration: "Calendar",
    purpose: "Schedule a calendar invite (logistics only — title, date, attendees, location).",
    run: async (store, args) => {
      const { tenant, ...rest } = parseArgs(inviteSchema, args);
      const invite = store.addInvite(tenant, rest);
      store.audit({
        tenant,
        capability: "calendar.create_invite",
        target: invite.id,
        summary: `scheduled "${rest.title}" on ${rest.date}`,
      });
      return { ok: true, invite };
    },
  },

  "content.get_branding": {
    name: "content.get_branding",
    integration: "Content",
    purpose: "Fetch Papaya branding content (company story, culture video, welcome note).",
    run: async (store, args) => {
      const { tenant } = parseArgs(brandingSchema, args);
      const branding = store.getBranding(tenant);
      if (!branding) throw new Error("no branding configured");
      store.audit({
        tenant,
        capability: "content.get_branding",
        target: tenant,
        summary: "retrieved branding pack",
      });
      return { ok: true, branding };
    },
  },

  "channel.send_message": {
    name: "channel.send_message",
    integration: "Channels",
    purpose: "Send a warm message to a recipient over a channel (email/teams/slack); recorded for the Messages view.",
    run: async (store, args) => {
      const { tenant, to, role, channel, body } = parseArgs(sendSchema, args);
      const message = store.addMessage({ tenant, from: "agent", to, role, channel, body });
      store.audit({
        tenant,
        capability: "channel.send_message",
        target: to,
        summary: `sent ${channel} message to ${to}`,
      });
      return { ok: true, message };
    },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix engine test -- tools`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/tools.ts engine/tests/tools.test.ts
git commit -m "feat(engine): mock integration tools (ask, teams, calendar, branding, send)"
```

---

## Task 5: `GET /messages` + `POST /reset` endpoints

**Files:**
- Modify: `engine/src/app.ts`
- Test: `engine/tests/messages.test.ts`

- [ ] **Step 1: Write the failing test**

Create `engine/tests/messages.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { seedFixtures } from "../src/fixtures.js";

describe("/messages and /reset", () => {
  it("GET /messages returns tenant-scoped messages", async () => {
    const store = new InMemoryStore();
    const app = buildApp({ store, hermes: {} as any });
    await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "channel.send_message", args: { tenant: "papaya", to: "Maya", role: "employee", channel: "email", body: "Welcome" } },
    });
    const res = await app.inject({ method: "GET", url: "/messages?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].body).toBe("Welcome");
  });

  it("POST /reset clears state and re-seeds fixtures", async () => {
    const store = new InMemoryStore();
    seedFixtures(store);
    const app = buildApp({ store, hermes: {} as any });
    await app.inject({
      method: "POST",
      url: "/tools/execute",
      payload: { name: "channel.send_message", args: { tenant: "papaya", to: "Maya", role: "employee", channel: "email", body: "hi" } },
    });
    const res = await app.inject({ method: "POST", url: "/reset" });
    expect(res.statusCode).toBe(200);
    expect(store.getMessages("papaya")).toHaveLength(0);
    // fixtures re-seeded
    expect(store.getContract("papaya", "c1")?.name).toBe("Maya Cohen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- messages`
Expected: FAIL — `/messages` and `/reset` return 404.

- [ ] **Step 3: Add the endpoints**

In `engine/src/app.ts`, add the fixtures import after the existing imports:

```typescript
import { seedFixtures } from "./fixtures.js";
```

Then add these two route handlers inside `buildApp`, immediately after the existing `GET /audit` handler:

```typescript
  app.get<{ Querystring: { tenant?: string } }>("/messages", async (req) => {
    const tenant = req.query.tenant ?? "papaya";
    return store.getMessages(tenant);
  });

  app.post("/reset", async () => {
    store.reset();
    seedFixtures(store);
    return { ok: true };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test -- messages`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/app.ts engine/tests/messages.test.ts
git commit -m "feat(engine): GET /messages and POST /reset endpoints"
```

---

## Task 6: Onboarding `WorkflowDefinition`

**Files:**
- Create: `engine/src/workflows/onboarding.ts`
- Test: `engine/tests/serialize.test.ts` (workflow-shape assertions added here; serializer in Task 7)

- [ ] **Step 1: Write the failing test**

Create `engine/tests/serialize.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { onboardingWorkflow } from "../src/workflows/onboarding.js";

describe("onboardingWorkflow definition", () => {
  it("is a linear ordered sequence of capabilities", () => {
    expect(onboardingWorkflow.id).toBe("onboarding");
    const caps = onboardingWorkflow.steps.map((s) => s.capability);
    expect(caps).toEqual([
      "ats.get_contract",
      "hiring_manager.ask",
      "hris.upsert_employee",
      "teams.add_member",
      "calendar.create_invite",
      "content.get_branding",
      "channel.send_message",
    ]);
  });

  it("each step carries an intent and audience", () => {
    for (const step of onboardingWorkflow.steps) {
      expect(step.intent.length).toBeGreaterThan(0);
      expect(["employee", "manager", "hr", "team"]).toContain(step.audience);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- serialize`
Expected: FAIL — cannot find module `../src/workflows/onboarding.js`.

- [ ] **Step 3: Implement the workflow definition**

Create `engine/src/workflows/onboarding.ts`:

```typescript
// Typed onboarding workflow (decisions #19, #46). Phase A is linear + happy-path;
// conditions/escalation are added in Phase B. The dashboard workflow editor (A10)
// will render and edit this same structure.
export type Audience = "employee" | "manager" | "hr" | "team";

export interface WorkflowStep {
  intent: string; // human-readable description of the step
  capability: string; // the tool name the agent should call
  audience: Audience; // who this step concerns (used by the confidentiality gate later)
}

export interface WorkflowDefinition {
  id: string;
  trigger: string;
  steps: WorkflowStep[];
}

export const onboardingWorkflow: WorkflowDefinition = {
  id: "onboarding",
  trigger: "A new hire needs to be onboarded.",
  steps: [
    { intent: "Extract the signed contract for the new hire.", capability: "ats.get_contract", audience: "hr" },
    { intent: "Ask the hiring manager for team placement and buddy details.", capability: "hiring_manager.ask", audience: "manager" },
    { intent: "Create the employee record in the HRIS.", capability: "hris.upsert_employee", audience: "hr" },
    { intent: "Add the new hire to their Microsoft Teams.", capability: "teams.add_member", audience: "team" },
    { intent: "Schedule a first-day welcome invite (logistics only).", capability: "calendar.create_invite", audience: "employee" },
    { intent: "Fetch Papaya branding content to share.", capability: "content.get_branding", audience: "employee" },
    { intent: "Send a warm welcome message to the new hire.", capability: "channel.send_message", audience: "employee" },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test -- serialize`
Expected: PASS (the workflow-shape tests; serializer tests come next).

- [ ] **Step 5: Commit**

```bash
git add engine/src/workflows/onboarding.ts engine/tests/serialize.test.ts
git commit -m "feat(engine): typed onboarding WorkflowDefinition"
```

---

## Task 7: Playbook serializer

**Files:**
- Create: `engine/src/workflows/serialize.ts`
- Test: `engine/tests/serialize.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `engine/tests/serialize.test.ts`:

```typescript
import { serializePlaybook } from "../src/workflows/serialize.js";
import { toolCatalog } from "../src/tools.js";

describe("serializePlaybook", () => {
  it("renders numbered steps, every capability, and the tool catalog", () => {
    const out = serializePlaybook(onboardingWorkflow, toolCatalog());
    expect(out).toMatch(/PLAYBOOK/i);
    // every step capability appears
    for (const step of onboardingWorkflow.steps) {
      expect(out).toContain(step.capability);
    }
    // step 1 is numbered
    expect(out).toContain("1.");
    // catalog purposes are present
    expect(out).toContain("Retrieve the signed contract");
    // instructs the agent how to call a tool via the skill
    expect(out).toMatch(/\{name, args\}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- serialize`
Expected: FAIL — cannot find module `../src/workflows/serialize.js`.

- [ ] **Step 3: Implement the serializer**

Create `engine/src/workflows/serialize.ts`:

```typescript
import type { WorkflowDefinition } from "./onboarding.js";

type CatalogEntry = { name: string; integration: string; purpose: string };

// Renders a WorkflowDefinition + tool catalog into a concise NL playbook the agent follows
// (decision #30, soft-first). Injected by the orchestrator as a system message.
export function serializePlaybook(wf: WorkflowDefinition, catalog: CatalogEntry[]): string {
  const steps = wf.steps
    .map((s, i) => `${i + 1}. ${s.intent} — call \`${s.capability}\``)
    .join("\n");

  const tools = catalog
    .map((t) => `- ${t.name} (${t.integration}): ${t.purpose}`)
    .join("\n");

  return [
    `ONBOARDING PLAYBOOK`,
    `Trigger: ${wf.trigger}`,
    ``,
    `Follow these steps in order. For each step, call exactly one tool via the hris-tool skill`,
    `by sending a JSON {name, args} payload, then use the result to inform the next step:`,
    steps,
    ``,
    `AVAILABLE TOOLS`,
    tools,
    ``,
    `Always include "tenant" in args (use "papaya" unless told otherwise). After completing all`,
    `steps, reply with a warm, professional welcome message plus a one-line recap of what you did.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test -- serialize`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/workflows/serialize.ts engine/tests/serialize.test.ts
git commit -m "feat(engine): NL playbook serializer"
```

---

## Task 8: Orchestrator injects the playbook

**Files:**
- Modify: `engine/src/orchestrator.ts`
- Test: `engine/tests/orchestrator.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `engine/tests/orchestrator.test.ts`:

```typescript
describe("/execute playbook injection", () => {
  it("injects the onboarding playbook + tool catalog into the Hermes messages", async () => {
    const hermes = new FakeHermes("Welcome Maya!");
    const app = buildApp({ store: new InMemoryStore(), hermes });
    await app.inject({
      method: "POST",
      url: "/execute",
      payload: { task: "Onboard Maya Cohen", context: { tenant: "papaya" } },
    });
    const joined = hermes.lastMessages.map((m) => m.content).join("\n");
    expect(joined).toMatch(/ONBOARDING PLAYBOOK/);
    expect(joined).toContain("ats.get_contract");
    expect(joined).toContain("channel.send_message");
    // the original task is still present
    expect(joined).toContain("Onboard Maya Cohen");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- orchestrator`
Expected: FAIL — no `ONBOARDING PLAYBOOK` in the messages (only system + user today).

- [ ] **Step 3: Inject the playbook**

In `engine/src/orchestrator.ts`, add these imports after the existing imports:

```typescript
import { onboardingWorkflow } from "./workflows/onboarding.js";
import { serializePlaybook } from "./workflows/serialize.js";
import { toolCatalog } from "./tools.js";
```

Add this module-level constant after the `SYSTEM_PROMPT` declaration (built once — the workflow and catalog are static):

```typescript
const ONBOARDING_PLAYBOOK = serializePlaybook(onboardingWorkflow, toolCatalog());
```

Replace the `messages` array construction inside `runExecute` with:

```typescript
      // system persona + injected onboarding playbook/tool-catalog + the user task.
      // Intent detection is minimal for now: onboarding is the demo path (decision #30).
      const messages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "system" as const, content: ONBOARDING_PLAYBOOK },
        { role: "user" as const, content: req.task },
      ];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test -- orchestrator`
Expected: PASS — including the existing tests (task still reaches Hermes; shape unchanged).

- [ ] **Step 5: Commit**

```bash
git add engine/src/orchestrator.ts engine/tests/orchestrator.test.ts
git commit -m "feat(engine): orchestrator injects onboarding playbook"
```

---

## Task 9: Stub Hermes runs the full sequence + startup seeding

**Files:**
- Modify: `engine/src/stubHermes.ts`
- Modify: `engine/src/server.ts`
- Test: `engine/tests/e2e.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Replace the body of the `it(...)` block in `engine/tests/e2e.test.ts` with the following (keep the surrounding `describe`/`beforeAll`/`afterAll` as-is, but add `seedFixtures` to the store setup — see Step 3):

```typescript
  it("runs the full onboarding sequence and records the multi-tool run + a message", async () => {
    const exec = await fetch(`http://127.0.0.1:${PORT}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "Onboard Maya Cohen", context: { tenant: "papaya" } }),
    });
    const body = await exec.json();
    expect(body.response).toContain("Maya");

    const audit = await (await fetch(`http://127.0.0.1:${PORT}/audit?tenant=papaya`)).json();
    const caps = audit.map((e: any) => e.capability);
    expect(caps).toContain("ats.get_contract");
    expect(caps).toContain("hris.upsert_employee");
    expect(caps).toContain("teams.add_member");
    expect(caps).toContain("channel.send_message");

    const messages = await (await fetch(`http://127.0.0.1:${PORT}/messages?tenant=papaya`)).json();
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].body).toMatch(/welcome/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- e2e`
Expected: FAIL — only `hris.upsert_employee` is in the audit; no contract/teams/message (the store also isn't seeded, so `ats.get_contract` would error).

- [ ] **Step 3: Seed the store in the e2e setup**

In `engine/tests/e2e.test.ts`, add the import and seed the store in `beforeAll`:

```typescript
import { seedFixtures } from "../src/fixtures.js";
```

Change the `beforeAll` store construction so fixtures are seeded:

```typescript
  beforeAll(async () => {
    const store = new InMemoryStore();
    seedFixtures(store);
    app = buildApp({ store, hermes: new StubHermes(`http://127.0.0.1:${PORT}`) });
    await app.listen({ port: PORT, host: "127.0.0.1" });
  });
```

- [ ] **Step 4: Rewrite the stub to drive the full sequence**

Replace the full contents of `engine/src/stubHermes.ts` with:

```typescript
import type { HermesClient, ChatMessage, ChatResult } from "./hermes.js";

// Simulates the agent following the onboarding playbook: it calls each domain tool in order
// via the engine skill (HTTP callback to /tools/execute), then returns a warm reply.
// Used for code-e2e and dashboard e2e without real Hermes.
export class StubHermes implements HermesClient {
  constructor(private engineUrl: string) {}

  private call(name: string, args: unknown): Promise<Response> {
    return fetch(`${this.engineUrl}/tools/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, args }),
    });
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const task = messages.find((m) => m.role === "user")?.content ?? "";
    const tenant = "papaya";

    const contractRes = (await (await this.call("ats.get_contract", { tenant, candidateId: "c1" })).json()) as {
      contract: { name: string; role: string; startDate: string; department: string; managerId: string; employmentType: string };
    };
    const c = contractRes.contract;

    await this.call("hiring_manager.ask", { tenant, managerId: c.managerId, question: "Which team and buddy for the new hire?" });
    await this.call("hris.upsert_employee", {
      tenant, id: "e1", name: c.name, role: c.role, startDate: c.startDate,
      department: c.department, managerId: c.managerId, employmentType: c.employmentType,
    });
    await this.call("teams.add_member", { tenant, employeeId: "e1", teams: ["Payments"] });
    await this.call("calendar.create_invite", {
      tenant, title: `Welcome ${c.name}`, date: c.startDate, attendees: ["e1", c.managerId], location: "Tel Aviv HQ",
    });
    await this.call("content.get_branding", { tenant });
    await this.call("channel.send_message", {
      tenant, to: c.name, role: "employee", channel: "email",
      body: `Welcome to Papaya, ${c.name} — it's genuinely great to have you joining us. Your first day is ${c.startDate}.`,
    });

    return {
      content:
        `Hi ${c.name}, welcome to Papaya! I've set up your record in Shapes, added you to the Payments team, ` +
        `scheduled your first day, and sent you a warm welcome. (task: ${task.slice(0, 30)})`,
    };
  }
}
```

- [ ] **Step 5: Seed at server startup**

In `engine/src/server.ts`, add the import after the `InMemoryStore` import:

```typescript
import { seedFixtures } from "./fixtures.js";
```

Replace the `const app = buildApp({...})` block with a seeded store:

```typescript
const store = new InMemoryStore();
seedFixtures(store);

const app = buildApp({
  store,
  hermes,
});
```

- [ ] **Step 6: Run the full engine suite**

Run: `npm --prefix engine test`
Expected: PASS — all suites green (store, fixtures, tools, messages, serialize, orchestrator, e2e, health, toolsExecute).

- [ ] **Step 7: Typecheck**

Run: `npm --prefix engine run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add engine/src/stubHermes.ts engine/src/server.ts engine/tests/e2e.test.ts
git commit -m "feat(engine): stub Hermes drives full onboarding sequence + startup seeding"
```

---

## Task 10: Messages screen (dashboard)

**Files:**
- Create: `dashboard/src/screens/MessagesScreen.tsx`
- Modify: `dashboard/src/shell/AppShell.tsx`

- [ ] **Step 1: Implement the Messages screen**

Create `dashboard/src/screens/MessagesScreen.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardBody, MessageBubble, EmptyState, LoadingState, ErrorState } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

interface Message {
  id: string;
  from: 'agent' | 'employee';
  to: string;
  role: string;
  channel: 'email' | 'teams' | 'slack';
  body: string;
  ts: string;
}

type LoadState = 'loading' | 'done' | 'error';

export function MessagesScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  async function load() {
    setState('loading');
    setErrorMsg('');
    try {
      const r = await fetch(`${ENGINE}/messages?tenant=papaya`);
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      setMessages(await r.json());
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[--text-primary] tracking-tight mb-0.5">
          Messages
        </h1>
        <p className="text-[13px] text-[--text-secondary]">
          Warm communications the agent sent across channels.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Agent communications"
          subtitle={state === 'done' && messages.length > 0
            ? `${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`
            : undefined}
        />
        <CardBody>
          {state === 'loading' && <LoadingState rows={3} />}
          {state === 'error' && (
            <ErrorState
              title="Couldn't load messages"
              description={errorMsg || 'Check the connection and try again.'}
              onRetry={load}
            />
          )}
          {state === 'done' && messages.length === 0 && (
            <EmptyState
              icon={<MessageSquare size={20} />}
              title="No messages yet"
              description="Run a scenario to see agent communications here."
            />
          )}
          {state === 'done' && messages.length > 0 && (
            <div className="flex flex-col gap-4" data-testid="messages-list">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  from={m.from}
                  recipient={m.to}
                  channel={m.channel}
                  timestamp={m.ts}
                  content={m.body}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the shell**

In `dashboard/src/shell/AppShell.tsx`, add the import near the other screen imports:

```tsx
import { MessagesScreen } from '../screens/MessagesScreen';
```

Replace the entire `activeScreen === 'messages'` block (the `<PlaceholderScreen .../>` for messages) with:

```tsx
          {activeScreen === 'messages' && <MessagesScreen />}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm --prefix dashboard run build`
Expected: build succeeds (tsc + vite), no type errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/screens/MessagesScreen.tsx dashboard/src/shell/AppShell.tsx
git commit -m "feat(dashboard): Messages screen"
```

---

## Task 11: Audit screen (dashboard)

**Files:**
- Create: `dashboard/src/screens/AuditScreen.tsx`
- Modify: `dashboard/src/shell/AppShell.tsx`

- [ ] **Step 1: Implement the Audit screen**

Create `dashboard/src/screens/AuditScreen.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardHeader, Table, TableFilter, EmptyState, LoadingState, ErrorState } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

interface AuditEntry {
  ts: string;
  capability: string;
  target: string;
  summary: string;
}

const COLUMNS = [
  { key: 'capability', label: 'Capability', mono: true, sortable: true },
  { key: 'target', label: 'Target' },
  { key: 'summary', label: 'Summary', muted: true },
  {
    key: 'ts',
    label: 'Time',
    muted: true,
    sortable: true,
    render: (v: unknown) => {
      if (!v) return '—';
      const d = new Date(v as string);
      return isNaN(d.getTime()) ? String(v) : d.toLocaleTimeString();
    },
  },
];

type LoadState = 'loading' | 'done' | 'error';

export function AuditScreen() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    setState('loading');
    setErrorMsg('');
    try {
      const r = await fetch(`${ENGINE}/audit?tenant=papaya`);
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      setAudit(await r.json());
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = audit.filter((e) => {
    const q = query.toLowerCase();
    return (
      e.capability.toLowerCase().includes(q) ||
      e.target.toLowerCase().includes(q) ||
      e.summary.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[--text-primary] tracking-tight mb-0.5">
          Audit log
        </h1>
        <p className="text-[13px] text-[--text-secondary]">
          Every action the agent took, logged and auditable.
        </p>
      </div>

      <Card padding={false}>
        <div className="p-4 pb-3">
          <CardHeader title="Actions" subtitle={state === 'done' ? `${audit.length} recorded` : undefined} />
        </div>
        <div className="px-4">
          {state === 'loading' && <LoadingState rows={4} />}
          {state === 'error' && (
            <ErrorState
              title="Couldn't load the audit log"
              description={errorMsg || 'Check the connection and try again.'}
              onRetry={load}
            />
          )}
          {state === 'done' && audit.length === 0 && (
            <EmptyState
              icon={<FileText size={20} />}
              title="No audit entries"
              description="Audit entries will appear here after a scenario runs."
              className="pb-8"
            />
          )}
          {state === 'done' && audit.length > 0 && (
            <div className="pb-4">
              <TableFilter
                value={query}
                onChange={setQuery}
                placeholder="Filter by capability, target, or summary…"
                count={filtered.length}
              />
              <Table columns={COLUMNS} rows={filtered as unknown as Record<string, unknown>[]} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the shell**

In `dashboard/src/shell/AppShell.tsx`, add the import near the other screen imports:

```tsx
import { AuditScreen } from '../screens/AuditScreen';
```

Replace the entire `activeScreen === 'audit-log'` block (the `<PlaceholderScreen .../>` for audit-log) with:

```tsx
          {activeScreen === 'audit-log' && <AuditScreen />}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm --prefix dashboard run build`
Expected: build succeeds, no type errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/screens/AuditScreen.tsx dashboard/src/shell/AppShell.tsx
git commit -m "feat(dashboard): Audit log screen"
```

---

## Task 12: Live Run tool-call trace

**Files:**
- Modify: `dashboard/src/screens/LiveRunScreen.tsx`

Adds a "Tool calls" card that renders the audit entries from the run as a TraceRow stepper, so the demo visibly shows the agent working across systems.

- [ ] **Step 1: Add the TraceRow import**

In `dashboard/src/screens/LiveRunScreen.tsx`, add `TraceRow` to the existing `../ui/index` import (alongside `Button`, `Card`, etc.):

```tsx
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Textarea,
  Table,
  TraceRow,
  LoadingState,
  ErrorState,
  EmptyState,
  StreamingState,
} from '../ui/index';
```

- [ ] **Step 2: Add the Tool-calls trace card**

In `LiveRunScreen.tsx`, insert this card immediately after the closing `</Card>` of the "Response card" and before the "Audit card" comment:

```tsx
      {/* Tool-calls trace card */}
      {runState === 'done' && audit.length > 0 && (
        <Card>
          <CardHeader
            title="Tool calls"
            subtitle={`${audit.length} ${audit.length === 1 ? 'step' : 'steps'} across systems`}
          />
          <CardBody>
            <div role="list" data-testid="trace-list">
              {audit.map((e, i) => (
                <TraceRow
                  key={i}
                  status="success"
                  label={e.capability}
                  value={e.summary}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      )}
```

- [ ] **Step 3: Build to verify it compiles**

Run: `npm --prefix dashboard run build`
Expected: build succeeds, no type errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/screens/LiveRunScreen.tsx
git commit -m "feat(dashboard): Live Run tool-call trace"
```

---

## Task 13: Dashboard e2e

**Files:**
- Modify: `dashboard/e2e/onboarding.spec.ts`

- [ ] **Step 1: Update the Playwright spec**

Replace the full contents of `dashboard/e2e/onboarding.spec.ts` with:

```typescript
import { test, expect } from "@playwright/test";

test("onboarding runs the multi-tool workflow and surfaces it in the UI", async ({ page }) => {
  await page.goto("/");

  // Trigger the onboarding scenario on the Live Run screen.
  await page.getByRole("button", { name: /trigger scenario/i }).first().click();

  // Warm agent response mentions the new hire.
  await expect(page.locator("[data-testid='response-text']")).toContainText("Maya", { timeout: 15000 });

  // The tool-call trace shows a multi-step run across systems.
  const trace = page.locator("[data-testid='trace-list']");
  await expect(trace.getByText("ats.get_contract")).toBeVisible();
  await expect(trace.getByText("teams.add_member")).toBeVisible();
  await expect(trace.getByText("channel.send_message")).toBeVisible();

  // Audit screen shows the multi-tool run.
  await page.getByRole("button", { name: /audit log/i }).click();
  await expect(page.getByText("hris.upsert_employee").first()).toBeVisible();

  // Messages screen shows the warm welcome.
  await page.getByRole("button", { name: /messages/i }).click();
  await expect(page.locator("[data-testid='messages-list']")).toContainText(/welcome/i);
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm --prefix dashboard run e2e`
Expected: PASS — Playwright starts the engine (stub Hermes) + dashboard, the trace/audit/messages assertions pass.

> If `npx playwright install` is needed (first run), run it once, then re-run the e2e command.

- [ ] **Step 3: Commit**

```bash
git add dashboard/e2e/onboarding.spec.ts
git commit -m "test(dashboard): e2e asserts multi-tool onboarding run"
```

---

## Task 14: Phase A verification + docs

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Full engine suite + typecheck**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: all suites PASS, no type errors.

- [ ] **Step 2: Dashboard build + e2e**

Run: `npm --prefix dashboard run build && npm --prefix dashboard run e2e`
Expected: build succeeds; e2e passes.

- [ ] **Step 3: Local Docker smoke test (real Hermes)**

Run:
```bash
docker compose up -d --build
curl -s -X POST http://localhost:3000/execute -H 'Content-Type: application/json' \
  -d '{"task":"Onboard Maya Cohen","context":{"tenant":"papaya"}}' | head -c 400
echo
curl -s 'http://localhost:3000/audit?tenant=papaya' | head -c 400
echo
curl -s 'http://localhost:3000/messages?tenant=papaya' | head -c 400
```
Expected: a warm response mentioning Maya; the audit shows multiple capabilities (`ats.get_contract`, `hris.upsert_employee`, `teams.add_member`, `channel.send_message`); `/messages` returns at least one welcome message. (With real Hermes the exact tool set depends on the model following the playbook — confirm at least a multi-tool run and a message.)

- [ ] **Step 4: Update STATUS.md**

In `docs/STATUS.md`, update the "What's built & working" engine bullet and the "NEXT SESSION" pointer to reflect that Phase A (A1–A9) is built: the onboarding workflow runs the full mock-integration sequence, with Messages and Audit screens live; next is A10 (configurable integrations + workflow editor), then Phase B. Mention the new endpoints (`GET /messages`, `POST /reset`) and the tool registry.

- [ ] **Step 5: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs: STATUS — Phase A onboarding workflow built (A1–A9)"
```

- [ ] **Step 6: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to merge/PR Phase A.

---

## Self-Review Notes

- **Spec coverage (A1–A9):** A1 → Tasks 1–2 (models, fixtures, messages list). A2 → Tasks 3–5 (registry + 6 tools + `/messages`). A3 → Tasks 6–7 (WorkflowDefinition + serializer). A4 → Task 8 (orchestrator injection). A5 → Tasks 1–9 tests + Task 9 code-e2e. A6 → Task 10 (Messages). A7 → Task 11 (Audit). A8 → Task 12 (tool-call trace). A9 → Task 13 (Playwright). Verify → Task 14.
- **Registry-first (STATUS reminder):** integrations modelled as `ToolDef.integration` role-ports from Task 3 so A10's config UI layers on without a rewrite.
- **Confidentiality seed (decision #46):** `calendar.create_invite` deliberately has no `reason` field; the test asserts its absence. Full gate is Phase B.
- **A10 deferred:** configurable-integrations registry UI + workflow editor are a separate follow-up plan, per the Phase A doc ("build it after A1–A9 are running").
- **No regressions:** existing tests still pass — `TOOLS[...]` stays defined (registry keeps the key), `/required/i` matches the new `parseArgs` message, the orchestrator still forwards the task and returns the same shape, and the original e2e assertions (response contains "Maya", audit has `hris.upsert_employee`) remain true.
