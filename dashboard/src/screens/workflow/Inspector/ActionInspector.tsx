import { useState } from "react";
import { Dropdown, Badge } from "../../../ui/index";
import { SchemaTree } from "./SchemaTree";
import type { ActionNode, Audience, Capability } from "../types";

interface Props {
  node: ActionNode;
  capabilities: Capability[];
  installedConnectors: Set<string>;
  onChange: (patch: Partial<ActionNode>) => void;
  /** Optional outputs from the most recent run for this node's capability. */
  lastRunOutput?: unknown;
}

const AUDIENCES: Array<{ value: ""; label: string } | { value: Audience; label: string }> = [
  { value: "",         label: "No audience" },
  { value: "employee", label: "Employee" },
  { value: "manager",  label: "Manager" },
  { value: "hr",       label: "HR" },
  { value: "team",     label: "Team" },
];

/** When an ActionCard is selected. Action picker + audience + Inputs/Output schema-trees. */
export function ActionInspector({ node, capabilities, installedConnectors, onChange, lastRunOutput }: Props) {
  const cap = capabilities.find((c) => c.name === node.capability);
  const [outputMode, setOutputMode] = useState<"schema" | "last-run">("schema");

  const actionOptions = capabilities.map((c) => {
    const available = installedConnectors.has(c.connector);
    return {
      value: c.name,
      label: available ? c.label : `${c.label} · install ${c.connector}`,
      disabled: !available,
    };
  });

  return (
    <div className="space-y-3 p-4 text-[13px]">
      <Section label="Action">
        <Dropdown
          value={node.capability}
          onChange={(v) => onChange({ capability: v, input: {} })}
          options={actionOptions}
          className="w-full"
        />
        {cap?.kind === "external-hermes" && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-[--green-50] p-2 text-[11px] text-[--green-700] ring-1 ring-[--green-200]">
            <Badge variant="real" size="xs">REAL</Badge>
            <span className="leading-snug">
              Sent by the agent via its native gateway. The engine records the side-effect after the send.
            </span>
          </div>
        )}
      </Section>

      <Section label="Audience">
        <Dropdown
          value={node.audience ?? ""}
          onChange={(v) => onChange({ audience: (v || undefined) as ActionNode["audience"] })}
          options={AUDIENCES}
          className="w-full"
        />
      </Section>

      <Section label="Inputs">
        {cap ? (
          <SchemaTree node={cap.inputSchema} bindings={node.input} />
        ) : (
          <p className="text-[11px] text-[--text-tertiary]">Pick an action above.</p>
        )}
      </Section>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">
            Output
          </p>
          <div className="inline-flex rounded-md border border-[--border-default] bg-[--surface-sunken] p-0.5 text-[10px]">
            {(["schema", "last-run"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setOutputMode(m)}
                className={`rounded px-2 py-0.5 ${
                  outputMode === m
                    ? "bg-[--surface-card] text-[--text-primary]"
                    : "text-[--text-tertiary]"
                }`}
              >
                {m === "schema" ? "Schema" : "Last run"}
              </button>
            ))}
          </div>
        </div>
        {outputMode === "schema" && cap && <SchemaTree node={cap.outputSchema} />}
        {outputMode === "last-run" && (
          lastRunOutput
            ? <pre className="max-h-56 overflow-auto rounded border border-[--border-default] bg-[--surface-sunken] p-2 text-[11px]">{JSON.stringify(lastRunOutput, null, 2)}</pre>
            : <p className="text-[11px] text-[--text-tertiary]">No run yet for this step.</p>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">
        {label}
      </p>
      {children}
    </div>
  );
}
