/**
 * Button — primary interactive control for PixushHR
 *
 * Use for all triggered actions. Three variants: primary (main CTA),
 * secondary (supporting actions), danger (destructive). Ghost for
 * toolbar/inline contexts. Supports icon-before, icon-after, loading, disabled.
 *
 * @example
 * <Button variant="primary" onClick={trigger}>Trigger scenario</Button>
 * <Button variant="secondary" leftIcon={<RefreshCw size={14}/>}>Reset</Button>
 * <Button variant="danger" loading>Deleting…</Button>
 * <Button variant="ghost" size="sm">Cancel</Button>
 */

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  children,
  onClick,
  type = 'button',
  className = '',
  ...rest
}) {
  const base = [
    'inline-flex items-center justify-center gap-1.5',
    'font-medium rounded select-none',
    'transition-[color,background-color,border-color,box-shadow]',
    'duration-100 cursor-pointer',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'active:scale-[0.98]',
  ].join(' ');

  const variants = {
    primary: [
      'bg-[--interactive-primary] text-[--interactive-primary-text]',
      'hover:bg-[--interactive-primary-hover]',
      'active:bg-[--interactive-primary-active]',
      'focus-visible:ring-[--papaya-500]',
      'border border-[--interactive-primary]',
    ].join(' '),
    secondary: [
      'bg-[--interactive-secondary] text-[--interactive-secondary-text]',
      'border border-[--interactive-secondary-border]',
      'hover:bg-[--interactive-secondary-hover]',
      'active:bg-[--interactive-secondary-active]',
      'focus-visible:ring-[--papaya-500]',
    ].join(' '),
    danger: [
      'bg-[--interactive-danger] text-[--interactive-danger-text]',
      'hover:bg-[--interactive-danger-hover]',
      'active:bg-[--interactive-danger-active]',
      'border border-[--interactive-danger]',
      'focus-visible:ring-[--red-500]',
    ].join(' '),
    ghost: [
      'bg-[--interactive-ghost] text-[--interactive-ghost-text]',
      'hover:bg-[--interactive-ghost-hover]',
      'active:bg-[--interactive-ghost-active]',
      'border border-transparent',
      'focus-visible:ring-[--papaya-500]',
    ].join(' '),
  };

  const sizes = {
    xs: 'h-6 px-2 text-[11px] gap-1',
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-8 px-3 text-[13px]',
    lg: 'h-9 px-4 text-sm',
    xl: 'h-10 px-5 text-base',
  };

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      aria-busy={loading}
      {...rest}
    >
      {loading ? (
        <svg
          className="animate-spin"
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

/**
 * IconButton — square/round icon-only button
 *
 * Always provide aria-label.
 *
 * @example
 * <IconButton aria-label="Close" variant="ghost"><X size={16}/></IconButton>
 */
export function IconButton({
  variant = 'ghost',
  size = 'md',
  disabled = false,
  loading = false,
  children,
  className = '',
  ...rest
}) {
  const base = [
    'inline-flex items-center justify-center',
    'rounded cursor-pointer select-none',
    'transition-[color,background-color,box-shadow] duration-100',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    'focus-visible:ring-[--papaya-500]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'active:scale-95',
  ].join(' ');

  const variants = {
    primary: 'bg-[--interactive-primary] text-white hover:bg-[--interactive-primary-hover]',
    secondary: 'bg-[--interactive-secondary] text-[--text-primary] border border-[--border-default] hover:bg-[--surface-hover]',
    ghost: 'text-[--text-secondary] hover:bg-[--surface-hover] hover:text-[--text-primary]',
    danger: 'text-[--red-600] hover:bg-[--red-50]',
  };

  const sizes = { xs: 'w-5 h-5', sm: 'w-6 h-6', md: 'w-7 h-7', lg: 'w-8 h-8' };

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : children}
    </button>
  );
}
