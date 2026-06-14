/**
 * Card — content container for PixushHR panels.
 *
 * @example
 * <Card>
 *   <CardHeader title="Audit Log" action={<Button size="sm">Export</Button>} />
 *   <CardBody>…</CardBody>
 * </Card>
 */
export function Card({ children, className = '', padding = true, ...rest }) {
  return (
    <div
      className={[
        'bg-[--surface-card] border border-[--border-default] rounded-lg',
        '[box-shadow:var(--shadow-sm)]',
        padding ? 'p-4' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-[--text-primary] truncate">{title}</h3>
        {subtitle && (
          <p className="text-xs text-[--text-tertiary] mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`text-[13px] text-[--text-secondary] ${className}`}>{children}</div>;
}

export function CardDivider() {
  return <hr className="border-[--border-default] -mx-4 my-3" />;
}

/**
 * KeyValueRow — horizontal key → value display
 *
 * @example
 * <KeyValueRow label="Employee ID" value="e1" />
 * <KeyValueRow label="Start date" value="2026-07-01" mono />
 * <KeyValueRow label="Status" value={<Badge variant="success">Active</Badge>} />
 */
export function KeyValueRow({ label, value, mono = false, className = '' }) {
  return (
    <div className={`flex items-baseline gap-3 py-1.5 border-b border-[--border-default] last:border-0 ${className}`}>
      <dt className="w-32 flex-shrink-0 text-xs text-[--text-tertiary] truncate">{label}</dt>
      <dd className={`flex-1 min-w-0 text-[13px] text-[--text-primary] ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

/**
 * KeyValueList — wraps multiple KeyValueRow items
 *
 * @example
 * <KeyValueList rows={[{label:'Tenant',value:'papaya'},{label:'Role',value:'Engineer'}]} />
 */
export function KeyValueList({ rows = [], className = '' }) {
  return (
    <dl className={`${className}`}>
      {rows.map((row, i) => (
        <KeyValueRow key={i} {...row} />
      ))}
    </dl>
  );
}
