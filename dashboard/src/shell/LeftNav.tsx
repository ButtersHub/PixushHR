import { Play, MessageSquare, FileText, Users, Database, Plug, Workflow } from 'lucide-react';

export type Screen =
  | 'live-run'
  | 'messages'
  | 'audit-log'
  | 'users-roles'
  | 'synthetic-data'
  | 'integrations'
  | 'workflow-editor';

interface NavItem {
  id: Screen;
  label: string;
  icon: React.ReactNode;
}

const SHOW_ITEMS: NavItem[] = [
  { id: 'live-run', label: 'Live run', icon: <Play size={16} /> },
  { id: 'messages', label: 'Messages', icon: <MessageSquare size={16} /> },
  { id: 'audit-log', label: 'Audit log', icon: <FileText size={16} /> },
];

const CONFIGURE_ITEMS: NavItem[] = [
  { id: 'users-roles', label: 'Users and roles', icon: <Users size={16} /> },
  { id: 'synthetic-data', label: 'Synthetic data', icon: <Database size={16} /> },
  { id: 'integrations', label: 'Integrations', icon: <Plug size={16} /> },
  { id: 'workflow-editor', label: 'Workflow editor', icon: <Workflow size={16} /> },
];

interface LeftNavProps {
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

function NavGroup({
  label,
  items,
  activeScreen,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  activeScreen: Screen;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <div className="mb-4">
      <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[--text-nav-muted]">
        {label}
      </p>
      <ul>
        {items.map(item => {
          const isActive = activeScreen === item.id;
          return (
            <li key={item.id}>
              <button
                onClick={() => onNavigate(item.id)}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-sm',
                  'transition-colors duration-100 focus-visible:outline-none',
                  'focus-visible:ring-2 focus-visible:ring-[--papaya-500] focus-visible:ring-inset',
                  isActive
                    ? 'text-[--text-inverse] bg-[--surface-nav-active] border-l-[3px] border-[--papaya-500] pl-[9px]'
                    : 'text-[--text-nav] hover:bg-[--surface-nav-hover] hover:text-[--text-inverse] border-l-[3px] border-transparent pl-[9px]',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LeftNav({ activeScreen, onNavigate }: LeftNavProps) {
  return (
    <nav
      className="flex flex-col w-[--nav-width] flex-shrink-0 bg-[--surface-nav] border-r border-[--border-nav] py-4 overflow-y-auto"
      aria-label="Main navigation"
    >
      <NavGroup
        label="Show"
        items={SHOW_ITEMS}
        activeScreen={activeScreen}
        onNavigate={onNavigate}
      />
      <NavGroup
        label="Configure"
        items={CONFIGURE_ITEMS}
        activeScreen={activeScreen}
        onNavigate={onNavigate}
      />
    </nav>
  );
}
