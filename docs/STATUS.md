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

## What's built & working
- **`engine/`** (TypeScript/Fastify): `POST /execute` (Sensei contract → calls Hermes → returns
  `{response, structured}`), `POST /tools/execute` (domain-tool callback for the Hermes skill),
  `GET /audit`, `GET /health`. In-memory employee store + audit log; `hris.upsert_employee` tool
  (zod-validated). **Langfuse tracing** (env-gated, OTel SDK). 16 tests green.
- **`agent/`** (Hermes `gateway` in Docker, Python): OpenAI-compatible API the engine calls; model
  = **gpt-5.5 via OpenAI Codex device-auth** (the "OpenAI with auth, not API key" path). Reaches
  our domain tools via the **`hris-tool` skill** that HTTP-calls the engine (NO MCP, per decision).
- **`dashboard/`** (React/Vite/TS): built on a **Claude-designed design system vendored at
  `dashboard/src/ui/`** (Tailwind + CSS-var tokens + lucide). App shell (top bar + dark nav) +
  **Live Run** screen (trigger→response+audit, wired to the engine); other screens are
  "Not implemented yet" placeholders. Guidelines: `docs/design/component-guidelines.md`.
- **Verified flow:** `/execute` → agent reasons → calls skill → engine tool → audit → warm
  response. Confirmed locally on Docker with real Hermes, and a live Langfuse trace.

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

## Deployment status — AWS EC2 (IN PROGRESS)
- **Instance:** EC2 t3.medium, Ubuntu, **public IP `18.215.146.5`**. Security group opens 22, 3000, 8080.
- **Containers (all Up):** engine `:3000`, agent(Hermes) `:8642`, dashboard `:8080`.
- **Config on the box** (git-ignored `.env`, NOT committed): `VITE_ENGINE_URL=http://18.215.146.5:3000`
  + Langfuse keys; `agent/.env` from the example (API_SERVER_KEY matches engine's HERMES_API_KEY).
- **RESUME HERE (next steps):**
  1. `docker compose exec agent bash -lc 'hermes model'` → OpenAI Codex device login → `docker compose restart agent`. (Persists in the `hermes-data` volume.)
  2. Verify: `curl -s -X POST http://18.215.146.5:3000/execute -H 'Content-Type: application/json' -d '{"task":"Onboard Maya Cohen (id e1, Engineer, start 2026-07-01)","context":{"tenant":"papaya"}}'` then `curl .../audit?tenant=papaya`. Open dashboard `http://18.215.146.5:8080`.
  3. Point Sensei/Agentalent at `http://18.215.146.5:3000/execute` (health `/health`).

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
