import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Check, Trash2, Wrench, Database, Settings2, FlaskConical, Cloud,
  Users, FileText, MessagesSquare, KanbanSquare, Calendar as CalendarIcon, Palette,
  Zap, ArrowRight, Webhook,
} from 'lucide-react';
import { Card, PageHeader, ConnectorIcon, Toggle, Table, Badge, LoadingState, ErrorState, EmptyState } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

import { SchemaTree } from './workflow/Inspector/SchemaTree';
import type { SchemaNode } from './workflow/types';

interface Capability {
  name: string;
  label: string;
  description: string;
  wired?: boolean;
  /** Set by the engine when a tool def backs this capability. */
  kind?: 'engine-tool' | 'external-hermes' | null;
  inputSchema?: SchemaNode | null;
  outputSchema?: SchemaNode | null;
}
interface Trigger {
  name: string;
  label: string;
  description: string;
}

interface Connector {
  id: string; name: string; role: string; description: string; icon: string;
  installed: boolean; enabled: boolean; mode: 'mock' | 'prod';
  config: { mock: { failNext?: boolean; latencyMs?: number; seed?: string }; prod: { baseUrl?: string; authRef?: string; ids?: string } };
  tools: string[];
  capabilities: Capability[];
  triggers?: Trigger[];
}

const ROLES = ['HRIS', 'ATS', 'Channels', 'TaskBoard', 'Calendar', 'Content'];

const ROLE_META: Record<string, { label: string; icon: typeof Users; blurb: string }> = {
  HRIS: { label: 'HRIS', icon: Users, blurb: 'System of record for people' },
  ATS: { label: 'ATS', icon: FileText, blurb: 'Hiring & signed contracts' },
  Channels: { label: 'Channels', icon: MessagesSquare, blurb: 'How the agent reaches people' },
  TaskBoard: { label: 'Project management', icon: KanbanSquare, blurb: 'Provisioning & task tracking' },
  Calendar: { label: 'Calendar', icon: CalendarIcon, blurb: 'Scheduling & invites' },
  Content: { label: 'Content', icon: Palette, blurb: 'Branding & culture material' },
};

type Tab = 'catalog' | 'installed';

export function IntegrationsScreen() {
  const [tab, setTab] = useState<Tab>('catalog');
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const r = await fetch(`${ENGINE}/integrations?tenant=papaya`);
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      setConnectors(await r.json());
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, path: string, body?: unknown) {
    // Always send a JSON body — Fastify 400s an application/json POST with an empty body,
    // which install/uninstall (no payload) would otherwise trigger.
    const r = await fetch(`${ENGINE}/integrations/${id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!r.ok) { setErrorMsg(`Action failed (${r.status})`); setState('error'); return; }
    await load();
  }

  if (state === 'loading') return <div className="max-w-[--content-max-width] mx-auto p-2"><LoadingState rows={5} /></div>;
  if (state === 'error') return <div className="max-w-[--content-max-width] mx-auto p-2"><ErrorState title="Couldn't load integrations" description={errorMsg} onRetry={load} /></div>;

  const installed = connectors.filter((c) => c.installed);
  const current = installed.find((c) => c.id === selected) ?? installed[0] ?? null;

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-6">
      <PageHeader
        eyebrow="Connectors"
        eyebrowIcon={<Zap size={11} />}
        title="Integrations"
        subtitle="Install systems the agent works across, switch each between mock and prod, and control exactly which capabilities reach the agent."
      />

      {/* ── Segmented tabs ──────────────────────────────────────── */}
      <Segmented
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        testIdPrefix="tab"
        size="lg"
        options={[
          { value: 'catalog', label: 'Catalog' },
          { value: 'installed', label: `Installed`, badge: installed.length },
        ]}
      />

      {tab === 'catalog' && (
        <div className="space-y-7" data-testid="catalog">
          {ROLES.map((role) => {
            const group = connectors.filter((c) => c.role === role);
            if (group.length === 0) return null;
            const meta = ROLE_META[role];
            const RoleGlyph = meta.icon;
            const liveInGroup = group.filter((c) => c.installed && c.enabled).length;
            return (
              <section key={role}>
                <div className="mb-3 flex items-center gap-2.5">
                  <div className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md bg-[--surface-sunken] text-[--text-tertiary]">
                    <RoleGlyph size={15} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-[--text-secondary]">{meta.label}</h2>
                    <span className="text-[11px] text-[--text-tertiary]">{meta.blurb}</span>
                  </div>
                  <div className="ml-2 h-px flex-1 bg-[--border-default] opacity-60" />
                  {liveInGroup > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full bg-[--green-50] px-2 py-0.5 text-[10px] font-semibold text-[--green-700] ring-1 ring-[--green-200]">
                      <span className="h-[5px] w-[5px] rounded-full bg-[--green-500]" aria-hidden /> {liveInGroup} live
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.map((c) => (
                    <ConnectorTile
                      key={c.id}
                      connector={c}
                      onInstall={() => act(c.id, 'install')}
                      onConfigure={() => { setSelected(c.id); setTab('installed'); }}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === 'installed' && (
        <InstalledPanel
          connectors={installed}
          current={current}
          onSelect={setSelected}
          onEnable={(id, enabled) => act(id, 'enable', { enabled })}
          onConfig={(id, body) => act(id, 'config', body)}
          onUninstall={(id) => act(id, 'uninstall')}
          onBrowse={() => setTab('catalog')}
        />
      )}
    </div>
  );
}

/* ── Segmented control (tabs / sub-tabs / mode) ───────────────── */
interface SegOption { value: string; label: string; icon?: React.ReactNode; badge?: number; activeClass?: string; }
function Segmented({
  value, onChange, options, size = 'md', testIdPrefix,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SegOption[];
  size?: 'sm' | 'md' | 'lg';
  testIdPrefix?: string;
}) {
  const pad = size === 'lg' ? 'h-9 px-4 text-[13px]' : size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[12px]';
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-[--border-default] bg-[--surface-sunken] p-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-100',
              pad,
              active
                ? (o.activeClass ?? 'bg-[--surface-card] text-[--text-primary] [box-shadow:var(--shadow-sm)]')
                : 'text-[--text-secondary] hover:text-[--text-primary]',
            ].join(' ')}
            aria-pressed={active}
          >
            {o.icon}
            {o.label}
            {o.badge !== undefined && (
              <span className={[
                'ml-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                active ? 'bg-[--green-100] text-[--green-700]' : 'bg-[--neutral-200] text-[--text-secondary]',
              ].join(' ')}>{o.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Connector tile (Catalog) ─────────────────────────────────── */
function ConnectorTile({ connector: c, onInstall, onConfigure }: { connector: Connector; onInstall: () => void; onConfigure: () => void }) {
  const live = c.installed && c.enabled;
  return (
    <div
      className={[
        'group relative flex min-h-[166px] flex-col overflow-hidden rounded-xl border border-[--border-default] bg-[--surface-card] p-4',
        '[box-shadow:var(--shadow-xs)] transition-all duration-150',
        'hover:-translate-y-[2px] hover:[box-shadow:var(--shadow-md)]',
        c.installed ? 'hover:border-[--papaya-200]' : 'hover:border-[--border-strong]',
      ].join(' ')}
    >
      {/* live accent rail — green = installed & enabled */}
      {live && <span className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-gradient-to-b from-[--green-500] to-[--green-600]" aria-hidden />}

      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[--surface-sunken] [box-shadow:var(--shadow-xs)] ring-1 ring-black/[0.06]">
          <ConnectorIcon name={c.icon} kind="logo" size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-semibold tracking-tight text-[--text-primary]">{c.name}</p>
            {c.installed ? (
              <Badge variant={c.enabled ? (c.mode === 'prod' ? 'real' : 'mock') : 'off'} size="xs">
                {c.enabled ? c.mode.toUpperCase() : 'OFF'}
              </Badge>
            ) : (
              <span className="whitespace-nowrap rounded border border-[--border-default] bg-[--surface-sunken] px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-[--text-tertiary]">
                Available
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-[--text-tertiary]">{ROLE_META[c.role]?.label ?? c.role}</p>
        </div>
      </div>

      <p className="mt-3 min-h-[40px] line-clamp-2 text-[12px] leading-[1.65] text-[--text-secondary]">{c.description}</p>

      <div className="mt-auto flex items-center justify-between border-t border-[--border-default] pt-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[--text-tertiary]">
          <Wrench size={12} />
          {c.capabilities.length > 0 ? `${c.capabilities.length} ${c.capabilities.length === 1 ? 'tool' : 'tools'}` : 'no tools'}
        </span>
        {c.installed ? (
          <button
            onClick={onConfigure}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[--border-default] bg-[--surface-card] px-3 py-1.5 text-[11px] font-medium text-[--text-secondary] transition-all hover:border-[--border-strong] hover:bg-[--surface-hover] hover:text-[--text-primary]"
          >
            <Settings2 size={13} /> Configure
          </button>
        ) : (
          <button
            onClick={onInstall}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[--papaya-500] px-3 py-1.5 text-[11px] font-semibold text-white [box-shadow:var(--shadow-sm)] transition-all hover:bg-[--papaya-600] active:scale-[0.97]"
          >
            <Plus size={13} /> Install
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Installed master/detail ──────────────────────────────────── */
interface InstalledPanelProps {
  connectors: Connector[];
  current: Connector | null;
  onSelect: (id: string) => void;
  onEnable: (id: string, enabled: boolean) => void;
  onConfig: (id: string, body: unknown) => void;
  onUninstall: (id: string) => void;
  onBrowse: () => void;
}

function InstalledPanel({ connectors, current, onSelect, onEnable, onConfig, onUninstall, onBrowse }: InstalledPanelProps) {
  const [subtab, setSubtab] = useState<'general' | 'mocked-data' | 'prod' | 'actions' | 'triggers'>('general');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [selectedActionName, setSelectedActionName] = useState<string | null>(null);
  const [selectedTriggerName, setSelectedTriggerName] = useState<string | null>(null);

  // Reset side-panel selection whenever the master connector changes so an out-of-context
  // capability id doesn't linger.
  useEffect(() => { setSelectedActionName(null); setSelectedTriggerName(null); }, [current?.id]);

  useEffect(() => {
    if (subtab === 'mocked-data' && current) {
      fetch(`${ENGINE}/integrations/${current.id}/data?tenant=papaya`).then((r) => r.json()).then(setData).catch(() => setData([]));
    }
  }, [subtab, current]);

  if (!current) {
    return (
      <Card>
        <EmptyState
          icon={<Plus size={20} />}
          title="No connectors installed"
          description="Install one from the Catalog to configure it."
        />
        <div className="flex justify-center pb-2">
          <button onClick={onBrowse} className="inline-flex items-center gap-1 text-[12px] font-medium text-[--papaya-600] hover:underline">
            Browse the catalog <ArrowRight size={13} />
          </button>
        </div>
      </Card>
    );
  }

  const SUBTABS: { value: typeof subtab; label: string; icon: React.ReactNode }[] = [
    { value: 'general', label: 'General', icon: <Settings2 size={13} /> },
    { value: 'mocked-data', label: 'Mocked Data', icon: <FlaskConical size={13} /> },
    { value: 'prod', label: 'Prod', icon: <Cloud size={13} /> },
    { value: 'actions', label: 'Actions', icon: <Wrench size={13} /> },
    { value: 'triggers', label: 'Triggers', icon: <Webhook size={13} /> },
  ];

  return (
    <div className="flex gap-4">
      {/* master list */}
      <ul className="w-56 flex-shrink-0 space-y-1" data-testid="installed-list">
        {connectors.map((c) => {
          const active = current.id === c.id;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={[
                  'group relative flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-100',
                  active
                    ? 'border-[--papaya-200] bg-[--papaya-50] [box-shadow:var(--shadow-xs)]'
                    : 'border-transparent hover:bg-[--surface-hover]',
                ].join(' ')}
              >
                {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[--papaya-500]" aria-hidden />}
                <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-[--surface-sunken] ring-1 ring-[--border-default]">
                  <ConnectorIcon name={c.icon} kind="logo" size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13px] font-medium ${active ? 'text-[--text-primary]' : 'text-[--text-secondary]'}`}>{c.name}</p>
                  <p className="truncate text-[10px] uppercase tracking-[0.05em] text-[--text-tertiary]">{ROLE_META[c.role]?.label ?? c.role}</p>
                </div>
                <span className={[
                  'h-2 w-2 flex-shrink-0 rounded-full',
                  c.enabled ? 'bg-[--green-500]' : 'bg-[--status-off-base]',
                ].join(' ')} title={c.enabled ? 'connected' : 'off'} />
              </button>
            </li>
          );
        })}
      </ul>

      {/* detail */}
      <Card className="flex-1 overflow-hidden" padding={false}>
        {/* detail header band */}
        <div className="relative border-b border-[--border-default] bg-gradient-to-br from-[--surface-sunken] to-[--surface-card] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[--surface-sunken] ring-1 ring-[--border-default] [box-shadow:var(--shadow-sm)]">
                <ConnectorIcon name={current.icon} kind="logo" size={26} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[--text-primary]">{current.name}</h2>
                  <Badge variant={current.enabled ? (current.mode === 'prod' ? 'real' : 'mock') : 'off'} size="xs">
                    {current.enabled ? current.mode.toUpperCase() : 'OFF'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-[--text-tertiary]">{ROLE_META[current.role]?.label ?? current.role} · {current.description}</p>
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-[--border-default] bg-[--surface-card] px-2.5 py-1.5">
              <span className="text-[11px] font-medium text-[--text-secondary]">{current.enabled ? 'Enabled' : 'Disabled'}</span>
              <Toggle checked={current.enabled} onChange={(v: boolean) => onEnable(current.id, v)} />
            </label>
          </div>

          <div className="mt-3.5">
            <Segmented
              value={subtab}
              onChange={(v) => setSubtab(v as typeof subtab)}
              testIdPrefix="subtab"
              size="sm"
              options={SUBTABS.map((s) => ({ value: s.value, label: s.label, icon: s.icon }))}
            />
          </div>
        </div>

        {/* detail body */}
        <div className="p-4">
          {subtab === 'general' && (
            <div className="space-y-3">
              <Row label="Active mode" hint="Mock simulates the system over synthetic data; prod is cosmetic in this demo.">
                <Segmented
                  value={current.mode}
                  onChange={(v) => onConfig(current.id, { mode: v })}
                  options={[
                    { value: 'mock', label: 'Mock', icon: <FlaskConical size={12} />, activeClass: 'bg-[--status-mock-bg] text-[--status-mock-text] [box-shadow:var(--shadow-xs)]' },
                    { value: 'prod', label: 'Prod', icon: <Cloud size={12} />, activeClass: 'bg-[--status-real-bg] text-[--status-real-text] [box-shadow:var(--shadow-xs)]' },
                  ]}
                />
              </Row>
              <Row label="Enabled" hint="Disabled connectors hide their actions from Pixush.">
                <Toggle checked={current.enabled} onChange={(v: boolean) => onEnable(current.id, v)} />
              </Row>
              <div className="border-t border-[--border-default] pt-3">
                <button
                  onClick={() => onUninstall(current.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[--red-200] bg-[--red-50] px-2.5 py-1.5 text-[12px] font-medium text-[--red-600] transition-colors hover:bg-[--red-100]"
                >
                  <Trash2 size={13} /> Uninstall connector
                </button>
              </div>
            </div>
          )}

          {subtab === 'mocked-data' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[--amber-200] bg-[--amber-50] p-3">
                <Row
                  label="Fail next call"
                  hint="The next call to this system errors once — use it to demo a live escalation."
                  tone="amber"
                >
                  <Toggle checked={!!current.config.mock.failNext} onChange={(v: boolean) => onConfig(current.id, { mock: { failNext: v } })} />
                </Row>
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[--text-tertiary]">
                  <Database size={13} /> Mocked records
                </p>
                <Table
                  columns={Object.keys(data[0] ?? { record: '' }).slice(0, 5).map((k) => ({ key: k, label: k }))}
                  rows={data as Record<string, unknown>[]}
                  empty="No records yet — run a scenario to populate this system."
                />
                <p className="mt-2 text-[11px] leading-relaxed text-[--text-tertiary]">
                  Mock adapters are stateful simulators over synthetic data — deterministic, idempotent, and fully audited.
                </p>
              </div>
            </div>
          )}

          {subtab === 'prod' && (
            <div className="rounded-xl border border-dashed border-[--border-strong] bg-[--surface-sunken] p-4">
              <div className="flex items-start gap-2.5">
                <Cloud size={16} className="mt-0.5 flex-shrink-0 text-[--text-tertiary]" />
                <p className="text-[12px] leading-relaxed text-[--text-secondary]">
                  Prod adapters are not wired in this demo — the mock adapter runs underneath.
                  Endpoint, auth reference (Secrets Manager), record IDs and rate limits would be configured here.
                </p>
              </div>
            </div>
          )}

          {subtab === 'actions' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-[--papaya-100] bg-[--papaya-50] px-3 py-2">
                <Zap size={14} className="mt-0.5 flex-shrink-0 text-[--papaya-600]" />
                <p className="text-[12px] leading-relaxed text-[--text-secondary]">
                  These are the actions Pixush can invoke on this system while running a workflow.
                  Actions marked <span className="font-semibold text-[--green-700]">Live</span> work now; the rest map the system's wider API. Click any action to see its contract.
                </p>
              </div>
              <div className="flex gap-3">
                <ul className="flex-1 space-y-1.5">
                  {current.capabilities.length === 0 && (
                    <li className="rounded-lg border border-dashed border-[--border-default] p-3 text-center text-[12px] text-[--text-tertiary]">
                      This connector exposes no actions.
                    </li>
                  )}
                  {current.capabilities.map((cap) => {
                    const active = selectedActionName === cap.name;
                    return (
                      <li key={cap.name}>
                        <button
                          type="button"
                          onClick={() => setSelectedActionName(cap.name)}
                          data-testid={`integration-action-${cap.name}`}
                          className={[
                            'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                            active
                              ? 'border-[--papaya-300] bg-[--papaya-50]'
                              : 'border-[--border-default] bg-[--surface-card] hover:bg-[--surface-hover]',
                          ].join(' ')}
                        >
                          <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md border border-[--border-default] bg-[--surface-sunken]">
                            <ConnectorIcon name={current.icon} kind="logo" size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium leading-tight text-[--text-primary]">{cap.label}</p>
                            <p className="truncate text-[11px] text-[--text-tertiary]">{cap.description}</p>
                          </div>
                          {cap.wired ? (
                            current.enabled
                              ? <span className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-full bg-[--green-50] px-1.5 py-0.5 text-[10px] font-semibold text-[--green-700]"><Check size={10} /> Live</span>
                              : <span className="ml-auto flex-shrink-0 rounded-full bg-[--surface-sunken] px-1.5 py-0.5 text-[10px] font-semibold text-[--text-tertiary]">Hidden</span>
                          ) : (
                            <span className="ml-auto flex-shrink-0 rounded-full border border-[--border-default] px-1.5 py-0.5 text-[10px] font-medium text-[--text-tertiary]">Available</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <SchemaSidePanel
                  capability={current.capabilities.find((c) => c.name === selectedActionName) ?? null}
                />
              </div>
            </div>
          )}

          {subtab === 'triggers' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-[--blue-100] bg-[--blue-50] px-3 py-2">
                <Webhook size={14} className="mt-0.5 flex-shrink-0 text-[--blue-600]" />
                <p className="text-[12px] leading-relaxed text-[--text-secondary]">
                  Triggers are inbound webhooks from this system that can start a Pixush workflow.
                  They're modelled here; wiring them to live webhooks is a later step.
                </p>
              </div>
              <div className="flex gap-3">
                <ul className="flex-1 space-y-1.5">
                  {(current.triggers ?? []).length === 0 && (
                    <li className="rounded-lg border border-dashed border-[--border-default] p-3 text-center text-[12px] text-[--text-tertiary]">
                      No triggers for this system yet.
                    </li>
                  )}
                  {(current.triggers ?? []).map((t) => {
                    const active = selectedTriggerName === t.name;
                    return (
                      <li key={t.name}>
                        <button
                          type="button"
                          onClick={() => setSelectedTriggerName(t.name)}
                          data-testid={`integration-trigger-${t.name}`}
                          className={[
                            'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                            active
                              ? 'border-[--blue-200] bg-[--blue-50]'
                              : 'border-[--border-default] bg-[--surface-card] hover:bg-[--surface-hover]',
                          ].join(' ')}
                        >
                          <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md border border-[--border-default] bg-[--surface-sunken] text-[--blue-600]">
                            <Webhook size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium leading-tight text-[--text-primary]">{t.label}</p>
                            <p className="truncate text-[11px] text-[--text-tertiary]">{t.description}</p>
                          </div>
                          <span className="ml-auto flex-shrink-0 rounded-full border border-[--border-default] px-1.5 py-0.5 font-mono text-[10px] text-[--text-tertiary]">{t.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <TriggerSidePanel
                  trigger={(current.triggers ?? []).find((t) => t.name === selectedTriggerName) ?? null}
                />
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ── Schema side panel for the Actions sub-tab ─────────────────── */
function SchemaSidePanel({ capability }: { capability: Capability | null }) {
  if (!capability) {
    return (
      <div className="w-72 flex-shrink-0 rounded-lg border border-dashed border-[--border-default] bg-[--surface-card] p-3 text-[12px] text-[--text-tertiary]">
        Pick an action to see its input/output contract.
      </div>
    );
  }
  return (
    <div className="w-72 flex-shrink-0 space-y-3 rounded-lg border border-[--border-default] bg-[--surface-card] p-3" data-testid="schema-side-panel">
      <div>
        <p className="font-mono text-[10px] text-[--text-tertiary]">{capability.name}</p>
        <p className="mt-0.5 text-[13px] font-semibold text-[--text-primary]">{capability.label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[--text-secondary]">{capability.description}</p>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">Inputs</p>
        {capability.inputSchema
          ? <SchemaTree node={capability.inputSchema} />
          : <p className="text-[11px] text-[--text-tertiary]">Not wired in this demo.</p>}
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">Output</p>
        {capability.outputSchema
          ? <SchemaTree node={capability.outputSchema} />
          : <p className="text-[11px] text-[--text-tertiary]">Not wired in this demo.</p>}
      </div>
    </div>
  );
}

/* ── Side panel for the Triggers sub-tab ──────────────────────── */
function TriggerSidePanel({ trigger }: { trigger: Trigger | null }) {
  if (!trigger) {
    return (
      <div className="w-72 flex-shrink-0 rounded-lg border border-dashed border-[--border-default] bg-[--surface-card] p-3 text-[12px] text-[--text-tertiary]">
        Pick a trigger to see its description.
      </div>
    );
  }
  return (
    <div className="w-72 flex-shrink-0 space-y-3 rounded-lg border border-[--border-default] bg-[--surface-card] p-3" data-testid="trigger-side-panel">
      <div>
        <p className="font-mono text-[10px] text-[--text-tertiary]">{trigger.name}</p>
        <p className="mt-0.5 text-[13px] font-semibold text-[--text-primary]">{trigger.label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[--text-secondary]">{trigger.description}</p>
      </div>
      <p className="text-[11px] text-[--text-tertiary]">
        Workflows pick a trigger in the editor's TriggerInspector. The sample payload that fires during Test flow lives on the workflow definition itself.
      </p>
    </div>
  );
}

/* ── Labeled config row ───────────────────────────────────────── */
function Row({ label, hint, tone, children }: { label: string; hint?: string; tone?: 'amber'; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className={`text-[13px] font-medium ${tone === 'amber' ? 'text-[--amber-700]' : 'text-[--text-primary]'}`}>{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-[--text-tertiary]">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
