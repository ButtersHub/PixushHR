/**
 * FlowNode — workflow canvas node for PixushHR's visual flow editor.
 *
 * Four variants matching the WorkflowDefinition model:
 * - trigger: entry point (green)
 * - action: capability call (blue)
 * - condition: branching logic (amber)
 * - escalate: human handoff (red)
 *
 * @example
 * <FlowNode variant="trigger" title="New hire confirmed" subtitle="Source: Comeet" />
 * <FlowNode variant="action" title="Upsert employee" subtitle="hris.upsert_employee" selected />
 * <FlowNode variant="condition" title="Has manager?" />
 * <FlowNode variant="escalate" title="Escalate to HR" subtitle="missing required fields" />
 */
export function FlowNode({ variant = 'action', title, subtitle, selected = false, onClick, className = '' }) {
  const configs = {
    trigger: {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      ),
      dot: 'bg-[--green-500]',
      border: selected ? 'border-[--green-500]' : 'border-[--green-200]',
      bg: selected ? 'bg-[--green-50]' : 'bg-[--surface-card]',
      iconBg: 'bg-[--green-50] text-[--green-700]',
      label: 'TRIGGER',
      labelColor: 'text-[--green-700]',
    },
    action: {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>
        </svg>
      ),
      dot: 'bg-[--blue-500]',
      border: selected ? 'border-[--blue-500]' : 'border-[--blue-200]',
      bg: selected ? 'bg-[--blue-50]' : 'bg-[--surface-card]',
      iconBg: 'bg-[--blue-50] text-[--blue-700]',
      label: 'ACTION',
      labelColor: 'text-[--blue-700]',
    },
    condition: {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      ),
      dot: 'bg-[--amber-500]',
      border: selected ? 'border-[--amber-500]' : 'border-[--amber-200]',
      bg: selected ? 'bg-[--amber-50]' : 'bg-[--surface-card]',
      iconBg: 'bg-[--amber-50] text-[--amber-700]',
      label: 'CONDITION',
      labelColor: 'text-[--amber-700]',
    },
    escalate: {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
      dot: 'bg-[--red-500]',
      border: selected ? 'border-[--red-500]' : 'border-[--red-200]',
      bg: selected ? 'bg-[--red-50]' : 'bg-[--surface-card]',
      iconBg: 'bg-[--red-50] text-[--red-700]',
      label: 'ESCALATE',
      labelColor: 'text-[--red-700]',
    },
  };

  const c = configs[variant];

  return (
    <button
      onClick={onClick}
      className={[
        'group relative flex items-start gap-2.5 text-left',
        'w-56 rounded-lg border-2 p-3',
        'transition-all duration-100',
        'hover:[box-shadow:var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--papaya-500]',
        c.border, c.bg,
        selected ? '[box-shadow:var(--shadow-base)]' : '[box-shadow:var(--shadow-xs)]',
        className,
      ].join(' ')}
      aria-pressed={selected}
    >
      <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${c.iconBg}`} aria-hidden="true">
        {c.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.08em] mb-0.5 ${c.labelColor}`}>{c.label}</p>
        <p className="text-[13px] font-medium text-[--text-primary] leading-snug truncate">{title}</p>
        {subtitle && (
          <p className="text-[11px] font-mono text-[--text-tertiary] truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {/* Connection handle */}
      <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[--surface-card] ${c.dot}`} aria-hidden="true" />
    </button>
  );
}

/**
 * BranchConnector — vertical/branching line between flow nodes.
 */
export function BranchConnector({ label, variant = 'default' }) {
  const colors = {
    default: 'border-[--border-default]',
    then: 'border-[--green-300]',
    else: 'border-[--red-300]',
  };
  const textColors = {
    default: 'text-[--text-tertiary]',
    then: 'text-[--green-700]',
    else: 'text-[--red-700]',
  };
  return (
    <div className="flex flex-col items-center">
      <div className={`w-0 h-6 border-l-2 border-dashed ${colors[variant]}`} aria-hidden="true" />
      {label && (
        <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${textColors[variant]} my-0.5`}>
          {label}
        </span>
      )}
      <div className={`w-0 h-6 border-l-2 border-dashed ${colors[variant]}`} aria-hidden="true" />
    </div>
  );
}

/**
 * BindingPill — shows how an input field's value is bound.
 *
 * Three variants:
 * - literal: a hardcoded string/number value (neutral)
 * - data-ref: reference to upstream data (blue)
 * - agent: the AI fills this at runtime (amber)
 *
 * @example
 * <BindingPill variant="literal" value="papaya" />
 * <BindingPill variant="data-ref" value="trigger.payload.employeeId" />
 * <BindingPill variant="agent" value="agent-filled" />
 */
export function BindingPill({ variant = 'literal', value, field, className = '' }) {
  const configs = {
    literal: {
      icon: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16"/>
        </svg>
      ),
      bg: 'bg-[--neutral-100]',
      border: 'border-[--neutral-300]',
      text: 'text-[--neutral-700]',
      label: 'literal',
    },
    'data-ref': {
      icon: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      ),
      bg: 'bg-[--blue-50]',
      border: 'border-[--blue-200]',
      text: 'text-[--blue-700]',
      label: 'ref',
    },
    agent: {
      icon: (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      ),
      bg: 'bg-[--amber-50]',
      border: 'border-[--amber-200]',
      text: 'text-[--amber-700]',
      label: 'agent',
    },
  };

  const c = configs[variant];

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2 h-5',
        c.bg, c.border, c.text, className,
      ].join(' ')}
      aria-label={`${field ? field + ': ' : ''}${c.label} binding — ${value}`}
    >
      <span aria-hidden="true">{c.icon}</span>
      <span className="text-[11px] font-mono font-medium leading-none truncate max-w-[10rem]">{value}</span>
    </span>
  );
}
