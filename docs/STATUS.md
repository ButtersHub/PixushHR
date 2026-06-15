# PixushHR — Current Status & Handoff

_Last updated: 2026-06-15. Read this first if you're a new session._

## TL;DR
Building the autonomous **Onboarding/Offboarding agent for Papaya Global** (Agentalent.ai "Big
Agents Competition", evaluated by **Sensei** over HTTP). The **lean end-to-end slice is BUILT and
WORKING** (real Hermes), and we are **mid-deploy to AWS EC2** — all containers are Up; the next
action is the one-time Hermes model login, then verify, then point Sensei at the endpoint.

- **Full decision history (authoritative):** `requirements/decisions.md` (52 numbered items +
  grilling resolutions + design + Langfuse). **Architecture spec:** `docs/superpowers/specs/2026-06-11-architecture-design.md`.
  **Lean-slice plan:** `docs/superpowers/plans/2026-06-11-lean-e2e-slice.md`. **Deploy guide:** `docs/DEPLOY.md`.

## ▶ NEXT SESSION — START HERE
**Phase A (A1–A10) is BUILT** on branch `phase-a-onboarding` (plan:
`docs/superpowers/plans/2026-06-13-phaseA-impl.md`): full onboarding sequence + configurable
integrations registry + workflow editor. 63 engine tests + 3 dashboard Playwright e2e green;
typecheck + build clean.

**Next work:**
1. **Phase B** — offboarding workflow + the structural confidentiality send-gate + escalation
   execution (`docs/superpowers/plans/2026-06-13-widening-roadmap.md`).

**Remaining deferrals (unchanged, none blocking the demo):** real prod adapters, DynamoDB/S3,
Users/Synthetic-data screens, real-Hermes deployed verification (run `/execute` against
`http://18.215.146.5:3000` with real Hermes after `docker compose up -d --build` + one-time
Hermes model login; confirm multi-tool Langfuse trace + populated Messages/Audit).

## What's built & working
- **`engine/`** (TypeScript/Fastify): `POST /execute` (Sensei contract → calls Hermes → returns
  `{response, structured}`), `POST /tools/execute` (domain-tool callback for the Hermes skill),
  `GET /audit`, `GET /messages`, `POST /reset`, `GET /health`. In-memory store now holds the full
  onboarding domain (employees, contracts, managers, departments, branding, messages, invites,
  team memberships, audit). **Tool registry** (`ToolDef` keyed by role-port `integration`):
  `hris.upsert_employee`, `ats.get_contract`, `hiring_manager.ask`, `teams.add_member`,
  `calendar.create_invite` (logistics-only, no `reason` — structural confidentiality seed),
  `content.get_branding`, `channel.send_message` — each zod-validated → store → audit. **Integration
  registry** keyed by role-port (`installed`/`enabled`/`mode`/`config`): `GET/POST /integrations`
  catalog + per-connector install/uninstall/enable/config/`:id/data`; per-connector mock/prod adapter
  with `failNext` injection; **tool gating** — only installed+enabled role-ports' tools reach the
  agent (`availableTools`/`gateToolCall`). **Workflow node-graph** `WorkflowDefinition` stored and
  served via `GET/PUT /workflows/:id`; `GET /capabilities` returns the full tool catalog. The
  orchestrator builds the playbook from the stored workflow + available tools each run. Typed
  **onboarding `WorkflowDefinition`** + **NL playbook serializer**. Synthetic **fixtures** seeded at
  startup (Maya Cohen's signed contract, hiring manager, branding). **Langfuse tracing** (env-gated,
  OTel SDK). 63 tests green (incl. code-e2e of the full sequence via stub Hermes).
- **`agent/`** (Hermes `gateway` in Docker, Python): OpenAI-compatible API the engine calls; model
  = **gpt-5.5 via OpenAI Codex device-auth** (the "OpenAI with auth, not API key" path). Reaches
  our domain tools via the **`hris-tool` skill** that HTTP-calls the engine (NO MCP, per decision).
  WhatsApp is live via Hermes' Baileys bridge (Node 20 in the agent image; bridge scripts copied
  into the installed package). Gmail SMTP/IMAP is configured for the demo account, and WhatsApp can
  trigger outbound email through Hermes' built-in `send_message` tool.
- **`dashboard/`** (React/Vite/TS): built on a **Claude-designed design system vendored at
  `dashboard/src/ui/`** (Tailwind + CSS-var tokens + lucide). App shell (top bar + dark nav) +
  **Live Run** screen (trigger→response, **tool-call trace** via `TraceRow` with brand icons, audit),
  **Messages** screen (`MessageBubble`, warm comms, brand icons), **Audit** screen (filterable
  `Table`, brand icons). **Integrations** screen: Catalog grouped by role-port with brand connector
  logos + Installed config panel (General/Mock/Prod/Data/Tools sub-tabs). **Workflow editor** screen:
  visual node-graph canvas (`data-testid="workflow-canvas"`) + inspector with binding pills + save.
  Playwright e2e (3 specs) asserts multi-tool run, catalog connectors, and workflow graph. Guidelines:
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
  engine was recreated via `docker compose up -d engine` to load the new keys). WhatsApp pairing
  completed and persisted in the same `hermes-data` volume. Gmail app-password SMTP works:
  `docker compose exec agent hermes send --to email:lev.vidrak@gmail.com "hello"` was verified.
- **Hermes runtime config gotchas:** `agent/.env` controls platform enablement/secrets
  (`WHATSAPP_ENABLED`, `EMAIL_*`, API server), but `~/.hermes/config.yaml` inside the Docker volume
  controls persisted Hermes behavior (model, toolsets, group rules, display, compression). Keep:
  `model.provider=openai-codex` and `model.default=gpt-5.5`; if `/execute` fails with
  `Codex Responses request 'model' must be a non-empty string`, repair with
  `hermes config set model.provider openai-codex` and `hermes config set model.default gpt-5.5`,
  then restart `agent`. For the non-interactive API surface, keep
  `platform_toolsets.api_server: [skills, terminal]`, `agent.max_turns: 15`, and
  `agent.environment_probe: false`. Set `approvals.mode: off` because the HTTP API cannot answer
  interactive approval prompts. This prevents approval-blocked tool attempts and unrelated
  cron/file exploration while retaining the LLM-driven `hris-tool` workflow and Hermes' hardline
  command blocks.
- **WhatsApp/Email demo notes:** Papaya-Ops group id is `120363408400308850@g.us`. Use
  `require_mention: true`, `group_policy: allowlist`, `display.platforms.whatsapp.tool_progress=off`,
  and keep `platform_toolsets.whatsapp: [hermes-whatsapp]` so the `send_message` tool is
  available for WhatsApp-to-email requests. Add a SOUL.md instruction that explicit email requests
  should call `send_message` with target `email:<address>`.
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
- Widen the agent: **offboarding workflow**, harden the **confidentiality send-gate**, replace
  in-memory with **DynamoDB/S3**, populate `structured.actions[]` from Hermes tool-calls, author the
  **self-test Sensei suite** (requirements-traceable), the typed `WorkflowDefinition` engine.
- Widen the **dashboard** (the 5 placeholder screens) on the design system.
- Langfuse: confirm token/cost capture in the UI; tune flush interval; nest `/tools/execute` spans.
- Encryption-at-rest (EBS/KMS) + Secrets Manager (decisions #8, #12).
