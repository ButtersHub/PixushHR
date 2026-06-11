# Architecture Decisions Log

Running log of decisions locked during design. Newest at the bottom. The full spec will
supersede this, but this captures intent as we go.

## Locked

1. **Language/runtime:** TypeScript / Node — aligns with Sensei (TS/Node), lets us run the
   Sensei CLI and embed our own self-test suite.

2. **Provider & infra agnostic:** All LLM reasoning, tool-calling, and memory go through an
   **Agent-Infra Port**. Adapters: **Hermes** (preferred) and **OpenClaw** (swappable). The
   HR domain never imports either directly.

3. **Top-level shape:** Five layers — Platform Edge → Agent Orchestrator → HR Domain Core →
   Ports (Agent-Infra + Integration) → Foundations (synthetic data, audit log, self-test
   harness). Layers ②③ are infra-agnostic and mock-agnostic.

4. **Only `response` is scored.** Verified in Sensei source. `structured` is never read by the
   scorer/judge — it is reporting-only. (See `sensei-and-platform.md`.) `structured` is NOT an
   architectural pillar.

5. **Orchestrator agency model: B — single full agent.** The Orchestrator is one agentic loop
   with access to all tools; it plans and acts freely. Chosen over the hybrid skeleton because
   scoring is mostly an LLM judge reading prose, so there is no rigid structured contract to
   protect. Residual risks (timeout under 60–120s, run-to-run variance in our own self-tests,
   over-action) are managed by prompting/guardrails and the output-envelope contract below.

6. **Agent output envelope (internal contract).** The agent always returns a structured
   envelope; the **Edge projects it** to each caller. Two boundaries:
   - **Sensei ↔ Edge (wire, fixed by Sensei):** `{ response, structured? }`, only `.response` read.
   - **Agent ↔ Edge (ours):** a richer envelope, e.g.:
     ```ts
     interface AgentReply {
       requestId: string;          // tracing / idempotency / audit
       tenant: string;             // multi-tenant seam ("papaya")
       user: { id; name; role; channel: "sensei" | "teams" | "email" };
       response: string;           // human-facing text — the only thing Sensei scores
       actions?: AuditedAction[];  // side-effects (HRIS write, Teams add, invite) for audit + real delivery
       meta?: Record<string, unknown>;
     }
     ```
   - Edge → Sensei: `{ response: env.response }` (optionally whole envelope in `structured`).
   - Edge → real channel (later): deliver `env.response` to `env.user` over `env.channel`.
   - We constrain the agent's **output format**, not its reasoning process. This is how B's
     variance is tamed. (Exception: scenarios scored by automated `json-schema`/`json-parse`
     parse `env.response` directly, so that response must itself be pure JSON.)

7. **Deployment substrate:** AWS, with Hermes on a long-lived **Lightsail/EC2** instance
   (Lightsail preferred for demo simplicity). The Node agent service is co-located and exposes
   the `POST /execute` + `/health` endpoint. (Detail TBD; recorded as the assumed target.)

8. **Q1 — Storage model (decided): four distinct storages, split by data ownership.**

   | # | What lives there | Backend | Encryption at rest | Lifetime |
   |---|---|---|---|---|
   | 1 | **Our own persistent state** — tenant config, users/roles, workflow/case tracking, idempotency & request-dedup, escalation records. **Not** employee data. | **DynamoDB** (keyed e.g. `tenant#type#id`) | KMS (dev flag) | Durable |
   | 2 | **Conversation & sessions** — message history, tool calls/results (Hermes `state.db`, `MEMORY.md`, `USER.md`); local-only. | **Hermes** on instance | Encrypted volume (EBS) | Resettable (`MEMORY_MODE`/`reset`) |
   | 3 | **Audit log + documents/content** — append-only audit JSONL, termination letters, branding assets. | **S3** | SSE-KMS (dev flag) | Durable |
   | 4 | **Simulated 3rd-party data** — employees, contracts, departments, Teams membership = the fake Shapes/Comeet/Teams state. | **InMemory** via `Repository` (JSON fixtures) | n/a (ephemeral, synthetic) | Reset per run |

   - Storages **1 and 4 sit behind the same `Repository` interface** (InMemory + DynamoDB
     adapters; DynamoDB Local for tests). Idempotent upserts handle Sensei's ×3 retries.
   - **DynamoDB is kept ACTIVE in the demo** (not prod-only) — to demonstrate readiness for
     **multi-tenancy and multi-user/role** (partition by tenant; model users + roles).
   - **Encryption map:** storages 1 (DynamoDB) + 3 (S3) → KMS at rest, gated behind dev flag
     `ENCRYPTION_AT_REST=on|off`; storage 2 → encrypted EBS volume; storage 4 → none needed
     (ephemeral synthetic). No app/field-level encryption for the demo; broader posture deferred.
   - **Supersedes** the earlier "DynamoDB = system of record (employees/contracts)" framing:
     employee/contract data is **storage 4** (simulated, in-memory). DynamoDB holds **only
     genuinely-ours** control-plane state. A "mock" simulates a system's *behavior*; the
     `Repository` behind it holds the simulated *state* — two separate concerns.
   - Reproducibility nuance is resolved by `reset` (item 11), not tenant-namespacing.

9. **Hermes memory role (decided).** Hermes' local memory (`~/.hermes/`: `MEMORY.md`,
   `USER.md`, `state.db`, `pending/`) is **ephemeral working memory only — never the system of
   record.** Durable employee/HRIS state lives in DynamoDB and is reached via tools.

10. **No external memory providers (decided).** Built-in local memory is always on and is
    sufficient; external providers are optional and many are cloud-backed (Mem0, Supermemory,
    Honcho, RetainDB, Memori). Cloud providers would transmit employee data off-box, violating
    "never transmit employee data outside authorized internal systems." → **built-in local
    memory only; external providers forbidden for this project.**

11. **Memory toggle + reset command (decided).**
    - `MEMORY_MODE=on|off` → maps to Hermes `config.yaml memory_enabled`; off = deterministic,
      no learning carryover.
    - A unified **`reset`** command wipes `~/.hermes` (`memories/*.md`, `state.db`, `pending/`)
      **and** clears + reseeds the DynamoDB tenant namespace → clean slate per self-test run.
      (This also resolves the open "namespace vs reset" reproducibility item: **reset**.)

12. **Volume encryption — third encryption surface (lean, not final).** Hermes' `state.db`/`.md`
    are plaintext on disk and may hold employee PII, which DynamoDB+S3 KMS does not cover.
    → encrypt the instance volume. **Leaning EC2 + encrypted EBS (KMS customer-managed key)**
    over Lightsail for real key control. Confirm Lightsail's encryption limits before finalizing.
    NOTE: supersedes the "Lightsail preferred" note in item 7.
    - **Kept as a lean, deferred.** Decide volume-encryption + Lightsail-vs-EC2 later.
    - **Portability principle (decided):** keep Lightsail→EC2 a *redeploy, not a rewrite*. Both
      are Linux VMs running the same two processes (Node service + Hermes). To preserve this:
      externalize all config (env vars / Secrets Manager, never baked in), provision via a small
      IaC/provisioning script, and use the AWS SDK + IAM roles rather than any Lightsail-only
      managed feature. No Lightsail lock-in.

## Q2 — Integrations (in progress)

13. **Integration approach (decided).** Canonical core, per-platform adapters, mock-first,
    reached only through tools:
    - **Canonical domain models** (`Employee`, `Contract`, `Department`, `OnboardingCase`,
      `OffboardingCase`, `Message`, `CalendarEvent`). Workflows + agent speak only these.
    - **Adapters** per port: **Mock** (demo) = stateful simulator backed by DynamoDB synthetic
      data — validates, idempotent upsert, deterministic, audited, returns **structured errors**
      the agent escalates on. **Real** (later) = actual API + anti-corruption layer (vendor DTO ↔
      canonical). Same interface → drop-in.
    - **Inbound triggers:** demo trigger = Sensei's HTTP `task`; real webhooks/EventBridge are a
      later inbound adapter.
    - Mock implementation style: **in-process adapters** (not standalone fake API servers) for
      the demo. Mock fidelity: **stateful simulators** (not canned stubs).

14. **Port granularity — by ROLE, not by vendor (decided).**
    - One interface per **role/capability**; vendors are interchangeable implementations.
      `HrisPort`←Shapes · `AtsPort`←Comeet · `MessageChannel`←{Teams, Slack, Email} ·
      `TaskBoardPort`←Trello · `CalendarPort`←Outlook/Google · `ContentPort`←Branding.
    - **Multi-implementation roles get a router** (e.g. `ChannelRouter`) that selects the impl by
      recipient preference / config / explicit arg.
    - **Single-vendor roles still get a role name** (`HrisPort`, never `ShapesPort`) so a second
      vendor is a drop-in; vendor names never leak into the domain.
    - **Guard (interface segregation):** if a shared interface forces lowest-common-denominator
      or methods only one impl supports → they play different roles; split, don't bloat.
      Substitutability is the test.
    - **Supersedes** the earlier "ports named per-vendor" wording in item 13's spirit.

15. **Tool naming — capability-level (decided, flips earlier lean).** Agent-facing tools are
    **capability/role-based** (e.g. `send_message(to, body, channel?)`), with the platform chosen
    by router/registry/param — not per-vendor tool names. The agent's `response` text can still
    name the platform (good for the LLM judge), but the tool surface stays vendor-agnostic.

## Users & roles

16. **Roles/tenancy dial — Level 2 "readiness-light" (decided).** Model the named actor types
    (new/departing **Employee**, **HiringManager**, **DepartmentPeer**, plus "relevant parties")
    *plus* a `tenant` partition key and a minimal `User { id, name, role, channel }` in DynamoDB
    (storage 1). Multi-tenant/role-aware *structure*, but only Papaya + the named roles seeded.
    No permission engine / RBAC matrix (that was Level 3, rejected as over-build for the demo).
    The requirements name only ~4 actor types in a single company; multi-tenancy is our
    deliberate "production-shaped readiness" signal, beyond the literal brief.

17. **Audience information-scoping is a real, testable requirement (decided).** Communications
    are scoped by recipient role, driven by "never share employee personal data outside
    authorized internal systems" + "full confidentiality." Canonical case: the offboarding
    **last-day calendar invite to "relevant parties" carries logistics only — NOT the
    termination `reason`**; the termination letter / reason stays with the employee + authorized
    HR. We will encode per-role visibility rules and test them.

## Demo dashboard

18. **Demo dashboard (decided).** A web UI on the same instance — **not in the brief**, but a
    demo aid that makes the agent visible and the configure→run loop fast on stage. It reads our
    APIs + the four storages.
    - **Top bar:** tenant selector · **Trigger scenario** · **Reset** (the unified
      wipe+reseed from item 11) · live toggles (`infra: Hermes|OpenClaw`,
      `integrations: mock|real`, `MEMORY_MODE`, `ENCRYPTION_AT_REST`).
    - **Layout:** left-nav split into **Show** and **Configure**; main area is tab-driven.
    - **Core spine (6) — one complete loop: configure → trigger → watch → verify → audit:**
      1. **Live Run trace** (Show) — agent classify → tool calls → output envelope, live.
      2. **Messages** (Show) — warm welcome / pre-offboarding / termination letter / Q&A per
         channel; demonstrates tone + audience-scoping (item 17).
      3. **Audit log** (Show) — every action, filterable; demonstrates "auditable".
      4. **Users & roles** (Configure) — seed tenant + users/roles (Level 2, item 16).
      5. **Synthetic data** (Configure) — seed/reset fixtures, choose scenario.
      6. **Integrations** (Configure + Show) — see below. Replaces a standalone "systems
         state (before/after)" panel.
    - **Integrations area** — two top tabs:
      - **Catalog** — browse all connectors **grouped by type** (HRIS, ATS, Channels, Task
        Board, Calendar, Content), each a card with a short description + install state
        (`installed` / `+ install`). Doubles as a capabilities map; "available" cards signal
        extensibility.
      - **Installed** — manage each installed connector via tabs: **General** (role, enable,
        active mode), **Mock config** and **Prod config** *kept on separate tabs* (mock =
        fixtures/latency/**error-injection**/seed; prod = endpoint/auth-as-Secrets-ref/IDs/rate
        limits), **Data** (the system's live records = the "systems state", with `Reset` as the
        before-baseline ⇒ before/after per-system for free), **Tools** (which agent tools it
        exposes).
      - **Install lifecycle:** Catalog → **Install** (= register adapter under its role-port) →
        Configure → Enable + pick active mode → Data/Tools light up → Uninstall to remove.
        Mirrors the Hermes/OpenClaw connector/skill mental model and our adapter registry.
      - **Error-injection** ("fail next call") lets us trigger an **escalation** live on stage
        (demonstrates the office-hours "escalation is an acceptable ending" decision).
    - **Stretch (additive, not core):** Cases/workflow Kanban · **Self-test & scores** panel
      (run our Sensei suite, show badge — strongest stretch) · scoping-rules editor (could be a
      config file) · branding-content manager.

## Workflows

19. **Workflow-definition layer (decided).** Workflows are **typed TS** objects, authored
    in-repo, rendered to the agent as a soft **playbook** and to the dashboard as an editable
    flow. Model: **Trigger · Action · Condition graph** (automation-recipe paradigm, à la
    Monday automations).
    - `WorkflowDefinition { id, name, version, trigger: TriggerDefinition, root: NodeId,
      nodes: Record<NodeId, Node> }`, `Node = ActionNode | ConditionNode`.
    - **Split (parallel) intentionally omitted** (YAGNI: single agentic loop + serial eval).
      Node-graph leaves the door open to add `Split`/`Join` later.
    - **Trigger — two sides:** `TriggerDefinition { type, filter?: Condition }` declared in the
      workflow; `TriggerEvent<P> { id, type, tenant, source:'sensei'|'manual'|'webhook',
      occurredAt, payload }` is the runtime event. `id` feeds idempotency/dedup (storage 1).
    - **Action — a declared capability call:** `ActionNode { id, kind:'action', capability,
      input: InputBinding, audience?, next? }`. `InputBinding` per field = **literal** | **ref**
      (`{from:'trigger.payload.x'}` / `{from:'step.y.output.z'}`) | **`'agent'`** (agent fills at
      runtime, e.g. message body).
    - **`CapabilitySpec` is the single source of truth** (shared by Action nodes AND the
      agent-facing tool layer): `{ name, description, input: JSONSchema (required[]+optional),
      output, sideEffectful }`. The "must fields" = the schema's `required[]`; never duplicated
      on the Action. `sideEffectful` drives idempotency + audit.
    - **Condition:** `{ kind:'condition', expr, then: NodeId, else?: NodeId }`. Soft now (agent
      judges `expr`); hardenable to code-evaluated later.
    - **Escalate** is both (a) a capability/tool the agent can invoke at its discretion and
      (b) an Action node placeable on a Condition `else` / step `onFailure`. Result: notify the
      responsible role · write escalation record (storage 1 + audit) · mark case `escalated`.
      Office-hours-blessed graceful ending (need not run end-to-end).
    - **Soft-first / harden-later** throughout: steps are soft agent guidance now; specific
      nodes, conditions, and guardrails (incl. audience-scoping, item 17) can be promoted to
      code-enforced without changing the shape.

20. **Workflow editor in the dashboard (decided).** A visual flow builder that is a **direct
    view of the typed `WorkflowDefinition`** (round-trips to the same TS object — no separate
    format).
    - **Build flow:** pick a **Trigger** (top) → it exposes its payload as bindable data →
      **+ add step** inserts an **Action** (pick a capability; its required fields auto-appear
      from `CapabilitySpec`) or a **Condition** (sprouts THEN/ELSE; ELSE often → escalate). An
      **inspector** edits each field's binding: **literal | data-ref | agent-filled**.
    - **Nested flows supported.** Free in the model: `then`/`else` reference NodeIds, which can
      be other Conditions → arbitrary depth, no schema change. Editor renders branches
      recursively with **collapse/expand** for readability.
    - **Convergence is also free:** two branches can point to the same NodeId (paths rejoin,
      e.g. manager-responded and peer-responded both → "welcome"). It's a node-graph (DAG) by
      reference; no explicit join node. Only **parallel Split** is omitted (that's the case that
      would need a real join).
    - **Scope now: view + edit** the two seeded workflows. **Create-from-scratch is a later
      phase.**
