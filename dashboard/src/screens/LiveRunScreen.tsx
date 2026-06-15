import { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Textarea,
  Table,
  TraceRow,
  LoadingState,
  ErrorState,
  EmptyState,
  StreamingState,
  ConnectorIcon,
} from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

interface AuditEntry {
  ts: string;
  capability: string;
  target: string;
  summary: string;
}

const AUDIT_COLUMNS = [
  { key: 'capability', label: 'Capability', mono: true },
  { key: 'target', label: 'Target' },
  { key: 'summary', label: 'Summary', muted: true },
  {
    key: 'ts',
    label: 'Time',
    muted: true,
    render: (v: unknown) => {
      if (!v) return '—';
      const d = new Date(v as string);
      return isNaN(d.getTime()) ? String(v) : d.toLocaleTimeString();
    },
  },
];

type RunState = 'idle' | 'running' | 'done' | 'error';

interface LiveRunScreenProps {
  autoTrigger?: boolean;
}

export function LiveRunScreen({ autoTrigger = false }: LiveRunScreenProps) {
  const [task, setTask] = useState(
    'Onboard Maya Cohen (id e1, Engineer, start 2026-07-01)'
  );
  const [response, setResponse] = useState('');
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [runState, setRunState] = useState<RunState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Simulate inbound (demo step 10) — manager messages the bot on WhatsApp.
  const [simFrom, setSimFrom] = useState('+972546358808');
  const [simBody, setSimBody] = useState('Hi Pixush, when does Maya start? Did we send the welcome?');
  const [simRunId, setSimRunId] = useState<string | null>(null);
  const [simError, setSimError] = useState('');

  async function simulateInbound() {
    setSimError('');
    setSimRunId(null);
    try {
      const r = await fetch(`${ENGINE}/simulate/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'whatsapp', from: simFrom, body: simBody }),
      });
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      const body = await r.json();
      setSimRunId(body.runId ?? null);
    } catch (e) {
      setSimError(e instanceof Error ? e.message : 'Could not simulate inbound');
    }
  }

  async function trigger() {
    setRunState('running');
    setResponse('');
    setAudit([]);
    setErrorMsg('');
    try {
      const r = await fetch(`${ENGINE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, context: { tenant: 'papaya' } }),
      });
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      const body = await r.json();
      setResponse(body.response ?? '');
      const a = await fetch(`${ENGINE}/audit?tenant=papaya`);
      if (a.ok) setAudit(await a.json());
      setRunState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setRunState('error');
    }
  }

  useEffect(() => {
    if (autoTrigger) trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[--text-primary] tracking-tight mb-0.5">
          Live run
        </h1>
        <p className="text-[13px] text-[--text-secondary]">
          Trigger a scenario and watch the agent work in real time.
        </p>
      </div>

      {/* Task input card */}
      <Card>
        <CardHeader title="Scenario task" subtitle="Describe the HR task to run" />
        <CardBody>
          <Textarea
            value={task}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTask(e.target.value)}
            rows={3}
            placeholder="Onboard Maya Cohen…"
            disabled={runState === 'running'}
          />
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              leftIcon={<Play size={14} />}
              onClick={trigger}
              loading={runState === 'running'}
              disabled={runState === 'running'}
            >
              Trigger scenario
            </Button>
            {runState === 'done' && (
              <span className="text-[12px] text-[--text-tertiary]">
                Scenario complete
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Simulate inbound WhatsApp — demo step 10 */}
      <Card>
        <CardHeader title="Simulate inbound WhatsApp" subtitle="The hiring manager messages the bot" />
        <CardBody>
          <div className="space-y-2">
            <input
              type="text"
              value={simFrom}
              onChange={(e) => setSimFrom(e.target.value)}
              placeholder="+972546358808"
              className="w-full rounded-md border border-[--border-default] bg-[--surface-card] px-2 py-1.5 text-[12px] text-[--text-primary] focus:border-[--papaya-300] focus:outline-none focus:ring-2 focus:ring-[--papaya-100]"
            />
            <textarea
              value={simBody}
              onChange={(e) => setSimBody(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[--border-default] bg-[--surface-card] px-2 py-1.5 text-[12px] text-[--text-primary] focus:border-[--papaya-300] focus:outline-none focus:ring-2 focus:ring-[--papaya-100]"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={simulateInbound}
                data-testid="simulate-inbound"
              >
                Simulate inbound
              </Button>
              {simRunId && (
                <span className="font-mono text-[11px] text-[--text-tertiary]" data-testid="simulate-runid">
                  run: {simRunId}
                </span>
              )}
              {simError && (
                <span className="text-[11px] text-[--red-600]">{simError}</span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Response card */}
      <Card>
        <CardHeader title="Agent response" />
        <CardBody>
          {runState === 'idle' && (
            <EmptyState
              title="No response yet"
              description="Trigger a scenario above to see the agent response here."
            />
          )}
          {runState === 'running' && (
            <StreamingState label="Running…" step="Agent is processing your request" />
          )}
          {runState === 'error' && (
            <ErrorState
              title="Couldn't reach the engine"
              description={errorMsg || 'Check the connection and try again.'}
              onRetry={trigger}
            />
          )}
          {runState === 'done' && response && (
            <pre
              className="whitespace-pre-wrap text-[13px] leading-relaxed text-[--text-primary] font-[family-name:var(--font-sans)] m-0"
              data-testid="response-text"
            >
              {response}
            </pre>
          )}
        </CardBody>
      </Card>

      {/* Tool-calls trace card */}
      {runState === 'done' && audit.length > 0 && (
        <Card>
          <CardHeader
            title="Tool calls"
            subtitle={`${audit.length} ${audit.length === 1 ? 'step' : 'steps'} across systems`}
          />
          <CardBody>
            <div role="list" data-testid="trace-list">
              {audit.map((e, i) => (
                <TraceRow
                  key={i}
                  status="success"
                  label={e.capability}
                  value={e.summary}
                  icon={<ConnectorIcon name={e.capability} kind="capability" size={16} />}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Audit card */}
      <Card padding={false}>
        <div className="p-4 pb-3">
          <CardHeader
            title="Audit log"
            subtitle={
              audit.length > 0
                ? `${audit.length} ${audit.length === 1 ? 'action' : 'actions'} recorded`
                : undefined
            }
          />
        </div>
        {runState === 'idle' && (
          <EmptyState
            title="No audit entries"
            description="Audit entries will appear here after a scenario runs."
            className="pb-8"
          />
        )}
        {runState === 'running' && (
          <div className="px-4 pb-4">
            <LoadingState rows={3} />
          </div>
        )}
        {(runState === 'done' || runState === 'error') && audit.length === 0 && (
          <EmptyState
            title="No audit entries recorded"
            className="pb-8"
          />
        )}
        {audit.length > 0 && (
          <Table
            columns={AUDIT_COLUMNS}
            rows={audit as unknown as Record<string, unknown>[]}
            className="border-0 rounded-none border-t border-[--border-default]"
          />
        )}
      </Card>
    </div>
  );
}
