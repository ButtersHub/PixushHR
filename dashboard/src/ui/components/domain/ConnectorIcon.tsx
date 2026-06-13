import { Calendar, FileText, Mail, Plug } from 'lucide-react';
import shapes from '../../assets/connectors/shapes.png';
import comeet from '../../assets/connectors/comeet.png';
import teams from '../../assets/connectors/teams.png';
import slack from '../../assets/connectors/slack.jpeg';
import trello from '../../assets/connectors/trello.jpeg';
import whatsapp from '../../assets/connectors/whatsapp.png';
import papaya from '../../assets/connectors/papaya.png';

const LOGOS: Record<string, string> = {
  shapes, comeet, teams, slack, trello, whatsapp, papaya,
  HRIS: shapes, ATS: comeet,
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
  if (kind === 'capability') key = CAPABILITY_KEY[name] ?? '__plug';
  else if (kind === 'channel') key = CHANNEL_KEY[name] ?? '__plug';

  const lucideProps = { size, className: `text-[--text-tertiary] ${className}` };
  if (key === '__calendar') return <Calendar {...lucideProps} />;
  if (key === '__content') return <FileText {...lucideProps} />;
  if (key === '__email') return <Mail {...lucideProps} />;

  const src = LOGOS[key];
  if (!src) return <Plug {...lucideProps} />;
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className={`inline-block rounded-sm object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
