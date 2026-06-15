import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dropdown, Button } from "../../ui/index";
import { api } from "./api";
import type { WorkflowSummary } from "./types";

interface Props {
  workflows: WorkflowSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Called after a create or delete so the parent can refresh the workflows list. */
  onChange: () => Promise<void>;
}

/** Top-row picker — dropdown + inline create + delete icon buttons. */
export function WorkflowPicker({ workflows, selectedId, onSelect, onChange }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const selected = workflows.find((w) => w.id === selectedId) ?? null;

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

  async function remove() {
    if (!selected) return;
    if (!confirm(`Delete workflow "${selected.name}"?`)) return;
    await api.deleteWorkflow(selected.id);
    await onChange();
    const next = workflows.find((w) => w.id !== selected.id);
    if (next) onSelect(next.id);
  }

  return (
    <div data-testid="workflow-picker" className="flex flex-wrap items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[--text-tertiary]">
        Workflow
      </span>

      <Dropdown
        value={selectedId ?? ""}
        onChange={(v) => onSelect(v)}
        options={workflows.map((w) => ({
          value: w.id,
          label: `${w.name} · ${w.trigger?.type ?? "—"}`,
        }))}
        className="min-w-[260px]"
      />

      <Button
        size="sm"
        variant="secondary"
        onClick={() => setCreating((c) => !c)}
        data-testid="picker-new"
      >
        <Plus size={12} /> New
      </Button>

      {selected && (
        <Button
          size="sm"
          variant="ghost"
          onClick={remove}
          data-testid={`picker-delete-${selected.id}`}
          aria-label={`Delete ${selected.name}`}
        >
          <Trash2 size={12} /> Delete
        </Button>
      )}

      {/* Hidden testid anchors so e2e specs can target a specific workflow without driving
       *  the Dropdown popover, which is harder to script in headless mode. */}
      <div className="sr-only">
        {workflows.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onSelect(w.id)}
            data-testid={`picker-${w.id}`}
          >
            {w.name}
          </button>
        ))}
      </div>

      {creating && (
        <div className="flex items-center gap-2 rounded-lg border border-[--border-default] bg-[--surface-card] px-2 py-1.5">
          <input
            type="text"
            placeholder="New workflow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") { setCreating(false); setName(""); setError(""); }
            }}
            className="w-[180px] rounded-md border border-[--border-default] bg-[--surface-card] px-2 py-1 text-[12px] text-[--text-primary] focus:border-[--papaya-300] focus:outline-none focus:ring-2 focus:ring-[--papaya-100]"
          />
          <Button size="sm" variant="primary" onClick={create}>Create</Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setName(""); setError(""); }}>Cancel</Button>
          {error && <span className="text-[11px] text-[--red-600]">{error}</span>}
        </div>
      )}
    </div>
  );
}
