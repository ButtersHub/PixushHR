import { Play, RotateCcw } from 'lucide-react';
import { Button } from '../ui/index';
import { Badge } from '../ui/index';
import pixushLogo from '../ui/assets/brand/pixush-logo.png';
import papayaLogo from '../ui/assets/brand/papaya-logo.png';

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
      <div className="flex items-center gap-2.5">
        {/* Pixush — the product */}
        <span className="flex items-center gap-1.5">
          <img
            src={pixushLogo}
            alt="Pixush"
            className="h-7 w-7 rounded-full object-cover ring-1 ring-[--border-default] [box-shadow:var(--shadow-xs)]"
          />
          <span className="text-[14px] font-bold tracking-[0.04em] text-[--text-primary]">
            PIXUSH
          </span>
        </span>
        {/* divider */}
        <span className="h-5 w-px bg-[--border-default]" aria-hidden />
        {/* Papaya — the customer */}
        <span className="flex items-center gap-1.5" title="Built for Papaya Global">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[--text-tertiary]">
            For
          </span>
          <img
            src={papayaLogo}
            alt="Papaya Global"
            className="h-4 w-auto select-none"
            draggable={false}
          />
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
