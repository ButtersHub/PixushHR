import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardBody, MessageBubble, EmptyState, LoadingState, ErrorState, ConnectorIcon } from '../ui/index';

const ENGINE = import.meta.env.VITE_ENGINE_URL ?? 'http://localhost:3000';

interface Message {
  id: string;
  from: string;
  to: string;
  role: string;
  channel: 'email' | 'teams' | 'slack' | 'whatsapp';
  body: string;
  ts: string;
  direction?: 'outbound' | 'inbound';
}

type LoadState = 'loading' | 'done' | 'error';

export function MessagesScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  async function load() {
    setState('loading');
    setErrorMsg('');
    try {
      const r = await fetch(`${ENGINE}/messages?tenant=papaya`);
      if (!r.ok) throw new Error(`Engine returned ${r.status}`);
      setMessages(await r.json());
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-[--content-max-width] mx-auto space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[--text-primary] tracking-tight mb-0.5">
          Messages
        </h1>
        <p className="text-[13px] text-[--text-secondary]">
          Warm communications the agent sent across channels.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Agent communications"
          subtitle={state === 'done' && messages.length > 0
            ? `${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`
            : undefined}
        />
        <CardBody>
          {state === 'loading' && <LoadingState rows={3} />}
          {state === 'error' && (
            <ErrorState
              title="Couldn't load messages"
              description={errorMsg || 'Check the connection and try again.'}
              onRetry={load}
            />
          )}
          {state === 'done' && messages.length === 0 && (
            <EmptyState
              icon={<MessageSquare size={20} />}
              title="No messages yet"
              description="Run a scenario to see agent communications here."
            />
          )}
          {state === 'done' && messages.length > 0 && (
            <div className="flex flex-col gap-4" data-testid="messages-list">
              {messages.map((m) => {
                const inbound = m.direction === 'inbound';
                return (
                  <div
                    key={m.id}
                    data-testid={`message-${inbound ? 'inbound' : 'outbound'}`}
                    className={`flex ${inbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={inbound ? 'opacity-90' : ''}>
                      <MessageBubble
                        from={inbound ? 'employee' : 'agent'}
                        recipient={inbound ? 'agent' : m.to}
                        channel={m.channel}
                        channelIcon={<ConnectorIcon name={m.channel} kind="channel" size={11} />}
                        timestamp={m.ts}
                        content={m.body}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
