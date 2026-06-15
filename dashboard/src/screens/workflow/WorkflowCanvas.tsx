import { Plus, ChevronDown } from "lucide-react";
import { TriggerCard } from "./TriggerCard";
import { ActionCard } from "./ActionCard";
import type { Capability, WorkflowDef, WorkflowNode } from "./types";

interface Props {
  workflow: WorkflowDef;
  capabilities: Capability[];
  /** connectorId → mode ("mock" | "prod") | undefined (= OFF, not installed or disabled). */
  installedModeByConnector: Record<string, "mock" | "prod" | undefined>;
  /** Either "trigger" or a node id. */
  selected: string | null;
  onSelect: (id: string) => void;
  /** Insert a new ActionNode after the given anchor (either "trigger" or a node id). */
  onInsertAfter: (afterId: string | "trigger") => void;
}

/** Vertical chain: TriggerCard → ActionCard → ActionCard → … with insert slots between. */
export function WorkflowCanvas({
  workflow,
  capabilities,
  installedModeByConnector,
  selected,
  onSelect,
  onInsertAfter,
}: Props) {
  // Walk root → next defensively (avoid infinite loops on bad data).
  const order: string[] = [];
  let cur: string | undefined = workflow.root;
  const seen = new Set<string>();
  while (cur && !seen.has(cur) && workflow.nodes[cur]) {
    seen.add(cur);
    order.push(cur);
    const node: WorkflowNode = workflow.nodes[cur];
    cur = node.kind === "action" ? node.next : undefined;
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6" data-testid="workflow-canvas">
      <TriggerCard
        triggerType={workflow.trigger.type}
        connector={workflow.trigger.connector}
        selected={selected === "trigger"}
        onClick={() => onSelect("trigger")}
      />
      <InsertSlot onAdd={() => onInsertAfter("trigger")} />

      {order.map((id, idx) => {
        const node = workflow.nodes[id];
        if (node.kind !== "action") return null;
        const cap = capabilities.find((c) => c.name === node.capability);
        const mode = cap ? installedModeByConnector[cap.connector] : undefined;
        const chip: "MOCK" | "REAL" | "OFF" = !mode
          ? "OFF"
          : cap?.kind === "external-hermes"
            ? "REAL"
            : "MOCK";
        return (
          <div key={id} className="flex flex-col items-center gap-3">
            <ActionCard
              stepNumber={idx + 1}
              capability={cap}
              audience={node.audience}
              selected={selected === id}
              modeChip={chip}
              onClick={() => onSelect(id)}
            />
            <InsertSlot onAdd={() => onInsertAfter(id)} />
          </div>
        );
      })}
    </div>
  );
}

/** Arrow + tiny + button anchored to the right edge that adds a step at this position. */
function InsertSlot({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 280 }}>
      <ChevronDown size={16} className="text-[--text-tertiary]" />
      <button
        type="button"
        onClick={onAdd}
        aria-label="Insert step here"
        className="absolute -right-1 grid h-5 w-5 place-items-center rounded-full border border-[--border-default] bg-[--surface-card] text-[--text-tertiary] hover:border-[--papaya-300] hover:text-[--papaya-600]"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}
