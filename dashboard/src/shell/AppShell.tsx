import { useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { LeftNav } from './LeftNav';
import type { Screen } from './LeftNav';
import { LiveRunScreen } from '../screens/LiveRunScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { AuditScreen } from '../screens/AuditScreen';
import { IntegrationsScreen } from '../screens/IntegrationsScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { WorkflowEditorScreen } from '../screens/workflow/WorkflowEditorScreen';
import {
  Users,
  Database,
} from 'lucide-react';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

export function AppShell() {
  const [activeScreen, setActiveScreen] = useState<Screen>('live-run');
  const [triggerKey, setTriggerKey] = useState(0);
  // Whether the next LiveRunScreen mount should auto-fire /execute. Set true only when
  // the Trigger button is clicked — Reset force-remounts via triggerKey but must NOT
  // re-run the scenario (otherwise the wiped audit log + Messages instantly fill back up).
  const [autoTrigger, setAutoTrigger] = useState(false);

  // LLM cache toggle. `null` until the first /settings fetch resolves.
  const [llmCacheEnabled, setLlmCacheEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${ENGINE}/settings`)
      .then(r => r.json())
      .then((s: { llmCacheEnabled?: boolean }) => {
        if (typeof s.llmCacheEnabled === 'boolean') setLlmCacheEnabled(s.llmCacheEnabled);
      })
      .catch(() => { /* leave as null — chip shows "…" */ });
  }, []);

  async function handleToggleLlmCache() {
    if (llmCacheEnabled === null) return;
    const next = !llmCacheEnabled;
    setLlmCacheEnabled(next); // optimistic
    try {
      const res = await fetch(`${ENGINE}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmCacheEnabled: next }),
      });
      const body = await res.json() as { llmCacheEnabled?: boolean };
      if (typeof body.llmCacheEnabled === 'boolean') setLlmCacheEnabled(body.llmCacheEnabled);
    } catch {
      // Revert on network failure
      setLlmCacheEnabled(!next);
    }
  }

  function handleTrigger() {
    setActiveScreen('live-run');
    setAutoTrigger(true);
    setTriggerKey(k => k + 1);
  }

  async function handleReset() {
    // Wipe the engine store + reseed fixtures so the audit log + Messages screen come back empty.
    try {
      await fetch(`${ENGINE}/reset`, { method: 'POST' });
    } catch {
      /* swallow — UI still refreshes below */
    }
    setAutoTrigger(false);
    setTriggerKey(k => k + 1); // force-remount the active screen so it refetches
    setActiveScreen('live-run');
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[--surface-app]">
      <TopBar
        onTrigger={handleTrigger}
        onReset={handleReset}
        llmCacheEnabled={llmCacheEnabled}
        onToggleLlmCache={handleToggleLlmCache}
      />
      <div className="flex flex-1 overflow-hidden">
        <LeftNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
        <main className="flex-1 overflow-y-auto p-6">
          {activeScreen === 'live-run' && (
            <LiveRunScreen key={triggerKey} autoTrigger={autoTrigger} />
          )}
          {activeScreen === 'messages' && <MessagesScreen />}
          {activeScreen === 'audit-log' && <AuditScreen />}
          {activeScreen === 'users-roles' && (
            <PlaceholderScreen
              icon={<Users size={20} />}
              title="Users and roles"
              description="Not implemented yet — coming in a later iteration."
            />
          )}
          {activeScreen === 'synthetic-data' && (
            <PlaceholderScreen
              icon={<Database size={20} />}
              title="Synthetic data"
              description="Not implemented yet — coming in a later iteration."
            />
          )}
          {activeScreen === 'integrations' && <IntegrationsScreen />}
          {activeScreen === 'workflow-editor' && <WorkflowEditorScreen />}
        </main>
      </div>
    </div>
  );
}
