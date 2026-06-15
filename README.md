# PixushHR

Autonomous **Onboarding & Offboarding Operations Agent** for Papaya Global, built for the
Agentalent.ai "Big Agents Competition." Evaluated by **Sensei** (monday.com's open-source agent
eval engine) over HTTP, and demonstrated through a dashboard.

> **Status:** Lean end-to-end slice **working locally on Docker with a real Hermes agent.** The
> full design (offboarding, confidentiality gate, durable storage, self-test suite, AWS) is
> specced and being widened incrementally. See `requirements/decisions.md` for the full history.

## Architecture (two services + dashboard)

```
Sensei / curl ─▶ Engine (TS) ─▶ Agent (Hermes, OpenAI-compatible API)
                   │  ▲  ▲ tool callback (skill → HTTP, no MCP)
                   │  └──┘
                   ├─ /tools/execute → in-memory store + audit
                   └─ Langfuse tracing (OTel) ─▶ Langfuse Cloud
Dashboard (React) ─▶ Engine /execute + /audit
```

- **`engine/`** — TypeScript/Fastify. Owns the Sensei contract (`/execute`), the domain tools
  (`/tools/execute`), the in-memory employee store + audit log (`/audit`), the Hermes client, and
  Langfuse tracing. *Engine = our code; the system of record + hard guardrails live here.*
- **`agent/`** — [Hermes](https://github.com/NousResearch/hermes-agent) run as `hermes gateway`
  (Docker). Exposes an OpenAI-compatible API the engine calls; reaches our domain tools via the
  **`hris-tool` skill** that HTTP-calls the engine. Model: gpt-5.5 via **OpenAI Codex auth**.
- **`dashboard/`** — React/Vite. Trigger a scenario, view the response + audit.

Design rationale and the (many) decisions: **`requirements/decisions.md`**. Architecture spec:
**`docs/superpowers/specs/2026-06-11-architecture-design.md`**. Plans: **`docs/superpowers/plans/`**.

## Run it locally

Prereqs: Docker. Secrets go in a **git-ignored `.env`** — copy `.env.example` and fill it
(Langfuse keys optional; leave blank to disable tracing).

**No-creds smoke** (engine in stub mode + dashboard, no Hermes/model needed):
```bash
docker compose -f docker-compose.yml -f docker-compose.stub.yml up --build engine dashboard
# open http://localhost:8080 → Trigger
```

**Full run with the real Hermes agent:**
```bash
docker compose up -d --build
# one-time: configure the model + persist it (the ~/.hermes volume keeps it across rebuilds)
docker compose exec agent bash -lc 'hermes model'     # OpenAI Codex device-login
docker compose restart agent
# test the text path:
curl -s -X POST http://localhost:3000/execute -H 'Content-Type: application/json' \
  -d '{"task":"Onboard Maya Cohen (id e1, Engineer, start 2026-07-01)","context":{"tenant":"papaya"}}'
curl -s 'http://localhost:3000/audit?tenant=papaya'
```
Expect a warm response **and** an `hris.upsert_employee` audit entry (agent → skill → engine tool).

## Tests
```bash
cd engine && npm test          # unit + code-level e2e (stub Hermes)
cd dashboard && npm run e2e     # Playwright UI e2e (stub engine)
```

## Agentalent Sensei Handshake
Use the handshake runner as a transport loop: it fetches each Agentalent task, sends it to the
deployed Pixush `/execute` endpoint, submits Pixush's answer, then continues until the handshake is
complete.

```bash
node tools/sensei-handshake.mjs \
  https://agentalent.ai/api/handshake/c83abeac-df50-4532-a930-b7e511a0eff8
```

Options:
```bash
node tools/sensei-handshake.mjs <handshake-url> \
  --agent-url http://18.215.146.5:3000/execute \
  --tenant papaya \
  --max-tasks 5
```

## Observability
The engine traces each `/execute` to **Langfuse** (env-gated). Set `LANGFUSE_PUBLIC_KEY`,
`LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` in `.env`. Follows the official `langfuse` skill
(current OTel SDK). See decision #52.

## Not done yet (roadmap)
WhatsApp inbound channel (Hermes bridge build), offboarding workflow, the confidentiality
send-gate, DynamoDB/S3 (replace in-memory), populate `structured.actions[]`, the self-test Sensei
suite, and AWS deploy.
