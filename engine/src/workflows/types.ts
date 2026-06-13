export type Audience = "employee" | "manager" | "hr" | "team";
export type NodeId = string;

export type InputBinding =
  | { kind: "literal"; value: unknown }
  | { kind: "ref"; from: string }
  | { kind: "agent" };

export interface ActionNode {
  id: NodeId;
  kind: "action";
  capability: string;
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

export interface TriggerDefinition {
  type: string;
  filter?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  trigger: TriggerDefinition;
  root: NodeId;
  nodes: Record<NodeId, WorkflowNode>;
}
