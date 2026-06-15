/** Engine-aware types for the Workflow Editor.
 *  Mirrors engine/src/workflows/types.ts + engine/src/tools.ts (SchemaNode + CapabilitySpec). */

export type Binding =
  | { kind: "literal"; value: unknown }
  | { kind: "ref"; from: string }
  | { kind: "agent" };

export type Audience = "employee" | "manager" | "hr" | "team";

export interface ActionNode {
  id: string;
  kind: "action";
  capability: string;
  input: Record<string, Binding>;
  audience?: Audience;
  next?: string;
}

export interface ConditionNode {
  id: string;
  kind: "condition";
  expr: string;
  then: string;
  else?: string;
}

export type WorkflowNode = ActionNode | ConditionNode;

export interface TriggerDef {
  type: string;
  connector: string;
  sample?: Record<string, unknown>;
}

export interface WorkflowDef {
  id: string;
  name: string;
  version: number;
  trigger: TriggerDef;
  root: string;
  nodes: Record<string, WorkflowNode>;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  version: number;
  trigger: TriggerDef;
}

/** JSON-serializable schema tree — mirrors engine/src/tools.ts SchemaNode. */
export type SchemaNode =
  | { kind: "object"; fields: Record<string, SchemaNode>; required?: boolean }
  | { kind: "string" | "number" | "boolean" | "unknown"; required?: boolean }
  | { kind: "array"; items: SchemaNode; required?: boolean }
  | { kind: "literal"; value: unknown; required?: boolean }
  | { kind: "union"; options: SchemaNode[]; required?: boolean };

export type ToolKind = "engine-tool" | "external-hermes";

export interface Capability {
  name: string;
  kind: ToolKind;
  connector: string;
  integration: string;
  label: string;
  description: string;
  sideEffectful: boolean;
  inputSchema: SchemaNode;
  outputSchema: SchemaNode;
  fields?: Array<{ name: string; required: boolean; system: boolean }>;
}

export interface TriggerCatalog {
  name: string;
  label: string;
  description: string;
  connector: string;
}

export interface Run {
  runId: string;
  workflowId: string;
  status: "running" | "done" | "error";
  response?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export interface AuditEntry {
  id: string;
  ts: string;
  tenant: string;
  capability: string;
  label?: string;
  integration?: string;
  target: string;
  summary: string;
  actor: "pixush" | "user" | "trigger" | "system" | "hermes-native";
  runId?: string;
  status: "success" | "error" | "escalated";
  durationMs?: number;
  inputs?: unknown;
  outputs?: unknown;
}

export interface IntegrationRow {
  id: string;
  name: string;
  role: string;
  installed: boolean;
  enabled: boolean;
  mode: "mock" | "prod";
}
