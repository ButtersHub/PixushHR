import { useState, useRef, useEffect, useId, useCallback } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** placeholder when no option matches `value` */
  placeholder?: string;
  /** disables the trigger */
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** menu alignment relative to trigger */
  align?: 'start' | 'end';
  /** className for the trigger button */
  className?: string;
  /** className for the popover menu */
  menuClassName?: string;
  /** ID used for the menu/listbox */
  id?: string;
  /** custom trigger renderer — receives the current option (or undefined) and `open` state */
  renderTrigger?: (current: DropdownOption | undefined, open: boolean) => React.ReactNode;
}

/**
 * Dropdown — custom-styled menu select. Replaces the native `<select>` so the menu matches
 * the PixushHR design system (and looks identical across OSes). Keyboard: ↑/↓ navigate,
 * Enter/Space pick, Esc close. Outside-click closes. Use `renderTrigger` for pill-style triggers.
 */
export function Dropdown({
  value, options, onChange, placeholder = 'Select…',
  disabled = false, size = 'md', align = 'start',
  className = '', menuClassName = '', id, renderTrigger,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const menuId = id ?? `dd-${reactId}`;

  const current = options.find((o) => o.value === value);

  // close on outside click + escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); }
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // focus the active option when menu opens
  useEffect(() => {
    if (open) {
      const idx = Math.max(0, options.findIndex((o) => o.value === value));
      setActiveIdx(idx);
      // bring the active option into view
      requestAnimationFrame(() => {
        const list = listRef.current;
        const el = list?.children[idx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: 'nearest' });
      });
    }
  }, [open, options, value]);

  const pick = useCallback((idx: number) => {
    const o = options[idx];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  }, [options, onChange]);

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(activeIdx);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  const sizeCls = size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-2.5 text-[13px]';

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      {renderTrigger ? (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          onKeyDown={onTriggerKey}
          className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[--papaya-500] focus-visible:rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {renderTrigger(current, open)}
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          onKeyDown={onTriggerKey}
          className={[
            'inline-flex w-full items-center justify-between gap-2 rounded-lg border',
            'bg-[--surface-card] text-[--text-primary] font-medium',
            'transition-colors duration-100 outline-none',
            'focus-visible:ring-2 focus-visible:ring-[--papaya-500] focus-visible:border-[--border-focus]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            open ? 'border-[--border-focus]' : 'border-[--border-default] hover:border-[--border-strong]',
            sizeCls,
          ].join(' ')}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {current?.icon}
            <span className="truncate">{current?.label ?? placeholder}</span>
          </span>
          <ChevronDown size={13} className={`flex-shrink-0 text-[--text-tertiary] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      {open && (
        <ul
          ref={listRef}
          id={menuId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${menuId}-opt-${activeIdx}`}
          onKeyDown={onMenuKey}
          className={[
            'absolute z-50 mt-1.5 max-h-72 min-w-full overflow-y-auto rounded-xl border border-[--border-default]',
            'bg-[--surface-card] p-1 [box-shadow:var(--shadow-lg)]',
            'animate-[fade-in_120ms_ease-out] origin-top',
            align === 'end' ? 'right-0' : 'left-0',
            menuClassName,
          ].join(' ')}
          // give it focus so arrow keys work right after open
          autoFocus
          onMouseDownCapture={(e) => e.preventDefault() /* keep focus on trigger */}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            const active = i === activeIdx;
            return (
              <li
                key={o.value}
                id={`${menuId}-opt-${i}`}
                role="option"
                aria-selected={selected}
                aria-disabled={o.disabled}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pick(i)}
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]',
                  o.disabled
                    ? 'cursor-not-allowed opacity-50'
                    : active
                    ? 'bg-[--surface-hover] text-[--text-primary]'
                    : 'text-[--text-primary]',
                ].join(' ')}
              >
                {o.icon && <span className="flex-shrink-0 text-[--text-secondary]">{o.icon}</span>}
                <div className="min-w-0 flex-1">
                  <p className="truncate">{o.label}</p>
                  {o.description && <p className="truncate text-[11px] text-[--text-tertiary]">{o.description}</p>}
                </div>
                {selected && <Check size={13} className="flex-shrink-0 text-[--papaya-600]" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
