import type { InMemoryStore } from "./store.js";
import { TOOLS } from "./tools.js";

export type RolePort = "HRIS" | "ATS" | "Channels" | "TaskBoard" | "Calendar" | "Content";

export interface ConnectorDef {
  id: string;
  name: string;
  role: RolePort;
  description: string;
  icon: string;
  seeded: boolean;
}

export interface ConnectorState {
  installed: boolean;
  enabled: boolean;
  mode: "mock" | "prod";
  config: {
    mock: { failNext?: boolean; latencyMs?: number; seed?: string };
    prod: { baseUrl?: string; authRef?: string; ids?: string };
  };
}

export const CONNECTORS: ConnectorDef[] = [
  { id: "shapes", name: "Shapes", role: "HRIS", description: "Core HRIS — employee records.", icon: "shapes", seeded: true },
  { id: "comeet", name: "Comeet", role: "ATS", description: "Applicant tracking — signed contracts.", icon: "comeet", seeded: true },
  { id: "teams", name: "Microsoft Teams", role: "Channels", description: "Team membership + messaging.", icon: "teams", seeded: true },
  { id: "calendar", name: "Calendar", role: "Calendar", description: "Schedule invites (logistics only).", icon: "calendar", seeded: true },
  { id: "branding", name: "Branding", role: "Content", description: "Company story + culture content.", icon: "branding", seeded: true },
  { id: "slack", name: "Slack", role: "Channels", description: "Messaging (available, not seeded).", icon: "slack", seeded: false },
  { id: "whatsapp", name: "WhatsApp", role: "Channels", description: "Messaging (available, not seeded).", icon: "whatsapp", seeded: false },
  { id: "trello", name: "Trello", role: "TaskBoard", description: "Task board (available, not seeded).", icon: "trello", seeded: false },
];

export function defaultState(def: ConnectorDef): ConnectorState {
  return {
    installed: def.seeded,
    enabled: def.seeded,
    mode: "mock",
    config: { mock: {}, prod: {} },
  };
}

export function connectorState(store: InMemoryStore, tenant: string, def: ConnectorDef): ConnectorState {
  return store.getConnectorState(tenant, def.id) ?? defaultState(def);
}

export function connectorsForRole(role: RolePort): ConnectorDef[] {
  return CONNECTORS.filter((c) => c.role === role);
}

export function enabledConnectorsForRole(
  store: InMemoryStore,
  tenant: string,
  role: RolePort,
): { def: ConnectorDef; state: ConnectorState }[] {
  return connectorsForRole(role)
    .map((def) => ({ def, state: connectorState(store, tenant, def) }))
    .filter(({ state }) => state.installed && state.enabled);
}

export function roleEnabled(store: InMemoryStore, tenant: string, role: RolePort): boolean {
  return enabledConnectorsForRole(store, tenant, role).length > 0;
}

export function availableTools(store: InMemoryStore, tenant: string): string[] {
  return Object.values(TOOLS)
    .filter((t) => roleEnabled(store, tenant, t.integration as RolePort))
    .map((t) => t.name);
}

export function gateToolCall(store: InMemoryStore, tenant: string, toolName: string): void {
  const tool = TOOLS[toolName];
  if (!tool) return;
  const role = tool.integration as RolePort;
  const enabled = enabledConnectorsForRole(store, tenant, role);
  if (enabled.length === 0) throw new Error(`${role} is not enabled`);
  const failing = enabled.find((c) => c.state.mode === "mock" && c.state.config.mock.failNext);
  if (failing) {
    failing.state.config.mock = { ...failing.state.config.mock, failNext: false };
    store.setConnectorState(tenant, failing.def.id, failing.state);
    throw new Error(`injected failure on ${role}`);
  }
}

export function roleForConnector(id: string): RolePort | undefined {
  return CONNECTORS.find((c) => c.id === id)?.role;
}
