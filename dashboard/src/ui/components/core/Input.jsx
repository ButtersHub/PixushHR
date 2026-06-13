/**
 * Input — text, number, and search fields for PixushHR.
 *
 * @example
 * <Input placeholder="Search audit log…" leftIcon={<Search size={14}/>} />
 * <Input type="number" label="Timeout (s)" value={120} />
 * <Input error="Required field" label="Employee ID" />
 */
export function Input({
  type = 'text',
  label,
  hint,
  error,
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  size = 'md',
  className = '',
  id,
  ...rest
}) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g,'-')}` : undefined);

  const base = [
    'w-full bg-[--surface-card] text-[--text-primary]',
    'border rounded outline-none',
    'font-[family-name:var(--font-sans)]',
    'placeholder:text-[--text-tertiary]',
    'transition-[border-color,box-shadow] duration-100',
    'focus-visible:ring-2 focus-visible:ring-[--papaya-500] focus-visible:ring-offset-0',
    'focus-visible:border-[--border-focus]',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[--surface-sunken]',
  ].join(' ');

  const borderClass = error
    ? 'border-[--border-danger] focus-visible:ring-[--red-500]'
    : 'border-[--border-default] hover:border-[--border-strong]';

  const sizes = {
    sm: 'h-7 text-xs',
    md: 'h-8 text-[13px]',
    lg: 'h-9 text-sm',
  };
  const paddings = {
    sm: leftIcon ? 'pl-6 pr-2' : rightIcon ? 'pl-2.5 pr-6' : 'px-2.5',
    md: leftIcon ? 'pl-8 pr-3' : rightIcon ? 'pl-3 pr-8' : 'px-3',
    lg: leftIcon ? 'pl-9 pr-3.5' : rightIcon ? 'pl-3.5 pr-9' : 'px-3.5',
  };

  const iconSizes = { sm: 'w-3 h-3', md: 'w-3.5 h-3.5', lg: 'w-4 h-4' };
  const iconOffset = { sm: 'left-2', md: 'left-2.5', lg: 'left-2.5' };
  const iconOffsetR = { sm: 'right-2', md: 'right-2.5', lg: 'right-2.5' };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[--text-secondary] select-none">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className={`absolute top-1/2 -translate-y-1/2 ${iconOffset[size]} text-[--text-tertiary] pointer-events-none ${iconSizes[size]}`}
            aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          type={type}
          disabled={disabled || loading}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={`${base} ${borderClass} ${sizes[size]} ${paddings[size]}`}
          {...rest}
        />
        {rightIcon && !loading && (
          <span className={`absolute top-1/2 -translate-y-1/2 ${iconOffsetR[size]} text-[--text-tertiary] pointer-events-none ${iconSizes[size]}`}
            aria-hidden="true">
            {rightIcon}
          </span>
        )}
        {loading && (
          <span className={`absolute top-1/2 -translate-y-1/2 ${iconOffsetR[size]} text-[--text-tertiary]`}>
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </span>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-[11px] text-[--text-danger]" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="text-[11px] text-[--text-tertiary]">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Textarea — multi-line text input
 *
 * @example
 * <Textarea label="Task" rows={3} placeholder="Onboard Maya Cohen…" />
 */
export function Textarea({ label, hint, error, disabled, rows = 4, id, className = '', ...rest }) {
  const inputId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g,'-')}` : undefined);
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[--text-secondary] select-none">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        disabled={disabled}
        aria-invalid={!!error}
        className={[
          'w-full bg-[--surface-card] text-[--text-primary] text-[13px]',
          'border rounded px-3 py-2 resize-y outline-none',
          'font-[family-name:var(--font-sans)]',
          'placeholder:text-[--text-tertiary]',
          'transition-[border-color,box-shadow] duration-100',
          'focus-visible:ring-2 focus-visible:ring-[--papaya-500] focus-visible:border-[--border-focus]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[--surface-sunken]',
          error ? 'border-[--border-danger]' : 'border-[--border-default] hover:border-[--border-strong]',
        ].join(' ')}
        {...rest}
      />
      {error && <p className="text-[11px] text-[--text-danger]">{error}</p>}
      {!error && hint && <p className="text-[11px] text-[--text-tertiary]">{hint}</p>}
    </div>
  );
}

/**
 * Select — styled native select
 *
 * @example
 * <Select label="Infra" options={[{value:'hermes',label:'Hermes'},{value:'openclaw',label:'OpenClaw'}]} />
 */
export function Select({ label, hint, error, options = [], disabled, size = 'md', id, className = '', ...rest }) {
  const inputId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g,'-')}` : undefined);
  const sizes = { sm: 'h-7 text-xs', md: 'h-8 text-[13px]', lg: 'h-9 text-sm' };
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[--text-secondary] select-none">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={inputId}
          disabled={disabled}
          className={[
            'w-full appearance-none bg-[--surface-card] text-[--text-primary]',
            'border rounded pl-3 pr-7 outline-none cursor-pointer',
            'font-[family-name:var(--font-sans)]',
            'transition-[border-color,box-shadow] duration-100',
            'focus-visible:ring-2 focus-visible:ring-[--papaya-500] focus-visible:border-[--border-focus]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-[--border-danger]' : 'border-[--border-default] hover:border-[--border-strong]',
            sizes[size],
          ].join(' ')}
          {...rest}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[--text-tertiary]" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
      {error && <p className="text-[11px] text-[--text-danger]">{error}</p>}
      {!error && hint && <p className="text-[11px] text-[--text-tertiary]">{hint}</p>}
    </div>
  );
}

/**
 * Toggle — switch/checkbox toggle with ARIA
 *
 * @example
 * <Toggle checked={memoryMode} onChange={setMemoryMode} label="MEMORY_MODE" />
 */
export function Toggle({ checked = false, onChange, label, disabled = false, size = 'md' }) {
  const id = label ? `toggle-${label.toLowerCase().replace(/\s+/g,'-')}` : undefined;
  const sizes = {
    sm: { track: 'w-7 h-4', thumb: 'w-3 h-3', translate: 'translate-x-3' },
    md: { track: 'w-9 h-5', thumb: 'w-3.5 h-3.5', translate: 'translate-x-4' },
    lg: { track: 'w-11 h-6', thumb: 'w-4.5 h-4.5', translate: 'translate-x-5' },
  };
  const s = sizes[size];

  return (
    <label
      className={`inline-flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      htmlFor={id}
    >
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange?.(!checked)}
        className={[
          `relative inline-flex flex-shrink-0 ${s.track} rounded-full`,
          'transition-colors duration-150 ease-standard',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[--papaya-500]',
          checked ? 'bg-[--papaya-500]' : 'bg-[--neutral-300]',
        ].join(' ')}
      >
        <span className={[
          `absolute top-0.5 left-0.5 rounded-full bg-white shadow-sm`,
          `${s.thumb} transition-transform duration-150 ease-spring`,
          checked ? s.translate : 'translate-x-0',
        ].join(' ')} aria-hidden="true" />
      </button>
      {label && (
        <span className="text-[13px] font-medium text-[--text-secondary]">{label}</span>
      )}
    </label>
  );
}
