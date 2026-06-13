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

export const TOOLS: Record<string, ToolDef> = {
  "hris.upsert_employee": {
    name: "hris.upsert_employee",
    integration: "HRIS",
    purpose: "Create or update the employee record in the HRIS (Shapes).",
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
};

export function toolCatalog(): { name: string; integration: string; purpose: string }[] {
  return Object.values(TOOLS).map(({ name, integration, purpose }) => ({ name, integration, purpose }));
}

export async function executeTool(store: InMemoryStore, name: string, args: unknown): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool.run(store, args);
}
