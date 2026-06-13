# Phase A — Onboarding as a real multi-step workflow

**Goal:** one `/execute` ("Onboard <hire>") makes the agent run the full brief sequence —
extract contract → ask hiring manager → populate HRIS → add to Teams → send warm welcome + share
branding → answer questions — across **mock integrations over synthetic data**, visible in the
trace, **Messages**, and **Audit**.

Build order: server first (so there's something to show), then dashboard. Each step = TDD →
verify → commit; merge the phase at the end. Verify finally against the deployed box with real Hermes.

---

## SERVER (engine + agent)

### A1 — Canonical models + synthetic fixtures (engine)
- Extend `engine/src/store.ts` (or new `domain.ts`) with: `Contract`, `Department`, `Manager`,
  `BrandingPack` (Employee exists). Keep tenant-scoped, in-memory.
- `engine/src/fixtures.ts`: seed a few candidates with **signed contracts** (name, role, startDate,
  dept, managerId), hiring managers (with canned answers), departments, branding content
  (culture-video links, company story). Loaded at startup + on `reset`.
- Add a `messages` list to the store + `getMessages(tenant)`.

### A2 — Mock integration tools (engine `tools.ts` registry; each validates → store → audit)
- `ats.get_contract({candidateId})` → contract details from fixtures.
- `hris.upsert_employee` (exists).
- `hiring_manager.ask({managerId, question})` → canned synthetic answer (the "collect info" step).
- `teams.add_member({employeeId, teams:[]})` → record membership.
- `calendar.create_invite({title, date, attendees, location})` → record invite (no sensitive fields).
- `content.get_branding()` → branding pack.
- `channel.send_message({to, role, channel, body})` → **record the message** (for the Messages
  screen) + audit. All go through the existing `/tools/execute` dispatcher (the Hermes skill is generic).
- New endpoint `GET /messages?tenant=` (for the dashboard).

### A3 — Onboarding workflow definition + playbook serializer
- `engine/src/workflows/onboarding.ts`: a structured definition (ordered steps: intent + capability
  + audience) — start simple (linear + one condition: manager-responded? else escalate later).
- `engine/src/workflows/serialize.ts`: render the definition → a concise **NL playbook** (the
  steps + the **tool catalog**: each tool's name, purpose, and "call it via the hris-tool skill with
  {name,args}"). This is what the agent follows (decision #30, soft-first).

### A4 — Orchestrator injects the playbook (engine `orchestrator.ts`)
- On an onboarding-type task, build the Hermes messages as: `system` (persona) + **injected
  onboarding playbook + tool catalog** + the user task. Keep intent detection minimal for now
  (onboarding is the demo path; default to it / detect "onboard").
- The agent then calls the skill repeatedly (one tool per step) and returns the warm welcome + recap.

### A5 — Tests
- Unit: each new tool (validation, store effect, audit); the serializer output; `/messages`.
- Code-e2e: a stub-Hermes that calls the sequence (`ats.get_contract` → `hris.upsert_employee` →
  `teams.add_member` → `content.get_branding` → `channel.send_message`) over `/tools/execute`;
  assert the audit + messages reflect the full run.

---

## DASHBOARD (on the design system, `dashboard/src/ui`)

### A6 — Messages screen (replace placeholder)
- Fetch `GET /messages`; render with the **MessageBubble** component, grouped by recipient/channel;
  show the warm tone. (Sets up audience-scoping visibility for Phase B.)

### A7 — Audit screen (replace placeholder)
- Proper filterable **Table** of `/audit` (capability, target, summary, timestamp).

### A8 — Live Run: show the multi-tool run
- In the Live Run screen, after a trigger, show the **sequence of tool calls** (from the audit/
  actions for that run) alongside the response — so the demo visibly shows the agent working across
  systems. (A simple list/stepper is enough; a full Langfuse-style trace can come later.)

### A9 — Dashboard e2e
- Update Playwright: trigger onboarding (stub engine) → assert response + a Message appears + the
  audit shows the multi-tool run.

---

## Verify Phase A
- Local: `engine` tests + dashboard e2e green; `docker compose up` and run an onboarding `/execute`
  → multi-tool trace in Langfuse + Messages + Audit populated.
- Deployed: same `/execute` against `http://18.215.146.5:3000` with real Hermes.

**Deferred to Phase B:** the manager-else-peer-else-escalate condition, offboarding, the
confidentiality gate. Keep Phase A linear + happy-path.
