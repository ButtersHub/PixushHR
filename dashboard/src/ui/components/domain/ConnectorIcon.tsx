import { Calendar, FileText, Mail, Palette, Plug, Webhook, Server, RotateCcw, Zap } from 'lucide-react';
import type { ComponentType } from 'react';
import shapes from '../../assets/connectors/shapes.webp';
import comeet from '../../assets/connectors/comeet.png';
import teams from '../../assets/connectors/teams.webp';
import slack from '../../assets/connectors/slack.webp';
import trello from '../../assets/connectors/trello.webp';
import whatsapp from '../../assets/connectors/whatsapp.webp';
import papaya from '../../assets/connectors/papaya.png';
import googleCalendar from '../../assets/connectors/google-calendar.webp';
import outlook from '../../assets/connectors/outlook.webp';
import gmail from '../../assets/connectors/gmail.webp';
import jira from '../../assets/connectors/jira.webp';

const LOGOS: Record<string, string> = {
  shapes, comeet, teams, slack, trello, whatsapp, papaya,
  google_calendar: googleCalendar,
  outlook_calendar: outlook,
  gmail, jira,
  HRIS: shapes, ATS: comeet,
};

// Colored lucide glyphs — for the connector kinds that don't have a vendor brand logo.
interface LucideEntry {
  Glyph: ComponentType<{ size?: number; className?: string }>;
  /** color class applied to the icon stroke */
  color: string;
  /** soft tile background + ring */
  tile: string;
}
const LUCIDE: Record<string, LucideEntry> = {
  __calendar: { Glyph: Calendar, color: 'text-[--blue-600]',   tile: 'bg-[--blue-50] ring-1 ring-[--blue-200]' },
  __content:  { Glyph: Palette,  color: 'text-[--papaya-600]', tile: 'bg-[--papaya-50] ring-1 ring-[--papaya-200]' },
  __email:    { Glyph: Mail,     color: 'text-[--red-600]',    tile: 'bg-[--red-50] ring-1 ring-[--red-200]' },
  __plug:     { Glyph: Plug,     color: 'text-[--papaya-600]', tile: 'bg-[--papaya-50] ring-1 ring-[--papaya-200]' },
  __webhook:  { Glyph: Webhook,  color: 'text-[--amber-600]',  tile: 'bg-[--amber-50] ring-1 ring-[--amber-200]' },
  __system:   { Glyph: Server,   color: 'text-[--text-secondary]', tile: 'bg-[--neutral-100] ring-1 ring-[--neutral-200]' },
  __reset:    { Glyph: RotateCcw, color: 'text-[--amber-600]', tile: 'bg-[--amber-50] ring-1 ring-[--amber-200]' },
  __trigger:  { Glyph: Zap,      color: 'text-[--amber-600]',  tile: 'bg-[--amber-50] ring-1 ring-[--amber-200]' },
  __doc:      { Glyph: FileText, color: 'text-[--blue-600]',   tile: 'bg-[--blue-50] ring-1 ring-[--blue-200]' },
  calendar:   { Glyph: Calendar, color: 'text-[--blue-600]',   tile: 'bg-[--blue-50] ring-1 ring-[--blue-200]' },
  branding:   { Glyph: Palette,  color: 'text-[--papaya-600]', tile: 'bg-[--papaya-50] ring-1 ring-[--papaya-200]' },
};

const CAPABILITY_KEY: Record<string, string> = {
  'hris.upsert_employee': 'shapes',
  'ats.get_contract': 'comeet',
  'hiring_manager.ask': 'teams',
  'teams.add_member': 'teams',
  'calendar.create_invite': '__calendar',
  'content.get_branding': '__content',
  'channel.send_message': 'teams',
  // user/system level audit capabilities
  'integrations.install':   '__plug',
  'integrations.uninstall': '__plug',
  'integrations.enable':    '__plug',
  'integrations.disable':   '__plug',
  'integrations.configure': '__plug',
  'system.reset':           '__reset',
  'run.started':            '__trigger',
};

const CHANNEL_KEY: Record<string, string> = {
  teams: 'teams', slack: 'slack', whatsapp: 'whatsapp', gmail: 'gmail', email: '__email',
};

export interface ConnectorIconProps {
  name?: string;
  kind?: 'logo' | 'capability' | 'channel' | 'role';
  size?: number;
  className?: string;
  /** wrap the icon in a soft tinted tile (for lucide glyphs) */
  tile?: boolean;
}

export function ConnectorIcon({ name = '', kind = 'logo', size = 16, className = '', tile = false }: ConnectorIconProps) {
  let key = name;
  if (kind === 'capability') key = CAPABILITY_KEY[name] ?? `cap:${name}`;
  else if (kind === 'channel') key = CHANNEL_KEY[name] ?? '__plug';

  const lucide = LUCIDE[key];
  if (lucide) {
    const Glyph = lucide.Glyph;
    const glyphEl = <Glyph size={tile ? Math.round(size * 0.62) : size} className={`${lucide.color} ${tile ? '' : className}`} />;
    if (tile) {
      return (
        <span className={`grid place-items-center rounded-md ${lucide.tile} ${className}`} style={{ width: size, height: size }}>
          {glyphEl}
        </span>
      );
    }
    return glyphEl;
  }

  const src = LOGOS[key];
  if (!src) return <Plug size={size} className={`text-[--text-tertiary] ${className}`} />;
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className={`inline-block object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
