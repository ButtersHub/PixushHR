import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../ui/index";
import { api } from "./api";
import type { WorkflowSummary } from "./types";

interface Props {
  workflows: WorkflowSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Called after a create or delete so the parent can refresh the workflows list. */
  onChange: () => Promise<void>;
}

/** Left-rail picker — vertical list of workflows + inline '+ New' form + per-row delete. */
export function WorkflowPicker({ workflows, selectedId, onSelect, onChange }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function create() {
    setError("");
    const trimmed = name.trim() || "New workflow";
    const id = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `wf-${Date.now()}`;
    try {
      await api.createWorkflow({
        id,
        name: trimmed,
        trigger: { type: "manual", connector: "manual" },
      });
      setCreating(false);
      setName("");
      await onChange();
      onSelect(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create workflow");
    }
  }

  async function remove(id: string) {
    if (!confirm(`Delete workflow "${id}"?`)) return;
    await api.deleteWorkflow(id);
    await onChange();
  }

  return (
    <aside data-testid="workflow-picker" className="flex w-[180px] flex-shrink-0 flex-col gap-2">
      <p className="px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[--text-tertiary]">
        Workflows
      </p>
      <ul className="space-y-1">
        {workflows.map((w) => {
          const active = w.id === selectedId;
          return (
            <li key={w.id}>
              <div
                className={[
                  "group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                  active ? "bg-[--papaya-50] text-[--text-primary]" : "text-[--text-secondary] hover:bg-[--surface-hover]",
                ].join(" ")}
              >
                {active && (
                  <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[--papaya-500]" />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(w.id)}
                  data-testid={`picker-${w.id}`}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <p className="truncate text-[12.5px] font-medium">{w.name}</p>
                  <p className="truncate text-[10px] text-[--text-tertiary]">
                    {w.trigger?.type ?? "—"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => remove(w.id)}
                  aria-label={`Delete ${w.name}`}
                  data-testid={`picker-delete-${w.id}`}
                  className="text-[--text-tertiary] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[--red-600]"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {creating ? (
        <div className="space-y-2 rounded-lg border border-[--border-default] bg-[--surface-card] p-2">
          <input
            type="text"
            placeholder="Workflow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") { setCreating(false); setName(""); setError(""); } }}
            className="w-full rounded-md border border-[--border-default] bg-[--surface-card] px-2 py-1 text-[12px] text-[--text-primary] focus:border-[--papaya-300] focus:outline-none focus:ring-2 focus:ring-[--papaya-100]"
          />
          {error && <p className="text-[10px] text-[--red-600]">{error}</p>}
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" onClick={create}>Create</Button>
            <Button size="sm" variant="secondary" onClick={() => { setCreating(false); setName(""); setError(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="picker-new"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[--border-default] py-2 text-[12px] text-[--text-tertiary] transition-colors hover:bg-[--surface-hover]"
        >
          <Plus size={12} /> New workflow
        </button>
      )}
    </aside>
  );
}
