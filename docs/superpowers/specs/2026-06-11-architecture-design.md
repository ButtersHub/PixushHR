# PixushHR — Architecture Design

> **Project:** Onboarding & Offboarding Operations Agent for Papaya Global
> (Agentalent.ai "Big Agents Competition" demo)
> **Date:** 2026-06-11 · **Status:** Design approved, pending final review
> **Sources of truth:** `requirements/` (job definition, office-hour summary, Sensei/platform
> notes) and `requirements/decisions.md` (chronological decision log, 20 items). This document
> reorganizes those decisions into a coherent, reviewable spec.

---

## 1. Overview

PixushHR is an autonomous agent that executes employee **onboarding** and **offboarding**
operations for Papaya Global. It is evaluated by **Sensei** (monday.com's open-source agent
qualification engine) over HTTP, and demonstrated through a configurable dashboard.

The deliverable is a **quality demo**, not a finished product: synthetic data only, onboarding
and offboarding scenarios only, with **escalation to a human as an acceptable ending** (per the
office-hour clarifications).

### Guiding principles

- **Infra-agnostic core.** Domain logic depends on ports, never on a vendor or runtime. Hermes
  (preferred) and OpenClaw are swappable behind one Agent-Infra Port.
- **Soft-first, harden-later.** The agent runs free (Model B) guided by declarative playbooks;
  specific guardrails/conditions can be promoted to code-enforced without reshaping anything.
- **Mock-first.** External systems are simulated over synthetic data; real adapters are drop-ins.
- **Everything auditable.** Every action is logged.

---

## 2. Platform contract (Sensei) — the hard constraints

Verified by reading the Sensei engine source (`reference/sensei/packages/engine/`).

- **Transport:** Sensei's HTTP adapter does `POST <endpoint>/execute` with
  `{ "task": "<prompt>", "context": {...} }`, health at `GET <endpoint>/health`.
- **Only `response` is scored.** The adapter maps our reply to
  `{ response: body.response, metadata: body.structured }`; the runner scores `output.response`
  (LLM judge **and** automated KPIs both read it). `metadata`/`structured` is **never read** by
  scoring — reporting only.
- **Automated KPIs run on the `response` string:** `contains`/`regex`/`word-count` are string
  ops; `json-schema`/`json-parse` do `JSON.parse(response)`. So a scenario that wants machine-
  validated JSON requires the **whole `response`** to be JSON — it can't coexist with prose.
- **Three layers:** Execution 50%, Reasoning 30%, Self-improvement 20%. Badges: gold ≥90,
  silver ≥75, bronze ≥60.
- **Timeouts:** 60s default, extendable to ~120s. Calls are **serial**. The HTTP adapter
  **retries up to 3×** → side-effects must be idempotent.
- **Verification handshake** (listing gate) is a separate 10-task character/safety check
  (`POST /api/handshake/{id}` → `POST /api/eval/{session}/{task}`). Confirmed live on a throwaway
  account ("KokoHR"): **94/100, gold.** The Papaya domain evaluation is a separate Sensei suite
  we can author and run ourselves (`sensei run --target http://localhost:PORT`).

**Implication:** our product is a `response` string, shaped per scenario (warm prose for
LLM-judge scenarios; pure JSON only where a scenario demands automated parsing). Safety,
honesty, confidentiality, and warm tone are scored directly.

---

## 3. Architecture overview

Five layers, top to bottom. Layers ② and ③ are infra-agnostic and mock-agnostic — they depend
only on the ports in ④.

```
①  Platform Edge            HTTP /execute + /health · Sensei envelope ↔ internal command
        │
②  Agent Orchestrator       Model B: one full agent. Classify intent → run workflow agentically
        │                    (bounded intent recognition + the agent loop, all via the port)
③  HR Domain Core           Onboarding · Offboarding workflows · Persona & Safety
        │
④  Ports (the swap seams)   Agent-Infra Port (Hermes ⇄ OpenClaw) · Integration Ports (role-based)
        │
⑤  Foundations              Four storages · Audit log · Self-test harness
```

- **Stack:** TypeScript / Node (aligns with Sensei; lets us embed our own self-test suite).
- **Pattern:** ports-and-adapters (hexagonal) at every seam — agent runtime, integrations,
  storage, and tool transport are all adapters.

---

## 4. Components

### 4.1 Platform Edge
Thin, non-agentic. Parses the Sensei envelope into an internal command and projects the agent's
reply back to `{ response }` (and optionally the full envelope into `structured` for reports).
Hosts `/execute` and `/health`.

### 4.2 Agent Orchestrator — Model B (single full agent)
One agentic loop with access to all tools; it plans and acts freely. The agent itself
recognizes intent from the natural-language task (onboarding / offboarding / Q&A / reasoning
follow-up) and loads the relevant workflow as a soft playbook — there is no separate
deterministic router. Chosen over a hybrid skeleton because scoring is mostly an LLM judge
reading prose, so there is no rigid structured contract to protect. Residual risks (timeout,
run-to-run variance) are managed by prompting/guardrails and the output envelope, not by caging
the agent. The Platform Edge remains non-agentic; all understanding happens here.

### 4.3 HR Domain Core
The two workflows (§8) plus a **Persona & Safety** unit that sets warm/brand tone, handles
employee Q&A, and applies guardrails (confidentiality, refusal behavior, never-dismiss-a-
question). Produces the human-facing text.

### 4.4 Agent-Infra Port (Hermes ⇄ OpenClaw)
Abstracts the agent runtime: reasoning loop, tool-calling, memory. Adapters: **Hermes**
(preferred), **OpenClaw** (swap-in). The domain never imports either.

- **No MCP.** Hermes (function-calling/skills) and OpenClaw (skills + local execution) aren't
  MCP-first; building integrations as MCP servers would fight their grain.
- **Tool transport is itself an adapter.** A transport-agnostic **Capability API** (typed TS
  functions) is exposed per runtime via thin bindings: Hermes → function-calling tools;
  OpenClaw → a `SKILL.md` that shells to a **dedicated, typed CLI** we ship; MCP → an optional
  façade later. The CLI doubles as the handle for manual testing and self-tests. "CLI" means a
  dedicated binary with validated args — never arbitrary shell over PII.
- Hermes is Python; our core is TS — so a Hermes "tool" is a thin Python skill shim that calls
  our Capability API over localhost (CLI / small local HTTP).

### 4.5 Output envelope (agent → Edge internal contract)
The agent always returns a structured envelope; the Edge projects it per caller.

```ts
interface AgentReply {
  requestId: string;          // tracing / idempotency / audit
  tenant: string;             // multi-tenant seam ("papaya")
  user: { id: string; name: string; role: string;
          channel: "sensei" | "teams" | "email" };
  response: string;           // human-facing text — the ONLY thing Sensei scores
  actions?: AuditedAction[];  // side-effects performed (HRIS write, Teams add, invite)
  meta?: Record<string, unknown>;
}
```
Edge → Sensei: `{ response: env.response }` (Sensei ignores the rest — a feature: one agent
serves Sensei and real channels). Edge → real channel (later): deliver `response` to `user`
over `channel`. Exception: scenarios scored by automated `json-schema`/`json-parse` parse
`env.response` directly, so that response must itself be pure JSON.

---

## 5. Data & storage model

Four storages, split by **data ownership** (not lumped into one "system of record"). A "mock"
simulates a system's *behavior*; a `Repository` behind it holds the simulated *state* — two
separate concerns.

| # | What lives there | Backend | Encryption at rest | Lifetime |
|---|---|---|---|---|
| 1 | **Our own state** — tenant config, users/roles, workflow/case tracking, idempotency & request-dedup, escalation records. *Not* employee data. | **DynamoDB** (`tenant#type#id`) | KMS (dev flag) | Durable |
| 2 | **Conversation & sessions** — message history, tool calls/results (Hermes `state.db`, `MEMORY.md`, `USER.md`); local-only. | **Hermes** on instance | Encrypted volume (EBS) | Resettable |
| 3 | **Audit log + documents/content** — append-only audit JSONL, termination letters, branding assets. | **S3** | SSE-KMS (dev flag) | Durable |
| 4 | **Simulated 3rd-party data** — employees, contracts, departments, Teams membership = the fake Shapes/Comeet/Teams state. | **InMemory** via `Repository` (JSON fixtures) | n/a (ephemeral, synthetic) | Reset per run |

- Storages **1 & 4 share the `Repository` interface** (InMemory + DynamoDB adapters; DynamoDB
  Local for tests). Idempotent upserts handle Sensei's ×3 retries.
- **DynamoDB stays active in the demo** to demonstrate multi-tenancy + multi-user/role readiness.
- **Encryption is gated behind a dev flag** (`ENCRYPTION_AT_REST=on|off`); storage 2 relies on an
  encrypted volume. No app/field-level encryption for the demo.
- **`MEMORY_MODE=on|off`** controls Hermes memory; a unified **`reset`** wipes `~/.hermes` and
  re-seeds the DynamoDB tenant namespace + fixtures → clean, reproducible self-test runs.
- **No external (cloud) memory providers** — they would transmit employee data off-box,
  violating confidentiality. Built-in local memory only.

---

## 6. Integrations

Canonical core, **role-named** ports, mock-first, reached only through tools.

- **Canonical domain models** (`Employee`, `Contract`, `Department`, `OnboardingCase`,
  `OffboardingCase`, `Message`, `CalendarEvent`). Workflows + agent speak only these.
- **Ports by ROLE, not vendor:** `HrisPort`←Shapes · `AtsPort`←Comeet ·
  `MessageChannel`←{Teams, Slack, Email} · `TaskBoardPort`←Trello · `CalendarPort`←Outlook/Google
  · `ContentPort`←Branding. Single-vendor roles still get a role name (never `ShapesPort`).
  Multi-implementation roles get a **router** (e.g. `ChannelRouter`) choosing the impl by
  recipient preference / config / explicit arg. Guard: if a shared interface forces lowest-
  common-denominator or one-impl-only methods → split (interface segregation).
- **Adapters:** **Mock** (demo) = stateful simulator backed by a Repository — validates, idempotent,
  deterministic, audited, returns **structured errors** the agent can escalate on. **Real** (later)
  = actual API + anti-corruption layer (vendor DTO ↔ canonical). Same interface → drop-in.
- **Inbound triggers:** demo trigger = Sensei's HTTP `task`; real webhooks/EventBridge are a
  later inbound adapter.
- **Tools are capability-level** (`send_message(to, body, channel?)`), platform chosen by
  router/param — not per-vendor tool names. The `response` text can still name the platform.

---

## 7. Users, roles & tenancy

**Level 2 "readiness-light"** (beyond the literal single-company brief, as a production-shaped
signal).

- **Actor types from the requirements:** new/departing **Employee**, **HiringManager** (emphasis),
  **DepartmentPeer** (nice-to-have), and offboarding **"relevant parties."**
- **Model:** a `tenant` partition key + minimal `User { id, name, role, channel }` in DynamoDB.
  Structure is multi-tenant/role-aware; only Papaya + the named roles are seeded. **No RBAC engine.**
- **Audience information-scoping is a real, testable requirement:** communications are scoped by
  recipient role. Canonical case — the offboarding **last-day calendar invite to "relevant
  parties" carries logistics only, NOT the termination `reason`**; the letter/reason stay with
  the employee + authorized HR. *Soft-enforced now (agent guidance), targeted for hardening.*

---

## 8. Workflows

Typed TS objects, authored in-repo, rendered to the agent as a **soft playbook** and to the
dashboard as an **editable flow**. Model: **Trigger · Action · Condition** graph (automation-
recipe paradigm).

### 8.1 Definition entities

```ts
interface WorkflowDefinition {
  id: string; name: string; version: string;
  trigger: TriggerDefinition;
  root: NodeId;
  nodes: Record<NodeId, Node>;            // Node = ActionNode | ConditionNode
}

interface TriggerDefinition { type: TriggerType; filter?: ConditionNode }
interface TriggerEvent<P> {               // runtime event instance
  id: string;                             // idempotency / dedup (storage 1)
  type: TriggerType; tenant: string;
  source: "sensei" | "manual" | "webhook";
  occurredAt: string; payload: P;
}

interface ActionNode {
  id: NodeId; kind: "action";
  capability: Capability;                 // names a tool (single source of contract)
  input: InputBinding;                    // per field: literal | {from:"…"} | "agent"
  audience?: AudienceRef;                 // role + visibility scope
  next?: NodeId;
}
interface ConditionNode {
  id: NodeId; kind: "condition";
  expr: Expr;                             // soft: agent judges; hardenable to code
  then: NodeId; else?: NodeId;
}

interface CapabilitySpec {                // SHARED by Action nodes AND the tool layer
  name: Capability; description: string;
  input: JSONSchema;                      // required[] = the "must fields"
  output: JSONSchema; sideEffectful: boolean;
}
```

- **The "must fields" live in `CapabilitySpec`, never duplicated on the Action.** The same spec
  is the agent-facing tool schema.
- **InputBinding** per field: **literal** · **data-ref** (`{from:'trigger.payload.x'}` /
  `{from:'step.y.output.z'}`) · **`'agent'`** (agent produces it at runtime).
- **Nesting & convergence are free** (NodeId references → DAG): conditions can nest arbitrarily;
  two branches can point to the same NodeId to rejoin. **Parallel Split is omitted** (single
  agentic loop + serial eval; it's the only case that would need a join).
- **Escalate** is both (a) a capability the agent can invoke at its discretion and (b) an Action
  node on a Condition `else` / step `onFailure`. Result: notify the responsible role · write
  escalation record (storage 1 + audit) · mark case `escalated`. A graceful ending — need not run
  end-to-end.

### 8.2 The two workflows (from the brief)

**Onboarding** — trigger: new hire confirmed in Comeet → extract contract details → ask hiring
manager (else peer, else escalate) → populate Shapes → add to Teams → welcome + branding → Q&A.

**Offboarding** — trigger: offboarding event in Shapes → pre-offboarding email → update
termination fields → last-day calendar invite (scoped) → activate workflow → termination letter
*or* escalate.

---

## 9. Self-test harness

We author our own Sensei suite (onboarding/offboarding scenarios, layered execution/reasoning/
self-improvement) and run it against `http://localhost:PORT` to grade ourselves before
submitting. The dashboard's **Self-test & scores** panel (stretch) surfaces the badge/score.

---

## 10. Deployment

- **Substrate:** AWS. Hermes + the Node service co-located on a long-lived instance, exposing
  `/execute` + `/health`.
- **Lightsail vs EC2:** *lean EC2 + encrypted EBS (KMS CMK)* for real key control over Hermes'
  plaintext `state.db` (storage 2) — but **deferred**; kept simple by the **portability
  principle**: Lightsail→EC2 must be a *redeploy, not a rewrite* (externalize config via env /
  Secrets Manager, provision via IaC/script, use AWS SDK + IAM roles, no Lightsail-only feature).
- **Encryption surfaces:** (1) DynamoDB + (3) S3 via KMS behind the dev flag; (2) instance volume
  via encrypted EBS. Storage 4 needs none (ephemeral, synthetic).
- **Secrets:** Secrets Manager / SSM (matches the handshake answer that creds belong in a secrets
  manager).

---

## 11. Dashboard — UX brief

> **Purpose of this section:** give the UX/design task a complete description of *what the
> dashboard does and contains*, so they can design a polished interface over it. This defines
> **structure, content, and behavior** — not visual design. Visuals are the design task's output
> (see §12).

### 11.1 Audience & purpose
A single-operator console used to **configure** the system and **show** the agent working during
a live demo. It turns an invisible HTTP agent into something watchable and stage-driveable. It
reads our APIs and the four storages.

### 11.2 Information architecture
- **Top bar (global, always visible):**
  - Tenant selector (e.g. *Papaya*).
  - **▶ Trigger scenario** — fire an onboarding/offboarding scenario manually.
  - **↺ Reset** — the unified wipe + reseed (clean slate for a fresh run).
  - **Live toggles:** `infra: Hermes | OpenClaw` · `integrations: mock | real` · `MEMORY_MODE` ·
    `ENCRYPTION_AT_REST`.
- **Left nav, split into two groups:**
  - **Show:** Live Run · Messages · Audit log · (stretch) Cases · (stretch) Self-test.
  - **Configure:** Users & roles · Synthetic data · Integrations · Workflows · (stretch)
    Scoping rules.
- **Main area:** tab-driven content for the selected nav item.

### 11.3 Core panels (the demo spine — one loop: configure → trigger → watch → verify → audit)

1. **Live Run** *(Show)* — the centerpiece. A live trace of a run: intent classification → each
   tool call (with args + result, success/error) → the final output envelope. Sub-tabs: *Trace*,
   *Tool calls*, *Output envelope*. States: idle, running (streaming), complete, escalated, error.
2. **Messages** *(Show)* — every message the agent produced (welcome, pre-offboarding,
   termination letter, Q&A replies), grouped by recipient/channel. Must make **tone** and
   **audience-scoping** visible (e.g. show that the invite to "relevant parties" omits the
   termination reason).
3. **Audit log** *(Show)* — append-only, filterable by tenant/employee/workflow/action type.
   Each entry: timestamp, actor, capability, target, before/after where relevant, requestId.
4. **Users & roles** *(Configure)* — view/seed tenant, users, and roles (Level 2). Per user:
   id, name, role, preferred channel.
5. **Synthetic data** *(Configure)* — view/seed/reset the fixture datasets (employees, contracts,
   departments, managers, branding); choose which scenario to run.
6. **Integrations** *(Configure + Show)* — see §11.4. Replaces a standalone "systems state" panel.
7. **Workflows** *(Configure)* — the workflow editor; see §11.5.

### 11.4 Integrations area (detailed)
Two top tabs:
- **Catalog** — browse all connectors **grouped by type** (HRIS · ATS/Recruitment · Communication
  Channels · Task Board · Calendar · Content). Each is a card: icon, name, short description,
  install state (`✓ installed` / `+ install`). Doubles as a capabilities map; "available" cards
  signal extensibility (Slack, Trello, Outlook, Spark Hire, Branding).
- **Installed** — manage each installed connector. Detail tabs per connector:
  - **General:** role, enable toggle, **active mode** (mock | prod), health/last-call, uninstall.
  - **Mock config** *(separate tab):* fixture dataset, simulated latency, **error injection**
    ("fail next call" → triggers a live escalation), determinism seed.
  - **Prod config** *(separate tab):* base URL, auth (**Secrets Manager reference**, never the
    secret), Team/Tenant ID, rate limits.
  - **Data:** the records this system currently holds (the "systems state"), live-updating as the
    agent acts; `Reset` sets the baseline → before/after per system, for free.
  - **Tools:** which agent tools this integration exposes.
- **Install lifecycle:** Catalog → Install (register adapter under its role-port) → Configure →
  Enable + pick active mode → Data/Tools light up → Uninstall.

### 11.5 Workflow editor (detailed)
A visual flow builder that is a **direct view of the typed `WorkflowDefinition`** (round-trips to
the same TS object — no separate format).
- **Trigger** at the top (dropdown of trigger types). Selecting it exposes its payload as bindable
  data for downstream steps.
- **Vertical flow** of step cards below. **+ add step** inserts an **Action** (pick a capability;
  its required fields auto-appear from `CapabilitySpec`) or a **Condition** (sprouts THEN/ELSE;
  ELSE often → escalate).
- **Nested flows supported** — conditions inside branches, rendered recursively with
  **collapse/expand** per branch for readability. **Convergence** supported (two branches → same
  step).
- **Inspector** (side panel) for the selected step: edit each field's **binding** — *literal* ·
  *data-ref* (dropdown of available data: trigger payload + prior step outputs) · *agent-filled*.
  Required fields marked; audience selector for communication actions.
- **Scope now:** **view + edit** the two seeded workflows. Create-from-scratch is a later phase.
- **States:** valid, has-unbound-required-fields (warning, soft), agent-filled fields highlighted.

### 11.6 Stretch panels
Cases/workflow Kanban (step progress + escalations) · **Self-test & scores** (run our Sensei
suite, show badge — strongest stretch) · scoping-rules editor (could be a config file) ·
branding-content manager.

---

## 12. Design system & guidelines — design-task brief

> **Purpose of this section:** define the deliverable for a dedicated **design task** — a visual
> language plus a **shared component library (design code)** that every dashboard screen consumes,
> so the product looks consistent and polished. This section sets *requirements*; the design task
> produces the actual tokens, components, and styles.

### 12.1 Deliverables expected from the design task
1. **Design language / mood** — professional, trustworthy, calm "operations console" feel that
   also reflects Papaya's warm, human brand. Office hours called out **accessible UX** as a
   priority — accessibility is a first-class requirement, not a polish step.
2. **Design tokens** — color palette (incl. semantic colors: success/info/warning/danger, and
   status colors for mock/real/off/health), typography scale, spacing scale, radii, elevation/
   shadows, motion/transitions.
3. **Typography** — font family choice, type scale (display/heading/body/mono for code & traces),
   weights, line-heights. A monospace face is required for the live trace, tool calls, and
   bindings.
4. **Shared component library ("design code")** — a single source-of-truth component set the whole
   dashboard imports, so nothing is styled ad hoc. Minimum inventory:
   - Layout: app shell, top bar, split nav, tabbed panel, inspector/side panel.
   - Data: tables (sortable/filterable for audit & data), cards, badges/pills, **status dots**
     (health, mock/real), key-value/field rows.
   - Inputs: buttons (primary/secondary/danger), toggles/switches, dropdowns/selects, text/number
     fields, search, code/JSON viewer.
   - Domain-specific: **flow-canvas nodes** (trigger/action/condition/escalate variants), branch
     connectors, the binding pill (literal/ref/agent), the live-trace stream row, message bubble.
   - Feedback: empty/loading/error/streaming states, toasts, confirmation dialogs (e.g. Reset).
5. **Accessibility guidelines** — color-contrast targets, keyboard navigation (esp. the flow
   editor), focus states, ARIA for the dynamic trace and toggles, reduced-motion support.
6. **Usage guidelines** — when to use each component, do/don't, spacing rules, density.

### 12.2 Recommended technical shape (not binding)
React (the app is TS already), a token-driven styling approach (CSS variables / Tailwind / a
component lib), components published as one internal package/module imported by every screen.
The design task confirms the exact stack.

### 12.3 Relationship to §11
§11 defines *what each screen contains and does*; §12 defines *how it looks and the shared parts*.
A screen is built by composing §12 components to satisfy a §11 panel description.

---

## 13. Open items / deferred decisions

- **Volume encryption + Lightsail-vs-EC2** — leaning EC2 + encrypted EBS; deferred.
- **Hardening targets** — promote audience-scoping (and other guardrails/conditions) from soft to
  code-enforced; choose which first.
- **Concrete `CapabilitySpec` / tool list** — enumerate each capability's input/output schema.
- **Workflow step contracts** — finalize the seeded onboarding/offboarding node graphs.
- **Self-test suite contents** — author the scenarios + KPIs.
- **Real-adapter auth/config** — finalize per-integration prod settings (later).

---

## 14. Reference

Full chronological rationale lives in `requirements/decisions.md` (20 items + storage model +
dashboard + workflow layer). Platform findings in `requirements/sensei-and-platform.md`. Original
brief in `requirements/job-definition.md` and `requirements/office-hour-summary.md`.
