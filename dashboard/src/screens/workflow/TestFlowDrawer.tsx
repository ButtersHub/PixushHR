import { useEffect, useRef, useState } from "react";
import { X, ChevronRight, AlertCircle, Loader } from "lucide-react";
import { ConnectorIcon, Badge } from "../../ui/index";
import { api } from "./api";
import type { AuditEntry, Run } from "./types";

interface Props {
  /** The workflow being tested — used for the header subtitle. Null = closed. */
  workflowId: string | null;
  runId: string | null;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 750;

/** Bottom drawer for /workflows/:id/test runs. Polls /runs/:id + /audit?runId=
 *  every 750ms (paused on document.hidden) until the run reaches a terminal state. */
export function TestFlowDrawer({ workflowId, runId, onClose }: Props) {
  const [run, setRun] = useState<Run | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    async function tick() {
      if (cancelled || document.hidden) return;
      try {
        const [r, a] = await Promise.all([api.getRun(runId!), api.auditForRun(runId!)]);
        if (cancelled) return;
        setRun(r);
        setAudit((cur) => (sameAudit(cur, a) ? cur : a));
        if (r.status === "done" || r.status === "error") {
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      } catch {
        /* swallow — polling resumes on the next tick */
      }
    }

    tick();
    timerRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setRun(null);
      setAudit([]);
      setExpanded(null);
    };
  }, [runId]);

  if (!workflowId || !runId) return null;

  const elapsed = run ? Math.max(0, Math.floor((Date.now() - run.startedAt) / 1000)) : 0;
  const status = run?.status ?? "running";

  return (
    <section
      data-testid="test-flow-drawer"
      className="border-t border-[--border-default] bg-[--surface-sunken]"
    >
      <header className="flex items-center gap-2 border-b border-[--border-default] bg-[--surface-card] px-4 py-2 text-[12px]">
        {status === "running" && <Loader size={12} className="animate-spin text-[--papaya-600]" />}
        {status === "done" && <span aria-hidden className="h-2 w-2 rounded-full bg-[--green-500]" />}
        {status === "error" && <AlertCircle size={12} className="text-[--red-600]" />}
        <span className="font-semibold text-[--text-primary]">Test run · {workflowId}</span>
        <span className="text-[--text-tertiary]">
          · {elapsed}s · {audit.length} step{audit.length === 1 ? "" : "s"}
          {status === "error" && run?.error && ` · ${run.error}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="ml-auto text-[--text-tertiary] hover:text-[--text-primary]"
        >
          <X size={14} />
        </button>
      </header>

      <ol className="max-h-[280px] space-y-1.5 overflow-auto p-3" data-testid="test-flow-audit">
        {audit.map((e, idx) => {
          const isOpen = expanded === e.id;
          const isReal = e.actor === "hermes-native";
          const variant = isReal ? "real" : "mock";
          const label = isReal ? "REAL" : "MOCK";
          const errored = e.status === "error";
          return (
            <li key={e.id} data-testid={`test-row-${idx}`}>
              <div
                onClick={() => setExpanded(isOpen ? null : e.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") setExpanded(isOpen ? null : e.id); }}
                className={[
                  "cursor-pointer rounded-md border bg-[--surface-card] px-3 py-2 transition-colors hover:bg-[--surface-hover]",
                  errored ? "border-l-2 border-l-[--red-500] border-[--border-default]" : "border-l-2 border-l-[--green-500] border-[--border-default]",
                ].join(" ")}
              >
                <div className="flex items-center gap-2 text-[12px]">
                  <ChevronRight
                    size={12}
                    className={`text-[--text-tertiary] transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                  <span className="w-5 text-right font-mono text-[10px] text-[--text-tertiary]">
                    {idx + 1}
                  </span>
                  {e.integration && (
                    <ConnectorIcon name={connectorIconHint(e)} kind="logo" size={14} />
                  )}
                  <span className="truncate font-medium text-[--text-primary]">
                    {e.label ?? e.capability}
                  </span>
                  <Badge variant={variant} size="xs">{label}</Badge>
                  <span className="ml-auto font-mono text-[10.5px] text-[--text-tertiary]">
                    {e.durationMs ? `${e.durationMs}ms` : ""}
                  </span>
                </div>
                <p className="ml-7 mt-0.5 text-[11px] text-[--text-secondary]">{e.summary}</p>
                {isOpen && (
                  <div className="ml-7 mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
                    <pre className="max-h-32 overflow-auto rounded bg-[--surface-sunken] p-2">
{JSON.stringify(e.inputs ?? {}, null, 2)}
                    </pre>
                    <pre className="max-h-32 overflow-auto rounded bg-[--surface-sunken] p-2">
{JSON.stringify(e.outputs ?? {}, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {status === "running" && audit.length === 0 && (
          <li className="text-[12px] text-[--text-tertiary]">Run starting…</li>
        )}
      </ol>

      {status === "done" && run?.response && (
        <div className="border-t border-[--border-default] bg-[--surface-card] px-4 py-2 text-[12px]" data-testid="test-flow-response">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[--text-tertiary]">
            Agent response
          </p>
          <p className="text-[12px] text-[--text-primary]">{run.response}</p>
        </div>
      )}
    </section>
  );
}

function sameAudit(a: AuditEntry[], b: AuditEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i].id) return false;
  return true;
}

function connectorIconHint(e: AuditEntry): string {
  if (e.integration === "Gmail")    return "gmail";
  if (e.integration === "WhatsApp") return "whatsapp";
  if (e.integration === "Channels") return "teams";
  if (e.integration === "ATS")      return "comeet";
  if (e.integration === "HRIS")     return "shapes";
  if (e.integration === "Calendar") return "calendar";
  if (e.integration === "Content")  return "branding";
  return "shapes";
}
