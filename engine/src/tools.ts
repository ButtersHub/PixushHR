import { z } from "zod";
import type { InMemoryStore } from "./store.js";

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

export interface ToolResult {
  ok: boolean;
  [k: string]: unknown;
}

export type ToolFn = (store: InMemoryStore, args: unknown) => Promise<ToolResult>;

export const TOOLS: Record<string, ToolFn> = {
  "hris.upsert_employee": async (store, args) => {
    const parsed = upsertSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`required fields missing: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    }
    const { tenant, ...emp } = parsed.data;
    store.upsertEmployee(tenant, emp);
    store.audit({
      tenant,
      capability: "hris.upsert_employee",
      target: emp.id,
      summary: `upserted employee ${emp.name} (${emp.role})`,
    });
    return { ok: true, employee: emp };
  },
};

export async function executeTool(store: InMemoryStore, name: string, args: unknown): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`unknown tool: ${name}`);
  return tool(store, args);
}
