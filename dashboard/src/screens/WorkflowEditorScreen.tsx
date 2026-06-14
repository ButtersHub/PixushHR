import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, Button, Dropdown, Input, FlowNode, BranchConnector, BindingPill, ConnectorIcon, LoadingState, ErrorState } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

type Binding = { kind: 'literal'; value: unknown } | { kind: 'ref'; from: string } | { kind: 'agent' };
interface ActionNode { id: string; kind: 'action'; capability: string; input: Record<string, Binding>; audience?: string; next?: string; }
interface ConditionNode { id: string; kind: 'condition'; expr: string; then: string; else?: string; }
type Node = ActionNode | ConditionNode;
interface WorkflowDef { id: string; name: string; version: number; trigger: { type: string }; root: string; nodes: Record<string, Node>; }
interface CapField { name: string; required: boolean; system: boolean; }
interface Capability { name: string; description: string; fields: CapField[]; sideEffectful: boolean; }

export function WorkflowEditorScreen() {
  const [wf, setWf] = useState<WorkflowDef | null>(null);
  const [caps, setCaps] = useState<Capability[]>([]);
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [wfRes, capRes] = await Promise.all([
        fetch(`${ENGINE}/workflows/onboarding?tenant=papaya`),
        fetch(`${ENGINE}/capabilities`),
      ]);
      if (!wfRes.ok) throw new Error(`Engine returned ${wfRes.status}`);
      setWf(await wfRes.json());
      setCaps(await capRes.json());
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!wf) return;
    setSaveError('');
    const res = await fetch(`${ENGINE}/workflows/onboarding?tenant=papaya`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wf),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    else { setSaveError(`Save failed (${res.status})`); }
  }

  function updateNode(id: string, patch: Partial<Node>) {
    setWf((prev) => prev && ({ ...prev, nodes: { ...prev.nodes, [id]: { ...prev.nodes[id], ...patch } as Node } }));
  }

  function addActionAfter(afterId: string) {
    if (!wf) return;
    const newId = `n${Object.keys(wf.nodes).length + 1}_${Math.floor(performance.now())}`;
    const after = wf.nodes[afterId];
    const newNode: ActionNode = { id: newId, kind: 'action', capability: caps[0]?.name ?? '', input: {}, next: after.kind === 'action' ? after.next : undefined };
    setWf({ ...wf, nodes: { ...wf.nodes, [newId]: newNode, [afterId]: { ...after, ...(after.kind === 'action' ? { next: newId } : {}) } as Node } });
    setSelected(newId);
  }

  if (state === 'loading') return <div className="max-w-[--content-max-width] mx-auto p-2"><LoadingState rows={6} /></div>;
  if (state === 'error') return <div className="max-w-[--content-max-width] mx-auto p-2"><ErrorState title="Couldn't load the workflow" description={errorMsg} onRetry={load} /></div>;
  if (!wf) return null;

  const ordered: { node: Node; branch?: 'then' | 'else' }[] = [];
  const seen = new Set<string>();
  function walk(id: string | undefined, branch?: 'then' | 'else') {
    if (!id || seen.has(id) || !wf!.nodes[id]) return;
    seen.add(id);
    const node = wf!.nodes[id];
    ordered.push({ node, branch });
    if (node.kind === 'action') walk(node.next);
    else { walk(node.then, 'then'); walk(node.else, 'else'); }
  }
  walk(wf.root);

  const selectedNode = selected ? wf.nodes[selected] : null;

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[--text-primary] tracking-tight mb-0.5">Workflow editor</h1>
          <p className="text-[13px] text-[--text-secondary]">A visual view of the typed workflow — edits apply to the next run.</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[12px] text-[--green-700]">Saved</span>}
          {saveError && <span className="text-[12px] text-[--red-600]">{saveError}</span>}
          <Button variant="secondary" size="sm" onClick={load}>Reset</Button>
          <Button variant="primary" size="sm" onClick={save}>Save</Button>
        </div>
      </div>

      <div className="flex gap-4">
        <Card className="flex-1">
          <CardHeader title={wf.name} subtitle={`v${wf.version} · trigger: ${wf.trigger.type}`} />
          <div className="flex flex-col items-center py-4" data-testid="workflow-canvas">
            <FlowNode variant="trigger" title={wf.trigger.type} subtitle="Trigger" />
            {ordered.map(({ node, branch }) => (
              <div key={node.id} className="flex flex-col items-center">
                <BranchConnector variant={branch ?? 'default'} label={branch?.toUpperCase()} />
                <FlowNode
                  variant={node.kind === 'condition' ? 'condition' : node.capability.includes('escalate') ? 'escalate' : 'action'}
                  title={node.kind === 'action' ? node.capability : node.expr}
                  subtitle={node.kind === 'action' ? (node.audience ?? 'action') : 'condition'}
                  selected={selected === node.id}
                  onClick={() => setSelected(node.id)}
                />
              </div>
            ))}
          </div>
        </Card>

        <Inspector node={selectedNode} caps={caps} onUpdate={updateNode} onAddAfter={addActionAfter} />
      </div>
    </div>
  );
}

interface InspectorProps {
  node: Node | null;
  caps: Capability[];
  onUpdate: (id: string, patch: Partial<Node>) => void;
  onAddAfter: (id: string) => void;
}

function Inspector({ node, caps, onUpdate, onAddAfter }: InspectorProps) {
  if (!node) {
    return (
      <Card className="w-72 flex-shrink-0">
        <CardHeader title="Inspector" subtitle="Select a node to edit it" />
        <div className="p-4 text-[13px] text-[--text-tertiary]">Click a step in the canvas.</div>
      </Card>
    );
  }

  const cap = node.kind === 'action' ? caps.find((c) => c.name === node.capability) : null;

  return (
    <Card className="w-72 flex-shrink-0" data-testid="inspector">
      <CardHeader title={node.kind === 'action' ? 'Action' : 'Condition'} subtitle={node.id} />
      <div className="p-4 space-y-3 text-[13px]">
        {node.kind === 'action' ? (
          <>
            <div className="block">
              <span className="text-[12px] text-[--text-secondary] flex items-center gap-1.5 mb-1">
                <ConnectorIcon name={node.capability} kind="capability" size={14} /> Capability
              </span>
              <Dropdown
                value={node.capability}
                onChange={(v) => onUpdate(node.id, { capability: v, input: {} } as Partial<Node>)}
                options={caps.map((c) => ({ value: c.name, label: c.name }))}
                className="w-full"
              />
            </div>
            <div className="block">
              <span className="text-[12px] text-[--text-secondary] mb-1 block">Audience</span>
              <Dropdown
                value={node.audience ?? ''}
                onChange={(v) => onUpdate(node.id, { audience: v === '' ? undefined : v } as Partial<Node>)}
                options={[
                  { value: '', label: 'No audience' },
                  { value: 'employee', label: 'Employee' },
                  { value: 'manager', label: 'Manager' },
                  { value: 'hr', label: 'HR' },
                  { value: 'team', label: 'Team' },
                ]}
                className="w-full"
              />
            </div>
            <div>
              <span className="text-[12px] text-[--text-secondary] mb-1.5 block">Inputs</span>
              <div className="space-y-1.5">
                {(cap?.fields.filter((f) => !f.system) ?? []).map((f) => {
                  const binding = node.input[f.name];
                  const variant = binding?.kind === 'ref' ? 'data-ref' : binding?.kind === 'agent' ? 'agent' : 'literal';
                  const value = binding?.kind === 'ref' ? binding.from : binding?.kind === 'literal' ? String(binding.value) : 'agent-filled';
                  return (
                    <div key={f.name} className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-mono text-[--text-tertiary]">{f.name}{f.required ? '*' : ''}</span>
                      <BindingPill variant={variant} value={value} field={f.name} />
                    </div>
                  );
                })}
                {(!cap || cap.fields.filter((f) => !f.system).length === 0) && <span className="text-[12px] text-[--text-tertiary]">No inputs.</span>}
              </div>
            </div>
          </>
        ) : (
          <label className="block">
            <span className="text-[12px] text-[--text-secondary] mb-1 block">Condition</span>
            <Input value={node.expr} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(node.id, { expr: e.target.value } as Partial<Node>)} />
          </label>
        )}
        {node.kind === 'action' && (
          <Button variant="secondary" size="sm" onClick={() => onAddAfter(node.id)}>+ Add step after</Button>
        )}
      </div>
    </Card>
  );
}
