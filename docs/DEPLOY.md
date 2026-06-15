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
#   set WHATSAPP_ENABLED=true when using the WhatsApp gateway.
#   set EMAIL_* values when using Gmail/SMTP from Hermes (details below).
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

Sanity-check the persisted model after config changes:
```bash
docker compose exec agent bash -lc 'grep -nA8 "^model:" /root/.hermes/config.yaml'
```
Expected for the current demo:
```yaml
model:
  provider: openai-codex
  default: gpt-5.5
```
If `/execute` returns `Codex Responses request 'model' must be a non-empty string`, repair it with:
```bash
docker compose exec agent hermes config set model.provider openai-codex
docker compose exec agent hermes config set model.default gpt-5.5
docker compose restart agent
```

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

Current demo group config:
- WhatsApp group: `Papaya-Ops`
- Group id: `120363408400308850@g.us`

Add or merge this into `/root/.hermes/config.yaml` inside the `agent` container:
```yaml
whatsapp:
  reply_prefix: ""
  require_mention: true
  group_policy: allowlist
  group_allow_from:
    - "120363408400308850@g.us"

platform_toolsets:
  whatsapp: [hermes-whatsapp]

display:
  platforms:
    whatsapp:
      tool_progress: off
      streaming: false
      cleanup_progress: true

compression:
  codex_gpt55_autoraise: false
```

Notes:
- `require_mention: true` means group messages need an `@bot-name` mention.
- `group_policy: allowlist` keeps Hermes scoped to Papaya-Ops.
- `tool_progress: off` suppresses internal tool/progress messages such as `skill_view` and
  terminal snippets in the group.
- `platform_toolsets.whatsapp: [hermes-whatsapp]` keeps Hermes' built-in `send_message` tool
  available, which is required for WhatsApp-to-email.
- `compression.codex_gpt55_autoraise: false` only disables the noisy Codex gpt-5.5 compaction
  notice; it does not change the model.

After editing `config.yaml`, restart the gateway:
```bash
docker compose restart agent
```

For cross-channel email requests, keep this instruction in `/root/.hermes/SOUL.md`:
```text
When a user asks to send an email, use the send_message tool with target email:<address>. Do not merely say that you sent it.
```

## 6b. Optional Hermes Email setup
Hermes can use Gmail over IMAP/SMTP. Use a dedicated Gmail account and generate a Google **App
Password** from Google Account → Security → 2-Step Verification → App passwords. Put the 16-character
password in `agent/.env` without spaces.

Example `agent/.env` email block:
```bash
EMAIL_ADDRESS=pixush.ops@gmail.com
EMAIL_PASSWORD=xxxxxxxxxxxxxxxx
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_PORT=993
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_POLL_INTERVAL=15
EMAIL_ALLOWED_USERS=lev.vidrak@gmail.com
EMAIL_HOME_ADDRESS=lev.vidrak@gmail.com
EMAIL_HOME_ADDRESS_NAME=Lev
```

Important semantics:
- `EMAIL_ALLOWED_USERS` controls who may command Hermes by emailing the inbox. It is **not** a
  recipient allowlist for outbound email.
- `EMAIL_HOME_ADDRESS` is the proactive/default delivery target. If present, Hermes may send gateway
  lifecycle notifications there.
- Changing `agent/.env` requires a recreate, not just restart:
  `docker compose up -d --force-recreate agent`.

Suppress email gateway restart/shutdown notifications while keeping email enabled:
```yaml
gateway:
  platforms:
    email:
      gateway_restart_notification: false
```

Verify SMTP directly before testing WhatsApp-to-email:
```bash
docker compose exec agent hermes send --to email:lev.vidrak@gmail.com "hello"
```

Then test from WhatsApp:
```text
@US-AWS-LightSail-Hermes send an email to lev.vidrak@gmail.com saying hello
```

Hermes' built-in email sender is intentionally simple: it sends fresh one-shot messages with the
subject `Hermes Agent`. Gmail may group repeated sends into the same conversation. Changing the Gmail
sender display name is done in Gmail settings for the `pixush.ops@gmail.com` account, not in Hermes.

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
- Reload root `.env` changes for Langfuse/dashboard/engine vars with
  `docker compose up -d --force-recreate engine`; reload `agent/.env` changes with
  `docker compose up -d --force-recreate agent`.
- Reset state: `docker compose down && docker volume rm pixushr_hermes-data` (forces a fresh Hermes
  login) — only if you want a clean slate.

## Hardening (deferred — do before anything real)
- **Rotate** the Langfuse keys and change `API_SERVER_KEY`/`HERMES_API_KEY` from the dev default.
- `/tools/execute` is reachable on the public engine port — fine for a synthetic-data demo, but for
  real use put the engine behind a reverse proxy that only exposes `/execute` + `/health`, or bind
  the tool callback to the internal network.
- Add a **domain + TLS** (e.g. Caddy/nginx in front) so Sensei + the dashboard use HTTPS.
- Enable **encrypted EBS** (decision #12) and move secrets to **SSM/Secrets Manager**.
