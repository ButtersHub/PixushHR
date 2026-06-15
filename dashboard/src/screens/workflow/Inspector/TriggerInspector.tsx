import { useMemo } from "react";
import { Dropdown } from "../../../ui/index";
import type { TriggerCatalog, TriggerDef } from "../types";

interface Props {
  trigger: TriggerDef;
  triggers: TriggerCatalog[];
  onChange: (t: TriggerDef) => void;
}

/** When the TriggerCard is selected. Connector + trigger dropdowns, read-only sample payload. */
export function TriggerInspector({ trigger, triggers, onChange }: Props) {
  const connectors = useMemo(
    () => Array.from(new Set(triggers.map((t) => t.connector))),
    [triggers],
  );
  const triggersForConnector = triggers.filter((t) => t.connector === trigger.connector);

  return (
    <div className="space-y-3 p-4 text-[13px]">
      <Section label="Connector">
        <Dropdown
          value={trigger.connector}
          onChange={(v) => {
            const firstTrigger = triggers.find((t) => t.connector === v);
            onChange({ ...trigger, connector: v, type: firstTrigger?.name ?? trigger.type });
          }}
          options={connectors.map((c) => ({ value: c, label: c }))}
          className="w-full"
        />
      </Section>

      <Section label="Trigger">
        <Dropdown
          value={trigger.type}
          onChange={(v) => onChange({ ...trigger, type: v })}
          options={triggersForConnector.map((t) => ({ value: t.name, label: t.label }))}
          className="w-full"
        />
        {triggersForConnector.length === 0 && (
          <p className="mt-1 text-[11px] text-[--text-tertiary]">
            No triggers available for this connector.
          </p>
        )}
      </Section>

      <Section label="Sample payload">
        <pre
          className="max-h-48 overflow-auto rounded border border-[--border-default] bg-[--surface-sunken] p-2 text-[11px] text-[--text-secondary]"
          data-testid="trigger-sample"
        >
{JSON.stringify(trigger.sample ?? {}, null, 2)}
        </pre>
        <p className="mt-1 text-[10px] text-[--text-tertiary]">
          Read-only — this is what the Test Flow drawer will fire.
        </p>
      </Section>
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
