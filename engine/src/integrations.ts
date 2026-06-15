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

// An inbound event (webhook) the system can emit that could start a Pixush workflow.
export interface ConnectorTrigger {
  name: string;        // stable id (e.g. "candidate.hired")
  label: string;       // human display name (e.g. "Candidate hired")
  description: string; // when it fires
}

export interface ConnectorDef {
  id: string;
  name: string;
  role: RolePort;
  description: string;
  icon: string;
  seeded: boolean;
  capabilities: ConnectorCapability[];
  triggers?: ConnectorTrigger[];
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
    id: "shapes", name: "Shapes", role: "HRIS", icon: "shapes", seeded: true,
    description: "Keep employee records accurate and up to date — your single source of truth for people.",
    capabilities: [
      { name: "hris.upsert_employee", label: "Update employee record", description: "Create or update a new hire's profile.", wired: true },
      { name: "hris.get_employee", label: "Get employee", description: "Look up a worker's profile and employment details." },
      { name: "hris.set_compensation", label: "Set compensation", description: "Record a worker's salary and pay details." },
      { name: "hris.update_employment", label: "Update employment status", description: "Change someone's status — active, on-leave, or leaving." },
      { name: "workflow.activate_offboarding", label: "Activate offboarding", description: "Start the employee offboarding workflow.", wired: true },
      { name: "hris.list_employees", label: "List employees", description: "Browse workers by team or status." },
    ],
    triggers: [
      { name: "employee.created", label: "New employee added", description: "A worker is added to the HRIS." },
      { name: "employee.terminated", label: "Employee offboarded", description: "A worker is marked as leaving." },
    ],
  },
  {
    id: "comeet", name: "Comeet", role: "ATS", icon: "comeet", seeded: true,
    description: "Bring over signed contracts and candidate details the moment someone's hired.",
    capabilities: [
      { name: "ats.get_contract", label: "Get signed contract", description: "Pull a new hire's signed offer or contract.", wired: true },
      { name: "ats.get_candidate", label: "Get candidate", description: "Look up a candidate's profile and stage." },
      { name: "ats.list_positions", label: "List open positions", description: "See open roles and their pipelines." },
      { name: "ats.advance_stage", label: "Advance candidate", description: "Move a candidate forward in hiring." },
      { name: "ats.get_offer", label: "Get offer details", description: "Review the offer terms for a candidate." },
    ],
    triggers: [
      { name: "candidate.hired", label: "Candidate hired", description: "A candidate accepts and is marked hired." },
      { name: "contract.signed", label: "Contract signed", description: "A new hire signs their contract." },
    ],
  },
  {
    id: "teams", name: "Microsoft Teams", role: "Channels", icon: "teams", seeded: true,
    description: "Add new hires to the right teams and send them a warm welcome in Microsoft Teams.",
    capabilities: [
      { name: "channel.send_message", label: "Send Teams message", description: "Send a message to a person or channel.", wired: true },
      { name: "teams.add_member", label: "Add to team", description: "Add a new hire to a team.", wired: true },
      { name: "hiring_manager.ask", label: "Ask hiring manager", description: "Ask the hiring manager a question and get an answer.", wired: true },
      { name: "teams.create_channel", label: "Create channel", description: "Spin up a channel for a team." },
      { name: "teams.schedule_meeting", label: "Schedule meeting", description: "Set up an online meeting with a join link." },
    ],
    triggers: [
      { name: "message.received", label: "Message received", description: "Someone messages the agent in Teams." },
    ],
  },
  {
    id: "calendar", name: "Calendar", role: "Calendar", icon: "calendar", seeded: true,
    description: "Schedule first-day invites and find times that work for everyone.",
    capabilities: [
      { name: "calendar.create_invite", label: "Create invite", description: "Schedule a calendar invite.", wired: true },
      { name: "calendar.list_events", label: "List events", description: "See what's on the calendar." },
      { name: "calendar.update_event", label: "Update event", description: "Reschedule or edit an event." },
      { name: "calendar.cancel_event", label: "Cancel event", description: "Cancel an event and let attendees know." },
      { name: "calendar.find_free_slot", label: "Find a time", description: "Find a slot that works for everyone." },
    ],
    triggers: [
      { name: "event.responded", label: "Invite answered", description: "An attendee accepts or declines." },
    ],
  },
  {
    id: "branding", name: "Branding", role: "Content", icon: "branding", seeded: true,
    description: "Share your company story, culture videos, and welcome materials with new hires.",
    capabilities: [
      { name: "content.get_branding", label: "Get branding pack", description: "Pull the company story, culture video, and welcome note.", wired: true },
      { name: "content.list_templates", label: "List templates", description: "Browse reusable message and email templates." },
      { name: "content.get_culture_video", label: "Get culture video", description: "Grab the onboarding culture video." },
      { name: "content.get_welcome_kit", label: "Get welcome kit", description: "Pull together the new-hire welcome kit." },
      { name: "document.generate_termination_letter", label: "Generate termination letter", description: "Create an employee-facing termination letter.", wired: true },
    ],
  },
  {
    id: "slack", name: "Slack", role: "Channels", icon: "slack", seeded: false,
    description: "Welcome new hires in Slack and spin up the channels they need on day one.",
    capabilities: [
      { name: "slack.post_message", label: "Post message", description: "Send a message to a channel or person." },
      { name: "slack.create_channel", label: "Create channel", description: "Create a public or private channel." },
      { name: "slack.invite_user", label: "Invite to channel", description: "Add someone to a channel." },
      { name: "slack.upload_file", label: "Share a file", description: "Upload and share a file." },
      { name: "slack.set_topic", label: "Set channel topic", description: "Set the topic for a channel." },
    ],
    triggers: [
      { name: "message.received", label: "Message received", description: "Someone messages the agent in Slack." },
    ],
  },
  {
    id: "whatsapp", name: "WhatsApp", role: "Channels", icon: "whatsapp", seeded: false,
    description: "Reach new hires on WhatsApp with friendly welcomes and reminders.",
    capabilities: [
      { name: "whatsapp.send_message", label: "Send message", description: "Send a text message to a new hire." },
      { name: "whatsapp.send_template", label: "Send template", description: "Send a pre-approved welcome template." },
      { name: "whatsapp.send_media", label: "Send media", description: "Share an image, document, or video." },
      { name: "whatsapp.mark_read", label: "Mark as read", description: "Mark an inbound message as read." },
      { name: "whatsapp.get_status", label: "Delivery status", description: "Check if a message was delivered and read." },
    ],
    triggers: [
      { name: "message.received", label: "Message received", description: "A new hire replies on WhatsApp." },
    ],
  },
  {
    id: "gmail", name: "Gmail", role: "Channels", icon: "gmail", seeded: false,
    description: "Send warm welcome emails and follow-ups straight from Gmail.",
    capabilities: [
      { name: "gmail.send_email", label: "Send email", description: "Send an email to a new hire." },
      { name: "gmail.send_template", label: "Send templated email", description: "Send a ready-made welcome email." },
      { name: "gmail.create_draft", label: "Create draft", description: "Draft an email for review." },
      { name: "gmail.add_label", label: "Label a thread", description: "Organize a conversation with a label." },
      { name: "gmail.search", label: "Search inbox", description: "Find emails matching a query." },
    ],
    triggers: [
      { name: "email.received", label: "Email received", description: "A new email lands in the shared inbox." },
    ],
  },
  {
    id: "trello", name: "Trello", role: "TaskBoard", icon: "trello", seeded: false,
    description: "Create onboarding checklists and track setup tasks on a shared board.",
    capabilities: [
      { name: "trello.create_card", label: "Create card", description: "Add a task card to a list." },
      { name: "trello.create_board", label: "Create board", description: "Start a board, like an onboarding checklist." },
      { name: "trello.add_checklist", label: "Add checklist", description: "Add a checklist to a card." },
      { name: "trello.assign_member", label: "Assign member", description: "Assign a teammate to a task." },
      { name: "trello.move_card", label: "Move card", description: "Move a card between lists." },
    ],
    triggers: [
      { name: "card.completed", label: "Task completed", description: "An onboarding task is marked done." },
    ],
  },
  {
    id: "jira", name: "Jira", role: "TaskBoard", icon: "jira", seeded: false,
    description: "Open onboarding tickets and track provisioning work in Jira.",
    capabilities: [
      { name: "jira.create_issue", label: "Create issue", description: "Open an onboarding or provisioning ticket." },
      { name: "jira.transition_issue", label: "Move issue", description: "Move a ticket to a new status." },
      { name: "jira.assign_issue", label: "Assign issue", description: "Assign a ticket to a teammate." },
      { name: "jira.add_comment", label: "Add comment", description: "Comment on a ticket." },
      { name: "jira.create_subtasks", label: "Add subtasks", description: "Break a ticket into subtasks." },
    ],
    triggers: [
      { name: "issue.transitioned", label: "Issue moved", description: "An onboarding ticket changes status." },
    ],
  },
  {
    id: "google_calendar", name: "Google Calendar", role: "Calendar", icon: "google_calendar", seeded: false,
    description: "Schedule events and check availability using Google Calendar.",
    capabilities: [
      { name: "gcal.create_event", label: "Create event", description: "Add an event to a calendar." },
      { name: "gcal.list_events", label: "List events", description: "See what's scheduled." },
      { name: "gcal.update_event", label: "Update event", description: "Edit an existing event." },
      { name: "gcal.delete_event", label: "Cancel event", description: "Remove an event." },
      { name: "gcal.freebusy", label: "Check availability", description: "See when attendees are free." },
    ],
    triggers: [
      { name: "event.responded", label: "Invite answered", description: "An attendee accepts or declines." },
    ],
  },
  {
    id: "outlook_calendar", name: "Outlook Calendar", role: "Calendar", icon: "outlook_calendar", seeded: false,
    description: "Schedule meetings and check availability using Outlook.",
    capabilities: [
      { name: "outlook.create_event", label: "Create event", description: "Add an event to a calendar." },
      { name: "outlook.list_events", label: "List events", description: "See what's scheduled." },
      { name: "outlook.update_event", label: "Update event", description: "Edit an existing event." },
      { name: "outlook.cancel_event", label: "Cancel event", description: "Cancel an event." },
      { name: "outlook.find_meeting_times", label: "Find meeting times", description: "Suggest times that work for everyone." },
    ],
    triggers: [
      { name: "event.responded", label: "Invite answered", description: "An attendee accepts or declines." },
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

/** Is the specific connector (by id, e.g. "gmail") installed and enabled? */
export function connectorEnabled(store: InMemoryStore, tenant: string, connectorId: string): boolean {
  const def = CONNECTORS.find((c) => c.id === connectorId);
  if (!def) return false;
  const state = connectorState(store, tenant, def);
  return state.installed && state.enabled;
}

export function availableTools(store: InMemoryStore, tenant: string): string[] {
  return Object.values(TOOLS)
    .filter((t) => connectorEnabled(store, tenant, t.connector))
    .map((t) => t.name);
}

export function gateToolCall(store: InMemoryStore, tenant: string, toolName: string): void {
  const tool = TOOLS[toolName];
  if (!tool) return;
  if (!connectorEnabled(store, tenant, tool.connector)) {
    throw new Error(`${tool.connector} is not enabled`);
  }
  // Single-connector failNext support — applies whether engine-tool or external-hermes.
  const def = CONNECTORS.find((c) => c.id === tool.connector);
  if (!def) return;
  const state = connectorState(store, tenant, def);
  if (state.mode === "mock" && state.config.mock.failNext) {
    const cleared = { ...state, config: { ...state.config, mock: { ...state.config.mock, failNext: false } } };
    store.setConnectorState(tenant, def.id, cleared);
    throw new Error(`injected failure on ${tool.connector}`);
  }
}

export function roleForConnector(id: string): RolePort | undefined {
  return CONNECTORS.find((c) => c.id === id)?.role;
}

/** Triggers from all installed+enabled connectors. Used by GET /triggers. */
export function enabledTriggers(
  store: InMemoryStore,
  tenant: string,
): Array<ConnectorTrigger & { connector: string }> {
  const out: Array<ConnectorTrigger & { connector: string }> = [];
  for (const def of CONNECTORS) {
    const state = connectorState(store, tenant, def);
    if (!state.installed || !state.enabled) continue;
    for (const t of def.triggers ?? []) {
      out.push({ ...t, connector: def.id });
    }
  }
  return out;
}
