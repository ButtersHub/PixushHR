export interface ExecuteRequest {
  task: string;
  context?: Record<string, unknown>;
}

export interface ExecuteResponse {
  response: string;
  structured?: Record<string, unknown>;
}

export interface AgentReply {
  requestId: string;
  tenant: string;
  user: { id: string; name: string; role: string; channel: "sensei" | "teams" | "slack" | "email" };
  response: string;
  actions: { capability: string; target: string; summary: string }[];
}
