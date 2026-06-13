import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardHeader, Table, TableFilter, EmptyState, LoadingState, ErrorState, ConnectorIcon } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

interface AuditEntry {
  ts: string;
  capability: string;
  target: string;
  summary: string;
}

const COLUMNS = [
  {
    key: 'system',
    label: 'System',
    render: (_v: unknown, row: Record<string, unknown>) => <ConnectorIcon name={String(row.capability)} kind="capability" size={16} />,
  },
  { key: 'capability', label: 'Capability', mono: true, sortable: true },
  { key: 'target', label: 'Target' },
  { key: 'summary', label: 'Summary', muted: true },
  {
    key: 'ts',
    label: 'Time',
    muted: true,
    sortable: true,
    render: (v: unknown) => {
      if (!v) return '—';
      const d = new Date(v as string);
      return isNaN(d.getTime()) ? String(v) : d.toLocaleTimeString();
    },
  },
];

type LoadState = 'loading' | 'done' | 'error';

export function AuditScreen() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    setState('loading');
    setErrorMsg('');
    try {
      const r = await fetch(`${ENGINE}/audit?tenant=papaya`);
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      setAudit(await r.json());
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = audit.filter((e) => {
    const q = query.toLowerCase();
    return (
      e.capability.toLowerCase().includes(q) ||
      e.target.toLowerCase().includes(q) ||
      e.summary.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[--text-primary] tracking-tight mb-0.5">
          Audit log
        </h1>
        <p className="text-[13px] text-[--text-secondary]">
          Every action the agent took, logged and auditable.
        </p>
      </div>

      <Card padding={false}>
        <div className="p-4 pb-3">
          <CardHeader title="Actions" subtitle={state === 'done' ? `${audit.length} recorded` : undefined} />
        </div>
        <div className="px-4">
          {state === 'loading' && <LoadingState rows={4} />}
          {state === 'error' && (
            <ErrorState
              title="Couldn't load the audit log"
              description={errorMsg || 'Check the connection and try again.'}
              onRetry={load}
            />
          )}
          {state === 'done' && audit.length === 0 && (
            <EmptyState
              icon={<FileText size={20} />}
              title="No audit entries"
              description="Audit entries will appear here after a scenario runs."
              className="pb-8"
            />
          )}
          {state === 'done' && audit.length > 0 && (
            <div className="pb-4">
              <TableFilter
                value={query}
                onChange={setQuery}
                placeholder="Filter by capability, target, or summary…"
                count={filtered.length}
              />
              <Table columns={COLUMNS} rows={filtered as unknown as Record<string, unknown>[]} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
