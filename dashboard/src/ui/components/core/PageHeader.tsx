import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** small uppercase label above the title */
  eyebrow?: string;
  eyebrowIcon?: ReactNode;
  title: string;
  subtitle?: string;
  /** right-aligned slot for stats or actions */
  right?: ReactNode;
  /** soft papaya glow in the corner (default true) */
  glow?: boolean;
  className?: string;
}

/**
 * PageHeader — the standard screen header for PixushHR.
 * A title + subtitle band (optionally with an eyebrow and a right-hand slot for stats/actions),
 * set on a card with a soft brand glow. Use at the top of every screen for a consistent feel.
 */
export function PageHeader({ eyebrow, eyebrowIcon, title, subtitle, right, glow = true, className = '' }: PageHeaderProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[--border-default] bg-[--surface-card] shadow-[--shadow-sm] ${className}`}>
      {glow && (
        <div
          className="pointer-events-none absolute -right-8 -top-20 h-72 w-72 rounded-full opacity-[0.15] blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--papaya-500), transparent 70%)' }}
          aria-hidden
        />
      )}
      <div className="relative flex flex-wrap items-end justify-between gap-4 p-6">
        <div className="max-w-2xl">
          {eyebrow && (
            <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-[--papaya-200] bg-[--papaya-50] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[--papaya-600]">
              {eyebrowIcon}
              {eyebrow}
            </div>
          )}
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.03em] text-[--text-primary]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-[--text-secondary]">{subtitle}</p>}
        </div>
        {right && <div className="flex items-stretch gap-2.5">{right}</div>}
      </div>
    </div>
  );
}
