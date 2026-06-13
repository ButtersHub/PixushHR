/**
 * Badge — compact label for statuses, counts, and categories.
 *
 * Use Badge for semantic status (success/warning/danger/info) and
 * StatusDot for the three integration modes (mock/real/off) and health.
 *
 * @example
 * <Badge variant="success">Completed</Badge>
 * <Badge variant="warning" size="sm">Escalated</Badge>
 * <Badge dot variant="danger">Error</Badge>
 */
export function Badge({
  variant = 'neutral',
  size = 'md',
  dot = false,
  pill = false,
  children,
  className = '',
}) {
  const base = 'inline-flex items-center gap-1 font-semibold uppercase tracking-[0.06em] leading-none whitespace-nowrap';

  const variants = {
    neutral:  'bg-[--neutral-100] text-[--neutral-700] border border-[--neutral-200]',
    success:  'bg-[--green-50]   text-[--green-700]   border border-[--green-200]',
    info:     'bg-[--blue-50]    text-[--blue-700]    border border-[--blue-200]',
    warning:  'bg-[--amber-50]   text-[--amber-700]   border border-[--amber-200]',
    danger:   'bg-[--red-50]     text-[--red-700]     border border-[--red-200]',
    accent:   'bg-[--papaya-50]  text-[--papaya-700]  border border-[--papaya-200]',
    mock:     'bg-[--status-mock-bg]  text-[--status-mock-text]  border border-[--status-mock-border]',
    real:     'bg-[--status-real-bg]  text-[--status-real-text]  border border-[--status-real-border]',
    off:      'bg-[--status-off-bg]   text-[--status-off-text]   border border-[--status-off-border]',
  };

  const sizes = {
    xs: 'text-[9px] px-1 h-4',
    sm: 'text-[10px] px-1.5 h-4.5',
    md: 'text-[10px] px-1.5 h-5',
    lg: 'text-[11px] px-2 h-6',
  };

  const dotColors = {
    neutral: 'bg-[--neutral-400]',
    success: 'bg-[--green-500]',
    info:    'bg-[--blue-500]',
    warning: 'bg-[--amber-500]',
    danger:  'bg-[--red-500]',
    accent:  'bg-[--papaya-500]',
    mock:    'bg-[--status-mock-base]',
    real:    'bg-[--status-real-base]',
    off:     'bg-[--status-off-base]',
  };

  const radius = pill ? 'rounded-full' : 'rounded';

  return (
    <span className={`${base} ${variants[variant]} ${sizes[size]} ${radius} ${className}`}>
      {dot && (
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/**
 * StatusDot — visual indicator for integration mode and health.
 *
 * @example
 * <StatusDot mode="mock" label="Shapes" />
 * <StatusDot health="warn" label="Agent" />
 * <StatusDot mode="real" />
 */
export function StatusDot({ mode, health, label, size = 'md', showLabel = true }) {
  const colorMap = {
    mock:  'bg-[--status-mock-base]',
    real:  'bg-[--status-real-base]',
    off:   'bg-[--status-off-base]',
    ok:    'bg-[--health-ok-base]',
    warn:  'bg-[--health-warn-base]',
    down:  'bg-[--health-down-base]',
  };

  const textMap = {
    mock:  'text-[--status-mock-text]',
    real:  'text-[--status-real-text]',
    off:   'text-[--status-off-text]',
    ok:    'text-[--health-ok-text]',
    warn:  'text-[--health-warn-text]',
    down:  'text-[--health-down-text]',
  };

  const key = mode || health;

  const sizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  const textSizes = { sm: 'text-[11px]', md: 'text-xs', lg: 'text-[13px]' };

  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="status"
      aria-label={`${key}${label ? `: ${label}` : ''}`}
    >
      <span
        className={`rounded-full flex-shrink-0 ${sizes[size]} ${colorMap[key]}`}
        aria-hidden="true"
      />
      {showLabel && label && (
        <span className={`font-medium ${textSizes[size]} ${textMap[key]}`}>
          {label}
        </span>
      )}
    </span>
  );
}
