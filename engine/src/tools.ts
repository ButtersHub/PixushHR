import { z } from "zod";
import type { InMemoryStore, AuditActor, AuditEntry } from "./store.js";

export interface ToolResult {
  ok: boolean;
  [k: string]: unknown;
}

export type ToolFn = (store: InMemoryStore, args: unknown) => Promise<ToolResult>;

// Role-port "integration" groups a tool under a capability area (decisions #13–15, #44).
// Phase A10's integration registry will derive installed/enabled tools from these.
export type ToolKind = "engine-tool" | "external-hermes";

export interface ToolDef {
  name: string;
  /** "engine-tool" = engine executes via `run`. "external-hermes" = Hermes runs natively
   * (via its built-in gateway), then calls back via POST /side-effect to record the action. */
  kind: ToolKind;
  integration: "HRIS" | "ATS" | "Channels" | "TaskBoard" | "Calendar" | "Content";
  /** stable connector id (e.g. "shapes", "gmail") — drives connector-level gating in the editor. */
  connector: string;
  /** friendly display name surfaced in audit + workflow editor (e.g. "Update employee record") */
  label: string;
  purpose: string;
  schema: z.ZodObject<z.ZodRawShape>;
  sideEffectful: boolean;
  /** runs the side-effect. Absent for kind:"external-hermes" tools (Hermes runs those). */
  run?: ToolFn;
  /** derives `{target, summary}` for the audit entry from the parsed args + result. */
  summarize: (args: Record<string, unknown>, result: ToolResult) => { target: string; summary: string };
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
  employmentStatus: z.string().optional(),
  terminationDate: z.string().optional(),
  lastWorkingDay: z.string().optional(),
  terminationReason: z.string().optional(),
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
}).strict();
const brandingSchema = z.object({ tenant: z.string() });
const sendSchema = z.object({
  tenant: z.string(),
  to: z.string(),
  role: z.string(),
  channel: z.enum(["email", "teams", "slack"]),
  body: z.string(),
});
const terminationLetterSchema = z.object({
  tenant: z.string(),
  employeeId: z.string(),
  employeeName: z.string(),
  effectiveDate: z.string(),
  reason: z.string(),
  body: z.string(),
});
const activateOffboardingSchema = z.object({
  tenant: z.string(),
  employeeId: z.string(),
  effectiveDate: z.string(),
  stakeholders: z.array(z.string()).min(1),
});

export const TOOLS: Record<string, ToolDef> = {
  "hris.upsert_employee": {
    name: "hris.upsert_employee",
    kind: "engine-tool",
    integration: "HRIS",
    connector: "shapes",
    label: "Update employee record",
    purpose: "Create or update the employee record in the HRIS (Shapes).",
    schema: upsertSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, ...emp } = parseArgs(upsertSchema, args);
      store.upsertEmployee(tenant, emp);
      return { ok: true, employee: emp };
    },
    summarize: (args) => ({
      target: String(args.name ?? args.id ?? "—"),
      summary: `Upserted employee ${args.name} (${args.role})`,
    }),
  },

  "ats.get_contract": {
    name: "ats.get_contract",
    kind: "engine-tool",
    integration: "ATS",
    connector: "comeet",
    label: "Get signed contract",
    purpose: "Retrieve the signed contract for a candidate from the ATS (Comeet).",
    schema: getContractSchema,
    sideEffectful: false,
    run: async (store, args) => {
      const { tenant, candidateId } = parseArgs(getContractSchema, args);
      const contract = store.getContract(tenant, candidateId);
      if (!contract) throw new Error(`no contract found for candidate ${candidateId}`);
      return { ok: true, contract };
    },
    summarize: (_args, result) => {
      const c = (result.contract as { name?: string } | undefined);
      return {
        target: c?.name ?? "—",
        summary: `Retrieved signed contract for ${c?.name ?? "candidate"}`,
      };
    },
  },

  "hiring_manager.ask": {
    name: "hiring_manager.ask",
    kind: "engine-tool",
    integration: "Channels",
    connector: "teams",
    label: "Ask hiring manager",
    purpose: "Ask the hiring manager a question and get their answer (the collect-info step).",
    schema: askSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, managerId, question } = parseArgs(askSchema, args);
      const mgr = store.getManager(tenant, managerId);
      if (!mgr) throw new Error(`no manager found: ${managerId}`);
      return { ok: true, answer: mgr.cannedAnswer, manager: { id: mgr.id, name: mgr.name } };
    },
    summarize: (args, result) => {
      const mgr = (result.manager as { name?: string } | undefined);
      const q = String(args.question ?? "");
      return {
        target: mgr?.name ?? String(args.managerId ?? "—"),
        summary: `Asked ${mgr?.name ?? "manager"}: ${q.slice(0, 60)}`,
      };
    },
  },

  "teams.add_member": {
    name: "teams.add_member",
    kind: "engine-tool",
    integration: "Channels",
    connector: "teams",
    label: "Add to team",
    purpose: "Add the new hire to one or more Microsoft Teams.",
    schema: teamsSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, employeeId, teams } = parseArgs(teamsSchema, args);
      store.addMembership({ tenant, employeeId, teams });
      return { ok: true, employeeId, teams };
    },
    summarize: (args) => ({
      target: String(args.employeeId ?? "—"),
      summary: `Added to teams: ${(args.teams as string[] | undefined)?.join(", ") ?? "—"}`,
    }),
  },

  "calendar.create_invite": {
    name: "calendar.create_invite",
    kind: "engine-tool",
    integration: "Calendar",
    connector: "calendar",
    label: "Schedule invite",
    purpose: "Schedule a calendar invite (logistics only — title, date, attendees, location).",
    schema: inviteSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, ...rest } = parseArgs(inviteSchema, args);
      const invite = store.addInvite(tenant, rest);
      return { ok: true, invite };
    },
    summarize: (args, result) => {
      const inv = (result.invite as { id?: string } | undefined);
      return {
        target: inv?.id ?? String(args.title ?? "—"),
        summary: `Scheduled "${args.title}" on ${args.date}`,
      };
    },
  },

  "document.generate_termination_letter": {
    name: "document.generate_termination_letter",
    kind: "engine-tool",
    integration: "Content",
    connector: "branding",
    label: "Generate termination letter",
    purpose: "Generate and retain an employee-facing termination letter with the authorized reason.",
    schema: terminationLetterSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, ...letter } = parseArgs(terminationLetterSchema, args);
      const document = store.addDocument({ tenant, type: "termination_letter", ...letter });
      return { ok: true, document };
    },
    summarize: (args, result) => ({
      target: String((result.document as { id?: string } | undefined)?.id ?? args.employeeId ?? "—"),
      summary: `Generated termination letter for ${args.employeeName}`,
    }),
  },

  "workflow.activate_offboarding": {
    name: "workflow.activate_offboarding",
    kind: "engine-tool",
    integration: "HRIS",
    connector: "shapes",
    label: "Activate offboarding workflow",
    purpose: "Activate the offboarding workflow for an employee and the approved logistics stakeholders.",
    schema: activateOffboardingSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, ...workflow } = parseArgs(activateOffboardingSchema, args);
      const run = store.activateWorkflow({ tenant, workflow: "offboarding", ...workflow });
      return { ok: true, workflow: run };
    },
    summarize: (args, result) => ({
      target: String((result.workflow as { id?: string } | undefined)?.id ?? args.employeeId ?? "—"),
      summary: `Activated offboarding workflow for ${args.employeeId}`,
    }),
  },

  "content.get_branding": {
    name: "content.get_branding",
    kind: "engine-tool",
    integration: "Content",
    connector: "branding",
    label: "Get branding pack",
    purpose: "Fetch Papaya branding content (company story, culture video, welcome note).",
    schema: brandingSchema,
    sideEffectful: false,
    run: async (store, args) => {
      const { tenant } = parseArgs(brandingSchema, args);
      const branding = store.getBranding(tenant);
      if (!branding) throw new Error("no branding configured");
      return { ok: true, branding };
    },
    summarize: (args) => ({
      target: String(args.tenant ?? "—"),
      summary: "Retrieved branding pack",
    }),
  },

  "channel.send_message": {
    name: "channel.send_message",
    kind: "engine-tool",
    integration: "Channels",
    connector: "teams",
    label: "Send message",
    purpose: "Send a warm message to a recipient over a channel (email/teams/slack); recorded for the Messages view.",
    schema: sendSchema,
    sideEffectful: true,
    run: async (store, args) => {
      const { tenant, to, role, channel, body } = parseArgs(sendSchema, args);
      const message = store.addMessage({ tenant, from: "agent", to, role, channel, body });
      return { ok: true, message };
    },
    summarize: (args) => ({
      target: String(args.to ?? "—"),
      summary: `Sent ${args.channel} message to ${args.to}`,
    }),
  },
};

export function toolCatalog(): { name: string; integration: string; purpose: string }[] {
  return Object.values(TOOLS).map(({ name, integration, purpose }) => ({ name, integration, purpose }));
}

export interface ExecuteToolOpts {
  /** the execution that owns this tool call (for grouping in the audit) */
  runId?: string;
  /** who/what initiated the call. defaults to "pixush" (the agent). */
  actor?: AuditActor;
}

export async function executeTool(
  store: InMemoryStore,
  name: string,
  args: unknown,
  opts: ExecuteToolOpts = {},
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);

  const tenant = ((args as { tenant?: string })?.tenant) ?? "papaya";
  const actor: AuditActor = opts.actor ?? "pixush";
  const start = Date.now();
  let result: ToolResult | undefined;
  let error: unknown;

  try {
    if (!tool.run) {
      throw new Error(`tool ${name} has no run function (kind: ${tool.kind}) — invoke its native gateway and report via /side-effect`);
    }
    result = await tool.run(store, args);
    return result;
  } catch (e) {
    error = e;
    throw e;
  } finally {
    const durationMs = Date.now() - start;
    const summarized = result
      ? tool.summarize(args as Record<string, unknown>, result)
      : { target: "—", summary: (error as Error)?.message ?? "Action failed" };

    const entry: Omit<AuditEntry, "id" | "ts"> = {
      tenant,
      capability: tool.name,
      label: tool.label,
      integration: tool.integration,
      target: summarized.target,
      summary: summarized.summary,
      actor,
      runId: opts.runId,
      status: error ? "error" : "success",
      durationMs,
      inputs: args,
      outputs: error ? { error: (error as Error)?.message } : result,
    };
    store.audit(entry);
  }
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
