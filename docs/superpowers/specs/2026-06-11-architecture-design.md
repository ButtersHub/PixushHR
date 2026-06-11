# PixushHR — Architecture Design

> **Project:** Onboarding & Offboarding Operations Agent for Papaya Global
> (Agentalent.ai "Big Agents Competition" demo)
> **Date:** 2026-06-11 · **Status:** Design approved (incl. grilling resolutions), pending final review
> **Sources of truth:** `requirements/` (job definition, office-hour summary, Sensei/platform
> notes) and `requirements/decisions.md` (chronological decision log, items 1–33). This document
> reorganizes those decisions into a coherent, reviewable spec. Where an early decision was later
> revised, this spec reflects the **revised** position and notes it.

---

## 1. Overview

PixushHR is an autonomous agent that executes employee **onboarding** and **offboarding**
operations for Papaya Global. It is evaluated by **Sensei** (monday.com's open-source agent
qualification engine) over HTTP, and demonstrated through a configurable dashboard.

The deliverable is a **quality demo**, not a finished product: synthetic data only, onboarding
and offboarding scenarios only, with **escalation to a human as an acceptable ending**.

### Guiding principles

- **Hermes-first pragmatism.** Prefer Hermes' built-in features when they fit; accept some
  coupling. Swappability to OpenClaw is **best-effort / where-cheap**, not absolute. Use a Hermes
  built-in unless: (1) it doesn't functionally fit, (2) a *hard* guarantee needs coverage on
  *all* code paths (not just Hermes-routed), or (3) there's no effort/quality win.
- **Soft-first, harden-later.** The agent runs free (Model B) guided by declarative playbooks;
  specific guardrails/conditions can be promoted to code without reshaping anything. **Exception:**
  audience-scoping (confidentiality) is hardened from day one.
- **Mock-first.** External systems are simulated over synthetic data; real adapters are drop-ins.
- **Stateless per call; stores are the factual authority.** The agent reconstructs context each
  call from the persistent stores + the injected prompt.
- **Everything auditable.** Every action is logged.

### Tech split
- **Agent service: Python** (Hermes-native). *(Reverses the earlier all-TS choice — Sensei is
  language-agnostic over HTTP, and Hermes is Python; a Python service avoids a cross-language hop
  on every tool call.)*
- **Dashboard: TypeScript / React**, talking to the Python service over HTTP (off the latency-
  critical path).

---

## 2. Platform contract (Sensei) — the hard constraints

Verified by reading the Sensei engine source (`reference/sensei/packages/engine/`).

- **Transport:** Sensei's HTTP adapter does `POST <endpoint>/execute` with
  `{ "task": "<prompt>", "context": {...} }`; health at `GET <endpoint>/health`.
- **Only `response` is scored.** The adapter maps our reply to
  `{ response: body.response, metadata: body.structured }`; the runner scores `output.response`
  (LLM judge *and* automated KPIs both read it). `metadata`/`structured` is **never read** by
  scoring — reporting only.
- **Automated KPIs run on the `response` string:** `contains`/`regex`/`word-count` are string
  ops; `json-schema`/`json-parse` do `JSON.parse(response)` (whole response must be JSON).
- **Three layers:** Execution 50%, Reasoning 30%, Self-improvement 20%. Badges: gold ≥90.
- **Timeouts:** 60s default, extendable to ~120s. Calls are **serial**. The HTTP adapter
  **retries up to 3×** → side-effects must be idempotent.
- **Verification handshake** (listing gate) is a separate 10-task character/safety check.
  Confirmed live on a throwaway account: **94/100, gold.** The Papaya domain evaluation is a
  **separate Sensei suite the organizers own — we do not control its scenario inputs.**

**Implication:** our product is a `response` string, shaped per scenario. Safety, honesty,
confidentiality, and warm tone are scored directly.

---

## 3. Architecture overview

Five layers. Layers ② and ③ depend only on the ports in ④.

```
①  Platform Edge            HTTP /execute + /health · Sensei envelope ↔ internal command
②  Agent Orchestrator       Model B: one warm full agent (Hermes). Recognizes intent → runs the
                            whole workflow agentically in one call
③  HR Domain Core           Onboarding · Offboarding workflows · Persona & Safety (SOUL.md)
④  Ports (swap seams)       Agent-Infra Port (Hermes-native; OpenClaw best-effort) · Integration
                            Ports (role-based)
⑤  Foundations              Four storages · Audit log · Self-test harness
```

- **Pattern:** ports-and-adapters at the integration and storage seams; the agent runtime is
  Hermes-native (the port abstraction is thin, per Hermes-first pragmatism).

---

## 4. Components

### 4.1 Platform Edge
Thin, non-agentic. Parses the Sensei envelope into an internal command and projects the agent's
reply back to `{ response }` (full envelope optionally into `structured` for reports). Hosts
`/execute` and `/health`. **All "understanding" happens above it; the Edge stays dumb.**

### 4.2 Agent Orchestrator — Model B (single full agent)
One **warm** agentic loop (Hermes) with access to all tools. It **recognizes intent itself** from
the natural-language task (onboarding / offboarding / Q&A / reasoning / redo) and runs the matched
workflow as a soft playbook — no separate deterministic router. Chosen over a hybrid skeleton
because scoring is mostly an LLM judge reading prose. Timeout/variance are managed by the playbook
and budget guard (§5), not by caging the agent.

### 4.3 HR Domain Core
The two workflows (§9) plus **Persona & Safety** — warm/brand tone, empathetic Q&A, refusal
behavior, never-dismiss-a-question. Realized largely via Hermes' **`SOUL.md`** (identity/values)
rather than custom code.

### 4.4 Agent-Infra Port — Hermes-native (OpenClaw best-effort)
Wraps the agent runtime: reasoning loop, tool-calling, memory, hooks. **Hermes is used as a native
Python library**; OpenClaw remains a possible swap but is no longer paid for everywhere.
- **No MCP.** Hermes (function-calling/skills) and OpenClaw (skills + local execution) aren't
  MCP-first; tools are **native Python functions**, exposed to Hermes directly.
- **Adopted Hermes built-ins:** `SOUL.md` (persona), memory (local-only, `MEMORY_MODE` toggle),
  pre-LLM **context-injection hook** (playbook delivery, §5.7), `transform_output`/tool hooks,
  and **`redact_pii`/`redact_secrets`** (also mitigates PII in the plaintext `state.db`).

### 4.5 Output envelope (agent → Edge internal contract)
A **Pydantic** model. The agent always returns it; the Edge projects per caller.

```python
class AgentReply(BaseModel):
    request_id: str            # tracing / idempotency / audit
    tenant: str                # multi-tenant seam ("papaya")
    user: UserRef              # { id, name, role, channel: sensei|teams|email }
    response: str              # human-facing text — the ONLY thing Sensei scores
    actions: list[AuditedAction] = []   # side-effects performed
    meta: dict = {}
```
Edge → Sensei: `{ response: reply.response }` (Sensei ignores the rest — a feature: one agent
serves Sensei and real channels). Exception: scenarios scored by automated `json-schema`/
`json-parse` parse `response` directly, so that response must itself be pure JSON.

---

## 5. Execution & runtime model

How a single Sensei call becomes a completed workflow (grilling resolutions, items 22–33).

### 5.1 Scenario ↔ workflow mapping
**Execution spine = whole-workflow-per-call:** one task runs the entire workflow in a single HTTP
call, returning one human-facing `response`. We also author **conversational (Q&A)**,
**reasoning** ("explain"), and **self-improvement** ("redo with feedback") scenarios; the agent's
intent recognition distinguishes them.

### 5.2 Timeout strategy (design to 120s)
In-memory mocks (~0ms I/O) · playbook-constrained execution (known sequence, not exploration — the
thing that makes Model B viable under a timeout) · batch/parallel tool calls where supported ·
fast model for orchestration, strong model for final prose · **soft budget guard → escalate (and
return 200)** rather than hard-timeout. **Measure early** with a latency harness; if over budget,
harden the highest-latency steps to deterministic code.

### 5.3 Trigger / intent recovery
At the Sensei boundary the trigger is **recovered**, not received pre-typed. **NL inference is the
baseline** (the official suite may send pure prose); **structured `context`** is an optional
accelerator in our own suite. Entities are **resolved by lookup** against the mock systems;
**no-match / multi-match → escalate.**

### 5.4 Response content contract
**Communication-first + a delimited operational recap**, natural prose; make confidentiality
visible (e.g. note the invite went to relevant parties without the reason). Pure JSON only for the
rare automated-KPI scenario. Tune later.

### 5.5 Continuity (stateless-per-call)
The agent reconstructs context from the **persistent stores (keyed by identity)** + the injected
prompt. **Stores are the sole factual authority.** `MEMORY_MODE` toggles **conversational assist
only** (never factual authority); **default off for scoring.** This also makes the ×3 retry
idempotent.

### 5.6 Idempotency under ×3 retry
Enforced at the **side-effectful tool handlers** via a deterministic logical key
`key(tenant, workflow, caseId, stepId, capability, targetIdentity)` (no Sensei request id needed),
recorded in storage 1's dedup table. Check-then-act → repeats are no-ops. Case/step state enables
*resume*. (Escalate-and-return-200 from §5.2 avoids triggering the retry in the first place.)

### 5.7 Playbook rendering
A deterministic serializer turns the typed `WorkflowDefinition` into a concise **natural-language
playbook** (steps + conditions + escalation + tools), inputs resolved from the stores. Delivered
via **Hermes' context-injection hook**. Three context layers: `SOUL.md` (static persona) ·
injected playbook (per-turn) · tools (capabilities). Demo = 2 workflows + Q&A → compact catalog,
single pass.

### 5.8 Self-improvement
Handled by Hermes' **native turn-handling**: Sensei injects original output (`depends_on`) +
`feedback`; the agent revises. **Not** Hermes' cross-session learning-loop pillar (avoided —
nondeterministic). We own only light revise discipline in `SOUL.md` + the test scenarios.

### 5.9 Runtime
**Warm, always-running embedded Hermes**, initialized once at startup (`SOUL.md`, tools, config,
`MEMORY_MODE=off`). Each `/execute` is an **isolated single-turn run** — fresh per-request context,
no cross-request state. Concurrency is a non-issue (Sensei is serial).

---

## 6. Data & storage model

Four storages, split by data ownership. A "mock" simulates a system's *behavior*; a `Repository`
behind it holds the simulated *state*.

| # | What lives there | Backend | Encryption at rest | Lifetime |
|---|---|---|---|---|
| 1 | **Our own state** — tenant config, users/roles, workflow/case tracking, idempotency/dedup, escalation records. *Not* employee data. | **DynamoDB** (`tenant#type#id`, boto3) | KMS (dev flag) | Durable |
| 2 | **Conversation & sessions** — Hermes `state.db`, `MEMORY.md`, `USER.md`; local-only. | **Hermes** on instance | Encrypted volume (EBS) | Resettable |
| 3 | **Audit log + documents/content** — audit JSONL, termination letters, branding assets. | **S3** | SSE-KMS (dev flag) | Durable |
| 4 | **Simulated 3rd-party data** — employees, contracts, departments, Teams membership. | **InMemory** via `Repository` (JSON fixtures) | n/a (ephemeral, synthetic) | Reset per run |

- Storages **1 & 4 share the `Repository` interface**. Idempotent upserts handle retries.
- **DynamoDB stays active in the demo** to demonstrate multi-tenancy + multi-user/role readiness.
- **`MEMORY_MODE`** toggles Hermes memory; **`reset`** wipes `~/.hermes` + re-seeds DynamoDB +
  fixtures → reproducible runs. **No external (cloud) memory providers** (confidentiality).
- **Encryption** gated behind `ENCRYPTION_AT_REST=on|off`; storage 2 via encrypted volume.

---

## 7. Integrations

Canonical core, **role-named** ports, mock-first, reached only through tools (native Python
capability functions).

- **Canonical models:** `Employee`, `Contract`, `Department`, `OnboardingCase`, `OffboardingCase`,
  `Message`, `CalendarEvent`. Workflows + agent speak only these.
- **Ports by ROLE, not vendor:** `HrisPort`←Shapes · `AtsPort`←Comeet ·
  `MessageChannel`←{Teams, Slack, Email} · `TaskBoardPort`←Trello · `CalendarPort`←Outlook/Google
  · `ContentPort`←Branding. Single-vendor roles still get a role name. Multi-impl roles get a
  **router** (e.g. `ChannelRouter`). Guard: split on lowest-common-denominator (interface segregation).
- **Adapters:** **Mock** (demo) = stateful simulator over a Repository — validates, idempotent,
  deterministic, audited, returns **structured errors** to escalate on. **Real** (later) = actual
  API + anti-corruption layer. Same interface → drop-in.
- **Tools are capability-level** (`send_message(to, body, channel?)`), platform chosen by
  router/param — not per-vendor tool names.
- **Inbound triggers:** demo = Sensei's HTTP `task`; real webhooks/EventBridge later.

---

## 8. Users, roles & tenancy

**Level 2 "readiness-light."**
- **Actor types:** new/departing **Employee**, **HiringManager** (emphasis), **DepartmentPeer**
  (nice-to-have), offboarding **"relevant parties."**
- **Model:** a `tenant` partition key + minimal `User { id, name, role, channel }` in DynamoDB.
  Only Papaya + named roles seeded. No RBAC engine.
- **Audience information-scoping — HARDENED from day one** (the lone exception to soft-first).
  Enforced as a **field×audience policy in the `send_message` tool handler** (universal outbound
  choke point — semantic + infra-agnostic; Hermes' regex redaction can't do recipient-dependent
  field policy). Canonical case: the last-day calendar invite to "relevant parties" carries
  **logistics only, NOT the termination `reason`.** Hermes `redact_pii`/hooks add a complementary
  generic layer.

---

## 9. Workflows

**Pydantic** models (typed), authored in-repo, rendered to the agent as a soft playbook (§5.7) and
to the dashboard as an editable flow. Model: **Trigger · Action · Condition** graph.

```python
class WorkflowDefinition(BaseModel):
    id: str; name: str; version: str
    trigger: TriggerDefinition
    root: NodeId
    nodes: dict[NodeId, Node]            # Node = ActionNode | ConditionNode

class TriggerDefinition(BaseModel): type: TriggerType; filter: ConditionNode | None = None
class TriggerEvent(BaseModel):           # runtime event (recovered at the Sensei boundary)
    id: str; type: TriggerType; tenant: str
    source: Literal["sensei","manual","webhook"]; occurred_at: str; payload: dict

class ActionNode(BaseModel):
    id: NodeId; kind: Literal["action"]
    capability: Capability                # names a tool (single source of contract)
    input: InputBinding                   # per field: literal | {from:"…"} | "agent"
    audience: AudienceRef | None = None
    next: NodeId | None = None

class ConditionNode(BaseModel):
    id: NodeId; kind: Literal["condition"]; expr: Expr; then: NodeId; else_: NodeId | None = None

class CapabilitySpec(BaseModel):          # SHARED by Action nodes AND the tool layer
    name: Capability; description: str
    input: JsonSchema                     # required[] = the "must fields"
    output: JsonSchema; side_effectful: bool
```

- **"Must fields" live in `CapabilitySpec`, never duplicated on the Action.** It's also the tool
  schema. `side_effectful` drives idempotency + audit.
- **InputBinding** per field: literal · data-ref · `"agent"` (runtime-filled).
- **Nesting & convergence are free** (NodeId references → DAG). **Parallel Split omitted.**
- **Escalate** = both a capability the agent can invoke *and* a node on a Condition `else_` /
  `onFailure`. Result: notify role · escalation record (storage 1 + audit) · mark case `escalated`.

**The two workflows** — Onboarding (Comeet new-hire → contract → ask manager/else peer/else
escalate → Shapes → Teams → welcome+branding → Q&A) and Offboarding (Shapes event → pre-offboarding
email → termination fields → scoped last-day invite → activate → letter *or* escalate).

---

## 10. Self-test harness

Author our own Sensei suite to grade ourselves — but honestly:
- **Derived from the requirements, not the implementation** — one scenario per requirement /
  constraint / success-criterion, tracked in a **traceability matrix**.
- **Three layers/weights**; includes **adversarial traps** (confidentiality-leak check,
  missing-info→escalate, out-of-bounds question, hallucination bait).
- **Independent judge** (different model from the agent) + **multi-judge median**.
- Our score is a **lower-bound proxy** for the unknown official suite. Run via the Sensei CLI
  against `http://localhost:PORT`.

---

## 11. Deployment

- **Substrate:** AWS. The Python agent service (with embedded **warm Hermes**) on a long-lived
  instance, exposing `/execute` + `/health`. The TS/React dashboard served alongside or separately.
- **Lightsail vs EC2:** lean **EC2 + encrypted EBS (KMS CMK)** for key control over Hermes'
  plaintext `state.db` — **deferred**; kept simple by the **portability principle** (Lightsail→EC2
  must be a redeploy, not a rewrite: externalize config, IaC/script, AWS SDK + IAM roles).
- **Encryption surfaces:** (1) DynamoDB + (3) S3 via KMS behind the dev flag; (2) instance volume
  via encrypted EBS; (4) none.
- **Secrets:** Secrets Manager / SSM.

---

## 12. Dashboard — UX brief

> Defines **structure, content, and behavior** so the UX/design task can design over it — not
> visual design. Built in **TypeScript / React**, reading the Python service's API + the stores.

### 12.1 Audience & purpose
A single-operator console to **configure** the system and **show** the agent working in a live
demo — turning an invisible HTTP agent into something watchable and stage-driveable.

### 12.2 Information architecture
- **Top bar:** tenant selector · **▶ Trigger scenario** · **↺ Reset** (unified wipe+reseed) ·
  live toggles (`infra: Hermes|OpenClaw`, `integrations: mock|real`, `MEMORY_MODE`,
  `ENCRYPTION_AT_REST`).
- **Left nav, split:** *Show* (Live Run · Messages · Audit log · stretch: Cases · Self-test) and
  *Configure* (Users & roles · Synthetic data · Integrations · Workflows · stretch: Scoping rules).
- **Main area:** tab-driven.

### 12.3 Core panels (loop: configure → trigger → watch → verify → audit)
1. **Live Run** *(Show)* — live trace: intent → each tool call (args+result, success/error) →
   output envelope. Sub-tabs: *Trace*, *Tool calls*, *Output envelope*. States: idle/running/
   complete/escalated/error.
2. **Messages** *(Show)* — every agent message grouped by recipient/channel; makes **tone** and
   **audience-scoping** visible (invite omits the termination reason).
3. **Audit log** *(Show)* — append-only, filterable; each entry timestamp/actor/capability/target/
   before-after/requestId.
4. **Users & roles** *(Configure)* — view/seed tenant, users, roles.
5. **Synthetic data** *(Configure)* — view/seed/reset fixtures; choose scenario.
6. **Integrations** *(Configure + Show)* — see §12.4.
7. **Workflows** *(Configure)* — the editor; see §12.5.

### 12.4 Integrations area
Two top tabs:
- **Catalog** — browse all connectors **grouped by type** (HRIS · ATS · Channels · Task Board ·
  Calendar · Content); each a card with icon, name, short description, install state. Doubles as a
  capabilities map; "available" cards signal extensibility.
- **Installed** — per-connector detail tabs: **General** (role, enable, active mode, health,
  uninstall) · **Mock config** *(separate)* (fixtures, latency, **error-injection** → live
  escalation, seed) · **Prod config** *(separate)* (base URL, auth as **Secrets Manager ref**,
  Team/Tenant ID, rate limits) · **Data** (live records = "systems state"; `Reset` = before/after
  baseline) · **Tools** (exposed agent tools).
- **Install lifecycle:** Catalog → Install (register adapter under its role-port) → Configure →
  Enable + pick mode → Data/Tools light up → Uninstall.

### 12.5 Workflow editor
A **direct view of the typed `WorkflowDefinition`** (round-trips to the same object — no separate
format).
- Pick a **Trigger** (top) → it exposes its payload as bindable data → **+ add step** inserts an
  **Action** (pick a capability; required fields auto-appear from `CapabilitySpec`) or a
  **Condition** (THEN/ELSE; ELSE often → escalate).
- **Nested flows supported** (recursive render, **collapse/expand** per branch); **convergence**
  supported (two branches → same step).
- **Inspector** edits each field's binding: *literal · data-ref · agent-filled*; required marked;
  audience selector for comms.
- **Scope now: view + edit** the two seeded workflows; create-from-scratch later.

### 12.6 Stretch panels
Cases Kanban · **Self-test & scores** (run our Sensei suite, show badge — strongest stretch) ·
scoping-rules editor · branding-content manager.

---

## 13. Design system & guidelines — design-task brief

> Defines the deliverable for a dedicated **design task**: a visual language + a **shared component
> library (design code)** every dashboard screen consumes. This sets *requirements*; the design
> task produces the tokens, components, and styles.

### 13.1 Deliverables
1. **Design language / mood** — professional, trustworthy "operations console" that also reflects
   Papaya's warm, human brand. **Accessible UX is a first-class requirement** (office hours).
2. **Design tokens** — color (incl. semantic + status: mock/real/off/health), typography scale,
   spacing, radii, elevation, motion.
3. **Typography** — families + scale (display/heading/body/**mono** for traces & code), weights,
   line-heights. Monospace required for the live trace, tool calls, and bindings.
4. **Shared component library ("design code")** — one source-of-truth set imported everywhere.
   Minimum: app shell · top bar · split nav · tabbed panel · inspector; tables (sortable/
   filterable) · cards · badges/pills · **status dots** · key-value rows; buttons (primary/
   secondary/danger) · toggles · selects · fields · search · JSON/code viewer; domain-specific:
   **flow-canvas nodes** (trigger/action/condition/escalate) · branch connectors · **binding pill**
   (literal/ref/agent) · live-trace row · message bubble; feedback: empty/loading/error/streaming ·
   toasts · confirm dialogs (Reset).
5. **Accessibility** — contrast targets, keyboard nav (esp. the flow editor), focus states, ARIA
   for the dynamic trace + toggles, reduced-motion.
6. **Usage guidelines** — when to use each component, do/don't, density.

### 13.2 Recommended shape (non-binding)
React + token-driven styling (CSS variables / Tailwind / a component lib), published as one
internal package every screen imports. The design task confirms the stack.

### 13.3 Relationship to §12
§12 = *what each screen contains and does*; §13 = *how it looks and the shared parts*. A screen is
built by composing §13 components to satisfy a §12 panel description.

---

## 14. Open items / deferred decisions

- **Volume encryption + Lightsail-vs-EC2** — leaning EC2 + encrypted EBS; deferred.
- **Hermes review pass** (task #9) — confirm `SOUL.md`, hooks, `redact_pii`, single-shot
  invocation API, write-approval; adopt what fits.
- **Latency harness** — build early to validate the 120s budget (§5.2).
- **Concrete `CapabilitySpec` / tool list** — enumerate each capability's input/output schema.
- **Seeded workflow graphs** — finalize the onboarding/offboarding node graphs.
- **Self-test suite contents** — author scenarios + KPIs + traceability matrix.
- **Observability / error-handling** beyond escalation.
- **Further hardening targets** — which soft guardrails/conditions to promote next.

---

## 15. Reference

Full chronological rationale in `requirements/decisions.md` (items 1–33, incl. the grilling
resolutions 21–33). Platform findings in `requirements/sensei-and-platform.md`. Original brief in
`requirements/job-definition.md` and `requirements/office-hour-summary.md`.
