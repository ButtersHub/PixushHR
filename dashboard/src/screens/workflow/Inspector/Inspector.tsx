import { Card, CardHeader } from "../../../ui/index";
import { TriggerInspector } from "./TriggerInspector";
import { ActionInspector } from "./ActionInspector";
import type {
  ActionNode,
  AuditEntry,
  Capability,
  TriggerCatalog,
  WorkflowDef,
  WorkflowNode,
} from "../types";

interface Props {
  workflow: WorkflowDef;
  /** Either "trigger" or a node id (or null when nothing selected). */
  selected: string | null;
  capabilities: Capability[];
  triggers: TriggerCatalog[];
  installedConnectors: Set<string>;
  onWorkflowChange: (wf: WorkflowDef) => void;
  /** Most recent run's audit entries — used to surface last-run output per capability. */
  lastRunAudit?: AuditEntry[];
}

/** Right-rail inspector. Dispatches between trigger and action editing based on selection. */
export function Inspector({
  workflow,
  selected,
  capabilities,
  triggers,
  installedConnectors,
  onWorkflowChange,
  lastRunAudit,
}: Props) {
  const headerTitle =
    selected === "trigger" ? "Trigger" :
    selected ? "Action" :
    "Inspector";
  const headerSubtitle = selected ?? "Select a card to edit it";

  return (
    <Card className="w-[320px] flex-shrink-0" data-testid="inspector">
      <CardHeader title={headerTitle} subtitle={headerSubtitle} />

      {selected === "trigger" && (
        <TriggerInspector
          trigger={workflow.trigger}
          triggers={triggers}
          onChange={(t) => onWorkflowChange({ ...workflow, trigger: t })}
        />
      )}

      {selected && selected !== "trigger" && isActionNode(workflow.nodes[selected]) && (
        <ActionInspector
          node={workflow.nodes[selected] as ActionNode}
          capabilities={capabilities}
          installedConnectors={installedConnectors}
          onChange={(patch) =>
            onWorkflowChange({
              ...workflow,
              nodes: {
                ...workflow.nodes,
                [selected]: { ...workflow.nodes[selected], ...patch } as ActionNode,
              },
            })
          }
          lastRunOutput={lastRunOutputFor(workflow.nodes[selected] as ActionNode, lastRunAudit)}
        />
      )}

      {!selected && (
        <p className="p-4 text-[12px] text-[--text-tertiary]">
          Click a card in the canvas to edit it.
        </p>
      )}
    </Card>
  );
}

function isActionNode(n: WorkflowNode | undefined): n is ActionNode {
  return !!n && n.kind === "action";
}

function lastRunOutputFor(node: ActionNode, audit?: AuditEntry[]): unknown {
  if (!audit) return undefined;
  // The most recent entry for this node's capability.
  const match = [...audit].reverse().find((e) => e.capability === node.capability);
  return match?.outputs;
}
