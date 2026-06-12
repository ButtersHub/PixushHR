export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HermesClient {
  chat(messages: ChatMessage[]): Promise<string>;
}

export class HttpHermesClient implements HermesClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model = "hermes-agent",
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) throw new Error(`hermes ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    return body.choices[0]?.message?.content ?? "";
  }
}
