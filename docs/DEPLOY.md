# Deploying PixushHR to AWS

The whole stack (engine + Hermes agent + dashboard) runs via **docker-compose on a single
instance** — the same compose you run locally. This guide gets it onto AWS for the demo / Sensei
evaluation.

> Per our decisions: a single long-lived instance (EC2 or Lightsail). Encryption-at-rest, a domain,
> and TLS are deferred (see "Hardening" at the end).

---

## 0. Before you start — what you'll need
- An AWS account.
- A way to get the code onto the box (a GitHub **Personal Access Token** to clone the private repo,
  or `scp` your local folder).
- Your **Langfuse keys** (the *rotated* pair — the old ones were exposed in chat).
- ~10 minutes at the box for the one-time **Hermes model login** (OpenAI Codex device flow).

## 1. Provision an instance
**EC2 (recommended)** — Ubuntu 24.04, **t3.medium** (2 vCPU / 4 GB — Hermes + the Node/Vite builds
need the RAM), 20 GB disk. Or **Lightsail** — the **$24/mo (4 GB)** Ubuntu plan.

**Open these ports** (EC2 security group inbound / Lightsail firewall), source = your IP for admin,
`0.0.0.0/0` for the public ones:
| Port | Who needs it | Why |
|------|--------------|-----|
| 22   | you          | SSH |
| 3000 | **Sensei + the browser** | the **engine** `/execute` (Sensei hits this) and the dashboard's API calls |
| 8080 | the browser  | the dashboard UI |
| 8642 | optional     | the Hermes API (usually internal-only; leave closed unless debugging) |

Note the instance's **public IP** — call it `PUBLIC_IP` below.

## 2. Install Docker (on the box)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker   # run docker without sudo
```

## 3. Get the code
```bash
# option A: clone (use a GitHub PAT when prompted for password)
git clone https://github.com/ButtersHub/PixushHR.git && cd PixushHR
# option B: from your laptop instead:  scp -r ./PixushHR ubuntu@PUBLIC_IP:~/
```

## 4. Configure secrets (git-ignored `.env` files — never committed)
```bash
# root .env — Langfuse + the PUBLIC engine url the browser uses
cp .env.example .env
#   set: LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY (rotated), LANGFUSE_BASE_URL
#   set: VITE_ENGINE_URL=http://PUBLIC_IP:3000        <-- critical: NOT localhost

# agent .env — Hermes gateway settings
cp agent/.env.example agent/.env
#   keep API_SERVER_KEY = "change-me-dev-key" (it must match the engine's HERMES_API_KEY in
#   docker-compose.yml) — or change BOTH to a strong shared value.
```
> `VITE_ENGINE_URL` is **baked into the dashboard at build time** (Vite). The compose build arg
> reads it from `.env`, so it must be set to `http://PUBLIC_IP:3000` *before* you build (step 5),
> or the dashboard will try to call `localhost` from your laptop.

## 5. Build & run
```bash
docker compose up -d --build
docker compose ps          # engine, agent, dashboard all "running"
```

## 6. One-time Hermes model login (the agent has no model until you do this)
```bash
docker compose exec agent bash -lc 'hermes model'   # follow the OpenAI Codex device-login URL/code
docker compose restart agent                        # picks up the config
```
This persists in the `hermes-data` volume — survives restarts/rebuilds.

## 6a. Optional Hermes WhatsApp setup
Hermes connects to WhatsApp through its built-in Baileys bridge. Use a dedicated demo number if
possible, then link it from inside the agent container:

```bash
docker compose up -d --build agent
docker compose exec agent hermes whatsapp
```

Scan the QR from **WhatsApp → Linked devices → Link a device**. The session is stored under
`~/.hermes` in the persisted `hermes-data` volume, so rebuilds do not require a new QR scan unless
WhatsApp unlinks the device. If `hermes whatsapp` asks who can message the bot, use comma-separated
phone numbers with country code and no `+`, or `*` for the open demo.

## 7. Verify
```bash
# text path against the PUBLIC engine:
curl -s -X POST http://PUBLIC_IP:3000/execute -H 'Content-Type: application/json' \
  -d '{"task":"Onboard Maya Cohen (id e1, Engineer, start 2026-07-01)","context":{"tenant":"papaya"}}'
curl -s 'http://PUBLIC_IP:3000/audit?tenant=papaya'
```
Expect a warm response + an `hris.upsert_employee` audit entry. Then open the **dashboard** at
`http://PUBLIC_IP:8080` and hit **Trigger scenario**. Langfuse Cloud should show the trace.

For WhatsApp, send the linked number a message from an allowed account:
```text
Hi, I'm Maya Cohen starting July 1 as an Engineer.
```
Expect a WhatsApp reply from Hermes/PixushHR and audit entries from the engine tool calls.

## 8. Point Sensei at it
Sensei evaluates by POSTing to your **engine** endpoint: `http://PUBLIC_IP:3000/execute`
(health at `/health`). Use that URL wherever the Agentalent/Sensei platform asks for your agent's
HTTP endpoint.

---

## Operating it
- Logs: `docker compose logs -f engine` (or `agent` / `dashboard`).
- Update: `git pull && docker compose up -d --build` (re-set `VITE_ENGINE_URL` if the IP changed).
- Reset state: `docker compose down && docker volume rm pixushr_hermes-data` (forces a fresh Hermes
  login) — only if you want a clean slate.

## Hardening (deferred — do before anything real)
- **Rotate** the Langfuse keys and change `API_SERVER_KEY`/`HERMES_API_KEY` from the dev default.
- `/tools/execute` is reachable on the public engine port — fine for a synthetic-data demo, but for
  real use put the engine behind a reverse proxy that only exposes `/execute` + `/health`, or bind
  the tool callback to the internal network.
- Add a **domain + TLS** (e.g. Caddy/nginx in front) so Sensei + the dashboard use HTTPS.
- Enable **encrypted EBS** (decision #12) and move secrets to **SSM/Secrets Manager**.
