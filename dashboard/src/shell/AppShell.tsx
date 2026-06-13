import { useState } from 'react';
import { TopBar } from './TopBar';
import { LeftNav } from './LeftNav';
import type { Screen } from './LeftNav';
import { LiveRunScreen } from '../screens/LiveRunScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import {
  FileText,
  Users,
  Database,
  Plug,
  Workflow,
} from 'lucide-react';

export function AppShell() {
  const [activeScreen, setActiveScreen] = useState<Screen>('live-run');
  const [triggerKey, setTriggerKey] = useState(0);

  function handleTrigger() {
    setActiveScreen('live-run');
    setTriggerKey(k => k + 1);
  }

  function handleReset() {
    setTriggerKey(0);
    setActiveScreen('live-run');
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[--surface-app]">
      <TopBar onTrigger={handleTrigger} onReset={handleReset} />
      <div className="flex flex-1 overflow-hidden">
        <LeftNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
        <main className="flex-1 overflow-y-auto p-6">
          {activeScreen === 'live-run' && (
            <LiveRunScreen key={triggerKey} autoTrigger={triggerKey > 0} />
          )}
          {activeScreen === 'messages' && <MessagesScreen />}
          {activeScreen === 'audit-log' && (
            <PlaceholderScreen
              icon={<FileText size={20} />}
              title="Audit log"
              description="Not implemented yet — coming in a later iteration."
            />
          )}
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
          {activeScreen === 'integrations' && (
            <PlaceholderScreen
              icon={<Plug size={20} />}
              title="Integrations"
              description="Not implemented yet — coming in a later iteration."
            />
          )}
          {activeScreen === 'workflow-editor' && (
            <PlaceholderScreen
              icon={<Workflow size={20} />}
              title="Workflow editor"
              description="Not implemented yet — coming in a later iteration."
            />
          )}
        </main>
      </div>
    </div>
  );
}
