import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, ScrollText, Search, X, Check, AlertTriangle, AlertOctagon,
  Bot, User, Webhook, Server, Filter, ChevronDown, ChevronRight, Layers,
  Clock, Copy,
} from 'lucide-react';
import { Card, PageHeader, EmptyState, LoadingState, ErrorState, ConnectorIcon } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

type Actor = 'pixush' | 'user' | 'trigger' | 'system';
type Status = 'success' | 'error' | 'escalated';

interface AuditEntry {
  id: string;
  ts: string;
  tenant: string;
  capability: string;
  label?: string;
  integration?: string;
  target: string;
  summary: string;
  actor: Actor;
  runId?: string;
  status: Status;
  durationMs?: number;
  inputs?: unknown;
  outputs?: unknown;
}

type LoadState = 'loading' | 'done' | 'error';

const ACTOR_META: Record<Actor, { label: string; icon: typeof Bot; tone: string }> = {
  pixush:  { label: 'Pixush',      icon: Bot,     tone: 'bg-[--papaya-50] text-[--papaya-700] ring-1 ring-[--papaya-200]' },
  user:    { label: 'User',        icon: User,    tone: 'bg-[--blue-50] text-[--blue-700] ring-1 ring-[--blue-200]' },
  trigger: { label: 'Trigger',     icon: Webhook, tone: 'bg-[--amber-50] text-[--amber-700] ring-1 ring-[--amber-200]' },
  system:  { label: 'System',      icon: Server,  tone: 'bg-[--neutral-100] text-[--text-secondary] ring-1 ring-[--neutral-200]' },
};

const STATUS_META: Record<Status, { label: string; icon: typeof Check; dot: string; pill: string }> = {
  success:   { label: 'Success',   icon: Check,         dot: 'bg-[--green-500]',  pill: 'bg-[--green-50] text-[--green-700] ring-1 ring-[--green-200]' },
  error:     { label: 'Error',     icon: AlertOctagon,  dot: 'bg-[--red-500]',    pill: 'bg-[--red-50] text-[--red-700] ring-1 ring-[--red-200]' },
  escalated: { label: 'Escalated', icon: AlertTriangle, dot: 'bg-[--amber-500]',  pill: 'bg-[--amber-50] text-[--amber-700] ring-1 ring-[--amber-200]' },
};

const TIME_WINDOWS: { value: string; label: string; ms: number | null }[] = [
  { value: 'all', label: 'All time', ms: null },
  { value: '1h',  label: 'Last hour', ms: 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { value: '7d',  label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
];

export function AuditScreen() {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');
  const [actorFilter, setActorFilter] = useState<Actor | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [systemFilter, setSystemFilter] = useState<string | 'all'>('all');
  const [flowFilter, setFlowFilter] = useState<string | 'all'>('all');
  const [timeWindow, setTimeWindow] = useState<string>('all');
  const [groupByFlow, setGroupByFlow] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedFlows, setCollapsedFlows] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setState('loading');
    setErrorMsg('');
    try {
      const r = await fetch(`${ENGINE}/audit?tenant=papaya`);
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      const data = (await r.json()) as AuditEntry[];
      // newest first
      setAudit([...data].sort((a, b) => (b.ts > a.ts ? 1 : -1)));
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const systems = useMemo(() => {
    const s = new Set<string>();
    audit.forEach((e) => { if (e.integration) s.add(e.integration); });
    return [...s].sort();
  }, [audit]);

  const flows = useMemo(() => {
    const s = new Set<string>();
    audit.forEach((e) => { if (e.runId) s.add(e.runId); });
    return [...s];
  }, [audit]);

  const filtered = useMemo(() => audit.filter((e) => {
    if (query) {
      const q = query.toLowerCase();
      const blob = `${e.capability} ${e.label ?? ''} ${e.target} ${e.summary} ${e.integration ?? ''}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (actorFilter !== 'all' && e.actor !== actorFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (systemFilter !== 'all' && e.integration !== systemFilter) return false;
    if (flowFilter !== 'all' && e.runId !== flowFilter) return false;
    if (timeWindow !== 'all') {
      const w = TIME_WINDOWS.find((t) => t.value === timeWindow);
      if (w?.ms) {
        if (new Date(e.ts).getTime() < Date.now() - w.ms) return false;
      }
    }
    return true;
  }), [audit, query, actorFilter, statusFilter, systemFilter, flowFilter, timeWindow]);

  const selected = useMemo(() => audit.find((e) => e.id === selectedId) ?? null, [audit, selectedId]);

  // Group filtered entries by runId for the group-by-flow view (preserves newest-first order)
  const grouped = useMemo(() => {
    const groups: { runId: string | null; entries: AuditEntry[] }[] = [];
    const byKey = new Map<string, AuditEntry[]>();
    for (const e of filtered) {
      const k = e.runId ?? `__no-flow:${e.id}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(e);
    }
    for (const [k, entries] of byKey) groups.push({ runId: k.startsWith('__no-flow') ? null : k, entries });
    return groups;
  }, [filtered]);

  const activeFilterCount =
    (query ? 1 : 0) +
    (actorFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (systemFilter !== 'all' ? 1 : 0) +
    (flowFilter !== 'all' ? 1 : 0) +
    (timeWindow !== 'all' ? 1 : 0);

  function resetFilters() {
    setQuery(''); setActorFilter('all'); setStatusFilter('all'); setSystemFilter('all'); setFlowFilter('all'); setTimeWindow('all');
  }

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-6">
      <PageHeader
        eyebrow="Activity"
        eyebrowIcon={<ScrollText size={11} />}
        title="Audit log"
        subtitle="Every action across the system — who initiated it, what it touched, and the raw payload behind it."
      />

      {state === 'loading' && <Card><LoadingState rows={6} /></Card>}
      {state === 'error' && (
        <Card>
          <ErrorState
            title="Couldn't load the audit log"
            description={errorMsg || 'Check the connection and try again.'}
            onRetry={load}
          />
        </Card>
      )}

      {state === 'done' && (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <FilterBar
              query={query} setQuery={setQuery}
              actor={actorFilter} setActor={setActorFilter}
              status={statusFilter} setStatus={setStatusFilter}
              system={systemFilter} setSystem={setSystemFilter}
              flow={flowFilter} setFlow={setFlowFilter}
              time={timeWindow} setTime={setTimeWindow}
              systems={systems}
              flows={flows}
              groupByFlow={groupByFlow} setGroupByFlow={setGroupByFlow}
              total={filtered.length}
              activeFilterCount={activeFilterCount}
              onReset={resetFilters}
            />

            {filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<FileText size={20} />}
                  title={audit.length === 0 ? "No audit entries yet" : 'No entries match your filters'}
                  description={audit.length === 0 ? "Trigger a scenario on Live Run to see actions here." : 'Try clearing some filters.'}
                  className="pb-8"
                />
              </Card>
            ) : (
              <Card padding={false}>
                <Header />
                <ul role="list" data-testid="audit-list">
                  {groupByFlow ? (
                    grouped.map((g) => (
                      <li key={g.runId ?? `none-${g.entries[0].id}`}>
                        {g.runId && (
                          <FlowHeader
                            runId={g.runId}
                            entries={g.entries}
                            collapsed={collapsedFlows.has(g.runId)}
                            onToggle={() => {
                              const s = new Set(collapsedFlows);
                              if (s.has(g.runId!)) s.delete(g.runId!); else s.add(g.runId!);
                              setCollapsedFlows(s);
                            }}
                            onFilter={() => setFlowFilter(g.runId!)}
                          />
                        )}
                        {(!g.runId || !collapsedFlows.has(g.runId)) && g.entries.map((e) => (
                          <Row key={e.id} entry={e} selected={selectedId === e.id} onSelect={() => setSelectedId(e.id)} indented={!!g.runId} />
                        ))}
                      </li>
                    ))
                  ) : (
                    filtered.map((e) => (
                      <Row key={e.id} entry={e} selected={selectedId === e.id} onSelect={() => setSelectedId(e.id)} />
                    ))
                  )}
                </ul>
              </Card>
            )}
          </div>

          {selected && <RawPanel entry={selected} onClose={() => setSelectedId(null)} />}
        </div>
      )}
    </div>
  );
}

/* ── Filter bar ─────────────────────────────────────────────────── */
interface FilterBarProps {
  query: string; setQuery: (v: string) => void;
  actor: Actor | 'all'; setActor: (v: Actor | 'all') => void;
  status: Status | 'all'; setStatus: (v: Status | 'all') => void;
  system: string; setSystem: (v: string) => void;
  flow: string; setFlow: (v: string) => void;
  time: string; setTime: (v: string) => void;
  systems: string[]; flows: string[];
  groupByFlow: boolean; setGroupByFlow: (v: boolean) => void;
  total: number; activeFilterCount: number;
  onReset: () => void;
}

function FilterBar(p: FilterBarProps) {
  return (
    <Card padding={false}>
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        {/* search */}
        <div className="relative flex-1 min-w-[200px]">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[--text-tertiary]">
            <Search size={13} />
          </span>
          <input
            value={p.query}
            onChange={(e) => p.setQuery(e.target.value)}
            placeholder="Search action, target, or summary…"
            className="h-8 w-full rounded-lg border border-[--border-default] bg-[--surface-card] pl-8 pr-3 text-[13px] outline-none placeholder:text-[--text-tertiary] hover:border-[--border-strong] focus-visible:border-[--border-focus] focus-visible:ring-2 focus-visible:ring-[--papaya-500]"
          />
        </div>

        <Pill icon={<Bot size={12} />} label="Actor" value={p.actor} options={[
          { value: 'all', label: 'Any' }, { value: 'pixush', label: 'Pixush' }, { value: 'user', label: 'User' },
          { value: 'trigger', label: 'Trigger' }, { value: 'system', label: 'System' },
        ]} onChange={(v) => p.setActor(v as Actor | 'all')} />

        <Pill icon={<Check size={12} />} label="Status" value={p.status} options={[
          { value: 'all', label: 'Any' }, { value: 'success', label: 'Success' }, { value: 'error', label: 'Error' }, { value: 'escalated', label: 'Escalated' },
        ]} onChange={(v) => p.setStatus(v as Status | 'all')} />

        <Pill icon={<Filter size={12} />} label="System" value={p.system} options={[
          { value: 'all', label: 'Any' }, ...p.systems.map((s) => ({ value: s, label: s })),
        ]} onChange={p.setSystem} />

        {p.flows.length > 0 && (
          <Pill icon={<Layers size={12} />} label="Flow" value={p.flow} options={[
            { value: 'all', label: 'Any' },
            ...p.flows.map((f) => ({ value: f, label: shortId(f) })),
          ]} onChange={p.setFlow} />
        )}

        <Pill icon={<Clock size={12} />} label="Time" value={p.time} options={TIME_WINDOWS.map((t) => ({ value: t.value, label: t.label }))} onChange={p.setTime} />

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-[--text-secondary]">
            <input type="checkbox" checked={p.groupByFlow} onChange={(e) => p.setGroupByFlow(e.target.checked)} className="h-3.5 w-3.5 rounded accent-[--papaya-500]" />
            Group by flow
          </label>
          <span className="text-[12px] tabular-nums text-[--text-tertiary]">{p.total} {p.total === 1 ? 'entry' : 'entries'}</span>
          {p.activeFilterCount > 0 && (
            <button onClick={p.onReset} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[--text-secondary] hover:bg-[--surface-hover] hover:text-[--text-primary]">
              <X size={12} /> Clear ({p.activeFilterCount})
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Pill({ icon, label, value, options, onChange }: {
  icon: React.ReactNode; label: string; value: string;
  options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  const isActive = value !== 'all';
  return (
    <label className={[
      'group inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors',
      isActive
        ? 'border-[--papaya-200] bg-[--papaya-50] text-[--papaya-700]'
        : 'border-[--border-default] bg-[--surface-card] text-[--text-secondary] hover:border-[--border-strong]',
    ].join(' ')}>
      <span className="opacity-80">{icon}</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.04em] opacity-70">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[12px] font-medium outline-none focus-visible:outline-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* ── Table header ─────────────────────────────────────────────── */
function Header() {
  return (
    <div className="sticky top-0 z-10 grid grid-cols-[auto_28px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(180px,2fr)_72px_auto_88px] items-center gap-3 border-b border-[--border-default] bg-[--surface-sunken]/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary] backdrop-blur">
      <span className="w-2" aria-hidden />
      <span aria-hidden />
      <span>Action</span>
      <span>Target</span>
      <span>Summary</span>
      <span className="text-right">Duration</span>
      <span>Actor</span>
      <span className="text-right">Time</span>
    </div>
  );
}

/* ── Row ──────────────────────────────────────────────────────── */
function Row({ entry: e, selected, onSelect, indented }: { entry: AuditEntry; selected: boolean; onSelect: () => void; indented?: boolean }) {
  const status = STATUS_META[e.status];
  const actor = ACTOR_META[e.actor];
  const ActorIcon = actor.icon;
  return (
    <button
      onClick={onSelect}
      className={[
        'grid w-full grid-cols-[auto_28px_minmax(160px,1.4fr)_minmax(120px,1fr)_minmax(180px,2fr)_72px_auto_88px]',
        'items-center gap-3 border-b border-[--border-default] px-3 py-2.5 text-left transition-colors last:border-b-0',
        selected ? 'bg-[--papaya-50]' : 'hover:bg-[--surface-hover]',
        indented ? 'pl-8' : '',
      ].join(' ')}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden title={status.label} />
      <ConnectorIcon name={e.integration?.toLowerCase() === 'channels' ? 'teams' : (capabilityIconKey(e.capability))} kind="capability" size={18} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[--text-primary]">{e.label ?? humanize(e.capability)}</p>
        <p className="truncate font-mono text-[10.5px] text-[--text-tertiary]">{e.capability}</p>
      </div>
      <span className="truncate text-[12px] text-[--text-secondary]">{e.target}</span>
      <span className="truncate text-[12px] text-[--text-tertiary]">{e.summary}</span>
      <span className="text-right text-[11px] tabular-nums text-[--text-tertiary]">
        {typeof e.durationMs === 'number' ? `${e.durationMs}ms` : '—'}
      </span>
      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${actor.tone}`}>
        <ActorIcon size={10} /> {actor.label}
      </span>
      <span className="text-right text-[11px] tabular-nums text-[--text-tertiary]" title={new Date(e.ts).toISOString()}>
        {new Date(e.ts).toLocaleTimeString()}
      </span>
    </button>
  );
}

/* ── Flow header (group-by-flow view) ─────────────────────────── */
function FlowHeader({ runId, entries, collapsed, onToggle, onFilter }: {
  runId: string; entries: AuditEntry[]; collapsed: boolean; onToggle: () => void; onFilter: () => void;
}) {
  const first = entries[entries.length - 1];
  const last = entries[0];
  const dur = new Date(last.ts).getTime() - new Date(first.ts).getTime();
  const ok = entries.filter((e) => e.status === 'success').length;
  const bad = entries.length - ok;
  return (
    <div className="flex items-center gap-2 border-b border-[--border-default] bg-[--surface-sunken] px-3 py-1.5">
      <button onClick={onToggle} className="grid h-5 w-5 place-items-center rounded text-[--text-secondary] hover:bg-[--surface-card]">
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
      </button>
      <Layers size={12} className="text-[--text-tertiary]" />
      <span className="font-mono text-[11px] text-[--text-secondary]">{shortId(runId)}</span>
      <span className="text-[11px] text-[--text-tertiary]">·</span>
      <span className="text-[11px] text-[--text-secondary]">{entries.length} {entries.length === 1 ? 'action' : 'actions'}</span>
      {dur > 0 && (
        <>
          <span className="text-[11px] text-[--text-tertiary]">·</span>
          <span className="text-[11px] tabular-nums text-[--text-tertiary]">{(dur / 1000).toFixed(2)}s</span>
        </>
      )}
      {ok > 0 && <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[--green-50] px-1.5 py-0.5 text-[10px] font-semibold text-[--green-700]"><Check size={9} /> {ok}</span>}
      {bad > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-[--red-50] px-1.5 py-0.5 text-[10px] font-semibold text-[--red-700]"><AlertOctagon size={9} /> {bad}</span>}
      <button onClick={onFilter} className="ml-auto text-[11px] font-medium text-[--papaya-600] hover:underline">Only this flow</button>
    </div>
  );
}

/* ── Raw panel (right side, on row select) ────────────────────── */
function RawPanel({ entry: e, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const status = STATUS_META[e.status];
  const actor = ACTOR_META[e.actor];
  const StatusIcon = status.icon;
  const ActorIcon = actor.icon;

  function copy(v: unknown) {
    navigator.clipboard?.writeText(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  }

  return (
    <Card className="w-[420px] flex-shrink-0 overflow-hidden" padding={false}>
      <div className="relative border-b border-[--border-default] bg-gradient-to-br from-[--surface-sunken] to-[--surface-card] p-4">
        <button onClick={onClose} className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded text-[--text-tertiary] hover:bg-[--surface-card] hover:text-[--text-primary]" aria-label="Close panel">
          <X size={14} />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[--surface-card] ring-1 ring-[--border-default] shadow-[--shadow-xs]">
            <ConnectorIcon name={capabilityIconKey(e.capability)} kind="capability" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-[--text-primary]">{e.label ?? humanize(e.capability)}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[--text-tertiary]">{e.capability}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.pill}`}>
            <StatusIcon size={11} /> {status.label}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${actor.tone}`}>
            <ActorIcon size={11} /> {actor.label}
          </span>
          {e.integration && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[--surface-card] px-2 py-0.5 text-[10px] font-medium text-[--text-secondary] ring-1 ring-[--border-default]">
              {e.integration}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <Field label="Target" value={e.target} />
          <Field label="Duration" value={typeof e.durationMs === 'number' ? `${e.durationMs} ms` : '—'} />
          <Field label="Time" value={new Date(e.ts).toLocaleString()} title={new Date(e.ts).toISOString()} />
          <Field label="Flow" value={e.runId ? shortId(e.runId) : '—'} mono onCopy={e.runId ? () => copy(e.runId) : undefined} />
        </div>

        {e.summary && (
          <div>
            <Label>Summary</Label>
            <p className="rounded-lg border border-[--border-default] bg-[--surface-sunken] px-2.5 py-2 text-[12px] text-[--text-primary]">{e.summary}</p>
          </div>
        )}

        <JsonBlock title="Inputs" value={e.inputs} onCopy={() => copy(e.inputs)} />
        <JsonBlock title="Outputs" value={e.outputs} onCopy={() => copy(e.outputs)} />

        <div className="border-t border-[--border-default] pt-3">
          <p className="font-mono text-[10px] text-[--text-tertiary]">id {e.id}</p>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value, mono, title, onCopy }: { label: string; value: string; mono?: boolean; title?: string; onCopy?: () => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <p className={[
          'truncate text-[12px] text-[--text-primary]',
          mono ? 'font-mono text-[11px]' : '',
        ].join(' ')} title={title}>{value}</p>
        {onCopy && (
          <button onClick={onCopy} className="rounded p-0.5 text-[--text-tertiary] hover:bg-[--surface-hover] hover:text-[--text-primary]" aria-label="Copy">
            <Copy size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">{children}</p>;
}

function JsonBlock({ title, value, onCopy }: { title: string; value: unknown; onCopy: () => void }) {
  if (value === undefined || value === null) {
    return (
      <div>
        <Label>{title}</Label>
        <p className="rounded-lg border border-dashed border-[--border-default] bg-[--surface-sunken] px-2.5 py-2 text-[11px] text-[--text-tertiary]">No {title.toLowerCase()}.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <Label>{title}</Label>
        <button onClick={onCopy} className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-[--text-tertiary] hover:bg-[--surface-hover] hover:text-[--text-primary]">
          <Copy size={10} /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-[--border-default] bg-[--surface-sunken] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[--text-primary]">
{JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────── */
function humanize(capability: string): string {
  return capability.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function shortId(s: string): string {
  return s.length > 8 ? s.slice(0, 8) : s;
}
function capabilityIconKey(capability: string): string {
  // map system/integrations capabilities to brand logos used elsewhere
  if (capability.startsWith('integrations.')) return 'integrations';
  if (capability.startsWith('system.')) return 'system';
  return capability;
}
