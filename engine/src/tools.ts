import { z } from "zod";
import type { InMemoryStore } from "./store.js";

export interface ToolResult {
  ok: boolean;
  [k: string]: unknown;
}

export type ToolFn = (store: InMemoryStore, args: unknown) => Promise<ToolResult>;

// Role-port "integration" groups a tool under a capability area (decisions #13–15, #44).
// Phase A10's integration registry will derive installed/enabled tools from these.
export interface ToolDef {
  name: string;
  integration: "HRIS" | "ATS" | "Channels" | "TaskBoard" | "Calendar" | "Content";
  purpose: string;
  schema: z.ZodObject<z.ZodRawShape>;
  sideEffectful: boolean;
  run: ToolFn;
}

function parseArgs<T>(schema: z.ZodType<T>, args: unknown): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new Error(
      `missing required fields: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

const upsertSchema = z.object({
  tenant: z.string(),
  id: z.string(),
  name: z.string(),
  role: z.string(),
  startDate: z.string().optional(),
  department: z.string().optional(),
  managerId: z.string().optional(),
  employmentType: z.string().optional(),
});

const getContractSchema = z.object({ tenant: z.string(), candidateId: z.string() });

const askSchema = z.object({ tenant: z.string(), managerId: z.string(), question: z.string() });
const teamsSchema = z.object({ tenant: z.string(), employeeId: z.string(), teams: z.array(z.string()).min(1) });
// NOTE: deliberately NO `reason`/sensitive fields — structural confidentiality (decision #46),
// hardened in Phase B. The invite tool only ever accepts logistics.
const inviteSchema = z.object({
  tenant: z.string(),
  title: z.string(),
  date: z.string(),
  attendees: z.array(z.string()).min(1),
  location: z.string(),
});
const brandingSchema = z.object({ tenant: z.string() });
const sendSchema = z.object({
  tenant: z.string(),
  to: z.string(),
  role: z.string(),
  channel: z.enum(["email", "teams", "slack"]),
  body: z.string(),
});

export const TOOLS: Record<string, ToolDef> = {
  "hris.upsert_employee": {
    name: "hris.upsert_employee",
    integration: "HRIS",
    purpose: "Create or update the employee record in the HRIS (Shapes).",
    schema: upsertSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, ...emp } = parseArgs(upsertSchema, args);
      store.upsertEmployee(tenant, emp);
      store.audit({
        tenant,
        capability: "hris.upsert_employee",
        target: emp.id,
        summary: `upserted employee ${emp.name} (${emp.role})`,
      });
      return { ok: true, employee: emp };
    },
  },

  "ats.get_contract": {
    name: "ats.get_contract",
    integration: "ATS",
    purpose: "Retrieve the signed contract for a candidate from the ATS (Comeet).",
    schema: getContractSchema,
    sideEffectful: false,
    run: async (store, args) => {
      const { tenant, candidateId } = parseArgs(getContractSchema, args);
      const contract = store.getContract(tenant, candidateId);
      if (!contract) throw new Error(`no contract found for candidate ${candidateId}`);
      store.audit({
        tenant,
        capability: "ats.get_contract",
        target: candidateId,
        summary: `retrieved signed contract for ${contract.name}`,
      });
      return { ok: true, contract };
    },
  },

  "hiring_manager.ask": {
    name: "hiring_manager.ask",
    integration: "Channels",
    purpose: "Ask the hiring manager a question and get their answer (the collect-info step).",
    schema: askSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, managerId, question } = parseArgs(askSchema, args);
      const mgr = store.getManager(tenant, managerId);
      if (!mgr) throw new Error(`no manager found: ${managerId}`);
      store.audit({
        tenant,
        capability: "hiring_manager.ask",
        target: managerId,
        summary: `asked ${mgr.name}: ${question.slice(0, 60)}`,
      });
      return { ok: true, answer: mgr.cannedAnswer };
    },
  },

  "teams.add_member": {
    name: "teams.add_member",
    integration: "Channels",
    purpose: "Add the new hire to one or more Microsoft Teams.",
    schema: teamsSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, employeeId, teams } = parseArgs(teamsSchema, args);
      store.addMembership({ tenant, employeeId, teams });
      store.audit({
        tenant,
        capability: "teams.add_member",
        target: employeeId,
        summary: `added to teams: ${teams.join(", ")}`,
      });
      return { ok: true, employeeId, teams };
    },
  },

  "calendar.create_invite": {
    name: "calendar.create_invite",
    integration: "Calendar",
    purpose: "Schedule a calendar invite (logistics only — title, date, attendees, location).",
    schema: inviteSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, ...rest } = parseArgs(inviteSchema, args);
      const invite = store.addInvite(tenant, rest);
      store.audit({
        tenant,
        capability: "calendar.create_invite",
        target: invite.id,
        summary: `scheduled "${rest.title}" on ${rest.date}`,
      });
      return { ok: true, invite };
    },
  },

  "content.get_branding": {
    name: "content.get_branding",
    integration: "Content",
    purpose: "Fetch Papaya branding content (company story, culture video, welcome note).",
    schema: brandingSchema,
    sideEffectful: false,
    run: async (store, args) => {
      const { tenant } = parseArgs(brandingSchema, args);
      const branding = store.getBranding(tenant);
      if (!branding) throw new Error("no branding configured");
      store.audit({
        tenant,
        capability: "content.get_branding",
        target: tenant,
        summary: "retrieved branding pack",
      });
      return { ok: true, branding };
    },
  },

  "channel.send_message": {
    name: "channel.send_message",
    integration: "Channels",
    purpose: "Send a warm message to a recipient over a channel (email/teams/slack); recorded for the Messages view.",
    schema: sendSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, to, role, channel, body } = parseArgs(sendSchema, args);
      const message = store.addMessage({ tenant, from: "agent", to, role, channel, body });
      store.audit({
        tenant,
        capability: "channel.send_message",
        target: to,
        summary: `sent ${channel} message to ${to}`,
      });
      return { ok: true, message };
    },
  },
};

export function toolCatalog(): { name: string; integration: string; purpose: string }[] {
  return Object.values(TOOLS).map(({ name, integration, purpose }) => ({ name, integration, purpose }));
}

export async function executeTool(store: InMemoryStore, name: string, args: unknown): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool.run(store, args);
}

export interface CapabilityField { name: string; required: boolean; system: boolean; }
export interface CapabilitySpec {
  name: string;
  description: string;
  fields: CapabilityField[];
  sideEffectful: boolean;
}

export function capabilitySpecs(): CapabilitySpec[] {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.purpose,
    sideEffectful: t.sideEffectful,
    fields: Object.entries(t.schema.shape).map(([name, field]) => ({
      name,
      required: !(field as z.ZodTypeAny).isOptional(),
      system: name === "tenant",
    })),
  }));
}
