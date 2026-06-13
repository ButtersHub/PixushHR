/**
 * EmptyState — placeholder for empty panels and lists.
 *
 * @example
 * <EmptyState icon={<MessageSquare/>} title="No messages yet" description="Run a scenario to see agent communications here." />
 */
/** Re-export namespace for bundler */
export const States = 'feedback-states';

export function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`} role="status">
      {icon && (
        <div className="w-10 h-10 rounded-full bg-[--surface-sunken] flex items-center justify-center text-[--text-tertiary] mb-3" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-[--text-secondary]">{title}</p>
      {description && (
        <p className="text-xs text-[--text-tertiary] mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * LoadingState — skeleton or spinner placeholder.
 *
 * @example
 * <LoadingState rows={3} />
 * <LoadingState type="spinner" message="Connecting to Shapes…" />
 */
export function LoadingState({ type = 'skeleton', rows = 4, message, className = '' }) {
  if (type === 'spinner') {
    return (
      <div className={`flex flex-col items-center justify-center py-12 gap-3 ${className}`} role="status" aria-label={message || 'Loading'}>
        <svg className="animate-spin text-[--papaya-500]" width="24" height="24" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        {message && <p className="text-[13px] text-[--text-tertiary]">{message}</p>}
      </div>
    );
  }
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <div className="h-3 rounded animate-pulse bg-[--neutral-200]" style={{ width: `${30 + (i % 3) * 20}%` }} />
          <div className="h-3 rounded animate-pulse bg-[--neutral-200] flex-1" />
        </div>
      ))}
    </div>
  );
}

/**
 * ErrorState — error messaging with optional retry action.
 *
 * @example
 * <ErrorState title="Couldn't reach Shapes" description="Check the connection in Integrations and try again." onRetry={reload} />
 */
export function ErrorState({ title = 'Something went wrong', description, onRetry, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`} role="alert">
      <div className="w-10 h-10 rounded-full bg-[--red-50] flex items-center justify-center text-[--red-500] mb-3" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p className="text-sm font-medium text-[--text-primary]">{title}</p>
      {description && (
        <p className="text-xs text-[--text-tertiary] mt-1 max-w-xs">{description}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-[13px] font-medium text-[--papaya-600] hover:text-[--papaya-700] focus-visible:outline-none focus-visible:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * StreamingState — shows agent is actively running/generating.
 *
 * @example
 * <StreamingState label="Agent is running…" step="Calling hris.upsert_employee" />
 */
export function StreamingState({ label = 'Running…', step, className = '' }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${className}`} role="status" aria-label={label}>
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[--papaya-500] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
          />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[--text-primary]">{label}</p>
        {step && (
          <p className="text-xs font-mono text-[--text-tertiary] truncate mt-0.5">{step}</p>
        )}
      </div>
    </div>
  );
}
