import { ConnectorIcon, Badge } from "../../ui/index";
import type { Capability } from "./types";

interface Props {
  stepNumber: number;
  /** The Capability metadata for the node's `capability` id, if installed. */
  capability?: Capability;
  audience?: string;
  selected: boolean;
  modeChip: "MOCK" | "REAL" | "OFF";
  onClick: () => void;
}

/** V2 stacked card design (locked in the brainstorm).
 *  Top row: connector logo · "Step N" eyebrow + title · mock/real chip.
 *  Bottom band: connector name · audience.
 */
export function ActionCard({ stepNumber, capability, audience, selected, modeChip, onClick }: Props) {
  const title = capability?.label ?? "Pick an action…";
  const connectorName = capability?.connector ?? "—";
  const chipVariant = modeChip === "REAL" ? "real" : modeChip === "MOCK" ? "mock" : "off";

  return (
    <div
      data-testid={`action-card-${stepNumber}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className={[
        "w-[280px] cursor-pointer overflow-hidden rounded-xl border bg-[--surface-card] transition-all duration-150",
        selected
          ? "border-[--papaya-300] [box-shadow:0_0_0_3px_var(--papaya-100),var(--shadow-md)]"
          : "border-[--border-default] [box-shadow:var(--shadow-xs)] hover:border-[--border-strong] hover:[box-shadow:var(--shadow-sm)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[--surface-sunken] ring-1 ring-[--border-default]">
          {capability && <ConnectorIcon name={capability.connector} kind="logo" size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[--text-tertiary]">
            Step {stepNumber}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-[--text-primary]">
            {title}
          </p>
        </div>
        <Badge variant={chipVariant} size="xs">{modeChip}</Badge>
      </div>
      <div className="flex items-center gap-2 border-t border-[--border-default] bg-[--surface-sunken] px-3 py-1.5 text-[10.5px]">
        <span className="font-medium text-[--text-secondary]">{connectorName}</span>
        {audience && (
          <>
            <span className="text-[--text-tertiary]">·</span>
            <span className="text-[--text-tertiary]">{audience}</span>
          </>
        )}
      </div>
    </div>
  );
}
