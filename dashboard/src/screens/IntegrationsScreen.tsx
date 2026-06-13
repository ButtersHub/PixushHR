import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, ConnectorCard, ConnectorIcon, Toggle, Select, Table, Badge, LoadingState, ErrorState, EmptyState } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

interface Connector {
  id: string; name: string; role: string; description: string; icon: string;
  installed: boolean; enabled: boolean; mode: 'mock' | 'prod';
  config: { mock: { failNext?: boolean; latencyMs?: number; seed?: string }; prod: { baseUrl?: string; authRef?: string; ids?: string } };
  tools: string[];
}

const ROLES = ['HRIS', 'ATS', 'Channels', 'TaskBoard', 'Calendar', 'Content'];

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
    const r = await fetch(`${ENGINE}/integrations/${id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) { setErrorMsg(`Action failed (${r.status})`); setState('error'); return; }
    await load();
  }

  if (state === 'loading') return <div className="max-w-[--content-max-width] mx-auto p-2"><LoadingState rows={5} /></div>;
  if (state === 'error') return <div className="max-w-[--content-max-width] mx-auto p-2"><ErrorState title="Couldn't load integrations" description={errorMsg} onRetry={load} /></div>;

  const installed = connectors.filter((c) => c.installed);
  const current = installed.find((c) => c.id === selected) ?? installed[0] ?? null;

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[--text-primary] tracking-tight mb-0.5">Integrations</h1>
        <p className="text-[13px] text-[--text-secondary]">Install connectors, choose mock or prod, and see which tools each exposes.</p>
      </div>

      <div className="flex gap-1 border-b border-[--border-default]">
        {(['catalog', 'installed'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            data-testid={`tab-${t}`}
            className={[
              'px-3 py-2 text-[13px] font-medium border-b-2 -mb-px capitalize',
              tab === t ? 'border-[--papaya-500] text-[--text-primary]' : 'border-transparent text-[--text-secondary] hover:text-[--text-primary]',
            ].join(' ')}
          >
            {t}{t === 'installed' ? ` (${installed.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'catalog' && (
        <div className="space-y-5" data-testid="catalog">
          {ROLES.map((role) => {
            const group = connectors.filter((c) => c.role === role);
            if (group.length === 0) return null;
            return (
              <div key={role}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary] mb-2">{role}</p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.map((c) => (
                    <ConnectorCard
                      key={c.id}
                      name={c.name}
                      type={c.role}
                      description={c.description}
                      mode={c.installed ? (c.mode === 'prod' ? 'real' : 'mock') : undefined}
                      installed={c.installed}
                      icon={<ConnectorIcon name={c.icon} kind="logo" size={18} />}
                      onInstall={() => act(c.id, 'install')}
                      onConfigure={() => { setSelected(c.id); setTab('installed'); }}
                    />
                  ))}
                </div>
              </div>
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
        />
      )}
    </div>
  );
}

interface InstalledPanelProps {
  connectors: Connector[];
  current: Connector | null;
  onSelect: (id: string) => void;
  onEnable: (id: string, enabled: boolean) => void;
  onConfig: (id: string, body: unknown) => void;
  onUninstall: (id: string) => void;
}

function InstalledPanel({ connectors, current, onSelect, onEnable, onConfig, onUninstall }: InstalledPanelProps) {
  const [subtab, setSubtab] = useState<'general' | 'mock' | 'prod' | 'data' | 'tools'>('general');
  const [data, setData] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (subtab === 'data' && current) {
      fetch(`${ENGINE}/integrations/${current.id}/data?tenant=papaya`).then((r) => r.json()).then(setData).catch(() => setData([]));
    }
  }, [subtab, current]);

  if (!current) return <EmptyState title="No connectors installed" description="Install one from the Catalog to configure it." />;

  const SUBTABS: typeof subtab[] = ['general', 'mock', 'prod', 'data', 'tools'];

  return (
    <div className="flex gap-4">
      <ul className="w-48 flex-shrink-0 space-y-1" data-testid="installed-list">
        {connectors.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={[
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[13px] text-left',
                current.id === c.id ? 'bg-[--surface-sunken] text-[--text-primary]' : 'text-[--text-secondary] hover:bg-[--surface-hover]',
              ].join(' ')}
            >
              <ConnectorIcon name={c.icon} kind="logo" size={16} />
              <span className="truncate flex-1">{c.name}</span>
              <Badge variant={c.enabled ? (c.mode === 'prod' ? 'real' : 'mock') : 'off'} size="xs">
                {c.enabled ? c.mode.toUpperCase() : 'OFF'}
              </Badge>
            </button>
          </li>
        ))}
      </ul>

      <Card className="flex-1" padding={false}>
        <div className="flex items-center gap-3 p-4 pb-2">
          <ConnectorIcon name={current.icon} kind="logo" size={22} />
          <CardHeader title={current.name} subtitle={current.role} />
        </div>
        <div className="flex gap-1 border-b border-[--border-default] px-4">
          {SUBTABS.map((s) => (
            <button
              key={s}
              onClick={() => setSubtab(s)}
              data-testid={`subtab-${s}`}
              className={[
                'px-2.5 py-2 text-[12px] font-medium border-b-2 -mb-px capitalize',
                subtab === s ? 'border-[--papaya-500] text-[--text-primary]' : 'border-transparent text-[--text-secondary] hover:text-[--text-primary]',
              ].join(' ')}
            >
              {s === 'mock' ? 'Mock config' : s === 'prod' ? 'Prod config' : s}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3 text-[13px]">
          {subtab === 'general' && (
            <>
              <label className="flex items-center justify-between">
                <span className="text-[--text-secondary]">Enabled</span>
                <Toggle checked={current.enabled} onChange={(v: boolean) => onEnable(current.id, v)} />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-[--text-secondary]">Active mode</span>
                <Select
                  value={current.mode}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onConfig(current.id, { mode: e.target.value })}
                  options={[{ value: 'mock', label: 'Mock' }, { value: 'prod', label: 'Prod' }]}
                />
              </label>
              <button className="text-[12px] text-[--red-600] hover:underline" onClick={() => onUninstall(current.id)}>Uninstall connector</button>
            </>
          )}
          {subtab === 'mock' && (
            <>
              <label className="flex items-center justify-between">
                <span className="text-[--text-secondary]">Fail next call (drives an escalation)</span>
                <Toggle checked={!!current.config.mock.failNext} onChange={(v: boolean) => onConfig(current.id, { mock: { failNext: v } })} />
              </label>
              <p className="text-[12px] text-[--text-tertiary]">Mock adapters are stateful simulators over synthetic data.</p>
            </>
          )}
          {subtab === 'prod' && (
            <p className="text-[12px] text-[--text-tertiary]">Prod adapters are not configured in this demo — the mock adapter runs underneath. Endpoint / auth-ref / IDs would live here.</p>
          )}
          {subtab === 'data' && (
            <Table
              columns={Object.keys(data[0] ?? { record: '' }).slice(0, 5).map((k) => ({ key: k, label: k }))}
              rows={data as Record<string, unknown>[]}
              empty="No records yet — run a scenario."
            />
          )}
          {subtab === 'tools' && (
            <ul className="space-y-1.5">
              {current.tools.length === 0 && <li className="text-[--text-tertiary]">No tools.</li>}
              {current.tools.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <ConnectorIcon name={t} kind="capability" size={14} />
                  <span className="font-mono text-[12px]">{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
