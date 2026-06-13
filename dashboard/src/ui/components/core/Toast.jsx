/**
 * Toast — ephemeral feedback notification.
 *
 * Mount a ToastContainer at the app root and call showToast() to add toasts.
 * Each toast auto-dismisses after `duration` ms (default 4000).
 *
 * @example
 * showToast({ message: 'Scenario complete — view the trace for details.', type: 'success' });
 * showToast({ message: "Couldn't reach Shapes — check Integrations.", type: 'error', action: { label: 'Go', onClick: fn } });
 */
export function Toast({ type = 'info', message, action, onDismiss }) {
  const icons = {
    success: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[--green-600] flex-shrink-0">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    error: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[--red-600] flex-shrink-0">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    warning: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[--amber-600] flex-shrink-0">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    info: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[--blue-600] flex-shrink-0">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  };

  const styles = {
    success: 'border-l-[--green-500]',
    error:   'border-l-[--red-500]',
    warning: 'border-l-[--amber-500]',
    info:    'border-l-[--blue-500]',
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'flex items-start gap-2.5 bg-[--surface-card]',
        'border border-[--border-default] border-l-4 rounded-lg',
        'shadow-[--shadow-md] px-3 py-2.5 w-80 max-w-full',
        styles[type],
      ].join(' ')}
    >
      {icons[type]}
      <p className="flex-1 text-[13px] text-[--text-primary] leading-snug">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="flex-shrink-0 text-xs font-semibold text-[--papaya-600] hover:text-[--papaya-700] focus-visible:outline-none focus-visible:underline"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="flex-shrink-0 text-[--text-tertiary] hover:text-[--text-secondary] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[--papaya-500] rounded"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer({ toasts = [], onDismiss }) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <Toast {...t} onDismiss={() => onDismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
