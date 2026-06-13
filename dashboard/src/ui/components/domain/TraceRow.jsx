/**
 * TraceRow — a single step in the live agent execution trace.
 *
 * States: pending, running, success, error, escalated
 *
 * @example
 * <TraceRow status="success" label="Intent resolved" value="onboarding" duration={12} />
 * <TraceRow status="running" label="Calling hris.upsert_employee" />
 * <TraceRow status="error" label="send_message" error="Shapes API timeout" />
 */
export function TraceRow({ status = 'pending', label, value, error, duration, depth = 0, className = '' }) {
  const icons = {
    pending: (
      <svg className="text-[--neutral-400]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
      </svg>
    ),
    running: (
      <svg className="text-[--papaya-500] animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    ),
    success: (
      <svg className="text-[--green-600]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    error: (
      <svg className="text-[--red-600]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
    escalated: (
      <svg className="text-[--amber-600]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  };

  return (
    <div
      className={`flex items-start gap-2.5 py-2 group ${className}`}
      style={{ paddingLeft: `${depth * 20 + 12}px` }}
      role="listitem"
    >
      <span className="mt-0.5 flex-shrink-0" aria-hidden="true">{icons[status]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-mono font-medium text-[--text-primary] truncate">{label}</span>
          {value && (
            <span className="text-xs text-[--text-tertiary] font-mono truncate">→ {value}</span>
          )}
          {duration !== undefined && (
            <span className="ml-auto text-[11px] text-[--text-tertiary] flex-shrink-0">{duration}ms</span>
          )}
        </div>
        {error && (
          <p className="text-xs text-[--red-600] mt-0.5 font-mono">{error}</p>
        )}
      </div>
    </div>
  );
}

/**
 * MessageBubble — an agent or employee message in the Messages panel.
 *
 * @example
 * <MessageBubble
 *   from="agent"
 *   recipient="Maya Cohen"
 *   channel="email"
 *   timestamp="2026-07-01T09:00Z"
 *   content="Welcome to Papaya, Maya — it's genuinely great to have you joining us."
 * />
 */
export function MessageBubble({ from = 'agent', recipient, channel, timestamp, content, redacted = false, className = '' }) {
  const channelIcons = {
    email: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
    ),
    teams: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    slack: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  };

  const isAgent = from === 'agent';

  return (
    <div className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'} gap-1 ${className}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-[--text-secondary]">
          {isAgent ? 'Papaya HR Agent' : recipient || 'Employee'}
        </span>
        {channel && (
          <span className="flex items-center gap-0.5 text-[10px] text-[--text-tertiary]">
            {channelIcons[channel]}
            {channel}
          </span>
        )}
        {recipient && isAgent && (
          <span className="text-[10px] text-[--text-tertiary]">→ {recipient}</span>
        )}
        {timestamp && (
          <time className="text-[10px] text-[--text-tertiary]" dateTime={timestamp}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        )}
      </div>
      <div className={[
        'relative max-w-lg rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed',
        isAgent
          ? 'bg-[--surface-card] border border-[--border-default] text-[--text-primary] rounded-tl-sm'
          : 'bg-[--papaya-50] border border-[--papaya-100] text-[--text-primary] rounded-tr-sm',
        redacted ? 'opacity-60' : '',
      ].join(' ')}>
        {redacted && (
          <span className="absolute -top-2 -right-2 bg-[--amber-50] border border-[--amber-200] text-[--amber-700] text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full">
            scoped
          </span>
        )}
        {content}
      </div>
    </div>
  );
}

/**
 * ConnectorCard — integration catalog card showing a connector.
 *
 * @example
 * <ConnectorCard name="Shapes" type="HRIS" description="Core employee data system" mode="real" installed />
 * <ConnectorCard name="Slack" type="Channel" description="Messaging (available, not seeded)" onInstall={fn} />
 */
export function ConnectorCard({ name, type, description, mode, installed = false, onInstall, onConfigure, icon, className = '' }) {
  const modeConfig = {
    mock: { badge: 'MOCK', color: 'text-[--status-mock-text] bg-[--status-mock-bg] border-[--status-mock-border]' },
    real: { badge: 'REAL', color: 'text-[--status-real-text] bg-[--status-real-bg] border-[--status-real-border]' },
    off: { badge: 'OFF', color: 'text-[--status-off-text] bg-[--status-off-bg] border-[--status-off-border]' },
  };

  return (
    <div className={[
      'group flex flex-col gap-2.5 p-3 rounded-lg border border-[--border-default]',
      'bg-[--surface-card] shadow-[--shadow-xs]',
      'hover:shadow-[--shadow-sm] transition-shadow duration-100',
      className,
    ].join(' ')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon ? (
            <div className="w-7 h-7 rounded border border-[--border-default] bg-[--surface-sunken] flex items-center justify-center text-[--text-secondary] flex-shrink-0">
              {icon}
            </div>
          ) : (
            <div className="w-7 h-7 rounded bg-[--neutral-200] flex-shrink-0 flex items-center justify-center text-[--text-tertiary] text-[10px] font-bold">
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-[13px] font-semibold text-[--text-primary]">{name}</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">{type}</p>
          </div>
        </div>
        {installed && mode && (
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${modeConfig[mode]?.color}`}>
            {modeConfig[mode]?.badge}
          </span>
        )}
      </div>
      <p className="text-xs text-[--text-tertiary] leading-snug">{description}</p>
      <div className="flex gap-2 mt-auto">
        {installed ? (
          <button
            onClick={onConfigure}
            className="flex-1 h-6 text-[11px] font-medium text-[--text-secondary] border border-[--border-default] rounded hover:bg-[--surface-hover] transition-colors"
          >
            Configure
          </button>
        ) : (
          <button
            onClick={onInstall}
            className="flex-1 h-6 text-[11px] font-medium text-[--papaya-600] border border-[--papaya-200] bg-[--papaya-50] rounded hover:bg-[--papaya-100] transition-colors"
          >
            + Install
          </button>
        )}
      </div>
    </div>
  );
}
