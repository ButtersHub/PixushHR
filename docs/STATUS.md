# PixushHR — Current Status & Handoff

_Last updated: 2026-06-13. Read this first if you're a new session._

## TL;DR
Building the autonomous **Onboarding/Offboarding agent for Papaya Global** (Agentalent.ai "Big
Agents Competition", evaluated by **Sensei** over HTTP). The **lean end-to-end slice is BUILT and
WORKING** (real Hermes), and we are **mid-deploy to AWS EC2** — all containers are Up; the next
action is the one-time Hermes model login, then verify, then point Sensei at the endpoint.

- **Full decision history (authoritative):** `requirements/decisions.md` (52 numbered items +
  grilling resolutions + design + Langfuse). **Architecture spec:** `docs/superpowers/specs/2026-06-11-architecture-design.md`.
  **Lean-slice plan:** `docs/superpowers/plans/2026-06-11-lean-e2e-slice.md`. **Deploy guide:** `docs/DEPLOY.md`.

## ▶ NEXT SESSION — START HERE
**Phase A (A1–A9) is BUILT** on branch `phase-a-onboarding` (plan:
`docs/superpowers/plans/2026-06-13-phaseA-impl.md`): one `/execute` now runs the full onboarding
sequence (extract contract → ask hiring manager → upsert HRIS → add to Teams → schedule first day →
fetch branding → warm welcome) across mock integrations over synthetic data, surfaced in the Live
Run tool-call trace, the Messages screen, and the Audit screen. 38 engine tests + dashboard
Playwright e2e green; typecheck + build clean.

**Next work, in order:**
1. **A10 — configurable integrations & workflow editor** (the heavier "configure integrations and
   their actions" half): integration registry keyed by role-port (`installed`/`enabled`/`mode`/
   `config`), tool registry derives from it, `GET/POST /integrations…`, Catalog/Installed config UI,
   visual Trigger·Action·Condition workflow editor over the typed `WorkflowDefinition`. See
   `docs/superpowers/plans/2026-06-13-phaseA-onboarding.md` (A10 section) — write its bite-sized plan,
   then build subagent-driven.
2. **Phase B** — offboarding workflow + the structural confidentiality send-gate + escalation
   (`docs/superpowers/plans/2026-06-13-widening-roadmap.md`).

The tool registry already models integrations as **role-ports** (`ToolDef.integration`) so A10's
config UI layers on without a rewrite. TDD → verify → merge per phase. **Remaining Phase A
verification:** run an onboarding `/execute` against the deployed box `http://18.215.146.5:3000`
with real Hermes (`docker compose up -d --build` + the one-time Hermes model login) and confirm a
multi-tool Langfuse trace + populated Messages/Audit — the automated suites already cover the
code-level e2e via stub Hermes.

## What's built & working
- **`engine/`** (TypeScript/Fastify): `POST /execute` (Sensei contract → calls Hermes → returns
  `{response, structured}`), `POST /tools/execute` (domain-tool callback for the Hermes skill),
  `GET /audit`, `GET /messages`, `POST /reset`, `GET /health`. In-memory store now holds the full
  onboarding domain (employees, contracts, managers, departments, branding, messages, invites,
  team memberships, audit). **Tool registry** (`ToolDef` keyed by role-port `integration`):
  `hris.upsert_employee`, `ats.get_contract`, `hiring_manager.ask`, `teams.add_member`,
  `calendar.create_invite` (logistics-only, no `reason` — structural confidentiality seed),
  `content.get_branding`, `channel.send_message` — each zod-validated → store → audit. Typed
  **onboarding `WorkflowDefinition`** + **NL playbook serializer** the orchestrator injects so the
  agent follows the steps and calls one tool per step. Synthetic **fixtures** seeded at startup
  (Maya Cohen's signed contract, hiring manager, branding). **Langfuse tracing** (env-gated, OTel
  SDK). 38 tests green (incl. code-e2e of the full sequence via stub Hermes).
- **`agent/`** (Hermes `gateway` in Docker, Python): OpenAI-compatible API the engine calls; model
  = **gpt-5.5 via OpenAI Codex device-auth** (the "OpenAI with auth, not API key" path). Reaches
  our domain tools via the **`hris-tool` skill** that HTTP-calls the engine (NO MCP, per decision).
- **`dashboard/`** (React/Vite/TS): built on a **Claude-designed design system vendored at
  `dashboard/src/ui/`** (Tailwind + CSS-var tokens + lucide). App shell (top bar + dark nav) +
  **Live Run** screen (trigger→response, **tool-call trace** via `TraceRow`, audit), **Messages**
  screen (`MessageBubble`, warm comms), **Audit** screen (filterable `Table`); Configure screens
  (users/synthetic-data/integrations/workflow-editor) are still placeholders (Integrations +
  Workflow editor land in A10). Playwright e2e asserts the multi-tool run. Guidelines:
  `docs/design/component-guidelines.md`.
- **Verified flow:** `/execute` → agent follows the injected playbook → calls each skill tool →
  engine validates/stores/audits → multi-tool audit + warm message. Confirmed via the engine
  code-e2e (stub Hermes) and the dashboard Playwright e2e. Real-Hermes Docker + deployed-box run is
  the remaining manual Phase A verification (see NEXT SESSION).

## Architecture (current — reflects all reversals)
Two services + dashboard over HTTP. **Engine = TypeScript** (owns Sensei contract, domain tools,
stores, audit, hard guardrails). **Agent = Python/Hermes** (pure reasoning; OpenAI-compatible API).
Tool callback = **Hermes skill → engine `/tools/execute` (HTTP, not MCP)**. Channels are
**reply-only** in Hermes → WhatsApp demo is **inbound-triggered** (parked: bridge not built).
Storage for the slice = **in-memory** (DynamoDB/S3 are the production path, deferred).
Confidentiality gate = **structural** (restricted-audience artifacts built by reason-free tools),
soft for now. Agent model = **B (full agent)**. Only `response` is scored by Sensei.

## Repo map
```
engine/      TS service (src/{app,server,models,store,tools,hermes,orchestrator,tracing}.ts; tests/)
agent/       Hermes container (Dockerfile, .env.example, SOUL.md, skills/hris-tool/)
dashboard/   React/Vite (src/ui = vendored design system; src/shell; src/screens; App.tsx; e2e/)
docs/        STATUS.md (this), DEPLOY.md, design/, superpowers/{specs,plans}
requirements/  decisions.md (THE log), job-definition.md, office-hour-summary.md, sensei-and-platform.md
docker-compose.yml + docker-compose.stub.yml
reference/   third-party clones (sensei, hermes-agent, langfuse-skills) — gitignored
```

## Deployment status — AWS EC2 — LIVE ✅ (verified end-to-end with real Hermes)
- **Instance:** EC2 t3.medium, Ubuntu, **public IP `18.215.146.5`**. Security group opens 22, 3000, 8080.
- **Containers (all Up):** engine `:3000`, agent(Hermes) `:8642`, dashboard `:8080`.
- **Config on the box** (git-ignored `.env`, NOT committed): `VITE_ENGINE_URL=http://18.215.146.5:3000`
  + Langfuse keys; `agent/.env` from the example (API_SERVER_KEY matches engine's HERMES_API_KEY).
- **Done:** Hermes model configured (OpenAI Codex, persisted in `hermes-data` volume); `/execute`
  + `/audit` verified working on the public endpoint; Langfuse keys rotated (after rotating, the
  engine was recreated via `docker compose up -d engine` to load the new keys).
- **Remaining:** point **Sensei/Agentalent** at `http://18.215.146.5:3000/execute` (health
  `/health`); open the dashboard at `http://18.215.146.5:8080`.
- **Ops:** update via `git pull && docker compose up -d --build` (re-set `VITE_ENGINE_URL` if the
  IP changes — it's baked into the dashboard at build time).

## Most load-bearing decisions (full list: requirements/decisions.md)
Response-only scoring (#4) · Model B full agent (#5) · output envelope (#6) · four-storage model
(#8) · users/roles Level-2 + audience info-scoping (#16–17) · Hermes-first pragmatism (#21) ·
whole-workflow-per-call + 120s budget (#22–23) · stateless-per-call (#26) · structural
confidentiality gate (#46) · two-service split & engine=TS / agent=Python (#42–43) · tool callback
= skill+HTTP, no MCP (#48) · channels reply-only / WhatsApp inbound (#49) · lean-slice scope (#50) ·
Langfuse OTel tracing (#52).

## Known follow-ups / deferred (none blocking the demo)
- **SECURITY: rotate the Langfuse key pair** (exposed in chat) + change the dev `API_SERVER_KEY`/
  `HERMES_API_KEY`. `/tools/execute` is on the public `:3000` (demo-acceptable, synthetic data) —
  add a reverse proxy exposing only `/execute`+`/health` and TLS for real use.
- Build the **WhatsApp bridge** in the agent image (Node `bridge.js`).
- Widen the agent: **offboarding workflow**, harden the **confidentiality send-gate**, replace
  in-memory with **DynamoDB/S3**, populate `structured.actions[]` from Hermes tool-calls, author the
  **self-test Sensei suite** (requirements-traceable), the typed `WorkflowDefinition` engine.
- Widen the **dashboard** (the 5 placeholder screens) on the design system.
- Langfuse: confirm token/cost capture in the UI; tune flush interval; nest `/tools/execute` spans.
- Encryption-at-rest (EBS/KMS) + Secrets Manager (decisions #8, #12).
