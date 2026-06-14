export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  model?: string;
  usage?: { input?: number; output?: number };
}

/** Per-request metadata the orchestrator threads through to the agent. */
export interface ChatOpts {
  /** correlation id for this run — flows down to /tools/execute so audit entries can be grouped */
  runId?: string;
}

export interface HermesClient {
  chat(messages: ChatMessage[], opts?: ChatOpts): Promise<ChatResult>;
}

export class HttpHermesClient implements HermesClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model = "hermes-agent",
  ) {}

  async chat(messages: ChatMessage[], _opts?: ChatOpts): Promise<ChatResult> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`hermes ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      content: body.choices[0]?.message?.content ?? "",
      model: body.model,
      usage: {
        input: body.usage?.prompt_tokens,
        output: body.usage?.completion_tokens,
      },
    };
  }
}
