import { Play, RotateCcw, Building2 } from 'lucide-react';
import { Button } from '../ui/index';
import { Badge } from '../ui/index';

interface TopBarProps {
  onTrigger: () => void;
  onReset: () => void;
}

interface ToggleChip {
  label: string;
  value: string;
  variant: 'mock' | 'real' | 'off' | 'neutral' | 'info';
}

const STATUS_CHIPS: ToggleChip[] = [
  { label: 'Infra', value: 'Hermes', variant: 'info' },
  { label: 'Integrations', value: 'MOCK', variant: 'mock' },
  { label: 'Memory', value: 'OFF', variant: 'off' },
  { label: 'Encrypt', value: 'ON', variant: 'neutral' },
];

export function TopBar({ onTrigger, onReset }: TopBarProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-4 bg-[--surface-topbar] border-b border-[--border-default] h-12 flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <span className="text-[13px] font-semibold text-[--text-primary] tracking-tight">
          PixushHR
        </span>
        <span className="text-[--border-default]">|</span>
        <span className="flex items-center gap-1.5 text-[13px] text-[--text-secondary]">
          <Building2 size={14} className="text-[--text-tertiary]" />
          Papaya
        </span>
      </div>

      {/* Status chips */}
      <div className="hidden md:flex items-center gap-2 flex-1 justify-center">
        {STATUS_CHIPS.map(chip => (
          <span key={chip.label} className="flex items-center gap-1.5">
            <span className="text-[11px] text-[--text-tertiary] font-medium">{chip.label}</span>
            <Badge variant={chip.variant} size="xs">{chip.value}</Badge>
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RotateCcw size={13} />}
          onClick={onReset}
        >
          Reset
        </Button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Play size={13} />}
          onClick={onTrigger}
        >
          Trigger scenario
        </Button>
      </div>
    </header>
  );
}
