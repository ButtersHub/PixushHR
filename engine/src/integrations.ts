import type { InMemoryStore } from "./store.js";
import { TOOLS } from "./tools.js";

export type RolePort = "HRIS" | "ATS" | "Channels" | "TaskBoard" | "Calendar" | "Content";

// A capability the connector's underlying system can perform. `wired: true` means it is an
// actually-executable agent tool today (see tools.ts); the rest map the system's real API surface
// (modelled on each vendor's public docs) and demonstrate extensibility.
export interface ConnectorCapability {
  name: string;        // stable id (e.g. "hiring_manager.ask")
  label: string;       // human display name (e.g. "Ask hiring manager")
  description: string; // one-line description of what it does
  wired?: boolean;     // true ⇒ the agent can actually call it now
}

export interface ConnectorDef {
  id: string;
  name: string;
  role: RolePort;
  description: string;
  icon: string;
  seeded: boolean;
  capabilities: ConnectorCapability[];
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
  {
    id: "shapes", name: "Shapes", role: "HRIS", description: "Core HRIS — the system of record for people.", icon: "shapes", seeded: true,
    capabilities: [
      { name: "hris.upsert_employee", label: "Update employee record", description: "Create or update a worker's HRIS profile.", wired: true },
      { name: "hris.get_employee", label: "Get employee", description: "Fetch a worker's profile and employment details." },
      { name: "hris.set_compensation", label: "Set compensation", description: "Record salary, currency, and pay frequency." },
      { name: "hris.update_employment", label: "Update employment status", description: "Change status (active, on-leave, terminated) and dates." },
      { name: "hris.list_employees", label: "List employees", description: "List workers, filterable by department or status." },
    ],
  },
  {
    id: "comeet", name: "Comeet", role: "ATS", description: "Applicant tracking — candidates and signed contracts.", icon: "comeet", seeded: true,
    capabilities: [
      { name: "ats.get_contract", label: "Get signed contract", description: "Retrieve a candidate's signed offer or contract.", wired: true },
      { name: "ats.get_candidate", label: "Get candidate", description: "Fetch candidate profile, stage, and source." },
      { name: "ats.list_positions", label: "List open positions", description: "List open requisitions and their pipelines." },
      { name: "ats.advance_stage", label: "Advance candidate stage", description: "Move a candidate to the next hiring stage." },
      { name: "ats.get_offer", label: "Get offer details", description: "Retrieve offer terms for a candidate." },
    ],
  },
  {
    id: "teams", name: "Microsoft Teams", role: "Channels", description: "Team membership and messaging over Microsoft Graph.", icon: "teams", seeded: true,
    capabilities: [
      { name: "channel.send_message", label: "Send Teams message", description: "Post a message to a person or channel.", wired: true },
      { name: "teams.add_member", label: "Add to team", description: "Add a member to a Microsoft Team.", wired: true },
      { name: "hiring_manager.ask", label: "Ask hiring manager", description: "Ask the hiring manager a question and get their answer.", wired: true },
      { name: "teams.create_channel", label: "Create channel", description: "Create a channel within a team." },
      { name: "teams.schedule_meeting", label: "Schedule meeting", description: "Create an online meeting with a join link." },
    ],
  },
  {
    id: "calendar", name: "Calendar", role: "Calendar", description: "Generic scheduling — invites and availability.", icon: "calendar", seeded: true,
    capabilities: [
      { name: "calendar.create_invite", label: "Create invite", description: "Schedule a calendar invite (logistics only).", wired: true },
      { name: "calendar.list_events", label: "List events", description: "List events within a time window." },
      { name: "calendar.update_event", label: "Update event", description: "Reschedule or edit an existing event." },
      { name: "calendar.cancel_event", label: "Cancel event", description: "Cancel an event and notify attendees." },
      { name: "calendar.find_free_slot", label: "Find free slot", description: "Find a mutual free slot for attendees." },
    ],
  },
  {
    id: "branding", name: "Branding", role: "Content", description: "Company story, culture, and welcome content.", icon: "branding", seeded: true,
    capabilities: [
      { name: "content.get_branding", label: "Get branding pack", description: "Fetch company story, culture video, and welcome note.", wired: true },
      { name: "content.list_templates", label: "List templates", description: "List reusable message and email templates." },
      { name: "content.get_culture_video", label: "Get culture video", description: "Get the onboarding culture video link." },
      { name: "content.get_welcome_kit", label: "Get welcome kit", description: "Get the new-hire welcome kit contents." },
    ],
  },
  {
    id: "slack", name: "Slack", role: "Channels", description: "Messaging over the Slack Web API.", icon: "slack", seeded: false,
    capabilities: [
      { name: "slack.post_message", label: "Post message", description: "Post a message to a channel or DM (chat.postMessage)." },
      { name: "slack.create_channel", label: "Create channel", description: "Create a public or private channel (conversations.create)." },
      { name: "slack.invite_user", label: "Invite to channel", description: "Invite a user to a channel (conversations.invite)." },
      { name: "slack.upload_file", label: "Share a file", description: "Upload and share a file (files.upload)." },
      { name: "slack.set_topic", label: "Set channel topic", description: "Set a channel's topic (conversations.setTopic)." },
    ],
  },
  {
    id: "whatsapp", name: "WhatsApp", role: "Channels", description: "Messaging over the WhatsApp Business Cloud API.", icon: "whatsapp", seeded: false,
    capabilities: [
      { name: "whatsapp.send_message", label: "Send message", description: "Send a text message to a phone number." },
      { name: "whatsapp.send_template", label: "Send template", description: "Send a pre-approved template message." },
      { name: "whatsapp.send_media", label: "Send media", description: "Send an image, document, or video." },
      { name: "whatsapp.mark_read", label: "Mark as read", description: "Mark an inbound message as read." },
      { name: "whatsapp.get_status", label: "Get delivery status", description: "Check delivery and read status of a message." },
    ],
  },
  {
    id: "trello", name: "Trello", role: "TaskBoard", description: "Provisioning checklists over the Trello REST API.", icon: "trello", seeded: false,
    capabilities: [
      { name: "trello.create_card", label: "Create card", description: "Create a card on a list." },
      { name: "trello.create_board", label: "Create board", description: "Create a board, e.g. an onboarding checklist." },
      { name: "trello.add_checklist", label: "Add checklist", description: "Add a checklist to a card." },
      { name: "trello.assign_member", label: "Assign member", description: "Assign a member to a card." },
      { name: "trello.move_card", label: "Move card", description: "Move a card to another list." },
    ],
  },
  {
    id: "google_calendar", name: "Google Calendar", role: "Calendar", description: "Scheduling over the Google Calendar API.", icon: "google_calendar", seeded: false,
    capabilities: [
      { name: "gcal.create_event", label: "Create event", description: "Insert a calendar event (events.insert)." },
      { name: "gcal.list_events", label: "List events", description: "List events on a calendar (events.list)." },
      { name: "gcal.update_event", label: "Update event", description: "Patch an existing event (events.patch)." },
      { name: "gcal.delete_event", label: "Cancel event", description: "Delete an event (events.delete)." },
      { name: "gcal.freebusy", label: "Check availability", description: "Query free/busy for attendees (freebusy.query)." },
    ],
  },
  {
    id: "outlook_calendar", name: "Outlook Calendar", role: "Calendar", description: "Scheduling over Microsoft Graph calendars.", icon: "outlook_calendar", seeded: false,
    capabilities: [
      { name: "outlook.create_event", label: "Create event", description: "Create a calendar event (POST /events)." },
      { name: "outlook.list_events", label: "List events", description: "List events (GET /events)." },
      { name: "outlook.update_event", label: "Update event", description: "Update an event (PATCH /events)." },
      { name: "outlook.cancel_event", label: "Cancel event", description: "Cancel an event (POST /cancel)." },
      { name: "outlook.find_meeting_times", label: "Find meeting times", description: "Suggest meeting times (findMeetingTimes)." },
    ],
  },
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
