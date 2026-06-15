import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, ScrollText, Search, X, Check, AlertTriangle, AlertOctagon,
  User, Webhook, Server, Filter, ChevronDown, ChevronRight, Layers,
  Clock, Copy, RefreshCw, MessageCircle,
} from 'lucide-react';
import { Card, PageHeader, EmptyState, LoadingState, ErrorState, ConnectorIcon, FrenchieIcon, Dropdown } from '../ui/index';
import type { DropdownOption } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

type Actor = 'pixush' | 'user' | 'trigger' | 'system' | 'hermes-native';
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

// Icon renderer: takes a size and returns an element. Used so Pixush can render the custom Frenchie SVG.
type ActorIconRenderer = (props: { size: number; className?: string }) => React.ReactElement;
const ACTOR_META: Record<Actor, { label: string; renderIcon: ActorIconRenderer; tone: string }> = {
  pixush:  { label: 'Pixush',  renderIcon: (p) => <FrenchieIcon size={p.size} className={p.className} />, tone: 'bg-[--papaya-50] text-[--papaya-700] ring-1 ring-[--papaya-200]' },
  user:    { label: 'User',    renderIcon: (p) => <User size={p.size} className={p.className} />,        tone: 'bg-[--blue-50] text-[--blue-700] ring-1 ring-[--blue-200]' },
  trigger: { label: 'Trigger', renderIcon: (p) => <Webhook size={p.size} className={p.className} />,     tone: 'bg-[--amber-50] text-[--amber-700] ring-1 ring-[--amber-200]' },
  system:  { label: 'System',  renderIcon: (p) => <Server size={p.size} className={p.className} />,      tone: 'bg-[--neutral-100] text-[--text-secondary] ring-1 ring-[--neutral-200]' },
  'hermes-native': { label: 'Hermes', renderIcon: (p) => <MessageCircle size={p.size} className={p.className} />, tone: 'bg-[--green-50] text-[--green-700] ring-1 ring-[--green-200]' },
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
  const [groupByFlow, setGroupByFlow] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedFlows, setCollapsedFlows] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Cheap signature of the current audit set — used to skip re-rendering when nothing changed.
  // Counts entries + the newest id+ts; covers append, delete, replace, and reset.
  function signatureOf(list: AuditEntry[]): string {
    if (list.length === 0) return '0:';
    const head = list[0];                          // newest (we keep audit sorted DESC)
    const tail = list[list.length - 1];            // oldest
    return `${list.length}:${head.id}:${head.ts}:${tail.id}`;
  }

  /**
   * fetch the audit; in `background` mode we don't flip the loading state — so the screen
   * doesn't flicker while polling. We also short-circuit when the data hasn't changed: no
   * setState, no useMemo recomputation, no re-render — keeps the tab cheap when nothing's happening.
   */
  const load = useCallback(async (mode: 'foreground' | 'background' = 'foreground') => {
    if (mode === 'foreground') {
      setState('loading');
      setErrorMsg('');
    }
    try {
      const r = await fetch(`${ENGINE}/audit?tenant=papaya`);
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      const data = (await r.json()) as AuditEntry[];
      const sorted = [...data].sort((a, b) => (b.ts > a.ts ? 1 : -1));     // newest first

      // Skip setState when content is unchanged (the common case during steady polling).
      setAudit((prev) => signatureOf(prev) === signatureOf(sorted) ? prev : sorted);
      setLastUpdated(Date.now());
      if (mode === 'foreground') setState('done');
    } catch (err) {
      if (mode === 'foreground') {
        setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
        setState('error');
      }
      // background load failures are swallowed; the next tick will retry
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh: poll every 3s while enabled AND the tab is visible.
  //
  // - When the tab is hidden (`visibilitychange` → 'hidden'), we clear the interval entirely
  //   so we don't burn CPU/network in the background. We do a single fetch on becoming visible
  //   again so the audit catches up instantly.
  // - When the dataset hasn't changed, `load()` short-circuits the setState (see signatureOf),
  //   so steady-state polling is effectively a tiny fetch + a string compare and nothing else.
  useEffect(() => {
    if (!autoRefresh) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    function start() {
      if (interval) return;
      interval = setInterval(() => { void load('background'); }, 3000);
    }
    function stop() {
      if (interval) { clearInterval(interval); interval = undefined; }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void load('background');                                       // catch up immediately
        start();
      } else {
        stop();
      }
    }
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoRefresh, load]);

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
              autoRefresh={autoRefresh}
              setAutoRefresh={setAutoRefresh}
              lastUpdated={lastUpdated}
              onManualRefresh={() => void load('background')}
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
                <Header compact={!!selected} />
                <ul role="list" data-testid="audit-list">
                  {groupByFlow ? (
                    grouped.map((g) => {
                      if (!g.runId) {
                        // ungrouped entries (no runId)
                        return (
                          <li key={`none-${g.entries[0].id}`}>
                            {g.entries.map((e) => (
                              <Row key={e.id} entry={e} selected={selectedId === e.id} onSelect={() => setSelectedId(e.id)} compact={!!selected} />
                            ))}
                          </li>
                        );
                      }
                      // grouped flow: render the trigger row + the steps with a connector line
                      const flowCollapsed = collapsedFlows.has(g.runId);
                      // sort ascending so trigger comes first, steps follow in execution order
                      const ascending = [...g.entries].sort((a, b) => (a.ts > b.ts ? 1 : -1));
                      const trigger = ascending.find((e) => e.actor === 'trigger') ?? ascending[0];
                      const steps = ascending.filter((e) => e.id !== trigger.id);
                      const flowStart = new Date(trigger.ts).getTime();
                      return (
                        <li key={g.runId}>
                          <FlowHeader
                            runId={g.runId}
                            entries={g.entries}
                            trigger={trigger}
                            onFilter={() => setFlowFilter(g.runId!)}
                          />
                          {/* trigger row stays visible even when steps are collapsed */}
                          <TriggerRow
                            entry={trigger}
                            stepCount={steps.length}
                            collapsed={flowCollapsed}
                            onToggleCollapse={() => {
                              const s = new Set(collapsedFlows);
                              if (s.has(g.runId!)) s.delete(g.runId!); else s.add(g.runId!);
                              setCollapsedFlows(s);
                            }}
                            selected={selectedId === trigger.id}
                            onSelect={() => setSelectedId(trigger.id)}
                            compact={!!selected}
                          />
                          {!flowCollapsed && (
                            <div className="relative">
                              {/* vertical connector line from trigger down through steps */}
                              {steps.length > 0 && (
                                <div className="pointer-events-none absolute left-[26px] top-0 bottom-3 w-px bg-[--border-default]" aria-hidden />
                              )}
                              {steps.map((e, i) => (
                                <Row
                                  key={e.id}
                                  entry={e}
                                  step={i + 1}
                                  relativeMs={new Date(e.ts).getTime() - flowStart}
                                  selected={selectedId === e.id}
                                  onSelect={() => setSelectedId(e.id)}
                                  compact={!!selected}
                                  inFlow
                                />
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })
                  ) : (
                    filtered.map((e) => (
                      <Row key={e.id} entry={e} selected={selectedId === e.id} onSelect={() => setSelectedId(e.id)} compact={!!selected} />
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
  autoRefresh: boolean; setAutoRefresh: (v: boolean) => void;
  lastUpdated: number | null;
  onManualRefresh: () => void;
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

        <Pill icon={<FrenchieIcon size={14} />} label="Actor" value={p.actor} options={[
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

          {/* divider */}
          <span className="mx-0.5 h-5 w-px bg-[--border-default]" aria-hidden />

          {/* Live / paused toggle — clicking it toggles auto-refresh */}
          <button
            onClick={() => p.setAutoRefresh(!p.autoRefresh)}
            title={p.autoRefresh ? `Live · refreshing every 2s${p.lastUpdated ? ` · last update ${new Date(p.lastUpdated).toLocaleTimeString()}` : ''}` : 'Paused — click to resume'}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors',
              p.autoRefresh
                ? 'border-[--green-200] bg-[--green-50] text-[--green-700] hover:bg-[--green-100]'
                : 'border-[--border-default] bg-[--surface-card] text-[--text-secondary] hover:bg-[--surface-hover]',
            ].join(' ')}
            aria-pressed={p.autoRefresh}
          >
            <span className="relative inline-flex h-1.5 w-1.5">
              {p.autoRefresh && <span className="absolute inset-0 animate-ping rounded-full bg-[--green-500] opacity-75" aria-hidden />}
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${p.autoRefresh ? 'bg-[--green-500]' : 'bg-[--text-tertiary]'}`} aria-hidden />
            </span>
            {p.autoRefresh ? 'Live' : 'Paused'}
          </button>

          {/* Manual refresh */}
          <button
            onClick={p.onManualRefresh}
            title="Refresh now"
            className="grid h-7 w-7 place-items-center rounded-md text-[--text-secondary] hover:bg-[--surface-hover] hover:text-[--text-primary]"
            aria-label="Refresh"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
    </Card>
  );
}

function Pill({ icon, label, value, options, onChange }: {
  icon: React.ReactNode; label: string; value: string;
  options: DropdownOption[]; onChange: (v: string) => void;
}) {
  const isActive = value !== 'all';
  return (
    <Dropdown
      value={value}
      options={options}
      onChange={onChange}
      renderTrigger={(current, open) => (
        <span className={[
          'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 transition-colors',
          isActive
            ? 'border-[--papaya-200] bg-[--papaya-50] text-[--papaya-700]'
            : 'border-[--border-default] bg-[--surface-card] text-[--text-secondary] hover:border-[--border-strong]',
          open ? 'ring-2 ring-[--papaya-500] ring-offset-0' : '',
        ].join(' ')}>
          <span className="opacity-80">{icon}</span>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em] opacity-70">{label}</span>
          <span className="text-[12px] font-medium">{current?.label ?? 'Any'}</span>
          <ChevronDown size={12} className={`opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      )}
    />
  );
}

/* ── Grid templates (compact when side panel is open) ─────────── */
// Full (no panel): status · icon · action · target · summary · duration · actor · time
// Compact (panel open): status · icon · action · target · duration · actor · time   (summary lives in the panel)
const GRID_FULL    = 'grid-cols-[10px_36px_minmax(140px,1.2fr)_minmax(100px,1fr)_minmax(140px,1.4fr)_60px_auto_72px]';
const GRID_COMPACT = 'grid-cols-[10px_36px_minmax(140px,1.4fr)_minmax(100px,1fr)_60px_auto_72px]';

/* ── Table header ─────────────────────────────────────────────── */
function Header({ compact }: { compact: boolean }) {
  return (
    <div className={[
      'sticky top-0 z-10 grid items-center gap-3 border-b border-[--border-default] bg-[--surface-sunken]/80 px-3 py-2',
      'text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary] backdrop-blur',
      compact ? GRID_COMPACT : GRID_FULL,
    ].join(' ')}>
      <span aria-hidden />
      <span aria-hidden />
      <span>Action</span>
      <span>Target</span>
      {!compact && <span>Summary</span>}
      <span className="text-right">Duration</span>
      <span>Actor</span>
      <span className="text-right">Time</span>
    </div>
  );
}

/* ── Row ──────────────────────────────────────────────────────── */
function Row({ entry: e, selected, onSelect, inFlow, step, relativeMs, compact }: {
  entry: AuditEntry;
  selected: boolean;
  onSelect: () => void;
  /** indented inside a flow group (renders a step-number bullet) */
  inFlow?: boolean;
  /** 1-based step number within a flow */
  step?: number;
  /** ms since the flow's trigger */
  relativeMs?: number;
  /** hide the Summary column to make room for the side panel */
  compact: boolean;
}) {
  const status = STATUS_META[e.status];
  const actor = ACTOR_META[e.actor];
  const ActorIcon = actor.renderIcon;
  return (
    <button
      onClick={onSelect}
      className={[
        'grid w-full items-center gap-3 border-b border-[--border-default] px-3 py-2 text-left transition-colors last:border-b-0',
        compact ? GRID_COMPACT : GRID_FULL,
        selected ? 'bg-[--papaya-50]' : 'hover:bg-[--surface-hover]',
      ].join(' ')}
    >
      {/* col 1: status dot — or, in a flow, a step bullet (numbered) */}
      <span className="relative flex items-center justify-center">
        {inFlow && step !== undefined ? (
          <span className="z-10 grid h-5 w-5 -translate-x-[2px] place-items-center rounded-full bg-[--surface-card] font-mono text-[9px] font-semibold text-[--text-tertiary] ring-1 ring-[--border-default]">
            {step}
          </span>
        ) : (
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden title={status.label} />
        )}
      </span>

      {/* col 2: capability icon (colored tile for non-app fallbacks) */}
      <span className="flex items-center justify-center">
        <ConnectorIcon
          name={e.capability}
          kind="capability"
          size={26}
          tile
        />
      </span>

      {/* col 3: action label + technical id */}
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[--text-primary]">{e.label ?? humanize(e.capability)}</p>
        <p className="truncate font-mono text-[10.5px] text-[--text-tertiary]">{e.capability}</p>
      </div>

      {/* col 4: target */}
      <span className="truncate text-[12px] text-[--text-secondary]">{e.target}</span>

      {/* col 5: summary (hidden in compact) */}
      {!compact && <span className="truncate text-[12px] text-[--text-tertiary]">{e.summary}</span>}

      {/* col 6: duration */}
      <span className="text-right text-[11px] tabular-nums text-[--text-tertiary]">
        {typeof e.durationMs === 'number' ? `${e.durationMs}ms` : '—'}
      </span>

      {/* col 7: actor pill */}
      <span className={`inline-flex min-w-[62px] items-center justify-start gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${actor.tone}`}>
        <ActorIcon size={13} /> {actor.label}
      </span>

      {/* col 8: time — relative to flow start when inside a flow, otherwise wall-clock */}
      <span className="text-right text-[11px] tabular-nums text-[--text-tertiary]" title={new Date(e.ts).toISOString()}>
        {inFlow && relativeMs !== undefined
          ? (relativeMs === 0 ? '0ms' : `+${formatRel(relativeMs)}`)
          : new Date(e.ts).toLocaleTimeString()}
      </span>
    </button>
  );
}

/* ── Trigger row (the visual "start" of a flow group) ─────────── */
function TriggerRow({ entry: e, selected, onSelect, compact, stepCount, collapsed, onToggleCollapse }: {
  entry: AuditEntry;
  selected: boolean;
  onSelect: () => void;
  compact: boolean;
  /** how many steps follow under this trigger (shown when collapsed) */
  stepCount: number;
  /** whether the steps under this trigger are hidden */
  collapsed: boolean;
  /** toggles collapse/expand of the steps under this trigger */
  onToggleCollapse: () => void;
}) {
  const actor = ACTOR_META[e.actor];
  const ActorIcon = actor.renderIcon;

  // Outer container is a div+role=button so we can nest the chevron button inside without
  // violating HTML's no-nested-buttons rule. Click anywhere except the chevron selects the row.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(); } }}
      className={[
        'relative grid w-full cursor-pointer items-center gap-3 border-b border-[--border-default] px-3 py-2.5 text-left transition-colors',
        compact ? GRID_COMPACT : GRID_FULL,
        selected ? 'bg-[--papaya-50]' : 'bg-[--amber-50]/40 hover:bg-[--amber-50]/70',
      ].join(' ')}
    >
      {/* col 1: chevron button — toggles steps. Clicking it doesn't bubble to the row. */}
      <span className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={(ev) => { ev.stopPropagation(); onToggleCollapse(); }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Show ${stepCount} steps` : 'Hide steps'}
          className="group/toggle grid h-5 w-5 -translate-x-[2px] place-items-center rounded-full bg-[--amber-100] text-[--amber-700] ring-1 ring-[--amber-200] transition-colors hover:bg-[--amber-200] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--amber-500]"
        >
          {collapsed
            ? <ChevronRight size={11} className="transition-transform" />
            : <ChevronDown size={11} className="transition-transform" />}
        </button>
      </span>

      <span className="flex items-center justify-center">
        <ConnectorIcon name={e.capability} kind="capability" size={26} tile />
      </span>

      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[--amber-700]">
          <span>Trigger</span>
          <span className="font-mono text-[10px] font-medium normal-case tracking-normal text-[--text-tertiary]">{e.capability}</span>
          {collapsed && stepCount > 0 && (
            <span className="ml-1 rounded-full bg-[--amber-100] px-1.5 py-px text-[9px] font-semibold text-[--amber-700] normal-case tracking-normal">
              +{stepCount} {stepCount === 1 ? 'step' : 'steps'}
            </span>
          )}
        </p>
        <p className="truncate text-[13px] font-medium text-[--text-primary]">{e.label ?? humanize(e.capability)}</p>
      </div>

      <span className="truncate text-[12px] text-[--text-secondary]">{e.target}</span>
      {!compact && <span className="truncate text-[12px] text-[--text-tertiary]">{e.summary}</span>}
      <span className="text-right text-[11px] tabular-nums text-[--text-tertiary]">{typeof e.durationMs === 'number' ? `${e.durationMs}ms` : '—'}</span>
      <span className={`inline-flex min-w-[62px] items-center justify-start gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${actor.tone}`}>
        <ActorIcon size={13} /> {actor.label}
      </span>
      <span className="text-right text-[11px] tabular-nums text-[--text-tertiary]">
        {new Date(e.ts).toLocaleTimeString()}
      </span>
    </div>
  );
}

function formatRel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms / 1000)}s`;
}

/* ── Flow header (group-by-flow view) ─────────────────────────── */
function FlowHeader({ runId, entries, trigger, onFilter }: {
  runId: string; entries: AuditEntry[]; trigger: AuditEntry;
  onFilter: () => void;
}) {
  const tsList = entries.map((e) => new Date(e.ts).getTime());
  const dur = Math.max(...tsList) - Math.min(...tsList);
  const ok = entries.filter((e) => e.status === 'success').length;
  const bad = entries.length - ok;
  return (
    <div className="flex items-center gap-2 border-y border-[--border-default] bg-gradient-to-r from-[--surface-sunken] to-[--surface-card] px-3 py-1.5">
      <Layers size={12} className="text-[--text-tertiary]" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-secondary]">Flow</span>
      <span className="font-mono text-[11px] text-[--text-primary]">{shortId(runId)}</span>
      <span className="text-[11px] text-[--text-tertiary]">·</span>
      <span className="truncate text-[11px] text-[--text-secondary]" title={trigger.target}>{trigger.target}</span>
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
  const ActorIcon = actor.renderIcon;

  function copy(v: unknown) {
    navigator.clipboard?.writeText(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  }

  return (
    <Card className="w-[380px] flex-shrink-0 overflow-hidden self-start sticky top-2" padding={false}>
      <div className="relative border-b border-[--border-default] bg-gradient-to-br from-[--surface-sunken] to-[--surface-card] p-4">
        <button onClick={onClose} className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded text-[--text-tertiary] hover:bg-[--surface-card] hover:text-[--text-primary]" aria-label="Close panel">
          <X size={14} />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <ConnectorIcon name={e.capability} kind="capability" size={44} tile />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight text-[--text-primary]">{e.label ?? humanize(e.capability)}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[--text-tertiary]">{e.capability}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.pill}`}>
            <StatusIcon size={11} /> {status.label}
          </span>
          <span className={`inline-flex min-w-[72px] items-center justify-start gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${actor.tone}`}>
            <ActorIcon size={15} /> {actor.label}
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
