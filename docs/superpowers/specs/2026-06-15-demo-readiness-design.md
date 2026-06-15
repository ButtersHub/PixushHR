# Demo-readiness design — Workflow Editor revamp + real channels via Hermes

_Spec author: brainstorming session 2026-06-15. Status: pending implementation. Replaces relevant portions of the [Phase A10 spec](2026-06-13-a10-integrations-workflow-editor-design.md) for the editor + integrations surfaces._

## 1. Goal

Make the 10-step demo scenario fully runnable end-to-end:

1. Integrations screen — *done_today, plus new schema side panel_*
2. Open the **New Hire** flow in the Workflow Editor
3. Trigger **Candidate Hired** (mock Comeet payload)
4. Mock: Extract employee details from signed contract (Comeet)
5. Mock: Start onboarding in Shapes — upsert + populate fields
6. Mock: Add to relevant Teams lists
7. **Real**: Send welcome email — warm tone (Gmail via Hermes)
8. **Real**: WhatsApp the hiring manager with details + summary (WhatsApp via Hermes)
9. View the full flow in the Audit Log
10. **Real**: Hiring manager messages the bot on WhatsApp; bot answers (inbound Q&A)

The deliverables span the engine (new endpoints + virtual tool kind + side-effect ingestion), the dashboard (rebuilt Workflow Editor with 4-area layout, schema-tree panel in Integrations, new actor in Audit), and the agent (Hermes channels enabled + a record-side-effect skill).

## 2. Architecture decisions locked

| Decision | Picked | Reason |
|---|---|---|
| How does the engine learn about Hermes-performed channel sends? | **A · LLM-mediated callback** | Aligned with Hermes's design (LLM-driven). Fastest to ship. Gating is "soft via playbook" — honest. |
| Email same shape as WhatsApp? | **Yes** | Symmetric. Both go through Hermes native gateways + record-side-effect callback. |
| Inbound WhatsApp Q&A shape? | **Free-form Hermes-driven (no workflow)** | Q&A is not a structured flow — playbook would be a lie. SOUL prompt + record-side-effect = audit symmetry. |
| Workflow picker scope? | **Onboarding + Offboarding stub** (Q1·b) | Picker looks alive; stub demonstrates extensibility without committing to Phase B yet. |
| Test flow scope? | **Fire + audit + response** (Q2·a) | Smallest delta that proves the loop end-to-end. |
| Editor layout? | **3-column + bottom drawer** (A) | Most demo-friendly: pick → see canvas → click Test → drawer fills below. |
| Canvas card design? | **V2 · Stacked** | Step number prominent, connector + chip on bottom band, mock-vs-real unmistakable. |
| Step Settings content? | **B · Schema-tree lineage** | Contract-shaped: full input schema + leaf source tags. Output as schema + last-run JSON. |
| Test endpoint shape? | **Async + polling** | Don't kill the browser. Same polling pattern as Audit screen. |

## 3. Engine

### 3.1 New endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/side-effect` | Hermes callback after native-channel action. Body: `{ channel: 'email'|'whatsapp', direction: 'outbound'|'inbound', to?, from?, subject?, body, runId? }`. Writes Message + audit entry. RunId falls back to `currentActiveRunId` per tenant. |
| `GET`  | `/triggers` | Triggers from **installed + enabled** connectors. Shape: `[{ name, label, description, connector, sample }]`. |
| `POST` | `/workflows/:id/test` | Fires the workflow with the configured trigger's `sample`. Returns `{ runId }` immediately; agent run executes in background. |
| `GET`  | `/runs/:runId` | `{ status: 'running'|'done'|'error', response?, error? }` for run-level state polling. |
| `POST` | `/simulate/inbound` | Dev simulator for step 10. Body: `{ channel: 'whatsapp', from, body }`. Prompts Hermes via its chat API with a synthetic "you just received this — respond" system message; both directions land in audit via record-side-effect. |
| `POST` | `/workflows` | Create a workflow. Body: `{ id, name, trigger }` returns full def. |
| `DELETE` | `/workflows/:id` | Remove a workflow (used by Offboarding stub's delete affordance + future user-created flows). |

### 3.2 Modified endpoints

- `GET /audit` accepts optional `?runId=` for filtering — the Test Flow drawer polls this.
- `GET /capabilities` returns per-capability `kind: 'engine-tool' | 'external-hermes'`, `connector`, `label`, and `outputSchema` derived from a new optional `outputShape: z.ZodTypeAny` on `ToolDef`.
- `GET /integrations` capability rows also get `inputSchema` + `outputSchema` for the new Integrations schema side panel.
- `GET /workflows` returns `[{ id, name, version, trigger }]` (trigger summary added for the picker).
- `POST /execute`, `POST /tools/execute` — unchanged in shape.

### 3.3 Tool registry

```ts
type ToolKind = 'engine-tool' | 'external-hermes';

interface ToolDef {
  name: string;
  kind: ToolKind;                  // NEW
  integration: RolePort;
  connector: string;               // NEW — connector id (e.g. 'gmail', 'whatsapp', 'shapes')
  label: string;
  purpose: string;
  schema: z.ZodObject<...>;        // input
  outputShape?: z.ZodTypeAny;      // NEW — drives schema-tree rendering
  sideEffectful: boolean;
  run?: ToolFn;                    // present for engine-tool, absent for external-hermes
  summarize: (...) => {...};
}
```

Two new virtual entries (`kind: 'external-hermes'`):

| name | integration | connector | input | output |
|---|---|---|---|---|
| `gmail.send_email` | Channels | `gmail` | `{ tenant, to, subject, body, from? }` | `{ ok, messageId, channel: 'email' }` |
| `whatsapp.send_message` | Channels | `whatsapp` | `{ tenant, to, body, mediaUrl? }` | `{ ok, messageId, channel: 'whatsapp' }` |

Existing tools' new `connector` field:
- `hris.upsert_employee` → `shapes` (also: label becomes *"Start onboarding in Shapes"* — id unchanged)
- `ats.get_contract` → `comeet`
- `hiring_manager.ask` → `teams`
- `teams.add_member` → `teams`
- `calendar.create_invite` → `calendar`
- `content.get_branding` → `branding`
- `channel.send_message` → `teams` (legacy generic send — stays as engine-tool. Teams/Slack migrations to `external-hermes` are deferred.)

### 3.4 Playbook serializer

`serializePlaybook` recognizes `kind: 'external-hermes'` and emits a different instruction block for those steps:

```
N. Send via your native <channel> gateway with these args: { to: <ref>, ... }.
   Then immediately call `record_side_effect` with:
     { channel: '<channel>', direction: 'outbound', to, body[, subject] }
   Do not skip the callback — it is how the audit log gets the entry.
```

Engine-tool steps continue using the existing instruction format.

### 3.5 Workflow data model

```diff
 interface WorkflowDefinition {
   id: string;
   name: string;
   version: number;
-  trigger: { type: string; filter?: string };
+  trigger: { type: string; connector: string; sample?: Record<string, unknown> };
   root: string;
   nodes: Record<NodeId, WorkflowNode>;
 }
```

Migration: existing `onboarding` fixture gains `connector: 'comeet'`, `sample: { candidateId: 'c1', candidate: { name: 'Maya Cohen', email: 'maya@cohen.io', role: 'Engineer' } }`. Version bumped to 2. No DB; in-memory store reset on restart.

Seeded **Offboarding** stub: `trigger: { type: 'employee.terminated', connector: 'shapes' }`, one action node calling `hris.upsert_employee` with placeholder bindings. Editable, deletable.

### 3.6 Side-effect ingestion

`POST /side-effect`:
1. Validates body with zod.
2. Resolves `runId` (request body → fallback to `store.currentActiveRunId(tenant)`).
3. Writes `store.addMessage({ channel, from: 'agent' or actual `from` for inbound, to, body, ... })`.
4. Writes `store.audit({ capability: '<channel>.send_message' or '<channel>.message_received', label, integration: 'Gmail'|'WhatsApp', target, summary, runId, actor: 'hermes-native', inputs, outputs: { ok: true } })`.
5. Returns `{ ok, messageId }`.

### 3.7 Connector gating for virtual tools

`gateToolCall` still applies: `availableTools(store, tenant)` filters by `roleEnabled`. The virtual tools' `integration: 'Channels'` is the role-port; the action picker filters by **specific connector** (`gmail`, `whatsapp`) not just by role-port. Concretely, the dashboard's action picker reads `/capabilities` (now with `connector`) and cross-references each capability's `connector` with the connector state from `/integrations` — disabled connectors' tools are greyed.

### 3.8 Fixtures

- `manager.cannedAnswer` already exists. Add `manager.phone = '+972546358808'` (user's real number — demo target) so step 10 can address the right recipient.
- `branding.welcomeEmailSubject`, `branding.welcomeEmailHints` — short string hints the LLM can use to compose a warm welcome.

### 3.9 Env flags

- `HERMES_CHANNELS_DRY_RUN` (engine + agent) — when `true`, the agent is instructed (via a conditional SOUL prepend the engine injects in the playbook) to *describe* the send instead of invoking the native gateway, while still calling `record-side-effect` so the audit + Messages screen populate. **Default `false`** — production hits the real gateway. Local dev opts in.
  - Engine reads the env at start, exposes it in the playbook serializer as a "Dry-run mode" preamble so the LLM behaves accordingly. No engine-side enforcement beyond the prompt — Hermes either has channel creds or it doesn't.

## 4. Hermes agent

### 4.1 Configuration

`agent/.env` gains:

```
WHATSAPP_ENABLED=true
WHATSAPP_MODE=bot
WHATSAPP_ALLOWED_USERS=*
EMAIL_ENABLED=true
EMAIL_GATEWAY=...      # per Hermes docs
```

Exact gateway choice (Baileys vs Cloud API; Gmail OAuth vs SMTP) is owned by the parallel gateway-setup track and not part of this spec's deliverable.

### 4.2 New skill — `agent/skills/record-side-effect/`

Same shape as the existing `hris-tool` skill: `SKILL.md` + `run.sh` that curls the engine.

```bash
# run.sh
set -euo pipefail
PAYLOAD="$1"
ENGINE_URL="${ENGINE_URL:-http://engine:3000}"
curl -sS -X POST "$ENGINE_URL/side-effect" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

`SKILL.md`: describes the payload shape + when to call (after every channel send/receive). Example payloads for both directions × both channels.

### 4.3 SOUL.md augmentation

Append:

> When you send a message via your native channels (WhatsApp, Email), you MUST call the `record-side-effect` skill immediately after each send, with the channel, direction='outbound', recipient and body. When you receive an inbound message, call `record-side-effect` with direction='inbound' first, then reply, then call it again for your reply. The audit log depends on this — do not omit it.

## 5. Dashboard — Workflow Editor (rebuild)

### 5.1 File layout

Break the current 207-line single-file screen into:

```
dashboard/src/screens/workflow/
  WorkflowEditorScreen.tsx        # top-level layout (left rail | canvas | inspector / drawer)
  WorkflowPicker.tsx              # left rail
  WorkflowCanvas.tsx              # the canvas
  TriggerCard.tsx                 # V2 stacked, special variant
  ActionCard.tsx                  # V2 stacked
  Inspector/
    Inspector.tsx                 # dispatches by selected kind
    TriggerInspector.tsx
    ActionInspector.tsx
    SchemaTree.tsx                # recursive renderer for input + output
    BindingSourceTag.tsx          # literal / ref / agent  source tag
  TestFlowDrawer.tsx              # bottom drawer with audit row stream
```

### 5.2 Layout (Layout A)

```
┌──────┬──────────────────────────────┬──────────────┐
│  P   │           Canvas             │  Inspector   │
│  i   │         (V2 cards)           │  (B-tree)    │
│  c   │                              │              │
│  k   ├──────────────────────────────┴──────────────┤
│  e   │         Test Flow drawer (collapsed default)│
│  r   │                                             │
└──────┴─────────────────────────────────────────────┘
```

### 5.3 Picker

- Vertical list of workflows from `GET /workflows`. Active item with green accent rail.
- Footer: `+ New workflow` — inline form `{ name, trigger.connector, trigger.type }` → `POST /workflows`.
- Per-item `…` menu: Rename · Duplicate · Delete.

### 5.4 Canvas

- Reads workflow def, walks from `root` via `next`, renders one card per node.
- First card is `<TriggerCard>` rendered from `wf.trigger` (not a graph node — the data model keeps trigger separate).
- Between cards: `+` inline slot. Click → action picker → insert at position.
- Click any card → `selected = node.id | 'trigger'` → drives Inspector.
- `data-testid="workflow-canvas"` retained for Playwright.

### 5.5 Inspector

Context-sensitive content (~320px wide):

**When `TriggerCard` selected**:
- Connector dropdown (filtered to connectors that publish triggers in `/triggers`).
- Trigger picker (`<connector>.<trigger_name>` from `/triggers`).
- Sample payload viewer — read-only by default, small "Edit sample" toggle reveals JSON textarea + zod-parse-on-save.

**When `ActionCard` selected**:
- Action picker (`/capabilities` filtered by enabled connectors). Disabled connectors show greyed-out items with `"Install <Connector>"` link to Integrations.
- Audience dropdown (employee / manager / hr / team).
- **Inputs** — `<SchemaTree>` rendered from `outputShape`'s sibling `inputSchema`. Each leaf shows `<BindingSourceTag>` (literal / ref / agent) + source detail (the literal value, the ref path, or "composed by LLM").
- **Output** — `<SchemaTree>` from `outputShape`. Toggle `[Schema | Last run]`. Last run reads from the most recent audit entry for this `(workflowId, nodeId)`.
- For `external-hermes` actions, an info note: *"Sent by the agent via its native gateway. The engine records the side-effect after the send."*

### 5.6 Test Flow drawer

- Trigger: `▶ Test flow` button in canvas header.
- Click → `POST /workflows/:id/test` → `{ runId }`. Drawer slides up to ~40% vertical.
- Polls `GET /runs/:runId` (status) + `GET /audit?runId=<id>` (rows) every 750ms with the existing perf pattern (skip-re-render-on-unchanged, clear interval on `document.hidden`). Stops on `done`/`error`.
- Header band: trigger label · elapsed · `N/M` step count · `×` close.
- Body: one row per audit entry. Each row = connector icon · step label · `MOCK`/`REAL` chip · runtime · summary. Click row → inline expansion with full `inputs` + `outputs` JSON.
- Error rows: red left border, error message in row-2.

## 6. Dashboard — Integrations screen

### 6.1 Schema side panel in Actions / Triggers sub-tabs

The current 1-column lists become 2-column inside the detail body:

```
┌───────────────────────────────┬──────────────────────────┐
│ Actions list                  │ <SchemaSidePanel>        │
│ ─ Get signed contract  LIVE   │   tool-id (mono)         │
│ ─ Get candidate               │   description            │
│ ─ List open positions         │   INPUTS  (SchemaTree)   │
│ Triggers list                 │   OUTPUT  (SchemaTree)   │
│ ─ Candidate hired             │                          │
│ ─ Contract signed             │                          │
└───────────────────────────────┴──────────────────────────┘
```

Component reuses `<SchemaTree>` from the Workflow Editor. Non-wired tools (no `outputShape`) show `"Not wired in this demo"` placeholder. Triggers' "output" is the sample payload schema.

State `selectedActionId` lives in `InstalledPanel`; defaults to first item in the active sub-tab.

## 7. Dashboard — Audit + Messages + Live Run

### 7.1 Audit

- New `actor: 'hermes-native'` badge: Hermes mark + neutral-green tint. Width-aligned with existing badges.
- New capabilities surface automatically (the redesigned audit screen reads from store with no schema assumptions): `gmail.send_email`, `whatsapp.send_message`, `whatsapp.message_received`.
- No structural changes to the screen.

### 7.2 Messages

- `email` and `whatsapp` channels already in the Zod schema; `ConnectorIcon` already covers both icons.
- Inbound messages render right-aligned with a slightly muted background so step-10 reads as a conversation.

### 7.3 Live Run

- Adds a `Simulate inbound WhatsApp` button alongside the trigger box. Tiny form: `from` (default: `+972546358808`), `body` (default: `Hi Pixush, when does Maya start? Did we send the welcome?`). Submit → `POST /simulate/inbound`.
- Audit table on this screen filters by the spawned runId.

## 8. Demo step → implementation map

| # | Demo step | Where it's delivered |
|---|---|---|
| 1 | Integrations screen — done | `IntegrationsScreen.tsx` + new `SchemaSidePanel` (§6.1) |
| 2 | See New Hire flow | `workflow/*` rebuild (§5) |
| 3 | Trigger Candidate Hired (mock) | `▶ Test flow` → `POST /workflows/onboarding/test` (§3.1, §5.6) |
| 4 | Mock: Extract from signed contract | Existing `ats.get_contract` tool, mock adapter, runId inherited |
| 5 | Mock: Start onboarding in Shapes | Existing `hris.upsert_employee`, label changed to *"Start onboarding in Shapes"* (§3.3) |
| 6 | Mock: Add to Teams lists | Existing `teams.add_member`, unchanged |
| 7 | Real: Welcome email | New virtual `gmail.send_email` → Hermes Gmail gateway → `/side-effect` callback (§3.3, §4.2) |
| 8 | Real: WhatsApp to hiring manager | New virtual `whatsapp.send_message`, same shape (§3.3, §4.2). Target: `+972546358808` |
| 9 | Audit log shows the flow | `AuditScreen.tsx`, new `hermes-native` badge (§7.1) |
| 10 | Real: Inbound WhatsApp Q&A | `POST /simulate/inbound` for demo; real WhatsApp inbound for prod (gateway track) (§3.1, §7.3) |

## 9. Testing

### 9.1 Engine — vitest

- `tests/sideEffect.test.ts` — `/side-effect` (outbound + inbound × email + whatsapp), runId fallback, store + audit writes. **~6 tests**
- `tests/triggers.test.ts` — `/triggers` filtered by installed+enabled connectors. **~3 tests**
- `tests/workflowTest.test.ts` — `/workflows/:id/test` returns runId, run executes in background, `/runs/:runId` transitions, `/audit?runId=` filters. **~4 tests**
- `tests/simulateInbound.test.ts` — `/simulate/inbound` prompts stub Hermes correctly, records both directions. **~2 tests**
- `tests/toolsExternal.test.ts` — playbook serializer emits external-hermes instruction; `gateToolCall` rejects when connector disabled. **~3 tests**
- `tests/workflowCrud.test.ts` — `POST/DELETE /workflows`. **~3 tests**
- `tests/e2e.test.ts` — extended: stub Hermes emits engine-tool calls + `record_side_effect` callbacks; assert final audit has all 7 expected entries including Gmail + WhatsApp REAL.

**Target: ~21 new tests → ~91 total.**

### 9.2 Dashboard — Playwright

- `workflow-editor.spec.ts` (new) — picker · canvas · inspector · `▶ Test flow` drawer streams rows.
- `integrations-schema.spec.ts` (new) — click connector → click action → schema side panel renders Inputs + Output trees.
- `audit-rich.spec.ts` (extended) — `hermes-native` badge appears on Gmail/WhatsApp entries.

**Target: 5 e2e specs (up from 3).** Run against the stub-Hermes docker-compose profile already in the repo.

### 9.3 Manual verification

A checklist in the implementation plan: walk demo steps 1–10 against a running local instance + assert expected state on each screen. Not scripted — a sanity gate before tagging the demo build.

## 10. Out of scope (explicit)

- Real-Hermes deployed verification on the AWS box — manual ops step in the plan, not coded.
- WhatsApp Cloud API webhook bridge into the engine — owned by the parallel gateway-setup track.
- Encryption at rest, Secrets Manager, reverse proxy in front of `/tools/execute`.
- Advanced workflow CRUD UX (search, tags, version history).
- JSON schema validation UX beyond zod-parse-on-save in the trigger sample editor.
- SSE/WebSocket streaming for the Test Flow drawer (polling per Q).
- Real Offboarding workflow logic — stub has one node; real flow lands in Phase B per [STATUS](../../STATUS.md).

## 11. Decisions log

(For traceability — append future decisions here.)

- 2026-06-15 · `A` for the Hermes-channel side-effect path (LLM-mediated callback).
- 2026-06-15 · Email same shape as WhatsApp.
- 2026-06-15 · Inbound Q&A free-form, no workflow.
- 2026-06-15 · Picker shows New Hire + Offboarding stub.
- 2026-06-15 · Test flow scope = fire + audit + response (no payload edit, no step-through).
- 2026-06-15 · Editor layout = 3-col + bottom drawer.
- 2026-06-15 · Cards = V2 stacked. Step Settings = B schema-tree.
- 2026-06-15 · Test endpoint = async + polling (`POST /workflows/:id/test` returns runId).
- 2026-06-15 · `hris.upsert_employee` label = *"Start onboarding in Shapes"*.
- 2026-06-15 · Demo manager phone = `+972546358808`.
- 2026-06-15 · `HERMES_CHANNELS_DRY_RUN` default OFF.
