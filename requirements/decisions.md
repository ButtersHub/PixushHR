# Architecture Decisions Log

Running log of decisions locked during design. Newest at the bottom. The full spec will
supersede this, but this captures intent as we go.

## Locked

1. **Language/runtime:** TypeScript / Node — aligns with Sensei (TS/Node), lets us run the
   Sensei CLI and embed our own self-test suite.
   > ⚠️ **SUPERSEDED by item 31.** Agent service is now **Python** (Hermes-native); dashboard is
   > **TS/React**. The "TS aligns with Sensei" rationale is retired — Sensei is language-agnostic
   > over HTTP and runs as a separate CLI.

2. **Provider & infra agnostic:** All LLM reasoning, tool-calling, and memory go through an
   **Agent-Infra Port**. Adapters: **Hermes** (preferred) and **OpenClaw** (swappable). The
   HR domain never imports either directly.
   > ⚠️ **SOFTENED by item 21 (Hermes-first pragmatism).** Prefer Hermes built-ins where they
   > fit; swappability to OpenClaw is now best-effort / where-cheap, not absolute.

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
   record.** Durable state lives in the stores and is reached via tools — **domain/employee data
   in the simulated systems (storage 4, in-memory Repository); our own control-plane state in
   DynamoDB (storage 1).** *(Corrected per the four-storage model, item 8 — employee/HRIS data is
   NOT in DynamoDB.)*

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
    - **Adapters** per port: **Mock** (demo) = stateful simulator backed by a `Repository`
      (**in-memory for the demo = storage 4**; see item 8, *not* DynamoDB) — validates, idempotent
      upsert, deterministic, audited, returns **structured errors** the agent escalates on.
      **Real** (later) = actual API + anti-corruption layer (vendor DTO ↔ canonical). Same
      interface → drop-in.
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

## Design-tree resolutions (grilling session, 2026-06-11)

21. **"Hermes-first pragmatism" principle (decided — softens item 2).** Prefer Hermes built-in
    features when they fit, accepting some coupling; swappability to OpenClaw is now
    **best-effort / where-cheap**, not absolute. The Agent-Infra Port still wraps the core loop.
    **Decision filter — use the built-in unless one fails:** (1) functional fit; (2) for a *hard*
    guarantee, coverage on *all* code paths (not just Hermes-routed ones); (3) effort/quality win.
    TODO: run a "what can Hermes do for us" review pass (memory ✓ already · `SOUL.md` for
    Persona & Safety · `redact_pii`/`redact_secrets` · hooks · write-approval).

22. **Scenario ↔ workflow mapping (Q1).** Execution **spine = whole-workflow-per-call**: one task
    runs the entire workflow in a single HTTP call, returning one human-facing `response`. We
    *also* author conversational (Q&A), reasoning ("explain"), and self-improvement ("redo with
    feedback") scenarios. Agent intent-recognition distinguishes which kind each call is.

23. **Timeout strategy (Q2).** Design to a **120s budget**: in-memory mocks (≈0ms I/O) ·
    playbook-constrained execution (known sequence, not exploration — this is what makes Model B
    viable under timeout) · batch/parallel tool calls where supported · fast model for
    orchestration, strong model for final prose · **soft time-budget guard → escalate** rather
    than hard-timeout. **Measure early** with a latency harness; if over budget, harden the
    highest-latency steps to deterministic code.

24. **NL trigger / intent resolution (Q3).** **NL inference is the baseline** (we don't own the
    scoring suite — it may send pure prose); **structured `context`** is an optional accelerator
    in our self-test suite. Entities **resolved by lookup** against the mock systems. No-match /
    multi-match → **escalate**. (Spec §8 note: at the Sensei boundary the trigger is *recovered*
    from the task, not received pre-typed.)

25. **Response content contract (Q4).** **Communication-first + delimited action recap**, natural
    prose; make confidentiality visible (e.g. invite sent to relevant parties without the
    reason). Pure JSON only for the rare scenario with an automated `json-schema` KPI. Fine-tune
    later.

26. **Cross-scenario continuity (Q5).** **Stateless-per-call**: the agent reconstructs context
    from the persistent stores (keyed by identity) + the injected prompt. **Stores are the sole
    factual authority.** `MEMORY_MODE` toggles **conversational assist only** (never factual
    authority); default **off** for scoring. This is also what makes the ×3 retry idempotent.

27. **Audience-scoping enforcement (Q6).** **Hardened from day one** as the lone exception to
    soft-first. Authoritative **field×audience** check lives in our **`send_message` tool handler**
    (the universal outbound choke point — semantic + infra-agnostic; Hermes' regex redaction
    can't do recipient-dependent field policy). **Adopt Hermes `redact_pii`/`redact_secrets` +
    `transform_output` hooks** as complementary layers (also mitigates PII in plaintext
    `state.db`, storage 2).

28. **Self-improvement layer (Q7) — via Hermes native handling, no custom dev.** Sensei's
    self-improvement ("redo with feedback") is handled by Hermes' **normal agent turn-handling**:
    Sensei injects the original output (`depends_on`) + `feedback` into the prompt, and the agent
    produces the revision. This is NOT Hermes' cross-session "self-improving loop" pillar (which
    we avoid — nondeterministic, off under `MEMORY_MODE=off`); the original comes from the prompt,
    so it stays stateless-per-call (item 26). We own only: light revise discipline in `SOUL.md`
    ("address each feedback point, preserve strengths") + authoring self-improvement test
    scenarios. Targets the communication artifacts, not the structured operations.

29. **Idempotency under ×3 retry (Q8).** Enforced at the **side-effectful tool handlers** via a
    **deterministic logical key** `key(tenant, workflow, caseId, stepId/intent, capability,
    targetIdentity)` — no Sensei request id needed. Recorded in storage 1's dedup table;
    check-then-act → repeats are no-ops returning the recorded result (dedupe on logical action,
    not exact text). Handler is the choke point (not agent discretion). Case/step state enables
    *resume* as an optimization. Synergy with item 23: escalate-and-return-200 avoids triggering
    the retry at all, so keys are the backstop.

30. **Playbook rendering (Q9).** A deterministic, infra-agnostic **serializer** turns the typed
    `WorkflowDefinition` graph into a concise **natural-language playbook** (steps + conditions +
    escalation + available tools), with bound inputs resolved from the stores. Delivered via
    **Hermes' pre-LLM context-injection hook** (Hermes-first), not the static prompt. Three
    context layers: `SOUL.md` (persona/safety, static) · injected playbook (per-turn, intent-
    specific) · tools (capabilities). Demo has 2 workflows + Q&A → inject a compact catalog,
    single-pass; switch to classify-then-inject only if workflow count grows. Standing constraint:
    **keep it simple and performant** (feeds the 120s budget, item 23).

31. **Language split — REVERSES item 1 (Q10).** **Agent service = Python** (Hermes-native:
    Edge, Orchestrator, capabilities, integrations, stores; Hermes as a native library, native
    Python tools, native `SOUL.md`/hooks/memory/`redact_pii`). **Dashboard = TS/React**, talking
    to the Python service over HTTP (off the latency-critical path). Rationale: Sensei is
    language-agnostic (HTTP, separate CLI), and Hermes-first + "simple/performant" both argue
    against a TS↔Python hop on every tool call. **Ripples:** `WorkflowDefinition`/`CapabilitySpec`/
    `AgentReply` become **Pydantic** models (same type-safety); the OpenClaw-binding CLI is Python;
    DynamoDB via boto3; the dashboard reads workflow defs via the API. The earlier "TS for Sensei
    alignment" rationale (item 1) is retired.

32. **Self-test suite (Q11).** Authored **from the requirements, not the implementation** — one
    scenario per requirement/constraint/success-criterion, tracked in a **traceability matrix**.
    Mirrors the three layers/weights. Includes **adversarial traps** (confidentiality leak check,
    missing-info → escalate, out-of-bounds question, hallucination bait). **Independent judge**
    (different model from the agent) + **multi-judge median**. Our score is a **lower-bound
    proxy** for the unknown official suite — don't over-fit to our own KPIs.

33. **Hermes runtime model (Q12).** **Warm, always-running embedded Hermes** initialized once at
    startup (`SOUL.md`, tools, config, `MEMORY_MODE=off`). Each `/execute` is an **isolated
    single-turn run** with fresh per-request context (playbook + task + resolved data), no
    cross-request state — warm runtime for speed, isolated context for determinism/statelessness
    (item 26). Concurrency a non-issue (Sensei serial). Confirm the single-shot invocation API in
    the Hermes review pass (task #9).

34. **Connector scope — "seeded" vs "catalog-available" (decided; resolves external-review notes
    1–3).** Every named system has a role-port and appears in the dashboard Catalog, but only some
    are **seeded/active in the demo**:
    - **Seeded (used by the two workflows):** Shapes (`HrisPort`), Comeet (`AtsPort`), **Teams** &
      **Email** (`MessageChannel`), Branding (`ContentPort`), Calendar (`CalendarPort`).
    - **Catalog-available, NOT seeded (installable — demonstrates extensibility):**
      - **Slack** — a `MessageChannel` impl. Office hours scoped channels to Teams + email, so
        Slack is installable but not a default demo channel. *Channel enum includes `slack` for
        completeness.*
      - **Spark Hire** — an alternate `AtsPort` adapter (brief's "Comeet / Spark Hire"). Comeet is
        the seeded ATS; Spark Hire is a future/alternate adapter, not in the demo path.
      - **Trello** (`TaskBoardPort`) — named in the brief but **not used by either seeded
        workflow**. **Explicitly deferred** to catalog-available. *Optional stretch:* a lightweight
        "create onboarding checklist card" action if time allows; otherwise a readiness signal only.
    - This is the Catalog-vs-Installed split already in the dashboard (item 18), now stated
      explicitly so implementers don't expect Slack/Spark Hire/Trello in the demo path.

## External review round 2 resolutions

35. **PII → LLM "authorized systems" boundary (review #1).** **Demo: non-issue** — synthetic data
    only, so no real PII crosses any boundary (incl. the model provider). **Production: define the
    authorized boundary** — bring the model inside it (self-hosted / VPC / Bedrock-with-DPA, or a
    local / Nous-Portal model via Hermes' custom-endpoint support) **or** PII-minimize before
    egress. Spec gets an explicit data-flow note.

36. **Communication-egress policy — generalizes item 27 (review #2).** The field×audience
    confidentiality gate applies to **all people-facing egress tools**, not just `send_message`:
    **`send_message` · `calendar.create_invite` · recipient-bound `document.generate`/delivery.**
    These share one **communication-egress policy layer** (the choke point). *Internal* surfaces
    (audit, dashboard traces, tool-call args/results, Hermes `state.db`) are a **separate** concern
    — handled by `redact_pii` + encryption + audit redaction (item 37) — **not** audience-scoping.

37. **Audit redaction (review #3).** Demo logs **synthetic data raw**; the store is **encrypted
    (S3+KMS) and authorized-internal**. The **dashboard display role-gates/redacts** sensitive
    fields (termination reason, salary) for non-authorized viewers. **No hashing** (over-build).

38. **Same-business-day metric — minimal, push back on SLA machinery (review #4).** Demo responses
    are **synchronous** (one call, seconds), so "same business day" is trivially met and proven by
    **communication-log timestamps**. **No** business-hours calendar / SLA clock / queue /
    reminders — that's production async-channel infrastructure, out of demo scope. Validation =
    response-log evidence in scenarios.

39. **HRIS required fields & validation (review #5).** Define **required Shapes fields** — onboarding:
    `name, role, startDate, department, managerId, employmentType`; offboarding: `terminationDate,
    reason, status, lastWorkingDay` — with validation rules (presence · type/format · referential
    e.g. manager/dept exists · date-sanity e.g. start not in past, lastWorkingDay ≥ today).
    **Validation failure → structured error → escalate** (never guess). Lives in the `CapabilitySpec`
    input schemas + mock-adapter rules; full enumeration in the implementation plan.

40. **Workflow terminal states (review #6).** `completed` · `completed_with_escalation` · `failed`.
    **Completion metric redefined:** success = reaching a *clean* terminal (`completed` OR
    `completed_with_escalation`); only `failed` (crash/timeout/unhandled) is non-completion. This
    reconciles "100% end-to-end" (brief) with "escalation is an acceptable ending" (office hours).
    Case terminal state is tracked in storage 1 and shown on the dashboard.

41. **Q&A modeling — "available throughout" (review #7).** Modeled as **separate Q&A scenarios /
    later channel events**, NOT a long-lived open connection within one whole-workflow call. The
    agent reconstructs context from the stores by identity (stateless-per-call, items 22 & 26).
    Made explicit in the spec.
