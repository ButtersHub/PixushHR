import { useCallback, useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button, Card, CardHeader, LoadingState, ErrorState } from "../../ui/index";
import { WorkflowPicker } from "./WorkflowPicker";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { Inspector } from "./Inspector/Inspector";
import { TestFlowDrawer } from "./TestFlowDrawer";
import { api } from "./api";
import type {
  ActionNode,
  AuditEntry,
  Capability,
  TriggerCatalog,
  WorkflowDef,
  WorkflowNode,
  WorkflowSummary,
} from "./types";

type Mode = "mock" | "prod" | undefined;
type ScreenState = "loading" | "done" | "error";

/** Top-level Workflow Editor — composes the four areas chosen in the brainstorm
 *  (picker · canvas · inspector · bottom drawer). */
export function WorkflowEditorScreen() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWfId, setSelectedWfId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDef | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [triggers, setTriggers] = useState<TriggerCatalog[]>([]);
  const [installedModeByConnector, setInstalledMode] = useState<Record<string, Mode>>({});
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [lastRunAudit, setLastRunAudit] = useState<AuditEntry[] | undefined>(undefined);

  const loadList = useCallback(async () => {
    setWorkflows(await api.listWorkflows());
  }, []);

  const loadAll = useCallback(async () => {
    setScreenState("loading");
    try {
      const [wfs, caps, trigs, integrations] = await Promise.all([
        api.listWorkflows(),
        api.capabilities(),
        api.triggers(),
        api.integrations(),
      ]);
      setWorkflows(wfs);
      setCapabilities(caps);
      setTriggers(trigs);
      const modeMap: Record<string, Mode> = {};
      for (const c of integrations) {
        modeMap[c.id] = c.installed && c.enabled ? c.mode : undefined;
      }
      setInstalledMode(modeMap);
      setSelectedWfId((cur) => cur ?? (wfs[0]?.id ?? null));
      setScreenState("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
      setScreenState("error");
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!selectedWfId) { setWorkflow(null); setLastRunAudit(undefined); return; }
    api.getWorkflow(selectedWfId)
      .then((wf) => {
        setWorkflow(wf);
        setSelectedNode(null);
      })
      .catch((e: unknown) => setErrorMsg(e instanceof Error ? e.message : "Failed to load workflow"));
  }, [selectedWfId]);

  async function save() {
    if (!workflow) return;
    setSaveError("");
    try {
      await api.putWorkflow(workflow);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function startTest() {
    if (!selectedWfId) return;
    setLastRunAudit(undefined);
    const r = await api.startTest(selectedWfId);
    setRunId(r.runId);
    pollAuditUntilTerminal(r.runId);
  }

  function pollAuditUntilTerminal(currentRunId: string) {
    const interval = window.setInterval(async () => {
      try {
        const run = await api.getRun(currentRunId);
        const a = await api.auditForRun(currentRunId);
        setLastRunAudit(a);
        if (run.status === "done" || run.status === "error") window.clearInterval(interval);
      } catch { /* ignore — next tick */ }
    }, 750);
  }

  function insertAfter(afterId: string | "trigger") {
    if (!workflow) return;
    const newId = `n${Object.keys(workflow.nodes).length + 1}_${Math.floor(performance.now())}`;
    const fallbackCap = capabilities[0]?.name ?? "";
    const newNode: ActionNode = { id: newId, kind: "action", capability: fallbackCap, input: {} };

    if (afterId === "trigger") {
      // Insert before the current root → newId becomes root, next → old root.
      newNode.next = workflow.root;
      const nodes = { ...workflow.nodes, [newId]: newNode };
      setWorkflow({ ...workflow, root: newId, nodes });
    } else {
      const anchor = workflow.nodes[afterId];
      if (!anchor || anchor.kind !== "action") return;
      newNode.next = anchor.next;
      const nodes: Record<string, WorkflowNode> = {
        ...workflow.nodes,
        [afterId]: { ...anchor, next: newId } as ActionNode,
        [newId]: newNode,
      };
      setWorkflow({ ...workflow, nodes });
    }
    setSelectedNode(newId);
  }

  if (screenState === "loading") {
    return (
      <div className="max-w-[--content-max-width] mx-auto p-2">
        <LoadingState rows={6} />
      </div>
    );
  }
  if (screenState === "error") {
    return (
      <div className="max-w-[--content-max-width] mx-auto p-2">
        <ErrorState title="Couldn't load the editor" description={errorMsg} onRetry={loadAll} />
      </div>
    );
  }

  const installedConnectorsSet = new Set(
    Object.entries(installedModeByConnector).filter(([, v]) => v).map(([k]) => k),
  );

  return (
    <div className="max-w-[--content-max-width] mx-auto flex flex-col gap-3" data-testid="workflow-editor">
      {/* ── Title row ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-[--text-primary]">
            Workflow editor
          </h1>
          <p className="text-[13px] text-[--text-secondary]">
            {workflow ? `${workflow.name} · v${workflow.version}` : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[12px] text-[--green-700]">Saved</span>}
          {saveError && <span className="text-[12px] text-[--red-600]">{saveError}</span>}
          <Button variant="secondary" size="sm" onClick={loadAll}>Reload</Button>
          <Button variant="primary" size="sm" onClick={save}>Save</Button>
          <Button variant="primary" size="sm" onClick={startTest} data-testid="test-flow-button">
            <Play size={12} /> Test flow
          </Button>
        </div>
      </div>

      {/* ── Picker row (dropdown + create/delete) ───────────────────────── */}
      <Card className="px-4 py-3">
        <WorkflowPicker
          workflows={workflows}
          selectedId={selectedWfId}
          onSelect={setSelectedWfId}
          onChange={loadList}
        />
      </Card>

      {/* ── Canvas + Inspector (full content width, aligned with drawer) ── */}
      <div className="flex gap-4">
        <Card className="flex-1 overflow-auto" padding={false}>
          <CardHeader
            title={workflow?.name ?? ""}
            subtitle={workflow ? `trigger: ${workflow.trigger.type} (${workflow.trigger.connector})` : ""}
          />
          {workflow && (
            <WorkflowCanvas
              workflow={workflow}
              capabilities={capabilities}
              installedModeByConnector={installedModeByConnector}
              selected={selectedNode}
              onSelect={setSelectedNode}
              onInsertAfter={insertAfter}
            />
          )}
        </Card>

        {workflow && (
          <Inspector
            workflow={workflow}
            selected={selectedNode}
            capabilities={capabilities}
            triggers={triggers}
            installedConnectors={installedConnectorsSet}
            onWorkflowChange={setWorkflow}
            lastRunAudit={lastRunAudit}
          />
        )}
      </div>

      {/* ── Test Flow drawer (full width, naturally aligned) ────────────── */}
      <TestFlowDrawer
        workflowId={selectedWfId}
        runId={runId}
        onClose={() => setRunId(null)}
      />
    </div>
  );
}
