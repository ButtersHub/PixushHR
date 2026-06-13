/**
 * Table — sortable, filterable data table for PixushHR.
 *
 * @example
 * <Table
 *   columns={[{key:'ts',label:'Time',sortable:true},{key:'capability',label:'Capability'},{key:'summary',label:'Summary'}]}
 *   rows={auditEntries}
 * />
 */
export function Table({
  columns = [],
  rows = [],
  sortKey,
  sortDir = 'asc',
  onSort,
  loading = false,
  empty,
  className = '',
}) {
  return (
    <div className={`w-full overflow-x-auto rounded-lg border border-[--border-default] ${className}`}>
      <table className="w-full text-[13px] border-collapse" role="grid">
        <thead>
          <tr className="bg-[--surface-sunken] border-b border-[--border-default]">
            {columns.map(col => (
              <th
                key={col.key}
                scope="col"
                className={[
                  'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]',
                  'text-[--text-tertiary] whitespace-nowrap select-none',
                  col.sortable ? 'cursor-pointer hover:text-[--text-secondary]' : '',
                ].join(' ')}
                onClick={() => col.sortable && onSort?.(col.key)}
                aria-sort={
                  sortKey === col.key
                    ? sortDir === 'asc' ? 'ascending' : 'descending'
                    : col.sortable ? 'none' : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && (
                    <span aria-hidden="true" className={`transition-opacity ${sortKey === col.key ? 'opacity-100' : 'opacity-30'}`}>
                      {sortKey === col.key && sortDir === 'asc' ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                      )}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-[--border-default] last:border-0">
                {columns.map(col => (
                  <td key={col.key} className="px-3 py-2.5">
                    <div className="h-3 rounded bg-[--neutral-200] animate-pulse"
                      style={{ width: `${50 + Math.random() * 40}%` }} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-[--text-tertiary]">
                {empty || 'No data'}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                className="border-b border-[--border-default] last:border-0 hover:bg-[--surface-hover] transition-colors duration-75"
              >
                {columns.map(col => (
                  <td key={col.key} className="px-3 py-2.5 text-[--text-primary] max-w-xs">
                    {col.render ? col.render(row[col.key], row) : (
                      <span className={`${col.mono ? 'font-mono text-[12px]' : ''} ${col.muted ? 'text-[--text-secondary]' : ''} block truncate`}>
                        {row[col.key] ?? '—'}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * TableFilter — search + filter controls above a Table
 *
 * @example
 * <TableFilter value={q} onChange={setQ} placeholder="Filter by capability…" count={audit.length} />
 */
export function TableFilter({ value, onChange, placeholder = 'Filter…', count, actions }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="relative flex-1">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[--text-tertiary] pointer-events-none" aria-hidden>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-8 text-[13px] bg-[--surface-card] text-[--text-primary] border border-[--border-default] rounded pl-8 pr-3 outline-none hover:border-[--border-strong] focus-visible:ring-2 focus-visible:ring-[--papaya-500] focus-visible:border-[--border-focus]"
        />
      </div>
      {count !== undefined && (
        <span className="text-xs text-[--text-tertiary] whitespace-nowrap">{count} rows</span>
      )}
      {actions}
    </div>
  );
}
