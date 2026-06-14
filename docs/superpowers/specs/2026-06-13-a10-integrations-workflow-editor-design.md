# A10 — Configurable Integrations & Workflow Editor (Design)

_Date: 2026-06-13. Builds on Phase A (A1–A9), branch `phase-a-onboarding`. Implements the
configurable half of the Phase A doc (`docs/superpowers/plans/2026-06-13-phaseA-onboarding.md`
§A10) and decisions #13–20, #34._

## Goal
Make integrations **installable / enable-able with per-integration config**, gate the agent's tools
by what's installed+enabled, make the onboarding workflow a **typed node-graph that is editable in a
visual editor** (edits reflected in the next run), and surface **vendor brand icons** everywhere a
third-party action appears.

Two user-confirmed scope decisions:
- **Workflow editor = full node-graph** (Trigger·Action·Condition, THEN/ELSE branches, nesting,
  create-from-scratch).
- **Prod mode = cosmetic** (stored + REAL badge, but the mock adapter still runs — happy path never
  breaks). The real behavior-changer is the **enable/disable gate** + the mock **failNext** toggle.

---

## 1. Engine — integration registry

`engine/src/integrations.ts`:

```ts
export type RolePort = "HRIS" | "ATS" | "Channels" | "TaskBoard" | "Calendar" | "Content";

export interface ConnectorDef {
  id: string;          // "shapes" | "comeet" | "teams" | "slack" | "whatsapp" | "trello" | "calendar" | "branding"
  name: string;        // "Shapes" | "Comeet" | ...
  role: RolePort;
  description: string;
  icon: string;        // asset key, e.g. "shapes" (maps to a vendored logo or a lucide fallback)
  seeded: boolean;     // seeded ⇒ installed+enabled+mock by default
}

export interface ConnectorState {
  installed: boolean;
  enabled: boolean;
  mode: "mock" | "prod";
  config: {
    mock: { failNext?: boolean; latencyMs?: number; seed?: string };
    prod: { baseUrl?: string; authRef?: string; ids?: string };
  };
}
```

**Catalog** (`CONNECTORS: ConnectorDef[]`, decision #34):
- Seeded (installed by default): **Shapes** (HRIS), **Comeet** (ATS), **Teams** (Channels),
  **Calendar** (Calendar), **Branding** (Content).
- Catalog-available, not installed (extensibility): **Slack** (Channels), **WhatsApp** (Channels),
  **Trello** (TaskBoard).

**State** lives in the store, keyed `tenant#connector#<id>`; seeded connectors initialized at
startup/reset to `{installed:true, enabled:true, mode:"mock", config:{mock:{},prod:{}}}`. Non-seeded
default to `{installed:false, ...}`.

**Tool gating.** A tool's `integration` is its role-port. `availableTools(store, tenant)` returns
tools whose role has ≥1 **installed && enabled** connector. This drives:
- the orchestrator's injected playbook (only available tools listed), and
- `/tools/execute`: a call to a tool whose role is not installed+enabled returns
  `{ ok:false, error:"<role> is not enabled" }` (HTTP 400). If the role's active connector has
  `mock.failNext` set, the dispatcher consumes the flag and returns
  `{ ok:false, error:"injected failure on <role>" }` (sets up Phase B escalation).

Seeded connectors are enabled by default, so the existing onboarding happy path is unaffected.

## 2. Engine — API

Integration endpoints (`engine/src/app.ts`, tenant via `?tenant=`, default `papaya`):
- `GET /integrations` → `[{ ...ConnectorDef, ...ConnectorState, tools: string[] }]` (tools = the
  role's tool names).
- `POST /integrations/:id/install` → `installed:true` (+ `enabled:true, mode:"mock"`).
- `POST /integrations/:id/uninstall` → `installed:false`.
- `POST /integrations/:id/enable` body `{ enabled:boolean }`.
- `POST /integrations/:id/config` body `{ mode?, mock?, prod? }` (shallow-merged into state).
- `GET /integrations/:id/data` → the connector's role's live records (Shapes→employees,
  Comeet→contracts, Channels→messages, Calendar→invites, TaskBoard→memberships, Content→branding).

Workflow endpoints:
- `GET /workflows` → `[{ id, name, version }]`.
- `GET /workflows/:id` → the full `WorkflowDefinition`.
- `PUT /workflows/:id` body = `WorkflowDefinition` → replaces the stored definition (bumps nothing
  automatically; client owns `version`). Validated with zod.
- `GET /capabilities` → `CapabilitySpec[]` for the editor's capability picker / required-field
  auto-population.

## 3. Engine — workflow node-graph model (decision #19)

`engine/src/workflows/types.ts`:

```ts
export type Audience = "employee" | "manager" | "hr" | "team";
export type NodeId = string;

export type InputBinding =
  | { kind: "literal"; value: unknown }
  | { kind: "ref"; from: string }     // "trigger.payload.x" | "step.<id>.output.y"
  | { kind: "agent" };

export interface ActionNode {
  id: NodeId;
  kind: "action";
  capability: string;                 // a tool name
  input: Record<string, InputBinding>;
  audience?: Audience;
  next?: NodeId;
}

export interface ConditionNode {
  id: NodeId;
  kind: "condition";
  expr: string;
  then: NodeId;
  else?: NodeId;
}

export type WorkflowNode = ActionNode | ConditionNode;

export interface TriggerDefinition { type: string; filter?: string; }

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  trigger: TriggerDefinition;
  root: NodeId;
  nodes: Record<NodeId, WorkflowNode>;
}
```

`CapabilitySpec` is **derived from each tool's zod schema** (single source of truth, decision #19) —
field names + required/optional, with `tenant` flagged as a system field (hidden from the editor):

```ts
export interface CapabilityField { name: string; required: boolean; system: boolean; }
export interface CapabilitySpec { name: string; description: string; fields: CapabilityField[]; sideEffectful: boolean; }
```

To enable derivation, each `ToolDef` gains a `schema: z.ZodObject` and a `sideEffectful: boolean`.
`capabilitySpecs()` introspects `schema.shape` (`.isOptional()` per key) to build the specs.

The seeded **onboarding** definition migrates to a linear chain of 7 `ActionNode`s linked by `next`
(same capabilities/order as A1–A9), each with `input` bindings (mostly `agent` for message bodies,
`ref`/`literal` for ids). `serializePlaybook(def, availableTools)` walks from `root` following
`next` and condition `then`/`else` (depth-first, conditions rendered as "If <expr> … else …"),
emitting numbered steps + the available-tool catalog. Stored definition is seeded at startup/reset
and read fresh per `/execute` run.

## 4. Dashboard — Integrations area (`integrations` screen)

`IntegrationsScreen.tsx` with two tabs:
- **Catalog** — connectors grouped by role-port; each a `ConnectorCard` with a **brand logo**, name,
  role, description, install state. Install / Configure actions hit the API and refetch.
- **Installed** — left list of installed connectors; selecting one shows sub-tabs:
  - **General** — `Toggle` enable; mock/prod `Select` (active mode); status badges.
  - **Mock config** — failNext toggle, latency, seed.
  - **Prod config** — baseUrl, authRef, ids (separate tab; cosmetic).
  - **Data** — `Table` of the role's live records (from `/integrations/:id/data`).
  - **Tools** — list of exposed capabilities (name + purpose), each badged by system icon.

## 5. Dashboard — Workflow editor (`workflow-editor` screen)

`WorkflowEditorScreen.tsx`, a direct view of the typed `WorkflowDefinition`:
- Loads `GET /workflows/onboarding` + `GET /capabilities`.
- **Canvas** — Trigger node (top) → renders nodes from `root`: `FlowNode` per node
  (action=blue, condition=amber, escalate=red), `BranchConnector` for `next`, THEN/ELSE connectors
  for conditions, recursive for nesting (collapse/expand on deep branches).
- **Inspector** (right panel) for the selected node:
  - Action → capability `Select` (required fields auto-appear from `CapabilitySpec`), audience
    `Select`, per-field `BindingPill` + editor (literal text input / ref `Select` of upstream
    sources / agent).
  - Condition → `expr` text, then/else node targets.
- **+ Add step** after the selected node → Action or Condition (Condition sprouts THEN/ELSE; ELSE
  defaults to an escalate action). **New workflow** → empty trigger + a single root action.
- **Save** → `PUT /workflows/:id`; **Reset** reloads from server. A subsequent Live Run reflects the
  saved graph.

State is held in React; the on-disk model is the single format (round-trips, no separate schema).

## 6. Icons

Vendor the 7 logos (`Comeet, MS_Teams, Shapes (HRIS), Slack, Trello, whatsapp, papaya`) into
`dashboard/src/ui/assets/connectors/` with normalized names. A `ConnectorIcon` helper
(`dashboard/src/ui/`) maps **role / connectorId / channel → logo** (Calendar→lucide `Calendar`,
Content→lucide `FileText`, email→lucide `Mail`). Wired into:
- **ConnectorCard** (Catalog/Installed) via its `icon` prop.
- **Live Run tool-call trace** — each `TraceRow` shows its system's logo (capability→role→icon).
- **Audit log** — capability → system logo (leading cell).
- **Messages** — channel brand (Teams/Slack/WhatsApp/email).
`TraceRow` and `MessageBubble` (vendored `.jsx`) gain an optional `icon` prop (backward-compatible).
A capability→role map (`engine` role-ports mirrored client-side, or returned by `/capabilities`)
resolves which logo a tool/audit row uses.

## 7. Testing

**Engine (vitest):**
- Registry: seeded vs catalog state; `availableTools` reflects install/enable.
- Endpoints: GET/POST integrations lifecycle; `/integrations/:id/data`; workflow GET/PUT;
  `/capabilities`.
- Gating: `/tools/execute` rejects a disabled role; `failNext` returns an injected error then clears.
- Node-graph serializer: walks the linear chain; renders a condition's then/else.
- No regression: existing onboarding e2e still green (seeded connectors enabled).

**Dashboard:** `npm run build` clean; Playwright e2e — install Slack from Catalog (card flips to
installed); disable a seeded connector → its tool drops from a subsequent run's trace; open the
Workflow editor, confirm the onboarding graph renders.

## 8. Out of scope (deferred)
Real prod API adapters · DynamoDB/S3 persistence (still in-memory) · Users & roles + Synthetic-data
config screens · Phase B (offboarding, confidentiality send-gate, escalation execution) ·
condition evaluation hardening (conditions remain soft/agent-judged).
