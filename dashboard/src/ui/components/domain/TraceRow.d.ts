export interface TraceRowProps {
  status?: 'pending' | 'running' | 'success' | 'error' | 'escalated';
  label: string;
  value?: string;
  error?: string;
  duration?: number;
  depth?: number;
  icon?: React.ReactNode;
  className?: string;
}

export interface MessageBubbleProps {
  from?: 'agent' | 'employee';
  recipient?: string;
  channel?: 'email' | 'teams' | 'slack' | 'whatsapp';
  channelIcon?: React.ReactNode;
  timestamp?: string;
  content: string;
  /** True if the message was audience-scoped (some fields omitted) */
  redacted?: boolean;
  className?: string;
}

/**
 * @startingPoint section="Domain" subtitle="Integration catalog card with install state" viewport="700x200"
 */
export interface ConnectorCardProps {
  name: string;
  type: string;
  description: string;
  mode?: 'mock' | 'real' | 'off';
  installed?: boolean;
  onInstall?: () => void;
  onConfigure?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export declare function TraceRow(props: TraceRowProps): JSX.Element;
export declare function MessageBubble(props: MessageBubbleProps): JSX.Element;
export declare function ConnectorCard(props: ConnectorCardProps): JSX.Element;
