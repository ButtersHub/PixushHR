import { ConnectorIcon, Badge } from "../../ui/index";

interface Props {
  triggerType: string;
  connector: string;
  selected: boolean;
  onClick: () => void;
}

/** Trigger card — V2 stacked variant with the papaya gradient to mark it apart from action cards.
 *  Renders the first row of the canvas. Inspector adapts to trigger fields when selected. */
export function TriggerCard({ triggerType, connector, selected, onClick }: Props) {
  return (
    <div
      data-testid="trigger-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className={[
        "w-[280px] cursor-pointer overflow-hidden rounded-xl border bg-gradient-to-b from-[--papaya-50] to-[--surface-card] transition-all duration-150",
        selected
          ? "border-[--papaya-300] [box-shadow:0_0_0_3px_var(--papaya-100),var(--shadow-md)]"
          : "border-[--papaya-200] [box-shadow:var(--shadow-xs)] hover:[box-shadow:var(--shadow-sm)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white ring-1 ring-[--papaya-200] [box-shadow:var(--shadow-xs)]">
          <ConnectorIcon name={connector} kind="logo" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[--papaya-600]">
            Trigger
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-[--text-primary]">
            {triggerType}
          </p>
        </div>
        <Badge variant="accent" size="xs">TRIG</Badge>
      </div>
      <div className="flex items-center gap-2 border-t border-[--papaya-200] bg-white/60 px-3 py-1.5 text-[10.5px]">
        <span className="font-medium text-[--text-secondary]">{connector}</span>
      </div>
    </div>
  );
}
