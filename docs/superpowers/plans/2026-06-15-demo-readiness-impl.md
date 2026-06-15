# Demo-readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 10-step onboarding demo runnable end-to-end — Workflow Editor revamp with V2 cards + schema-tree inspector + Test Flow drawer; engine virtual `external-hermes` tool kind + `/side-effect` ingestion + async test-run endpoints; record-side-effect Hermes skill; Integrations schema side panel; audit/messages updates for `hermes-native` actor.

**Architecture:** Engine grows a `kind: 'external-hermes'` virtual tool category for Gmail + WhatsApp (Hermes sends natively, calls back `/side-effect` to record audit + Messages). Workflow data model upgraded with `trigger.connector` + `trigger.sample`. Test runs go async (`POST /workflows/:id/test` → `{ runId }`, polled via `/runs/:id` + `/audit?runId=`). Dashboard rebuilds the Workflow Editor as a 4-area screen (picker · canvas · inspector · drawer) under `dashboard/src/screens/workflow/`.

**Tech Stack:** Engine: TypeScript + Fastify + zod + vitest. Agent: Python Hermes container + bash skills. Dashboard: React + Vite + Tailwind + Playwright.

**Source spec:** [docs/superpowers/specs/2026-06-15-demo-readiness-design.md](../specs/2026-06-15-demo-readiness-design.md)

---

## File map

**Engine — modified:**
- `engine/src/tools.ts` — `ToolDef` gains `kind`, `connector`, `outputShape`; two virtual tools added; existing tool labels/connectors filled in.
- `engine/src/workflows/types.ts` — `WorkflowDefinition.trigger` shape changes.
- `engine/src/workflows/onboarding.ts` — fixture migration to new trigger shape.
- `engine/src/workflows/offboarding.ts` — **NEW** stub workflow.
- `engine/src/workflows/serialize.ts` — playbook serializer emits external-hermes instructions.
- `engine/src/store.ts` — adds `Run` tracking (status + result), `addRun`, `updateRun`, `getRun`; `Message.channel` accepts `'whatsapp'`; `AuditActor` adds `'hermes-native'`.
- `engine/src/integrations.ts` — small helper: `gateConnectorEnabled(store, tenant, connectorId)` to gate virtual tools by specific connector.
- `engine/src/orchestrator.ts` — refactored to expose a non-HTTP `runOnce` used by both `/execute` and the async test runner.
- `engine/src/app.ts` — new endpoints: `/side-effect`, `/triggers`, `/workflows/:id/test`, `/runs/:id`, `/simulate/inbound`, `POST/DELETE /workflows`. `/audit` gains `?runId=`. `/capabilities` + `/integrations` include schemas.
- `engine/src/fixtures.ts` — `manager.phone`, Offboarding stub seeded.

**Engine — new tests:**
- `engine/tests/sideEffect.test.ts`
- `engine/tests/triggers.test.ts`
- `engine/tests/workflowTest.test.ts`
- `engine/tests/simulateInbound.test.ts`
- `engine/tests/toolsExternal.test.ts`
- `engine/tests/workflowCrud.test.ts`

**Engine — extended tests:**
- `engine/tests/workflowsApi.test.ts` — trigger shape migration.
- `engine/tests/serialize.test.ts` — trigger shape + external-hermes serialization.
- `engine/tests/store.test.ts` — trigger shape migration + Run tracking.
- `engine/tests/e2e.test.ts` — stub Hermes emits record_side_effect, final audit has Gmail + WhatsApp REAL.
- `engine/tests/capabilities.test.ts` — kind + connector + schemas surfaced.
- `engine/tests/integrationsApi.test.ts` — capabilities include schemas.

**Agent — new:**
- `agent/skills/record-side-effect/SKILL.md`
- `agent/skills/record-side-effect/run.sh`

**Agent — modified:**
- `agent/SOUL.md` — appends channel-callback contract.

**Dashboard — modified:**
- `dashboard/src/screens/IntegrationsScreen.tsx` — Actions + Triggers sub-tabs gain right side panel.
- `dashboard/src/screens/AuditScreen.tsx` — `hermes-native` actor styling.
- `dashboard/src/screens/MessagesScreen.tsx` — inbound message right-aligned.
- `dashboard/src/screens/LiveRunScreen.tsx` — "Simulate inbound WhatsApp" affordance.
- `dashboard/src/App.tsx` — update import path of WorkflowEditorScreen.

**Dashboard — deleted (replaced by folder):**
- `dashboard/src/screens/WorkflowEditorScreen.tsx`

**Dashboard — new folder:**
- `dashboard/src/screens/workflow/WorkflowEditorScreen.tsx`
- `dashboard/src/screens/workflow/WorkflowPicker.tsx`
- `dashboard/src/screens/workflow/WorkflowCanvas.tsx`
- `dashboard/src/screens/workflow/TriggerCard.tsx`
- `dashboard/src/screens/workflow/ActionCard.tsx`
- `dashboard/src/screens/workflow/TestFlowDrawer.tsx`
- `dashboard/src/screens/workflow/Inspector/Inspector.tsx`
- `dashboard/src/screens/workflow/Inspector/TriggerInspector.tsx`
- `dashboard/src/screens/workflow/Inspector/ActionInspector.tsx`
- `dashboard/src/screens/workflow/Inspector/SchemaTree.tsx`
- `dashboard/src/screens/workflow/Inspector/BindingSourceTag.tsx`
- `dashboard/src/screens/workflow/api.ts` — typed `fetch` wrappers.

**Dashboard — new tests:**
- `dashboard/e2e/workflow-editor.spec.ts`
- `dashboard/e2e/integrations-schema.spec.ts`

**Dashboard — extended tests:**
- `dashboard/e2e/audit-rich.spec.ts` — `hermes-native` badge.

---

## Conventions for every task

- **TDD: red → green → refactor → commit.**
- **One commit per task.** Commit message: `feat(<area>): <task-name>` or `test(<area>): <task-name>`. Include `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` on every commit.
- **Run lights before commit:**
  - Engine task → `npm --prefix engine test && npm --prefix engine run typecheck`
  - Dashboard task → `npm --prefix dashboard run build` (typecheck is part of build via `tsc -b`)
  - Both green → commit.
- **Branch:** stay on the current `claude/loving-dubinsky-ebcc74` worktree branch unless a task says otherwise. Final merge to main is out-of-band.

---

# PHASE 1 — Engine foundation

## Task 1: Extend `ToolDef` with `kind`, `connector`, `outputShape`

**Goal:** Additive type changes only — no behavior change. All existing tools get `kind: 'engine-tool'` and a `connector` value. New optional `outputShape` field.

**Files:**
- Modify: `engine/src/tools.ts`
- Test: `engine/tests/toolsExternal.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `engine/tests/toolsExternal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TOOLS } from "../src/tools.js";

describe("ToolDef metadata", () => {
  it("every tool has a kind, label and connector", () => {
    for (const [name, def] of Object.entries(TOOLS)) {
      expect(def.kind, `${name} missing kind`).toBeDefined();
      expect(["engine-tool", "external-hermes"]).toContain(def.kind);
      expect(def.label, `${name} missing label`).toBeTruthy();
      expect(def.connector, `${name} missing connector`).toBeTruthy();
    }
  });

  it("existing wired tools are engine-tool kind", () => {
    expect(TOOLS["hris.upsert_employee"].kind).toBe("engine-tool");
    expect(TOOLS["ats.get_contract"].kind).toBe("engine-tool");
    expect(TOOLS["teams.add_member"].kind).toBe("engine-tool");
    expect(TOOLS["channel.send_message"].kind).toBe("engine-tool");
  });

  it("connector ids match real connector definitions", () => {
    expect(TOOLS["hris.upsert_employee"].connector).toBe("shapes");
    expect(TOOLS["ats.get_contract"].connector).toBe("comeet");
    expect(TOOLS["teams.add_member"].connector).toBe("teams");
    expect(TOOLS["calendar.create_invite"].connector).toBe("calendar");
    expect(TOOLS["content.get_branding"].connector).toBe("branding");
    expect(TOOLS["channel.send_message"].connector).toBe("teams");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- toolsExternal`
Expected: FAIL — `kind`/`connector` undefined on each tool.

- [ ] **Step 3: Extend `ToolDef` + populate existing tools**

In `engine/src/tools.ts`:

a) Add to the `ToolDef` interface, right after `name`:
```ts
export type ToolKind = "engine-tool" | "external-hermes";
export interface ToolDef {
  name: string;
  kind: ToolKind;
  integration: "HRIS" | "ATS" | "Channels" | "TaskBoard" | "Calendar" | "Content";
  /** stable connector id this tool belongs to (e.g. "shapes", "gmail"). */
  connector: string;
  label: string;
  purpose: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** Output shape — drives the dashboard schema-tree renderer. Optional for legacy tools. */
  outputShape?: z.ZodTypeAny;
  sideEffectful: boolean;
  /** Absent for kind: "external-hermes" — those are executed by the agent's native gateway. */
  run?: ToolFn;
  summarize: (args: Record<string, unknown>, result: ToolResult) => { target: string; summary: string };
}
```

b) For each existing TOOLS entry, add `kind: "engine-tool"` and the `connector` shown in the test (Task 13 changes the `hris.upsert_employee` label).

c) Update `executeTool` so the missing-`run` case throws clearly:
```ts
// Inside executeTool, before tool.run(...):
if (!tool.run) {
  throw new Error(`tool ${name} has no run function (kind: ${tool.kind})`);
}
result = await tool.run(store, args);
```

- [ ] **Step 4: Run test to verify it passes + existing tests still green**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS — 70+3 = 73 tests.

- [ ] **Step 5: Commit**

```bash
git add engine/src/tools.ts engine/tests/toolsExternal.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): add kind + connector to ToolDef; introduce ToolKind type

ToolDef gains a discriminator (kind: 'engine-tool' | 'external-hermes') and a
stable connector id so the dashboard can gate by specific connector instead of
role-port. outputShape field added for schema-tree rendering. All existing tools
labeled engine-tool with their connector populated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `outputShape` to existing wired engine tools

**Goal:** Each wired tool declares its output zod shape so the dashboard schema-tree has something to render. Optional field — leaving undefined is allowed for unsurfaced tools.

**Files:**
- Modify: `engine/src/tools.ts`
- Test: `engine/tests/toolsExternal.test.ts`

- [ ] **Step 1: Extend the test**

Add to `engine/tests/toolsExternal.test.ts`:

```ts
import { z } from "zod";

describe("ToolDef outputShape", () => {
  it("wired tools declare an output shape", () => {
    expect(TOOLS["ats.get_contract"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["hris.upsert_employee"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["teams.add_member"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["calendar.create_invite"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["content.get_branding"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["channel.send_message"].outputShape).toBeInstanceOf(z.ZodObject);
    expect(TOOLS["hiring_manager.ask"].outputShape).toBeInstanceOf(z.ZodObject);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- toolsExternal`
Expected: FAIL — outputShape undefined.

- [ ] **Step 3: Add output zod shapes**

In `engine/src/tools.ts`, add the shapes alongside each tool def. Examples:

```ts
const contractOutput = z.object({
  ok: z.boolean(),
  contract: z.object({
    candidateId: z.string(),
    name: z.string(),
    role: z.string(),
    startDate: z.string(),
    department: z.string(),
    managerId: z.string(),
    employmentType: z.string(),
    signed: z.boolean(),
  }),
});

const upsertOutput = z.object({
  ok: z.boolean(),
  employee: z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    startDate: z.string().optional(),
    department: z.string().optional(),
    managerId: z.string().optional(),
    employmentType: z.string().optional(),
  }),
});

const teamsAddOutput = z.object({
  ok: z.boolean(),
  employeeId: z.string(),
  teams: z.array(z.string()),
});

const inviteOutput = z.object({
  ok: z.boolean(),
  invite: z.object({
    id: z.string(),
    tenant: z.string(),
    title: z.string(),
    date: z.string(),
    attendees: z.array(z.string()),
    location: z.string(),
  }),
});

const brandingOutput = z.object({
  ok: z.boolean(),
  branding: z.object({
    companyStory: z.string(),
    cultureVideoUrl: z.string(),
    welcomeNote: z.string(),
  }),
});

const sendOutput = z.object({
  ok: z.boolean(),
  message: z.object({
    id: z.string(),
    channel: z.enum(["email", "teams", "slack", "whatsapp"]),
    to: z.string(),
    body: z.string(),
    ts: z.string(),
  }),
});

const askOutput = z.object({
  ok: z.boolean(),
  answer: z.string(),
  manager: z.object({ id: z.string(), name: z.string() }),
});
```

Then on each tool def add `outputShape: <matching>Output` field.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/tools.ts engine/tests/toolsExternal.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): declare outputShape on wired tools for schema-tree rendering

Each wired tool now declares its zod output schema so the dashboard's
schema-tree inspector + Integrations side panel have a concrete contract to
render. Engine behavior is unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `gmail.send_email` + `whatsapp.send_message` virtual tools

**Goal:** Two new ToolDef entries with `kind: "external-hermes"`, no `run` function, full schemas, audit summarizers.

**Files:**
- Modify: `engine/src/tools.ts`
- Test: `engine/tests/toolsExternal.test.ts`

- [ ] **Step 1: Extend the test**

Append to `engine/tests/toolsExternal.test.ts`:

```ts
describe("external-hermes virtual tools", () => {
  it("registers gmail.send_email + whatsapp.send_message", () => {
    expect(TOOLS["gmail.send_email"]).toBeDefined();
    expect(TOOLS["whatsapp.send_message"]).toBeDefined();
  });

  it("virtual tools have kind=external-hermes and no run", () => {
    expect(TOOLS["gmail.send_email"].kind).toBe("external-hermes");
    expect(TOOLS["gmail.send_email"].run).toBeUndefined();
    expect(TOOLS["whatsapp.send_message"].kind).toBe("external-hermes");
    expect(TOOLS["whatsapp.send_message"].run).toBeUndefined();
  });

  it("virtual tools carry their connector ids", () => {
    expect(TOOLS["gmail.send_email"].connector).toBe("gmail");
    expect(TOOLS["whatsapp.send_message"].connector).toBe("whatsapp");
  });

  it("virtual tools live under the Channels role-port", () => {
    expect(TOOLS["gmail.send_email"].integration).toBe("Channels");
    expect(TOOLS["whatsapp.send_message"].integration).toBe("Channels");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- toolsExternal`
Expected: FAIL — virtual tools not registered.

- [ ] **Step 3: Add the two virtual tools**

In `engine/src/tools.ts`, append to `TOOLS`:

```ts
const gmailSendSchema = z.object({
  tenant: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  from: z.string().optional(),
});
const gmailSendOutput = z.object({
  ok: z.boolean(),
  messageId: z.string(),
  channel: z.literal("email"),
});

const whatsappSendSchema = z.object({
  tenant: z.string(),
  to: z.string(),
  body: z.string(),
  mediaUrl: z.string().optional(),
});
const whatsappSendOutput = z.object({
  ok: z.boolean(),
  messageId: z.string(),
  channel: z.literal("whatsapp"),
});

// Inside the TOOLS object, after channel.send_message:
"gmail.send_email": {
  name: "gmail.send_email",
  kind: "external-hermes",
  integration: "Channels",
  connector: "gmail",
  label: "Send welcome email",
  purpose:
    "Send a warm welcome email via Hermes's native Gmail gateway. The engine does not execute this — Hermes does, then calls back via /side-effect.",
  schema: gmailSendSchema,
  outputShape: gmailSendOutput,
  sideEffectful: true,
  summarize: (args) => ({
    target: String(args.to ?? "—"),
    summary: `Sent welcome email to ${args.to}`,
  }),
},

"whatsapp.send_message": {
  name: "whatsapp.send_message",
  kind: "external-hermes",
  integration: "Channels",
  connector: "whatsapp",
  label: "Send WhatsApp",
  purpose:
    "Send a WhatsApp message via Hermes's native gateway. The engine does not execute this — Hermes does, then calls back via /side-effect.",
  schema: whatsappSendSchema,
  outputShape: whatsappSendOutput,
  sideEffectful: true,
  summarize: (args) => ({
    target: String(args.to ?? "—"),
    summary: `Sent WhatsApp to ${args.to}`,
  }),
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/tools.ts engine/tests/toolsExternal.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): register gmail.send_email + whatsapp.send_message virtual tools

Two external-hermes tools represent the channel sends Hermes performs natively
via its built-in gateways. They have schemas + summarizers (so the workflow
editor + audit log render them) but no run function — execution is recorded
later via POST /side-effect.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Playbook serializer emits external-hermes instructions

**Goal:** When serializing an `external-hermes` action node, the playbook block instructs the LLM to use its native gateway tool AND call `record_side_effect`. The available-tools catalog also flags which channel tools are native (so Hermes knows).

**Files:**
- Modify: `engine/src/workflows/serialize.ts`
- Test: `engine/tests/serialize.test.ts` (extend existing)

- [ ] **Step 1: Update existing trigger-shape uses + add new test**

First, fix the existing test fixture's trigger shape (Task 5 will formalize the type — for now, add `connector: "manual"`):

In `engine/tests/serialize.test.ts:55`, change:
```ts
id: "t", name: "T", version: 1, trigger: { type: "manual" }, root: "c1",
```
to:
```ts
id: "t", name: "T", version: 1, trigger: { type: "manual", connector: "manual" }, root: "c1",
```

Then append a new test:

```ts
import { TOOLS } from "../src/tools.js";

describe("serializePlaybook external-hermes", () => {
  it("emits a 'use native gateway + call record_side_effect' block for external-hermes actions", () => {
    const wf: WorkflowDefinition = {
      id: "t", name: "Test", version: 1,
      trigger: { type: "manual", connector: "manual" },
      root: "n1",
      nodes: {
        n1: {
          id: "n1", kind: "action", capability: "gmail.send_email",
          input: {
            tenant: { kind: "literal", value: "papaya" },
            to: { kind: "ref", from: "step.x.email" },
            subject: { kind: "agent" },
            body: { kind: "agent" },
          },
        },
      },
    };
    const out = serializePlaybook(wf, ["gmail.send_email"]);
    expect(out).toContain("native");
    expect(out).toContain("gmail");
    expect(out).toContain("record_side_effect");
    expect(out).toContain("direction: 'outbound'");
  });

  it("engine-tool steps render as before", () => {
    const wf: WorkflowDefinition = {
      id: "t", name: "Test", version: 1,
      trigger: { type: "manual", connector: "manual" },
      root: "n1",
      nodes: {
        n1: { id: "n1", kind: "action", capability: "ats.get_contract", input: {} },
      },
    };
    const out = serializePlaybook(wf, ["ats.get_contract"]);
    expect(out).toContain("Call `ats.get_contract`");
    expect(out).not.toContain("record_side_effect");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- serialize`
Expected: FAIL — external-hermes branch absent.

- [ ] **Step 3: Update the serializer**

In `engine/src/workflows/serialize.ts`, change the walker to branch on tool kind:

```ts
import { TOOLS } from "../tools.js";

// inside walk(), the action branch:
if (node.kind === "action") {
  n += 1;
  const tool = TOOLS[node.capability];
  const isExternal = tool?.kind === "external-hermes";
  const audiencePart = node.audience ? ` (audience: ${node.audience})` : "";
  if (isExternal) {
    lines.push(
      `${indent}${n}. Send via your native ${tool.connector} gateway${audiencePart}.`
    );
    const argsLine = renderArgs(node);
    if (argsLine) lines.push(`${indent}   args: ${argsLine}`);
    lines.push(
      `${indent}   Then immediately call \`record_side_effect\` with:`
    );
    lines.push(
      `${indent}     { channel: '${tool.connector === "gmail" ? "email" : tool.connector}', direction: 'outbound', to, body${tool.connector === "gmail" ? ", subject" : ""} }`
    );
    lines.push(
      `${indent}   Do not skip the callback — it is how the audit log gets the entry.`
    );
  } else {
    lines.push(`${indent}${n}. Call \`${node.capability}\`${audiencePart}`);
    const argsLine = renderArgs(node);
    if (argsLine) lines.push(`${indent}   args: ${argsLine}`);
  }
  walk(node.next, indent);
} else { /* condition branch unchanged */ }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/workflows/serialize.ts engine/tests/serialize.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): playbook serializer emits record_side_effect contract for external-hermes steps

External-hermes action nodes render as 'send via your native gateway + call
record_side_effect' instead of 'Call <tool>'. Engine-tool steps unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Migrate `WorkflowDefinition.trigger` shape + zod schema

**Goal:** `trigger` becomes `{ type, connector, sample? }`. Update interface, fixture, runtime zod schema, and all tests that constructed `trigger: { type: "..." }`.

**Files:**
- Modify: `engine/src/workflows/types.ts`
- Modify: `engine/src/workflows/onboarding.ts`
- Modify: `engine/src/app.ts:30` — the `workflowSchema` zod object
- Modify: `engine/tests/workflowsApi.test.ts:27`
- Modify: `engine/tests/store.test.ts:43,52`

- [ ] **Step 1: Write the failing test**

Add to `engine/tests/workflowsApi.test.ts`:

```ts
import { CONNECTORS } from "../src/integrations.js";

describe("workflow trigger shape", () => {
  it("PUT rejects a trigger without connector", async () => {
    const app = createApp();
    await app.ready();
    const def = {
      id: "x", name: "X", version: 1,
      trigger: { type: "onboard" }, // missing connector
      root: "n1",
      nodes: { n1: { id: "n1", kind: "action", capability: "hris.upsert_employee", input: {} } },
    };
    const res = await app.inject({ method: "PUT", url: "/workflows/x?tenant=papaya", payload: def });
    expect(res.statusCode).toBe(400);
  });

  it("PUT accepts a trigger with type + connector + optional sample", async () => {
    const app = createApp();
    await app.ready();
    const def = {
      id: "x", name: "X", version: 1,
      trigger: { type: "candidate.hired", connector: "comeet", sample: { candidateId: "c1" } },
      root: "n1",
      nodes: { n1: { id: "n1", kind: "action", capability: "hris.upsert_employee", input: {} } },
    };
    const res = await app.inject({ method: "PUT", url: "/workflows/x?tenant=papaya", payload: def });
    expect(res.statusCode).toBe(200);
  });
});
```

(Adapt `createApp()` to the existing test helper — check the file's existing imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- workflowsApi`
Expected: FAIL — current schema doesn't require connector.

- [ ] **Step 3: Update the interface, fixture, and zod schema**

In `engine/src/workflows/types.ts`:
```ts
export interface TriggerDefinition {
  type: string;
  connector: string;
  sample?: Record<string, unknown>;
}
```

In `engine/src/workflows/onboarding.ts`:
```ts
trigger: {
  type: "candidate.hired",
  connector: "comeet",
  sample: {
    candidateId: "c1",
    candidate: { name: "Maya Cohen", email: "maya@cohen.io", role: "Engineer" },
  },
},
```

In `engine/src/app.ts:30`, the workflowSchema:
```ts
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
```

In `engine/src/workflows/serialize.ts:37`, the trigger line:
```ts
`Trigger: ${wf.trigger.type} (${wf.trigger.connector})`,
```

In all existing tests that construct `trigger: { type: "..." }`, add `connector: "..."`:
- `engine/tests/workflowsApi.test.ts:27` → `trigger: { type: "onboard", connector: "manual" }`
- `engine/tests/store.test.ts:43,52` → same
- `engine/tests/serialize.test.ts:55` → already updated in Task 4

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add engine/src/workflows engine/src/app.ts engine/tests
git commit -m "$(cat <<'EOF'
feat(engine): WorkflowDefinition.trigger gains connector + optional sample payload

Trigger upgraded from { type, filter? } to { type, connector, sample? }. The
onboarding fixture migrates to { type: candidate.hired, connector: comeet,
sample: {...Maya Cohen...} } so the Test Flow drawer has a deterministic
starting payload. Filter field removed (unused).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `GET /triggers` endpoint

**Goal:** Return triggers from installed + enabled connectors. Used by the Trigger Inspector's picker.

**Files:**
- Modify: `engine/src/app.ts`
- Modify: `engine/src/integrations.ts` (small helper)
- Test: `engine/tests/triggers.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `engine/tests/triggers.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { stubHermes } from "../src/stubHermes.js";
import { seedFixtures } from "../src/fixtures.js";

let store: InMemoryStore;
function createApp() {
  store = new InMemoryStore();
  seedFixtures(store);
  return buildApp({ store, hermes: stubHermes });
}

describe("GET /triggers", () => {
  it("returns triggers from installed+enabled connectors only", async () => {
    const app = createApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/triggers?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    const triggers = res.json();
    const candidateHired = triggers.find((t: any) => t.name === "candidate.hired");
    expect(candidateHired).toBeDefined();
    expect(candidateHired.connector).toBe("comeet");
    expect(candidateHired.label).toBe("Candidate hired");
  });

  it("excludes triggers from disabled connectors", async () => {
    const app = createApp();
    await app.ready();
    await app.inject({ method: "POST", url: "/integrations/comeet/enable", payload: { enabled: false } });
    const res = await app.inject({ method: "GET", url: "/triggers?tenant=papaya" });
    const triggers = res.json();
    expect(triggers.find((t: any) => t.connector === "comeet")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- triggers`
Expected: FAIL — 404 (endpoint missing).

- [ ] **Step 3: Add the helper + endpoint**

In `engine/src/integrations.ts`, append:

```ts
export function enabledTriggers(
  store: InMemoryStore,
  tenant: string,
): Array<ConnectorTrigger & { connector: string }> {
  const out: Array<ConnectorTrigger & { connector: string }> = [];
  for (const def of CONNECTORS) {
    const state = connectorState(store, tenant, def);
    if (!state.installed || !state.enabled) continue;
    for (const t of def.triggers ?? []) {
      out.push({ ...t, connector: def.id });
    }
  }
  return out;
}
```

In `engine/src/app.ts`, add the import and route:
```ts
import { enabledTriggers, ... } from "./integrations.js";

// alongside the other GET routes:
app.get<{ Querystring: { tenant?: string } }>("/triggers", async (req) => {
  return enabledTriggers(store, req.query.tenant ?? "papaya");
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/integrations.ts engine/src/app.ts engine/tests/triggers.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): GET /triggers — list triggers from enabled connectors

Powers the trigger-picker in the workflow editor's TriggerInspector.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `POST /side-effect` endpoint

**Goal:** Hermes callback after native channel send/receive. Writes a Message + audit entry with `actor: 'hermes-native'`.

**Files:**
- Modify: `engine/src/store.ts` (extend `Message.channel` + `AuditActor`)
- Modify: `engine/src/app.ts` (new endpoint)
- Test: `engine/tests/sideEffect.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `engine/tests/sideEffect.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { stubHermes } from "../src/stubHermes.js";
import { seedFixtures } from "../src/fixtures.js";

let store: InMemoryStore;
function createApp() {
  store = new InMemoryStore();
  seedFixtures(store);
  return buildApp({ store, hermes: stubHermes });
}

describe("POST /side-effect", () => {
  it("records an outbound email — Message + audit entry", async () => {
    const app = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: {
        channel: "email",
        direction: "outbound",
        to: "maya@cohen.io",
        subject: "Welcome to Papaya",
        body: "Hi Maya — welcome aboard!",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    const msgs = store.getMessages("papaya");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].channel).toBe("email");
    expect(msgs[0].to).toBe("maya@cohen.io");

    const audit = store.getAudit("papaya");
    const entry = audit.find((a) => a.capability === "email.send_message");
    expect(entry).toBeDefined();
    expect(entry!.actor).toBe("hermes-native");
    expect(entry!.integration).toBe("Gmail");
  });

  it("records an inbound whatsapp message", async () => {
    const app = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: {
        channel: "whatsapp",
        direction: "inbound",
        from: "+972546358808",
        body: "When does Maya start?",
      },
    });
    expect(res.statusCode).toBe(200);
    const audit = store.getAudit("papaya");
    const entry = audit.find((a) => a.capability === "whatsapp.message_received");
    expect(entry).toBeDefined();
    expect(entry!.integration).toBe("WhatsApp");
  });

  it("inherits runId from the active run when not provided", async () => {
    const app = createApp();
    await app.ready();
    store.pushActiveRun("papaya", "run-abc");
    await app.inject({
      method: "POST",
      url: "/side-effect",
      payload: { channel: "email", direction: "outbound", to: "x@y", subject: "S", body: "B" },
    });
    const audit = store.getAudit("papaya");
    expect(audit.at(-1)!.runId).toBe("run-abc");
    store.popActiveRun("papaya", "run-abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- sideEffect`
Expected: FAIL — endpoint missing + `whatsapp` not in Message.channel + `hermes-native` not in AuditActor.

- [ ] **Step 3: Extend Message + AuditActor + add endpoint**

In `engine/src/store.ts`:
```ts
// Update Message:
channel: "email" | "teams" | "slack" | "whatsapp";

// Update AuditActor:
export type AuditActor = "pixush" | "user" | "trigger" | "system" | "hermes-native";

// Also add direction to Message (default outbound for back-compat):
direction?: "outbound" | "inbound";
```

Inside `addMessage`, default `direction` to `"outbound"` when not provided.

In `engine/src/app.ts`, add the endpoint near `/tools/execute`:

```ts
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

  // Persist to Messages store
  const msg = store.addMessage({
    tenant,
    from: parsed.data.direction === "inbound" ? (parsed.data.from ?? "external") : "agent",
    to: parsed.data.direction === "outbound" ? (parsed.data.to ?? "—") : "agent",
    role: parsed.data.direction === "inbound" ? "inbound" : "employee",
    channel: parsed.data.channel,
    body: parsed.data.body,
    direction: parsed.data.direction,
  });

  // Write audit entry
  const capability = parsed.data.direction === "outbound"
    ? `${parsed.data.channel}.send_message`
    : `${parsed.data.channel}.message_received`;
  const target = parsed.data.direction === "outbound"
    ? (parsed.data.to ?? "—")
    : (parsed.data.from ?? "—");
  const summary = parsed.data.direction === "outbound"
    ? `Sent ${parsed.data.channel} to ${target}${parsed.data.subject ? `: "${parsed.data.subject}"` : ""}`
    : `Received ${parsed.data.channel} from ${target}: "${parsed.data.body.slice(0, 60)}${parsed.data.body.length > 60 ? "…" : ""}"`;

  store.audit({
    tenant,
    capability,
    label: parsed.data.direction === "outbound"
      ? (parsed.data.channel === "email" ? "Send welcome email" : "Send WhatsApp")
      : `Inbound ${parsed.data.channel}`,
    integration,
    target,
    summary,
    actor: "hermes-native",
    status: "success",
    runId,
    inputs: { to: parsed.data.to, from: parsed.data.from, subject: parsed.data.subject, body: parsed.data.body },
    outputs: { ok: true, messageId: msg.id },
  });

  return { ok: true, messageId: msg.id };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src
git commit -m "$(cat <<'EOF'
feat(engine): POST /side-effect — Hermes-native channel ingestion

Records a Message + audit entry when Hermes performs a channel send/receive
via its native gateway. RunId falls back to the active run for the tenant.
AuditActor gains 'hermes-native'; Message.channel admits 'whatsapp'.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Run tracking in the store

**Goal:** Persist run-level status so `/runs/:id` can report `running | done | error` + result.

**Files:**
- Modify: `engine/src/store.ts`
- Test: `engine/tests/store.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `engine/tests/store.test.ts`:

```ts
import type { Run } from "../src/store.js";

describe("InMemoryStore.runs", () => {
  it("addRun, updateRun, getRun roundtrip", () => {
    const s = new InMemoryStore();
    const run = s.addRun({ tenant: "papaya", runId: "r1", workflowId: "onboarding", status: "running" });
    expect(run.startedAt).toBeTypeOf("number");
    expect(s.getRun("r1")?.status).toBe("running");
    s.updateRun("r1", { status: "done", response: "All set." });
    expect(s.getRun("r1")?.status).toBe("done");
    expect(s.getRun("r1")?.response).toBe("All set.");
  });

  it("reset() clears runs", () => {
    const s = new InMemoryStore();
    s.addRun({ tenant: "papaya", runId: "r1", workflowId: "x", status: "running" });
    s.reset();
    expect(s.getRun("r1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- store`
Expected: FAIL — Run type / addRun / getRun missing.

- [ ] **Step 3: Add Run tracking to the store**

In `engine/src/store.ts`:
```ts
export interface Run {
  tenant: string;
  runId: string;
  workflowId: string;
  status: "running" | "done" | "error";
  response?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

// inside class InMemoryStore:
private runs = new Map<string, Run>();

addRun(input: Omit<Run, "startedAt">): Run {
  const full: Run = { ...input, startedAt: Date.now() };
  this.runs.set(full.runId, full);
  return full;
}

updateRun(runId: string, patch: Partial<Run>): void {
  const cur = this.runs.get(runId);
  if (!cur) return;
  this.runs.set(runId, { ...cur, ...patch, endedAt: patch.status === "done" || patch.status === "error" ? Date.now() : cur.endedAt });
}

getRun(runId: string): Run | undefined {
  return this.runs.get(runId);
}

// inside reset(), add:
this.runs.clear();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src/store.ts engine/tests/store.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): InMemoryStore.runs — track run-level status for /runs/:id polling

Adds Run type + addRun/updateRun/getRun + cleared on reset. Used by the async
test endpoints (Task 9) and Test Flow drawer polling.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Async test endpoints: `POST /workflows/:id/test`, `GET /runs/:id`, `?runId=` filter on `/audit`

**Goal:** The Test Flow drawer needs an async run-and-poll pattern.

**Files:**
- Modify: `engine/src/orchestrator.ts` — extract a `runWorkflow(req, …)` helper.
- Modify: `engine/src/app.ts` — add the three endpoints + extend `/audit`.
- Test: `engine/tests/workflowTest.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `engine/tests/workflowTest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { stubHermes } from "../src/stubHermes.js";
import { seedFixtures } from "../src/fixtures.js";

function createApp() {
  const store = new InMemoryStore();
  seedFixtures(store);
  return { app: buildApp({ store, hermes: stubHermes }), store };
}

async function waitForDone(app: any, runId: string, attempts = 20): Promise<any> {
  for (let i = 0; i < attempts; i++) {
    const res = await app.inject({ method: "GET", url: `/runs/${runId}` });
    const run = res.json();
    if (run.status === "done" || run.status === "error") return run;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("run did not finish in time");
}

describe("async test runs", () => {
  it("POST /workflows/:id/test returns runId immediately", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/workflows/onboarding/test?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(res.json().runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("GET /runs/:id transitions running → done", async () => {
    const { app } = createApp();
    await app.ready();
    const { runId } = (await app.inject({ method: "POST", url: "/workflows/onboarding/test?tenant=papaya" })).json();
    const done = await waitForDone(app, runId);
    expect(done.status).toBe("done");
    expect(done.response).toBeTruthy();
  });

  it("GET /audit?runId=... filters to one run", async () => {
    const { app, store } = createApp();
    await app.ready();
    const { runId } = (await app.inject({ method: "POST", url: "/workflows/onboarding/test?tenant=papaya" })).json();
    await waitForDone(app, runId);
    const res = await app.inject({ method: "GET", url: `/audit?tenant=papaya&runId=${runId}` });
    const entries = res.json();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.runId).toBe(runId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- workflowTest`
Expected: FAIL — endpoints missing.

- [ ] **Step 3: Extract a non-HTTP `runWorkflow` helper from `runExecute` and add endpoints**

In `engine/src/orchestrator.ts`, refactor — extract the body so both `/execute` and the test endpoint can call it. New signature:

```ts
export interface RunOptions {
  tenant: string;
  task: string;
  workflowId?: string;
  source?: string;
  runId?: string;
}

export async function runWorkflow(
  opts: RunOptions,
  hermes: HermesClient,
  store: InMemoryStore,
): Promise<AgentReply> {
  const tenant = opts.tenant;
  const requestId = opts.runId ?? randomUUID();
  const workflowId = opts.workflowId ?? "onboarding";
  const def = store.getWorkflow(tenant, workflowId) ?? onboardingWorkflow;
  const playbook = serializePlaybook(def, availableTools(store, tenant));

  const source = opts.source ?? "sensei";
  store.audit({
    tenant, actor: "trigger", status: "success",
    capability: "run.started", label: "Run started",
    integration: source === "sensei" ? "Sensei" : "Trigger",
    target: opts.task.slice(0, 80),
    summary: `Started by ${source}: ${opts.task.slice(0, 60)}${opts.task.length > 60 ? "…" : ""}`,
    runId: requestId,
    inputs: { task: opts.task },
  });

  store.pushActiveRun(tenant, requestId);
  try {
    return await withTrace(
      { traceName: "workflow-execute", metadata: { requestId, tenant, workflowId }, tags: [`tenant:${tenant}`, `workflow:${workflowId}`] },
      async () => {
        const messages = [
          { role: "system" as const, content: SYSTEM_PROMPT },
          { role: "system" as const, content: playbook },
          { role: "user" as const, content: opts.task },
        ];
        const gen = startGeneration("hermes-chat", { input: messages });
        const res = await hermes.chat(messages, { runId: requestId });
        gen?.update({ output: res.content, model: res.model, usageDetails: { input: res.usage?.input, output: res.usage?.output } }).end();
        return {
          requestId, tenant,
          user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
          response: res.content,
          actions: [],
        };
      },
    );
  } finally {
    store.popActiveRun(tenant, requestId);
  }
}

// Keep runExecute as a thin wrapper for back-compat:
export async function runExecute(req: ExecuteRequest, hermes: HermesClient, store: InMemoryStore): Promise<AgentReply> {
  return runWorkflow({
    tenant: (req.context?.tenant as string) ?? "papaya",
    task: req.task,
    source: req.context?.source as string,
  }, hermes, store);
}
```

In `engine/src/app.ts`, add the endpoints:

```ts
import { randomUUID } from "node:crypto";
import { runWorkflow } from "./orchestrator.js";

// /audit gets a runId filter:
app.get<{ Querystring: { tenant?: string; runId?: string } }>("/audit", async (req) => {
  const tenant = req.query.tenant ?? "papaya";
  const all = store.getAudit(tenant);
  return req.query.runId ? all.filter((e) => e.runId === req.query.runId) : all;
});

app.post<{ Params: { id: string }; Querystring: { tenant?: string } }>("/workflows/:id/test", async (req, reply) => {
  const tenant = req.query.tenant ?? "papaya";
  const wf = store.getWorkflow(tenant, req.params.id);
  if (!wf) { reply.code(404); return { ok: false, error: "unknown workflow" }; }
  const runId = randomUUID();
  store.addRun({ tenant, runId, workflowId: req.params.id, status: "running" });

  const sample = wf.trigger.sample ?? {};
  const candidate = (sample as any).candidate ?? {};
  const task = `Run the ${wf.name} workflow for the trigger payload below. Trigger: ${wf.trigger.type} via ${wf.trigger.connector}. Payload: ${JSON.stringify(sample)}.`;

  // Fire-and-forget — update Run state on completion/error
  void runWorkflow({ tenant, task, workflowId: req.params.id, source: "test-flow", runId }, deps.hermes, store)
    .then((r) => store.updateRun(runId, { status: "done", response: r.response }))
    .catch((e) => store.updateRun(runId, { status: "error", error: (e as Error).message }));

  return { runId };
});

app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
  const run = store.getRun(req.params.id);
  if (!run) { reply.code(404); return { ok: false, error: "unknown run" }; }
  return run;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src engine/tests/workflowTest.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): async test-run endpoints — /workflows/:id/test + /runs/:id + audit runId filter

Refactors the orchestrator's runExecute into a reusable runWorkflow helper so
the test endpoint can fire-and-forget a run and the dashboard's Test Flow
drawer can poll /runs/:id and /audit?runId= for live status.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `POST /workflows` + `DELETE /workflows/:id`

**Goal:** Picker can create new workflows and delete the Offboarding stub.

**Files:**
- Modify: `engine/src/app.ts`
- Modify: `engine/src/store.ts` — add `deleteWorkflow`
- Test: `engine/tests/workflowCrud.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `engine/tests/workflowCrud.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import { stubHermes } from "../src/stubHermes.js";
import { seedFixtures } from "../src/fixtures.js";

function createApp() {
  const store = new InMemoryStore();
  seedFixtures(store);
  return { app: buildApp({ store, hermes: stubHermes }), store };
}

describe("workflow CRUD", () => {
  it("POST /workflows creates a workflow with a default action node", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/workflows?tenant=papaya",
      payload: { id: "test-wf", name: "Test", trigger: { type: "manual", connector: "manual" } },
    });
    expect(res.statusCode).toBe(200);
    const wf = res.json();
    expect(wf.root).toBeDefined();
    expect(wf.nodes[wf.root]).toBeDefined();
  });

  it("DELETE /workflows/:id removes it", async () => {
    const { app, store } = createApp();
    await app.ready();
    await app.inject({
      method: "POST", url: "/workflows?tenant=papaya",
      payload: { id: "to-delete", name: "X", trigger: { type: "m", connector: "manual" } },
    });
    const res = await app.inject({ method: "DELETE", url: "/workflows/to-delete?tenant=papaya" });
    expect(res.statusCode).toBe(200);
    expect(store.getWorkflow("papaya", "to-delete")).toBeUndefined();
  });

  it("POST /workflows 409s on duplicate id", async () => {
    const { app } = createApp();
    await app.ready();
    const res = await app.inject({
      method: "POST", url: "/workflows?tenant=papaya",
      payload: { id: "onboarding", name: "Dup", trigger: { type: "m", connector: "manual" } },
    });
    expect(res.statusCode).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- workflowCrud`
Expected: FAIL — endpoints missing.

- [ ] **Step 3: Add endpoints + store method**

In `engine/src/store.ts`:
```ts
deleteWorkflow(tenant: string, id: string): void {
  this.workflows.delete(this.key(tenant, "workflow", id));
}
```

In `engine/src/app.ts`:
```ts
const createWorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  trigger: z.object({ type: z.string(), connector: z.string(), sample: z.record(z.unknown()).optional() }),
});

app.post<{ Querystring: { tenant?: string }; Body: unknown }>("/workflows", async (req, reply) => {
  const tenant = req.query.tenant ?? "papaya";
  const parsed = createWorkflowSchema.safeParse(req.body);
  if (!parsed.success) { reply.code(400); return { ok: false, error: "invalid workflow seed" }; }
  if (store.getWorkflow(tenant, parsed.data.id)) {
    reply.code(409);
    return { ok: false, error: "workflow already exists" };
  }
  const rootId = "n1";
  const def: import("./workflows/types.js").WorkflowDefinition = {
    id: parsed.data.id, name: parsed.data.name, version: 1,
    trigger: parsed.data.trigger,
    root: rootId,
    nodes: { [rootId]: { id: rootId, kind: "action", capability: "", input: {} } },
  };
  store.setWorkflow(tenant, def);
  return def;
});

app.delete<{ Params: { id: string }; Querystring: { tenant?: string } }>("/workflows/:id", async (req, reply) => {
  const tenant = req.query.tenant ?? "papaya";
  if (!store.getWorkflow(tenant, req.params.id)) { reply.code(404); return { ok: false, error: "unknown workflow" }; }
  store.deleteWorkflow(tenant, req.params.id);
  return { ok: true };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src engine/tests/workflowCrud.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): POST/DELETE /workflows for picker create + delete

Powers the WorkflowPicker's '+ New' affordance and the Offboarding stub's delete.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `POST /simulate/inbound`

**Goal:** Synthesize an inbound channel message; Hermes responds; both directions land in audit.

**Files:**
- Modify: `engine/src/app.ts`
- Test: `engine/tests/simulateInbound.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `engine/tests/simulateInbound.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryStore } from "../src/store.js";
import type { HermesClient } from "../src/hermes.js";
import { seedFixtures } from "../src/fixtures.js";

const recordingHermes: HermesClient = {
  chat: async (messages) => {
    return {
      content: "I'll check Maya's start date and reply.",
      model: "stub",
      usage: { input: 10, output: 5 },
      // The simulator should have given Hermes a clear inbound-message prompt.
      // We assert that below — for now, just return a benign response.
    } as any;
  },
};

function createApp(h: HermesClient = recordingHermes) {
  const store = new InMemoryStore();
  seedFixtures(store);
  return { app: buildApp({ store, hermes: h }), store };
}

describe("POST /simulate/inbound", () => {
  it("records an inbound side-effect under a fresh runId then prompts Hermes", async () => {
    const seen: any[] = [];
    const h: HermesClient = {
      chat: async (messages, opts) => {
        seen.push({ messages, opts });
        return { content: "Sure, Maya starts July 1.", model: "stub", usage: { input: 10, output: 5 } } as any;
      },
    };
    const { app, store } = createApp(h);
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/simulate/inbound",
      payload: { channel: "whatsapp", from: "+972546358808", body: "When does Maya start?" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().runId).toBeDefined();

    const audit = store.getAudit("papaya");
    expect(audit.find((a) => a.capability === "whatsapp.message_received")).toBeDefined();
    // Hermes was called with a "you just received this inbound" system message
    const lastCall = seen.at(-1)!;
    const systemMsg = lastCall.messages.find((m: any) => m.role === "system" && m.content.includes("inbound"));
    expect(systemMsg).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- simulateInbound`
Expected: FAIL — endpoint missing.

- [ ] **Step 3: Add the endpoint**

In `engine/src/app.ts`:

```ts
const simulateInboundSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  from: z.string(),
  body: z.string(),
});

app.post<{ Body: unknown; Querystring: { tenant?: string } }>("/simulate/inbound", async (req, reply) => {
  const parsed = simulateInboundSchema.safeParse(req.body);
  if (!parsed.success) { reply.code(400); return { ok: false, error: "invalid inbound payload" }; }
  const tenant = req.query.tenant ?? "papaya";
  const runId = randomUUID();
  store.addRun({ tenant, runId, workflowId: "<inbound>", status: "running" });

  // 1. Record the inbound side-effect directly (so the Messages screen + audit show it immediately).
  await app.inject({
    method: "POST", url: "/side-effect",
    payload: { channel: parsed.data.channel, direction: "inbound", from: parsed.data.from, body: parsed.data.body, runId, tenant },
  });

  // 2. Synthesize a Hermes prompt and fire-and-forget the response loop.
  const inboundSystemNote =
    `You just received this inbound ${parsed.data.channel} message from ${parsed.data.from}: "${parsed.data.body}". ` +
    `Look up any context you need (Maya Cohen's start date is in the HRIS), then reply via your native ${parsed.data.channel} gateway. ` +
    `After replying, call record_side_effect to log your outbound message.`;

  void runWorkflow({
    tenant, task: inboundSystemNote, workflowId: "<inbound>", source: "inbound", runId,
  }, deps.hermes, store)
    .then((r) => store.updateRun(runId, { status: "done", response: r.response }))
    .catch((e) => store.updateRun(runId, { status: "error", error: (e as Error).message }));

  return { runId };
});
```

NOTE: `runWorkflow` for an unknown workflowId currently falls back to `onboardingWorkflow`. For the inbound case, we want a *free-form* run with no playbook. Adjust `runWorkflow`:

In `engine/src/orchestrator.ts`, change:
```ts
const def = store.getWorkflow(tenant, workflowId) ?? onboardingWorkflow;
const playbook = serializePlaybook(def, availableTools(store, tenant));
```
to:
```ts
const def = store.getWorkflow(tenant, workflowId);
const playbook = def
  ? serializePlaybook(def, availableTools(store, tenant))
  : `AVAILABLE TOOLS\n${availableTools(store, tenant).map((t) => `- ${t}`).join("\n")}\n\nUse your tools as needed; no playbook for this request.`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src engine/tests/simulateInbound.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): POST /simulate/inbound — synthesize a Hermes Q&A round-trip

Records the inbound side-effect, then fires-and-forgets a free-form (no
playbook) Hermes run with the inbound message embedded in a system prompt.
The orchestrator's runWorkflow now handles unknown workflowId gracefully
(no playbook, just available tools).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Surface `kind`, `connector`, `inputSchema`, `outputSchema` via `/capabilities` + `/integrations`

**Goal:** Dashboard's schema-tree renderers consume JSON. The engine emits a `{ name, kind, label, connector, inputSchema, outputSchema }` block per capability.

**Files:**
- Modify: `engine/src/tools.ts` — extend `capabilitySpecs` + add `schemaToTree` helper.
- Modify: `engine/src/app.ts` — `/integrations` capability rows include same.
- Test: `engine/tests/capabilities.test.ts` (extend)

- [ ] **Step 1: Extend the test**

Append to `engine/tests/capabilities.test.ts`:

```ts
it("each capability emits kind, connector, label, inputSchema, outputSchema", async () => {
  const app = createApp();
  await app.ready();
  const caps = (await app.inject({ method: "GET", url: "/capabilities" })).json();
  const gmail = caps.find((c: any) => c.name === "gmail.send_email");
  expect(gmail.kind).toBe("external-hermes");
  expect(gmail.connector).toBe("gmail");
  expect(gmail.label).toBe("Send welcome email");
  expect(gmail.inputSchema).toMatchObject({ kind: "object" });
  expect(gmail.outputSchema).toMatchObject({ kind: "object" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- capabilities`
Expected: FAIL.

- [ ] **Step 3: Implement schemaToTree + extend capabilitySpecs**

In `engine/src/tools.ts` (append):

```ts
// SchemaNode — JSON-serializable tree the dashboard consumes.
export interface SchemaNode {
  kind: "object" | "string" | "number" | "boolean" | "array" | "literal" | "union" | "unknown";
  required?: boolean;
  fields?: Record<string, SchemaNode>;   // object
  items?: SchemaNode;                    // array
  value?: unknown;                       // literal
  options?: SchemaNode[];                // union
}

export function schemaToTree(z: z.ZodTypeAny | undefined): SchemaNode {
  if (!z) return { kind: "unknown" };
  const def = (z as any)._def;
  const typeName = def?.typeName;
  switch (typeName) {
    case "ZodObject": {
      const shape = (z as z.ZodObject<z.ZodRawShape>).shape;
      const fields: Record<string, SchemaNode> = {};
      for (const [k, v] of Object.entries(shape)) {
        const child = schemaToTree(v as z.ZodTypeAny);
        child.required = !(v as z.ZodTypeAny).isOptional();
        fields[k] = child;
      }
      return { kind: "object", fields };
    }
    case "ZodString": return { kind: "string" };
    case "ZodNumber": return { kind: "number" };
    case "ZodBoolean": return { kind: "boolean" };
    case "ZodArray": return { kind: "array", items: schemaToTree(def.type) };
    case "ZodLiteral": return { kind: "literal", value: def.value };
    case "ZodOptional": return schemaToTree(def.innerType);
    case "ZodEnum": return { kind: "union", options: def.values.map((v: unknown) => ({ kind: "literal" as const, value: v })) };
    case "ZodUnion": return { kind: "union", options: def.options.map((o: z.ZodTypeAny) => schemaToTree(o)) };
    default: return { kind: "unknown" };
  }
}

// Replace capabilitySpecs() with:
export function capabilitySpecs() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    kind: t.kind,
    connector: t.connector,
    integration: t.integration,
    label: t.label,
    description: t.purpose,
    sideEffectful: t.sideEffectful,
    inputSchema: schemaToTree(t.schema),
    outputSchema: schemaToTree(t.outputShape),
    fields: Object.entries(t.schema.shape).map(([name, field]) => ({
      name,
      required: !(field as z.ZodTypeAny).isOptional(),
      system: name === "tenant",
    })),
  }));
}
```

In `engine/src/app.ts`, where the `/integrations` route enumerates capabilities (around line 96–103), include `inputSchema`/`outputSchema`:

```ts
const tools = Object.values(TOOLS).filter((t) => t.connector === def.id).map((t) => t.name);
const capabilities = def.capabilities.map((cap) => {
  const tool = TOOLS[cap.name];
  return {
    ...cap,
    kind: tool?.kind,
    inputSchema: tool ? schemaToTree(tool.schema) : null,
    outputSchema: tool ? schemaToTree(tool.outputShape) : null,
  };
});
return { ...def, ...state, tools, capabilities };
```

(Import `schemaToTree` from `./tools.js`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src engine/tests/capabilities.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): /capabilities + /integrations include input/output schema trees

Zod schemas serialized to a portable SchemaNode tree so the dashboard's
schema-tree inspector + Integrations side panel can render Inputs + Output
without re-implementing zod introspection.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Fixtures — Offboarding stub + manager phone + onboarding label tweak

**Goal:** Picker shows Offboarding stub. Manager has `phone: '+972546358808'`. `hris.upsert_employee` label flips to *"Start onboarding in Shapes"*.

**Files:**
- Modify: `engine/src/store.ts` — `Manager.phone?: string`
- Modify: `engine/src/fixtures.ts`
- Modify: `engine/src/tools.ts` — label only
- Create: `engine/src/workflows/offboarding.ts`
- Test: `engine/tests/fixtures.test.ts` (extend)

- [ ] **Step 1: Extend the test**

Append to `engine/tests/fixtures.test.ts`:

```ts
import { onboardingWorkflow } from "../src/workflows/onboarding.js";
import { offboardingWorkflow } from "../src/workflows/offboarding.js";
import { TOOLS } from "../src/tools.js";

describe("demo fixtures", () => {
  it("seeds manager with a phone", () => {
    const s = makeStore();
    expect(s.getManager("papaya", "m1")?.phone).toBe("+972546358808");
  });

  it("seeds an Offboarding stub workflow alongside Onboarding", () => {
    const s = makeStore();
    const ids = s.listWorkflows("papaya").map((w) => w.id);
    expect(ids).toContain("onboarding");
    expect(ids).toContain("offboarding");
  });

  it("hris.upsert_employee label reads as 'Start onboarding in Shapes'", () => {
    expect(TOOLS["hris.upsert_employee"].label).toBe("Start onboarding in Shapes");
  });

  it("Offboarding stub trigger matches Shapes employee.terminated", () => {
    expect(offboardingWorkflow.trigger.connector).toBe("shapes");
    expect(offboardingWorkflow.trigger.type).toBe("employee.terminated");
  });
});

function makeStore() {
  const { InMemoryStore } = require("../src/store.js");
  const { seedFixtures } = require("../src/fixtures.js");
  const s = new InMemoryStore();
  seedFixtures(s);
  return s;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix engine test -- fixtures`
Expected: FAIL.

- [ ] **Step 3: Apply the changes**

`engine/src/store.ts` — extend `Manager`:
```ts
export interface Manager {
  id: string;
  name: string;
  department: string;
  cannedAnswer: string;
  phone?: string;
}
```

`engine/src/workflows/offboarding.ts` (new):
```ts
import type { WorkflowDefinition } from "./types.js";

export const offboardingWorkflow: WorkflowDefinition = {
  id: "offboarding",
  name: "Offboarding",
  version: 1,
  trigger: { type: "employee.terminated", connector: "shapes", sample: { employeeId: "e1" } },
  root: "n1",
  nodes: {
    n1: {
      id: "n1", kind: "action", capability: "hris.upsert_employee", audience: "hr",
      input: {
        tenant: { kind: "literal", value: "papaya" },
        id: { kind: "ref", from: "trigger.employeeId" },
        name: { kind: "literal", value: "—" },
        role: { kind: "literal", value: "—" },
        employmentType: { kind: "literal", value: "Terminated" },
      },
    },
  },
};
```

`engine/src/fixtures.ts` — add the manager phone + seed offboarding:
```ts
import { offboardingWorkflow } from "./workflows/offboarding.js";

// inside seedFixtures:
store.addManager(tenant, {
  id: "m1",
  name: "Daniel Levi",
  department: "Engineering",
  cannedAnswer: "...",
  phone: "+972546358808",
});

// at the bottom, after onboarding seed:
store.setWorkflow(tenant, JSON.parse(JSON.stringify(offboardingWorkflow)));
```

`engine/src/tools.ts` — change `hris.upsert_employee.label` to `"Start onboarding in Shapes"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix engine test && npm --prefix engine run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/src engine/tests/fixtures.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): seed Offboarding workflow stub + manager phone + Shapes label

Picker shows New Hire + Offboarding so it looks alive (Q1.b). Manager fixture
gains the demo phone (+972546358808). The hris.upsert_employee display label
becomes 'Start onboarding in Shapes' to match the demo narration; tool id
unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 2 — Agent

## Task 14: New Hermes skill `record-side-effect`

**Goal:** A bash skill the LLM calls after every native channel send/receive. Same shape as `hris-tool`.

**Files:**
- Create: `agent/skills/record-side-effect/SKILL.md`
- Create: `agent/skills/record-side-effect/run.sh`

- [ ] **Step 1: Write the skill manifest**

Create `agent/skills/record-side-effect/SKILL.md`:

````md
---
name: record-side-effect
description: Log a channel-message side-effect (sent or received via your native gateways) to the PixushHR engine so it appears in the audit log + Messages screen.
---

Use this skill after every channel send or receive you perform via your native
gateways (WhatsApp, Email). The engine cannot see those actions on its own —
this skill is how it learns.

Provide a JSON payload with these fields:
- `channel`: "email" | "whatsapp"
- `direction`: "outbound" | "inbound"
- `to` (outbound): recipient
- `from` (inbound): sender
- `subject` (email outbound only): subject line
- `body`: the message body
- (optional) `tenant`: defaults to "papaya"

Examples:

```
{ "channel": "email", "direction": "outbound", "to": "maya@cohen.io",
  "subject": "Welcome to Papaya", "body": "Hi Maya — welcome aboard!" }

{ "channel": "whatsapp", "direction": "inbound",
  "from": "+972546358808", "body": "When does Maya start?" }
```

Run: `bash run.sh '<payload-json>'` — returns `{"ok":true,"messageId":"..."}`.
````

- [ ] **Step 2: Write the runner**

Create `agent/skills/record-side-effect/run.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
PAYLOAD="$1"
ENGINE_URL="${ENGINE_URL:-http://engine:3000}"
curl -sS -X POST "$ENGINE_URL/side-effect" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

- [ ] **Step 3: Make it executable + sanity check**

Run:
```bash
chmod +x agent/skills/record-side-effect/run.sh
ls -la agent/skills/record-side-effect/
```
Expected: `run.sh` has `x` bit; both files present.

- [ ] **Step 4: Commit**

```bash
git add agent/skills/record-side-effect
git commit -m "$(cat <<'EOF'
feat(agent): record-side-effect skill — Hermes callback for native-gateway sends

Mirrors the hris-tool skill shape. The LLM calls this after every native
WhatsApp/Email send or receipt; engine writes Messages + audit entries with
actor=hermes-native.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Update SOUL.md with channel-callback contract

**Goal:** SOUL prompts Hermes to always call `record-side-effect` around channel sends + receipts.

**Files:**
- Modify: `agent/SOUL.md`

- [ ] **Step 1: Append the contract section**

Open `agent/SOUL.md` and append:

```md

# Channel callbacks (audit contract)

You can reach people through native gateways (WhatsApp, Email). The engine
does not see those calls on its own — you must log them yourself.

After every native channel send, call the `record-side-effect` skill with:
```
{ "channel": "<email|whatsapp>", "direction": "outbound",
  "to": "<recipient>", "body": "<the message>",
  "subject": "<email only>" }
```

When you receive an inbound message (e.g. a WhatsApp reply), before composing
your answer, call `record-side-effect` with `direction: "inbound"` and the
sender as `from`. After you reply, call it again for the outbound. The audit
log depends on this — do not omit it.
```

- [ ] **Step 2: Commit**

```bash
git add agent/SOUL.md
git commit -m "$(cat <<'EOF'
feat(agent): SOUL extends the channel-callback contract

Hermes is told to record_side_effect around every native WhatsApp/Email
send and receive — the engine's audit log + Messages screen depend on it.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 3 — Dashboard: Workflow Editor rebuild

## Task 16: Engine-aware types + API client

**Goal:** Type-safe access to `/workflows`, `/capabilities`, `/triggers`, `/runs/:id`, `/audit?runId=`, plus `SchemaNode` + `Binding` types.

**Files:**
- Create: `dashboard/src/screens/workflow/api.ts`
- Create: `dashboard/src/screens/workflow/types.ts`

- [ ] **Step 1: Write the types**

Create `dashboard/src/screens/workflow/types.ts`:

```ts
export type Binding =
  | { kind: "literal"; value: unknown }
  | { kind: "ref"; from: string }
  | { kind: "agent" };

export interface ActionNode {
  id: string;
  kind: "action";
  capability: string;
  input: Record<string, Binding>;
  audience?: "employee" | "manager" | "hr" | "team";
  next?: string;
}

export interface ConditionNode {
  id: string;
  kind: "condition";
  expr: string;
  then: string;
  else?: string;
}

export type WorkflowNode = ActionNode | ConditionNode;

export interface TriggerDef {
  type: string;
  connector: string;
  sample?: Record<string, unknown>;
}

export interface WorkflowDef {
  id: string;
  name: string;
  version: number;
  trigger: TriggerDef;
  root: string;
  nodes: Record<string, WorkflowNode>;
}

export type SchemaNode =
  | { kind: "object"; fields: Record<string, SchemaNode>; required?: boolean }
  | { kind: "string" | "number" | "boolean" | "unknown"; required?: boolean }
  | { kind: "array"; items: SchemaNode; required?: boolean }
  | { kind: "literal"; value: unknown; required?: boolean }
  | { kind: "union"; options: SchemaNode[]; required?: boolean };

export interface Capability {
  name: string;
  kind: "engine-tool" | "external-hermes";
  connector: string;
  integration: string;
  label: string;
  description: string;
  sideEffectful: boolean;
  inputSchema: SchemaNode;
  outputSchema: SchemaNode;
}

export interface TriggerCatalog {
  name: string;
  label: string;
  description: string;
  connector: string;
}

export interface Run {
  runId: string;
  workflowId: string;
  status: "running" | "done" | "error";
  response?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}
```

- [ ] **Step 2: Write the API client**

Create `dashboard/src/screens/workflow/api.ts`:

```ts
import type {
  WorkflowDef, Capability, TriggerCatalog, Run,
} from "./types";

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? "http://localhost:3000";

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`engine ${r.status}`);
  return r.json();
}

export const api = {
  listWorkflows: () => fetch(`${ENGINE}/workflows?tenant=papaya`).then(j<Array<Pick<WorkflowDef, "id" | "name" | "version" | "trigger">>>),
  getWorkflow: (id: string) => fetch(`${ENGINE}/workflows/${id}?tenant=papaya`).then(j<WorkflowDef>),
  putWorkflow: (def: WorkflowDef) =>
    fetch(`${ENGINE}/workflows/${def.id}?tenant=papaya`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(def),
    }).then(j<{ ok: boolean }>),
  createWorkflow: (seed: { id: string; name: string; trigger: WorkflowDef["trigger"] }) =>
    fetch(`${ENGINE}/workflows?tenant=papaya`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(seed),
    }).then(j<WorkflowDef>),
  deleteWorkflow: (id: string) =>
    fetch(`${ENGINE}/workflows/${id}?tenant=papaya`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  capabilities: () => fetch(`${ENGINE}/capabilities`).then(j<Capability[]>),
  triggers: () => fetch(`${ENGINE}/triggers?tenant=papaya`).then(j<TriggerCatalog[]>),
  startTest: (workflowId: string) =>
    fetch(`${ENGINE}/workflows/${workflowId}/test?tenant=papaya`, { method: "POST" }).then(j<{ runId: string }>),
  getRun: (runId: string) => fetch(`${ENGINE}/runs/${runId}`).then(j<Run>),
  auditForRun: (runId: string) => fetch(`${ENGINE}/audit?tenant=papaya&runId=${runId}`).then(j<any[]>),
};
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/screens/workflow/
git commit -m "$(cat <<'EOF'
feat(dashboard): workflow types + API client

Shared type definitions (WorkflowDef, SchemaNode, Capability, Run) and a tiny
typed fetch wrapper for the editor's engine calls. No UI yet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: `SchemaTree` + `BindingSourceTag`

**Goal:** Recursive renderer for `SchemaNode` + the tag pill used by ActionInspector inputs.

**Files:**
- Create: `dashboard/src/screens/workflow/Inspector/SchemaTree.tsx`
- Create: `dashboard/src/screens/workflow/Inspector/BindingSourceTag.tsx`

- [ ] **Step 1: Write `BindingSourceTag`**

Create `dashboard/src/screens/workflow/Inspector/BindingSourceTag.tsx`:

```tsx
import type { Binding } from "../types";

interface Props { binding?: Binding }

export function BindingSourceTag({ binding }: Props) {
  const variant = binding?.kind ?? "agent";
  const value = !binding
    ? "unset"
    : binding.kind === "literal" ? JSON.stringify(binding.value)
    : binding.kind === "ref" ? binding.from
    : "composed by LLM";

  const cls =
    variant === "literal" ? "bg-[--surface-sunken] text-[--text-secondary] ring-[--border-default]"
    : variant === "ref"   ? "bg-[--green-50] text-[--green-700] ring-[--green-200]"
                          : "bg-[--papaya-50] text-[--papaya-600] ring-[--papaya-200]";

  const tagLabel = variant === "literal" ? "literal" : variant === "ref" ? "ref" : "agent";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${cls}`}>
      <span className="uppercase tracking-wide">{tagLabel}</span>
      <span className="font-mono text-[10px] opacity-80 max-w-[140px] truncate">{value}</span>
    </span>
  );
}
```

- [ ] **Step 2: Write `SchemaTree`**

Create `dashboard/src/screens/workflow/Inspector/SchemaTree.tsx`:

```tsx
import type { SchemaNode, Binding } from "../types";
import { BindingSourceTag } from "./BindingSourceTag";

interface Props {
  node: SchemaNode;
  bindings?: Record<string, Binding>;   // when rendering Inputs; absent for Outputs
  depth?: number;
}

export function SchemaTree({ node, bindings, depth = 0 }: Props) {
  if (node.kind === "object") {
    return (
      <ul className="space-y-1">
        {Object.entries(node.fields).map(([k, child]) => (
          <li key={k} className="flex items-start justify-between gap-2 leading-snug">
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="font-mono text-[12px] text-[--text-primary]">{k}</span>
              {child.required && <span className="text-[--red-600] text-[10px]">*</span>}
              <span className="font-mono text-[10.5px] text-[--text-tertiary]">: {typeLabel(child)}</span>
            </div>
            {bindings && <BindingSourceTag binding={bindings[k]} />}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="font-mono text-[11px] text-[--text-tertiary]">{typeLabel(node)}</span>;
}

function typeLabel(n: SchemaNode): string {
  switch (n.kind) {
    case "object": return "object";
    case "string":
    case "number":
    case "boolean": return n.kind;
    case "array": return `array<${typeLabel(n.items)}>`;
    case "literal": return JSON.stringify(n.value);
    case "union": return n.options.map(typeLabel).join(" | ");
    case "unknown": return "unknown";
  }
}
```

- [ ] **Step 3: Sanity build**

Run: `npm --prefix dashboard run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/screens/workflow/Inspector
git commit -m "$(cat <<'EOF'
feat(dashboard): SchemaTree + BindingSourceTag

Recursive renderer for the SchemaNode tree (used by both the workflow editor
Inspector and the Integrations side panel) plus the color-coded source tag
(literal / ref / agent) for input rows.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: `TriggerCard` + `ActionCard` (V2 stacked)

**Goal:** The V2 stacked card design picked in the brainstorm — connector logo + step number eyebrow + title + mock/real chip + connector name + audience footer.

**Files:**
- Create: `dashboard/src/screens/workflow/TriggerCard.tsx`
- Create: `dashboard/src/screens/workflow/ActionCard.tsx`

- [ ] **Step 1: Write `ActionCard`**

Create `dashboard/src/screens/workflow/ActionCard.tsx`:

```tsx
import { ConnectorIcon, Badge } from "../../ui/index";
import type { Capability } from "./types";

interface Props {
  stepNumber: number;
  capability?: Capability;
  audience?: string;
  selected: boolean;
  modeChip: "MOCK" | "REAL" | "OFF";
  onClick: () => void;
}

export function ActionCard({ stepNumber, capability, audience, selected, modeChip, onClick }: Props) {
  const title = capability?.label ?? "Pick an action…";
  const connectorName = capability?.connector ?? "—";
  const variant = modeChip === "REAL" ? "real" : modeChip === "MOCK" ? "mock" : "off";

  return (
    <div
      data-testid={`action-card-${stepNumber}`}
      onClick={onClick}
      className={[
        "w-[280px] cursor-pointer rounded-xl border bg-[--surface-card] overflow-hidden transition-all duration-150",
        selected
          ? "border-[--papaya-300] [box-shadow:0_0_0_3px_var(--papaya-100),var(--shadow-md)]"
          : "border-[--border-default] [box-shadow:var(--shadow-xs)] hover:border-[--border-strong] hover:[box-shadow:var(--shadow-sm)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[--surface-sunken] ring-1 ring-[--border-default]">
          {capability && <ConnectorIcon name={capability.connector} kind="logo" size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[--text-tertiary]">
            Step {stepNumber}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-[--text-primary]">{title}</p>
        </div>
        <Badge variant={variant} size="xs">{modeChip}</Badge>
      </div>
      <div className="flex items-center gap-2 border-t border-[--border-default] bg-[--surface-sunken] px-3 py-1.5 text-[10.5px]">
        <span className="font-medium text-[--text-secondary]">{connectorName}</span>
        {audience && (
          <>
            <span className="text-[--text-tertiary]">·</span>
            <span className="text-[--text-tertiary]">{audience}</span>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `TriggerCard`**

Create `dashboard/src/screens/workflow/TriggerCard.tsx`:

```tsx
import { ConnectorIcon, Badge } from "../../ui/index";

interface Props {
  triggerType: string;
  connector: string;
  selected: boolean;
  onClick: () => void;
}

export function TriggerCard({ triggerType, connector, selected, onClick }: Props) {
  return (
    <div
      data-testid="trigger-card"
      onClick={onClick}
      className={[
        "w-[280px] cursor-pointer rounded-xl border bg-gradient-to-b from-[--papaya-50] to-[--surface-card] overflow-hidden transition-all duration-150",
        selected
          ? "border-[--papaya-300] [box-shadow:0_0_0_3px_var(--papaya-100),var(--shadow-md)]"
          : "border-[--papaya-200] [box-shadow:var(--shadow-xs)] hover:[box-shadow:var(--shadow-sm)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white ring-1 ring-[--papaya-200] [box-shadow:var(--shadow-xs)]">
          <ConnectorIcon name={connector} kind="logo" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[--papaya-600]">Trigger</p>
          <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-[--text-primary]">{triggerType}</p>
        </div>
        <Badge variant="trigger" size="xs">TRIG</Badge>
      </div>
      <div className="flex items-center gap-2 border-t border-[--papaya-200] bg-white/60 px-3 py-1.5 text-[10.5px]">
        <span className="font-medium text-[--text-secondary]">{connector}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add `trigger` variant to `Badge`**

Quickly check `dashboard/src/ui/index.ts` Badge variants. Add `'trigger'` if missing (papaya-tinted):

```tsx
// In the Badge implementation, alongside other variants:
trigger: "bg-[--papaya-50] text-[--papaya-600] ring-1 ring-[--papaya-200]",
```

- [ ] **Step 4: Sanity build**

Run: `npm --prefix dashboard run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/screens/workflow dashboard/src/ui
git commit -m "$(cat <<'EOF'
feat(dashboard): TriggerCard + ActionCard (V2 stacked design)

Two card components mirror the brainstorm pick: connector logo · step number
eyebrow · title · mock/real chip · connector footer. TriggerCard has the
papaya-tinted gradient + 'TRIG' badge. Adds the 'trigger' Badge variant.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: `WorkflowPicker`

**Goal:** Left rail list of workflows + active highlight + `+ New` affordance + per-item `Delete`.

**Files:**
- Create: `dashboard/src/screens/workflow/WorkflowPicker.tsx`

- [ ] **Step 1: Write the picker**

Create `dashboard/src/screens/workflow/WorkflowPicker.tsx`:

```tsx
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input, Button } from "../../ui/index";
import { api } from "./api";
import type { WorkflowDef } from "./types";

interface Props {
  workflows: Array<Pick<WorkflowDef, "id" | "name" | "trigger">>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: () => Promise<void>;
}

export function WorkflowPicker({ workflows, selectedId, onSelect, onChange }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function create() {
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `wf-${Date.now()}`;
    await api.createWorkflow({ id, name: name || "New workflow", trigger: { type: "manual", connector: "manual" } });
    setCreating(false); setName("");
    await onChange();
    onSelect(id);
  }

  async function remove(id: string) {
    if (!confirm(`Delete workflow "${id}"?`)) return;
    await api.deleteWorkflow(id);
    await onChange();
  }

  return (
    <aside data-testid="workflow-picker" className="w-[180px] flex-shrink-0 flex flex-col gap-2">
      <p className="px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[--text-tertiary]">Workflows</p>
      <ul className="space-y-1">
        {workflows.map((w) => {
          const active = w.id === selectedId;
          return (
            <li key={w.id}>
              <button
                onClick={() => onSelect(w.id)}
                data-testid={`picker-${w.id}`}
                className={[
                  "group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                  active ? "bg-[--papaya-50] text-[--text-primary]" : "text-[--text-secondary] hover:bg-[--surface-hover]",
                ].join(" ")}
              >
                {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[--papaya-500]" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{w.name}</p>
                  <p className="truncate text-[10px] text-[--text-tertiary]">{w.trigger?.type ?? "—"}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); remove(w.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[--text-tertiary] hover:text-[--red-600]"
                        aria-label={`Delete ${w.name}`}>
                  <Trash2 size={12} />
                </button>
              </button>
            </li>
          );
        })}
      </ul>
      {creating ? (
        <div className="rounded-lg border border-[--border-default] bg-[--surface-card] p-2 space-y-2">
          <Input placeholder="Name" value={name} onChange={(e: any) => setName(e.target.value)} />
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" onClick={create}>Create</Button>
            <Button size="sm" variant="secondary" onClick={() => { setCreating(false); setName(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          data-testid="picker-new"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[--border-default] py-2 text-[12px] text-[--text-tertiary] hover:bg-[--surface-hover]"
        >
          <Plus size={12} /> New workflow
        </button>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Sanity build**

Run: `npm --prefix dashboard run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/screens/workflow/WorkflowPicker.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): WorkflowPicker — left-rail list with create/delete

Active workflow gets the green accent rail. '+ New workflow' opens an inline
form. Hover row reveals a delete trash icon (with confirm).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Inspector — `TriggerInspector`, `ActionInspector`, dispatcher

**Goal:** Context-sensitive right rail. For trigger: connector + trigger dropdowns + sample viewer. For action: action dropdown + audience + Inputs SchemaTree (with bindings) + Output SchemaTree.

**Files:**
- Create: `dashboard/src/screens/workflow/Inspector/Inspector.tsx`
- Create: `dashboard/src/screens/workflow/Inspector/TriggerInspector.tsx`
- Create: `dashboard/src/screens/workflow/Inspector/ActionInspector.tsx`

- [ ] **Step 1: Write `TriggerInspector`**

Create `dashboard/src/screens/workflow/Inspector/TriggerInspector.tsx`:

```tsx
import { useMemo } from "react";
import { Dropdown } from "../../../ui/index";
import type { TriggerCatalog, TriggerDef } from "../types";

interface Props {
  trigger: TriggerDef;
  triggers: TriggerCatalog[];
  onChange: (t: TriggerDef) => void;
}

export function TriggerInspector({ trigger, triggers, onChange }: Props) {
  const connectors = useMemo(() => Array.from(new Set(triggers.map((t) => t.connector))), [triggers]);
  const triggersForConnector = triggers.filter((t) => t.connector === trigger.connector);

  return (
    <div className="space-y-3 p-4 text-[13px]">
      <Section label="Connector">
        <Dropdown
          value={trigger.connector}
          onChange={(v) => onChange({ ...trigger, connector: v, type: triggers.find((t) => t.connector === v)?.name ?? trigger.type })}
          options={connectors.map((c) => ({ value: c, label: c }))}
          className="w-full"
        />
      </Section>
      <Section label="Trigger">
        <Dropdown
          value={trigger.type}
          onChange={(v) => onChange({ ...trigger, type: v })}
          options={triggersForConnector.map((t) => ({ value: t.name, label: t.label }))}
          className="w-full"
        />
      </Section>
      <Section label="Sample payload (read-only)">
        <pre className="rounded border border-[--border-default] bg-[--surface-sunken] p-2 text-[11px] text-[--text-secondary] overflow-auto max-h-48">
{JSON.stringify(trigger.sample ?? {}, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">{label}</p>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Write `ActionInspector`**

Create `dashboard/src/screens/workflow/Inspector/ActionInspector.tsx`:

```tsx
import { useState } from "react";
import { Dropdown, Badge } from "../../../ui/index";
import { SchemaTree } from "./SchemaTree";
import type { ActionNode, Capability } from "../types";

interface Props {
  node: ActionNode;
  capabilities: Capability[];
  installedConnectors: Set<string>;   // currently enabled
  onChange: (patch: Partial<ActionNode>) => void;
  lastRunOutput?: unknown;
}

const AUDIENCES = [
  { value: "",          label: "No audience" },
  { value: "employee",  label: "Employee" },
  { value: "manager",   label: "Manager" },
  { value: "hr",        label: "HR" },
  { value: "team",      label: "Team" },
];

export function ActionInspector({ node, capabilities, installedConnectors, onChange, lastRunOutput }: Props) {
  const cap = capabilities.find((c) => c.name === node.capability);
  const [outputMode, setOutputMode] = useState<"schema" | "last-run">("schema");

  return (
    <div className="space-y-3 p-4 text-[13px]">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">Action</p>
        <Dropdown
          value={node.capability}
          onChange={(v) => onChange({ capability: v, input: {} })}
          options={capabilities.map((c) => ({
            value: c.name,
            label: installedConnectors.has(c.connector) ? c.label : `${c.label} · install ${c.connector}`,
            disabled: !installedConnectors.has(c.connector),
          }))}
          className="w-full"
        />
        {cap && cap.kind === "external-hermes" && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-[--green-50] p-2 text-[11px] text-[--green-700] ring-1 ring-[--green-200]">
            <Badge variant="real" size="xs">REAL</Badge>
            <span>Sent by the agent via its native gateway. The engine records the side-effect after the send.</span>
          </div>
        )}
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">Audience</p>
        <Dropdown
          value={node.audience ?? ""}
          onChange={(v) => onChange({ audience: (v || undefined) as ActionNode["audience"] })}
          options={AUDIENCES}
          className="w-full"
        />
      </div>
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">Inputs</p>
        {cap ? <SchemaTree node={cap.inputSchema} bindings={node.input} /> : <p className="text-[--text-tertiary] text-[11px]">Pick an action above.</p>}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">Output</p>
          <div className="inline-flex rounded-md border border-[--border-default] bg-[--surface-sunken] p-0.5 text-[10px]">
            {(["schema", "last-run"] as const).map((m) => (
              <button key={m} onClick={() => setOutputMode(m)}
                      className={`px-2 py-0.5 rounded ${outputMode === m ? "bg-[--surface-card] text-[--text-primary]" : "text-[--text-tertiary]"}`}>
                {m === "schema" ? "Schema" : "Last run"}
              </button>
            ))}
          </div>
        </div>
        {outputMode === "schema" && cap && <SchemaTree node={cap.outputSchema} />}
        {outputMode === "last-run" && (lastRunOutput
          ? <pre className="rounded border border-[--border-default] bg-[--surface-sunken] p-2 text-[11px] overflow-auto max-h-56">{JSON.stringify(lastRunOutput, null, 2)}</pre>
          : <p className="text-[11px] text-[--text-tertiary]">No run yet for this step.</p>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the `Inspector` dispatcher**

Create `dashboard/src/screens/workflow/Inspector/Inspector.tsx`:

```tsx
import { Card, CardHeader } from "../../../ui/index";
import { TriggerInspector } from "./TriggerInspector";
import { ActionInspector } from "./ActionInspector";
import type { WorkflowDef, Capability, TriggerCatalog, ActionNode } from "../types";

interface Props {
  workflow: WorkflowDef;
  selected: string | null;          // node id or "trigger"
  capabilities: Capability[];
  triggers: TriggerCatalog[];
  installedConnectors: Set<string>;
  onWorkflowChange: (wf: WorkflowDef) => void;
  lastRunAudit?: Array<{ capability: string; outputs?: unknown }>;
}

export function Inspector({ workflow, selected, capabilities, triggers, installedConnectors, onWorkflowChange, lastRunAudit }: Props) {
  return (
    <Card className="w-[320px] flex-shrink-0" data-testid="inspector">
      <CardHeader title={selected === "trigger" ? "Trigger" : selected ? "Action" : "Inspector"} subtitle={selected ?? "Select a card to edit it"} />
      {selected === "trigger" && (
        <TriggerInspector
          trigger={workflow.trigger}
          triggers={triggers}
          onChange={(t) => onWorkflowChange({ ...workflow, trigger: t })}
        />
      )}
      {selected && selected !== "trigger" && workflow.nodes[selected]?.kind === "action" && (
        <ActionInspector
          node={workflow.nodes[selected] as ActionNode}
          capabilities={capabilities}
          installedConnectors={installedConnectors}
          onChange={(patch) => onWorkflowChange({
            ...workflow,
            nodes: { ...workflow.nodes, [selected]: { ...workflow.nodes[selected], ...patch } as ActionNode },
          })}
          lastRunOutput={lastRunAudit?.find((a) => a.capability === (workflow.nodes[selected] as ActionNode).capability)?.outputs}
        />
      )}
      {!selected && <p className="p-4 text-[12px] text-[--text-tertiary]">Click a card in the canvas.</p>}
    </Card>
  );
}
```

- [ ] **Step 4: Sanity build**

Run: `npm --prefix dashboard run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/screens/workflow/Inspector
git commit -m "$(cat <<'EOF'
feat(dashboard): Inspector — TriggerInspector + ActionInspector + dispatcher

TriggerInspector: connector + trigger dropdowns + read-only sample payload.
ActionInspector: action dropdown (greyed for disabled connectors), audience,
Inputs schema-tree with binding tags, Output toggle Schema | Last run, and the
REAL info note for external-hermes actions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: `WorkflowCanvas`

**Goal:** Vertical stack: TriggerCard → ActionCards (walked from `root` via `next`). `+` insert slot between cards.

**Files:**
- Create: `dashboard/src/screens/workflow/WorkflowCanvas.tsx`

- [ ] **Step 1: Write the canvas**

Create `dashboard/src/screens/workflow/WorkflowCanvas.tsx`:

```tsx
import { Plus, ChevronDown } from "lucide-react";
import { TriggerCard } from "./TriggerCard";
import { ActionCard } from "./ActionCard";
import type { WorkflowDef, Capability } from "./types";

interface Props {
  workflow: WorkflowDef;
  capabilities: Capability[];
  installedModeByConnector: Record<string, "mock" | "prod" | undefined>;  // undefined = OFF
  selected: string | null;
  onSelect: (id: string) => void;
  onInsertAfter: (id: string | "trigger") => void;
}

export function WorkflowCanvas({ workflow, capabilities, installedModeByConnector, selected, onSelect, onInsertAfter }: Props) {
  const order: string[] = [];
  let cur: string | undefined = workflow.root;
  const seen = new Set<string>();
  while (cur && !seen.has(cur) && workflow.nodes[cur]) {
    seen.add(cur);
    order.push(cur);
    const node = workflow.nodes[cur];
    cur = node.kind === "action" ? node.next : undefined;
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6" data-testid="workflow-canvas">
      <TriggerCard
        triggerType={workflow.trigger.type}
        connector={workflow.trigger.connector}
        selected={selected === "trigger"}
        onClick={() => onSelect("trigger")}
      />
      <ConnectorAndAddButton onAdd={() => onInsertAfter("trigger")} />

      {order.map((id, idx) => {
        const node = workflow.nodes[id];
        if (node.kind !== "action") return null;
        const cap = capabilities.find((c) => c.name === node.capability);
        const mode = cap ? installedModeByConnector[cap.connector] : undefined;
        const chip: "MOCK" | "REAL" | "OFF" =
          !mode ? "OFF" :
          cap?.kind === "external-hermes" ? "REAL" : "MOCK";
        return (
          <div key={id} className="flex flex-col items-center gap-3">
            <ActionCard
              stepNumber={idx + 1}
              capability={cap}
              audience={node.audience}
              selected={selected === id}
              modeChip={chip}
              onClick={() => onSelect(id)}
            />
            <ConnectorAndAddButton onAdd={() => onInsertAfter(id)} />
          </div>
        );
      })}
    </div>
  );
}

function ConnectorAndAddButton({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 280 }}>
      <ChevronDown size={16} className="text-[--text-tertiary]" />
      <button
        onClick={onAdd}
        aria-label="Insert step here"
        className="absolute -right-1 grid h-5 w-5 place-items-center rounded-full border border-[--border-default] bg-[--surface-card] text-[--text-tertiary] hover:border-[--papaya-300] hover:text-[--papaya-600]"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Sanity build**

Run: `npm --prefix dashboard run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/screens/workflow/WorkflowCanvas.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): WorkflowCanvas — Trigger → Action chain with insert slots

Walks the workflow from root via next, renders one V2 stacked card per node
with an arrow + inline '+' slot between each. Mode chip derives from the
connector's current state (REAL for external-hermes, MOCK for engine-tool,
OFF when the connector is disabled).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: `TestFlowDrawer` with polling

**Goal:** Bottom drawer. POST `/workflows/:id/test`, poll `/runs/:id` + `/audit?runId=` every 750ms with `document.hidden` pause, render one row per audit entry, expandable for inputs/outputs.

**Files:**
- Create: `dashboard/src/screens/workflow/TestFlowDrawer.tsx`

- [ ] **Step 1: Write the drawer**

Create `dashboard/src/screens/workflow/TestFlowDrawer.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { X, ChevronRight, AlertCircle, Loader } from "lucide-react";
import { ConnectorIcon, Badge } from "../../ui/index";
import { api } from "./api";

interface Props {
  workflowId: string | null;     // null = closed
  runId: string | null;
  onClose: () => void;
}

interface AuditEntry {
  id: string;
  capability: string;
  label?: string;
  integration?: string;
  target: string;
  summary: string;
  actor: string;
  status: "success" | "error" | "escalated";
  runId?: string;
  durationMs?: number;
  inputs?: unknown;
  outputs?: unknown;
  ts: string;
}

export function TestFlowDrawer({ workflowId, runId, onClose }: Props) {
  const [run, setRun] = useState<{ status: "running" | "done" | "error"; response?: string; error?: string; startedAt: number } | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    async function poll() {
      if (document.hidden || cancelled) return;
      try {
        const [r, a] = await Promise.all([api.getRun(runId!), api.auditForRun(runId!)]);
        setRun(r);
        setAudit((cur) => (a.length === cur.length ? cur : a));
        if (r.status === "done" || r.status === "error") {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } catch { /* polling resumes on next tick */ }
    }
    poll();
    timerRef.current = window.setInterval(poll, 750);
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [runId]);

  if (!workflowId || !runId) return null;

  const elapsed = run ? Math.floor((Date.now() - run.startedAt) / 1000) : 0;

  return (
    <section data-testid="test-flow-drawer" className="border-t border-[--border-default] bg-[--surface-sunken]">
      <header className="flex items-center gap-2 border-b border-[--border-default] bg-[--surface-card] px-4 py-2 text-[12px]">
        {run?.status === "running" && <Loader size={12} className="animate-spin text-[--papaya-600]" />}
        {run?.status === "done" && <span className="h-2 w-2 rounded-full bg-[--green-500]" />}
        {run?.status === "error" && <AlertCircle size={12} className="text-[--red-600]" />}
        <span className="font-semibold text-[--text-primary]">Test run · {workflowId}</span>
        <span className="text-[--text-tertiary]">· {elapsed}s · {audit.length} step{audit.length === 1 ? "" : "s"}</span>
        <button onClick={onClose} aria-label="Close drawer" className="ml-auto text-[--text-tertiary] hover:text-[--text-primary]"><X size={14} /></button>
      </header>

      <ol className="max-h-[260px] overflow-auto p-3 space-y-1.5" data-testid="test-flow-audit">
        {audit.map((e, idx) => (
          <li key={e.id} data-testid={`test-row-${idx}`}>
            <div
              onClick={() => setExpanded((cur) => (cur === e.id ? null : e.id))}
              className={[
                "cursor-pointer rounded-md border bg-[--surface-card] px-3 py-2 transition-colors hover:bg-[--surface-hover]",
                e.status === "error" ? "border-l-2 border-l-[--red-500] border-[--border-default]" : "border-l-2 border-l-[--green-500] border-[--border-default]",
              ].join(" ")}
            >
              <div className="flex items-center gap-2 text-[12px]">
                <ChevronRight size={12} className={`text-[--text-tertiary] transition-transform ${expanded === e.id ? "rotate-90" : ""}`} />
                <span className="font-mono text-[10px] text-[--text-tertiary] w-5 text-right">{idx + 1}</span>
                {e.integration && <ConnectorIcon name={connectorIconHint(e)} kind="logo" size={14} />}
                <span className="truncate font-medium text-[--text-primary]">{e.label ?? e.capability}</span>
                {e.actor === "hermes-native" ? <Badge variant="real" size="xs">REAL</Badge> : <Badge variant="mock" size="xs">MOCK</Badge>}
                <span className="ml-auto font-mono text-[10.5px] text-[--text-tertiary]">{e.durationMs ? `${e.durationMs}ms` : ""}</span>
              </div>
              <p className="ml-7 mt-0.5 text-[11px] text-[--text-secondary]">{e.summary}</p>
              {expanded === e.id && (
                <div className="ml-7 mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
                  <pre className="rounded bg-[--surface-sunken] p-2 overflow-auto max-h-32">{JSON.stringify(e.inputs ?? {}, null, 2)}</pre>
                  <pre className="rounded bg-[--surface-sunken] p-2 overflow-auto max-h-32">{JSON.stringify(e.outputs ?? {}, null, 2)}</pre>
                </div>
              )}
            </div>
          </li>
        ))}
        {run?.status === "running" && audit.length === 0 && <li className="text-[12px] text-[--text-tertiary]">Run starting…</li>}
      </ol>
    </section>
  );
}

function connectorIconHint(e: AuditEntry): string {
  if (e.integration === "Gmail") return "gmail";
  if (e.integration === "WhatsApp") return "whatsapp";
  if (e.integration === "Channels") return "teams";
  if (e.integration === "ATS") return "comeet";
  if (e.integration === "HRIS") return "shapes";
  if (e.integration === "Calendar") return "calendar";
  if (e.integration === "Content") return "branding";
  return "shapes";
}
```

- [ ] **Step 2: Sanity build**

Run: `npm --prefix dashboard run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/screens/workflow/TestFlowDrawer.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): TestFlowDrawer — streams audit rows with 750ms polling

Polls /runs/:id and /audit?runId= every 750ms, pauses on document.hidden.
Mock/Real chip per row, click-to-expand inputs/outputs JSON, error rows get a
red left rail.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: `WorkflowEditorScreen` top-level + delete old screen

**Goal:** Compose Picker · Canvas · Inspector · TestFlowDrawer into the 3-column + bottom-drawer layout. Update `App.tsx` import. Delete the old single-file screen.

**Files:**
- Create: `dashboard/src/screens/workflow/WorkflowEditorScreen.tsx`
- Modify: `dashboard/src/App.tsx`
- Delete: `dashboard/src/screens/WorkflowEditorScreen.tsx`

- [ ] **Step 1: Write the screen**

Create `dashboard/src/screens/workflow/WorkflowEditorScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button, Card, CardHeader, LoadingState, ErrorState } from "../../ui/index";
import { WorkflowPicker } from "./WorkflowPicker";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { Inspector } from "./Inspector/Inspector";
import { TestFlowDrawer } from "./TestFlowDrawer";
import { api } from "./api";
import type { WorkflowDef, Capability, TriggerCatalog } from "./types";

export function WorkflowEditorScreen() {
  const [workflows, setWorkflows] = useState<Array<Pick<WorkflowDef, "id" | "name" | "trigger">>>([]);
  const [selectedWfId, setSelectedWfId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [triggers, setTriggers] = useState<TriggerCatalog[]>([]);
  const [installedModeByConnector, setInstalledMode] = useState<Record<string, "mock" | "prod" | undefined>>({});
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setWorkflows(await api.listWorkflows());
  }, []);

  const loadAll = useCallback(async () => {
    setState("loading");
    try {
      const [wfs, caps, trigs, integrations] = await Promise.all([
        api.listWorkflows(),
        api.capabilities(),
        api.triggers(),
        fetch(`${import.meta.env.VITE_ENGINE_URL ?? "http://localhost:3000"}/integrations?tenant=papaya`).then((r) => r.json()),
      ]);
      setWorkflows(wfs);
      setCapabilities(caps);
      setTriggers(trigs);
      const modeMap: Record<string, "mock" | "prod" | undefined> = {};
      for (const c of integrations) {
        modeMap[c.id] = c.installed && c.enabled ? c.mode : undefined;
      }
      setInstalledMode(modeMap);
      if (!selectedWfId && wfs.length > 0) setSelectedWfId(wfs[0].id);
      setState("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setState("error");
    }
  }, [selectedWfId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!selectedWfId) { setWorkflow(null); return; }
    api.getWorkflow(selectedWfId).then(setWorkflow).catch((e) => setErrorMsg(e.message));
    setSelectedNode(null);
  }, [selectedWfId]);

  async function save() {
    if (!workflow) return;
    await api.putWorkflow(workflow);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function startTest() {
    if (!selectedWfId) return;
    const r = await api.startTest(selectedWfId);
    setRunId(r.runId);
  }

  function insertAfter(afterId: string | "trigger") {
    if (!workflow) return;
    const newId = `n${Object.keys(workflow.nodes).length + 1}_${Math.floor(performance.now())}`;
    const newNode = { id: newId, kind: "action" as const, capability: capabilities[0]?.name ?? "", input: {} };
    if (afterId === "trigger") {
      const newNodes = { [newId]: { ...newNode, next: workflow.root } as any, ...workflow.nodes };
      setWorkflow({ ...workflow, nodes: newNodes, root: newId });
    } else {
      const after = workflow.nodes[afterId];
      if (after.kind !== "action") return;
      const updated = { ...workflow.nodes };
      updated[afterId] = { ...after, next: newId } as any;
      updated[newId] = { ...newNode, next: after.next } as any;
      setWorkflow({ ...workflow, nodes: updated });
    }
    setSelectedNode(newId);
  }

  if (state === "loading") return <div className="max-w-[--content-max-width] mx-auto p-2"><LoadingState rows={6} /></div>;
  if (state === "error") return <div className="max-w-[--content-max-width] mx-auto p-2"><ErrorState title="Couldn't load the editor" description={errorMsg} onRetry={loadAll} /></div>;

  return (
    <div className="max-w-[--content-max-width] mx-auto flex flex-col gap-3" data-testid="workflow-editor">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-[--text-primary]">Workflow editor</h1>
          <p className="text-[13px] text-[--text-secondary]">{workflow ? `${workflow.name} · v${workflow.version}` : "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[12px] text-[--green-700]">Saved</span>}
          <Button variant="secondary" size="sm" onClick={loadAll}>Reset</Button>
          <Button variant="primary" size="sm" onClick={save}>Save</Button>
          <Button variant="primary" size="sm" onClick={startTest} data-testid="test-flow-button">
            <Play size={12} /> Test flow
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <WorkflowPicker workflows={workflows} selectedId={selectedWfId} onSelect={setSelectedWfId} onChange={loadList} />

        <Card className="flex-1 overflow-auto" padding={false}>
          <CardHeader title={workflow?.name ?? ""} subtitle={workflow ? `trigger: ${workflow.trigger.type}` : ""} />
          {workflow && (
            <WorkflowCanvas
              workflow={workflow}
              capabilities={capabilities}
              installedModeByConnector={installedModeByConnector}
              selected={selectedNode}
              onSelect={setSelectedNode}
              onInsertAfter={insertAfter}
            />
          )}
        </Card>

        {workflow && (
          <Inspector
            workflow={workflow}
            selected={selectedNode}
            capabilities={capabilities}
            triggers={triggers}
            installedConnectors={new Set(Object.entries(installedModeByConnector).filter(([, v]) => v).map(([k]) => k))}
            onWorkflowChange={setWorkflow}
          />
        )}
      </div>

      <TestFlowDrawer workflowId={selectedWfId} runId={runId} onClose={() => setRunId(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Update `App.tsx`**

Find the `WorkflowEditorScreen` import in `dashboard/src/App.tsx` and update it from:
```tsx
import { WorkflowEditorScreen } from "./screens/WorkflowEditorScreen";
```
to:
```tsx
import { WorkflowEditorScreen } from "./screens/workflow/WorkflowEditorScreen";
```

- [ ] **Step 3: Delete the old screen**

```bash
rm dashboard/src/screens/WorkflowEditorScreen.tsx
```

- [ ] **Step 4: Build + manual smoke**

Run: `npm --prefix dashboard run build`
Expected: clean.

Then run dev locally + the engine, open the editor, click through: pick New Hire → see canvas, click trigger card → inspector shows Comeet, click an action card → inspector shows schema tree, click `▶ Test flow` → drawer streams audit rows.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src
git commit -m "$(cat <<'EOF'
feat(dashboard): rebuilt WorkflowEditorScreen — 3-column + bottom drawer

Composes WorkflowPicker · WorkflowCanvas · Inspector · TestFlowDrawer into the
layout-A picked in the brainstorm. Replaces the old single-file editor; App.tsx
import path updated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: Playwright e2e — `workflow-editor.spec.ts`

**Goal:** Smoke the editor against the stub-Hermes compose profile.

**Files:**
- Create: `dashboard/e2e/workflow-editor.spec.ts`

- [ ] **Step 1: Write the spec**

Create `dashboard/e2e/workflow-editor.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("picker → canvas → inspector → test flow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /workflow editor/i }).click();
  await expect(page.getByTestId("workflow-editor")).toBeVisible();
  // Picker shows both seeded workflows
  await expect(page.getByTestId("picker-onboarding")).toBeVisible();
  await expect(page.getByTestId("picker-offboarding")).toBeVisible();
  await page.getByTestId("picker-onboarding").click();
  // Canvas renders trigger + at least one action card
  await expect(page.getByTestId("trigger-card")).toBeVisible();
  await expect(page.getByTestId("action-card-1")).toBeVisible();
  // Click trigger → inspector shows connector "comeet"
  await page.getByTestId("trigger-card").click();
  await expect(page.getByTestId("inspector")).toContainText(/comeet/i);
  // Click action 1 → inspector shows schema tree fields
  await page.getByTestId("action-card-1").click();
  await expect(page.getByTestId("inspector")).toContainText(/candidateId/i);
  // Test flow → drawer opens, audit rows appear
  await page.getByTestId("test-flow-button").click();
  await expect(page.getByTestId("test-flow-drawer")).toBeVisible();
  await expect(page.getByTestId("test-row-0")).toBeVisible({ timeout: 10000 });
});
```

- [ ] **Step 2: Run against stub-Hermes**

```bash
cd dashboard
npm run e2e -- workflow-editor
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add dashboard/e2e/workflow-editor.spec.ts
git commit -m "$(cat <<'EOF'
test(dashboard): Playwright e2e for the rebuilt Workflow Editor

Verifies the demo's editor path: picker shows both workflows, canvas renders
the trigger + first action, inspector reflects selection, Test flow streams
audit rows into the drawer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 4 — Integrations schema side panel

## Task 25: `SchemaSidePanel` in Actions + Triggers sub-tabs

**Goal:** Click an action or trigger in Integrations → right side panel renders tool id + description + Inputs SchemaTree + Output SchemaTree.

**Files:**
- Modify: `dashboard/src/screens/IntegrationsScreen.tsx`
- Test: `dashboard/e2e/integrations-schema.spec.ts` (new)

- [ ] **Step 1: Refactor — split Actions/Triggers list into selectable rows**

In `dashboard/src/screens/IntegrationsScreen.tsx`, inside `InstalledPanel`:

a) Add state at the top of the component:
```tsx
const [selectedCapName, setSelectedCapName] = useState<string | null>(null);
```

b) Where the `actions` sub-tab renders `current.capabilities.map((cap) => (<li…>…</li>))`, wrap the list + add a new right column:

```tsx
{subtab === 'actions' && (
  <div className="flex gap-4">
    <ul className="flex-1 space-y-1.5">
      {current.capabilities.map((cap: any) => (
        <li key={cap.name}>
          <button
            onClick={() => setSelectedCapName(cap.name)}
            data-testid={`integration-action-${cap.name}`}
            className={[
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
              selectedCapName === cap.name ? "border-[--papaya-300] bg-[--papaya-50]" : "border-[--border-default] bg-[--surface-card] hover:bg-[--surface-hover]",
            ].join(" ")}
          >
            {/* keep existing icon + label + Live/Available chip JSX */}
            <ConnectorIcon name={current.icon} kind="logo" size={15} />
            <span className="flex-1 text-left text-[13px] font-medium text-[--text-primary]">{cap.label}</span>
          </button>
        </li>
      ))}
    </ul>
    <SchemaSidePanel capability={current.capabilities.find((c: any) => c.name === selectedCapName) ?? current.capabilities[0]} />
  </div>
)}
```

c) Do the same for the `triggers` sub-tab (`current.triggers ?? []`), reusing the same `SchemaSidePanel` with the trigger's `sample` as its "output" preview.

d) Add the `SchemaSidePanel` component at the bottom of the file:

```tsx
function SchemaSidePanel({ capability }: { capability: any }) {
  if (!capability) return <div className="w-72 flex-shrink-0 text-[12px] text-[--text-tertiary]">Pick an action to see its contract.</div>;
  return (
    <div className="w-72 flex-shrink-0 space-y-3 rounded-lg border border-[--border-default] bg-[--surface-card] p-3" data-testid="schema-side-panel">
      <div>
        <p className="font-mono text-[10px] text-[--text-tertiary]">{capability.name}</p>
        <p className="mt-0.5 text-[13px] font-semibold text-[--text-primary]">{capability.label}</p>
        <p className="mt-0.5 text-[11px] text-[--text-secondary] leading-snug">{capability.description}</p>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">Inputs</p>
        {capability.inputSchema ? <SchemaTree node={capability.inputSchema} /> : <p className="text-[11px] text-[--text-tertiary]">Not wired in this demo.</p>}
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">Output</p>
        {capability.outputSchema ? <SchemaTree node={capability.outputSchema} /> : <p className="text-[11px] text-[--text-tertiary]">Not wired in this demo.</p>}
      </div>
    </div>
  );
}
```

Import `SchemaTree` at the top:
```tsx
import { SchemaTree } from "./workflow/Inspector/SchemaTree";
```

- [ ] **Step 2: Write the e2e**

Create `dashboard/e2e/integrations-schema.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("clicking an action shows the schema side panel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /integrations/i }).click();
  await page.getByTestId("tab-installed").click();
  // Comeet is the first installed seeded connector
  await page.getByTestId("subtab-actions").click();
  await page.getByTestId("integration-action-ats.get_contract").click();
  await expect(page.getByTestId("schema-side-panel")).toContainText(/candidateId/i);
  await expect(page.getByTestId("schema-side-panel")).toContainText(/contract/i);
});
```

- [ ] **Step 3: Build + run e2e**

Run:
```bash
npm --prefix dashboard run build
npm --prefix dashboard run e2e -- integrations-schema
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add dashboard
git commit -m "$(cat <<'EOF'
feat(dashboard): Integrations Actions+Triggers sub-tabs gain SchemaSidePanel

Click any action/trigger → right side panel renders tool id, description,
Inputs schema-tree, Output schema-tree (reusing the SchemaTree component from
the workflow editor). Playwright e2e covers the happy path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 5 — Audit + Messages + Live Run

## Task 26: `hermes-native` actor badge + inbound message styling + Simulate-inbound + extend audit-rich e2e

**Goal:** Audit screen recognizes new actor; Messages renders inbound right-aligned; Live Run has the simulate-inbound affordance; e2e asserts the badge.

**Files:**
- Modify: `dashboard/src/screens/AuditScreen.tsx` — `hermes-native` styling.
- Modify: `dashboard/src/screens/MessagesScreen.tsx` — inbound right-align.
- Modify: `dashboard/src/screens/LiveRunScreen.tsx` — Simulate inbound button.
- Modify: `dashboard/e2e/audit-rich.spec.ts` — assert badge.

- [ ] **Step 1: Audit screen actor styling**

In `dashboard/src/screens/AuditScreen.tsx`, find the actor-badge section. Add a `hermes-native` case alongside `pixush`/`user`/`trigger`/`system`:

```tsx
case "hermes-native": return { label: "Hermes", className: "bg-[--green-50] text-[--green-700] ring-[--green-200]" };
```

(Match the existing case's shape exactly — look at how the others are structured in your local copy.)

- [ ] **Step 2: Messages inbound styling**

In `dashboard/src/screens/MessagesScreen.tsx`, find the `MessageBubble` rendering. Add an `isInbound = msg.direction === "inbound"` check, and conditionally swap alignment:

```tsx
<div className={`flex ${msg.direction === "inbound" ? "justify-end" : "justify-start"}`}>
  <MessageBubble {...msg} muted={msg.direction === "inbound"} />
</div>
```

(If `MessageBubble` doesn't accept `muted`, plumb the prop through, or wrap in a `bg-[--surface-sunken] opacity-90` div for the inbound case.)

- [ ] **Step 3: Live Run Simulate-inbound button**

In `dashboard/src/screens/LiveRunScreen.tsx`, alongside the existing trigger box, add:

```tsx
const [simFrom, setSimFrom] = useState("+972546358808");
const [simBody, setSimBody] = useState("Hi Pixush, when does Maya start? Did we send the welcome?");
const [simRunId, setSimRunId] = useState<string | null>(null);

async function simulateInbound() {
  setSimRunId(null);
  const r = await fetch(`${ENGINE}/simulate/inbound`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "whatsapp", from: simFrom, body: simBody }),
  });
  const { runId } = await r.json();
  setSimRunId(runId);
}

// alongside the existing trigger card, add:
<Card>
  <CardHeader title="Simulate inbound WhatsApp" subtitle="Manager messages the bot" />
  <CardBody className="space-y-2">
    <Input value={simFrom} onChange={(e: any) => setSimFrom(e.target.value)} placeholder="+972546358808" />
    <Textarea value={simBody} onChange={(e: any) => setSimBody(e.target.value)} />
    <Button variant="primary" size="sm" onClick={simulateInbound} data-testid="simulate-inbound">
      Simulate inbound
    </Button>
    {simRunId && <p className="text-[11px] text-[--text-tertiary]">Run: {simRunId}</p>}
  </CardBody>
</Card>
```

- [ ] **Step 4: Extend audit-rich e2e**

In `dashboard/e2e/audit-rich.spec.ts`, add a test:

```ts
test("hermes-native actor renders the Hermes badge", async ({ page }) => {
  // Drive a /side-effect call first so audit has the row
  const ENGINE = process.env.VITE_ENGINE_URL ?? "http://localhost:3000";
  await fetch(`${ENGINE}/side-effect`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "whatsapp", direction: "outbound", to: "+972546358808", body: "Welcome!" }),
  });
  await page.goto("/");
  await page.getByRole("link", { name: /audit/i }).click();
  await expect(page.locator('text=Hermes').first()).toBeVisible();
  await expect(page.locator('text=Send WhatsApp').first()).toBeVisible();
});
```

- [ ] **Step 5: Build + run all dashboard e2e + commit**

Run:
```bash
npm --prefix dashboard run build
npm --prefix dashboard run e2e
```
Expected: all specs PASS.

Then commit:
```bash
git add dashboard
git commit -m "$(cat <<'EOF'
feat(dashboard): hermes-native audit badge + inbound message styling + simulate-inbound

Audit screen styles 'hermes-native' actor with the Hermes-green badge.
MessagesScreen right-aligns inbound bubbles for the Q&A round-trip.
LiveRun gains a Simulate inbound WhatsApp affordance for demo step 10.
audit-rich e2e asserts the badge appears.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# PHASE 6 — Manual verification

## Task 27: Walk the demo end-to-end

**Goal:** Tag the build as demo-ready by running the 10 steps against a real local stack.

- [ ] **Step 1: Start the engine + dashboard + stub Hermes**

```bash
docker compose -f docker-compose.stub.yml up -d --build
```

Wait for `engine: ready` in logs.

- [ ] **Step 2: Walk the demo checklist** — confirm each:

| # | Step | Verify on screen |
|---|---|---|
| 1 | Integrations · click Comeet → schema panel | Inputs + Output trees visible |
| 2 | Workflow Editor · pick New Hire | Canvas shows Comeet trigger + 7 action cards |
| 3 | Click `▶ Test flow` | Drawer opens, run starts |
| 4 | Step 1 row appears | Comeet · MOCK · "Get signed contract" |
| 5 | Step 2 row | Shapes · MOCK · "Start onboarding in Shapes" |
| 6 | Step 3 row | Teams · MOCK · "Add to team" |
| 7 | Step 4 row | Gmail · REAL · "Send welcome email" |
| 8 | Step 5 row | WhatsApp · REAL · "Send WhatsApp" |
| 9 | Audit screen | All steps present, hermes-native badge on Gmail + WhatsApp |
| 10 | Live Run · Simulate inbound | Audit shows received → tool calls → reply, all with hermes-native + runId match |

- [ ] **Step 3: Run engine tests + dashboard e2e one last time**

```bash
npm --prefix engine test
npm --prefix engine run typecheck
npm --prefix dashboard run build
npm --prefix dashboard run e2e
```
Expected: all green. Engine should be ~91 tests; dashboard ~5 specs.

- [ ] **Step 4: Final commit + tag (optional)**

If anything tweaks during walk-through, commit those changes. Otherwise no commit. Optionally tag:
```bash
git tag demo-ready-2026-06-15
```

---

## Spec coverage self-review

Cross-reference against [spec §11 decisions log](../specs/2026-06-15-demo-readiness-design.md#11-decisions-log) and §8 demo step-map:

- [x] Pattern A (LLM callback): Task 4 (serializer) + Task 7 (/side-effect) + Tasks 14–15 (skill + SOUL).
- [x] Email same shape as WhatsApp: Task 3 (gmail.send_email) + Task 4 (serializer) + Task 7 (channel: 'email').
- [x] Inbound Q&A free-form: Task 11 (runWorkflow handles unknown workflowId, no playbook).
- [x] Picker shows New Hire + Offboarding stub: Task 10 + Task 13.
- [x] Test flow = fire + audit + response: Task 9 (`POST /workflows/:id/test`).
- [x] 3-col + bottom drawer layout: Task 23.
- [x] V2 stacked cards: Task 17.
- [x] B schema-tree inspector: Tasks 17–20.
- [x] Async + polling: Tasks 9 + 22.
- [x] `hris.upsert_employee` label: Task 13.
- [x] Demo manager phone: Task 13 (fixture).
- [x] `HERMES_CHANNELS_DRY_RUN` default OFF: NOT directly implemented as an engine flag in this plan — it's a Hermes-side env (Task 14's `agent/.env.example` mention is captured by the parallel gateway-setup track). If we need it engine-side, add a Task 14b before merging.
- [x] `outputShape` on ToolDef: Task 2.
- [x] Run tracking + endpoints: Task 8 + Task 9.
- [x] Integrations schema side panel: Task 25.
- [x] Audit `hermes-native` badge: Task 26.
- [x] Live Run Simulate-inbound: Task 26.
- [x] All engine tests (~21 new): Tasks 1–13 (one test file per task or shared).
- [x] Dashboard e2e (5 specs): Tasks 24 + 25 + 26 (and existing two unchanged).

**Open after self-review:**
- `HERMES_CHANNELS_DRY_RUN` is currently only mentioned in the SOUL contract (Task 15). Engine-side enforcement would be its own task. Confirmed deferred — the gateway-setup track owns it.
- The serializer in Task 4 emits `channel: 'whatsapp'` for the whatsapp connector but maps `gmail` → `'email'`. That mapping is hand-coded in `serialize.ts`; consider a constant lookup map if a third channel appears.
