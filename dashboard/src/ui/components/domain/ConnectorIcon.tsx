import { Calendar, FileText, Mail, Palette, Plug } from 'lucide-react';
import type { ComponentType } from 'react';
import shapes from '../../assets/connectors/shapes.png';
import comeet from '../../assets/connectors/comeet.png';
import teams from '../../assets/connectors/teams.png';
import slack from '../../assets/connectors/slack.jpeg';
import trello from '../../assets/connectors/trello.jpeg';
import whatsapp from '../../assets/connectors/whatsapp.png';
import papaya from '../../assets/connectors/papaya.png';
import googleCalendar from '../../assets/connectors/google-calendar.png';
import outlook from '../../assets/connectors/outlook.png';

const LOGOS: Record<string, string> = {
  shapes, comeet, teams, slack, trello, whatsapp, papaya,
  google_calendar: googleCalendar,
  outlook_calendar: outlook,
  HRIS: shapes, ATS: comeet,
};

// Keys that render a lucide glyph instead of a brand logo.
const LUCIDE: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  __calendar: Calendar, __content: FileText, __email: Mail,
  calendar: Calendar, branding: Palette,
};

const CAPABILITY_KEY: Record<string, string> = {
  'hris.upsert_employee': 'shapes',
  'ats.get_contract': 'comeet',
  'hiring_manager.ask': 'teams',
  'teams.add_member': 'teams',
  'calendar.create_invite': '__calendar',
  'content.get_branding': '__content',
  'channel.send_message': 'teams',
};

const CHANNEL_KEY: Record<string, string> = {
  teams: 'teams', slack: 'slack', whatsapp: 'whatsapp', email: '__email',
};

export interface ConnectorIconProps {
  name?: string;
  kind?: 'logo' | 'capability' | 'channel' | 'role';
  size?: number;
  className?: string;
}

export function ConnectorIcon({ name = '', kind = 'logo', size = 16, className = '' }: ConnectorIconProps) {
  let key = name;
  if (kind === 'capability') key = CAPABILITY_KEY[name] ?? `cap:${name}`;
  else if (kind === 'channel') key = CHANNEL_KEY[name] ?? '__plug';

  const Glyph = LUCIDE[key];
  if (Glyph) return <Glyph size={size} className={`text-[--text-tertiary] ${className}`} />;

  const src = LOGOS[key];
  if (!src) return <Plug size={size} className={`text-[--text-tertiary] ${className}`} />;
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className={`inline-block rounded-[20%] object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
