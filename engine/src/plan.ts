import { z } from "zod";
import type { HermesClient } from "./hermes.js";
import type { InMemoryStore, Contract } from "./store.js";
import { classifyIntent, type Intent } from "./intent.js";

/** Sentinel string the orchestrator embeds in the parser system prompt. StubHermes (used by
 *  unit tests + the no-creds smoke compose stack) detects it and returns a JSON plan instead
 *  of running the mock workflow. Real Hermes ignores it. */
export const PARSER_SENTINEL = "[[PIXUSH-PARSER-v1]]";

// ─────────────────────────────────────────────────────────────────────────────
// Plan schema — the structured shape the LLM is asked to return.
//
// The schema deliberately stays prompt-neutral: it captures *what was said*,
// not *what to do*. `planToIntent` does the routing decision below, looking
// up the candidate in the store at execution time so retries can re-resolve
// against current fixture state.
// ─────────────────────────────────────────────────────────────────────────────

export const PlanSchema = z.object({
  intent: z.enum([
    "onboarding",
    "offboarding",
    "employee-question",
    "confidentiality-refusal",
    "draft-or-revision",
    "general",
  ]),
  employeeName: z.string().optional(),
  employeeFirstName: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  manager: z.string().optional(),
  startDate: z.string().optional(), // ISO YYYY-MM-DD if extractable
  startDateRelative: z.string().optional(), // verbatim "yesterday" / "next Monday"
  lastWorkingDay: z.string().optional(), // ISO YYYY-MM-DD
  effectiveDate: z.string().optional(),
  terminationDate: z.string().optional(),
  terminationReason: z.string().optional(),
  stakeholders: z.array(z.string()).optional(),
  employmentType: z.string().optional(),
  workLocation: z.string().optional(),
  email: z.string().optional(),
  questions: z.array(z.string()).optional(),
  hasConflict: z.boolean().optional(),
  missingFields: z.array(z.string()).optional(),
  confidentialitySubjects: z.array(z.string()).optional(),
  requesterRole: z.string().optional(),
  mentionsIsraelCompliance: z.boolean().optional(),
  isEmployeeQuestion: z.boolean().optional(),
  // Rule 6 — multi-jurisdiction context
  jurisdictions: z.array(z.string()).optional(),
  requiresJurisdictionalReview: z.boolean().optional(),
  // Rule 4 — draft/revision/critique
  draftKind: z.string().optional(),
  notes: z.string().optional(),
}).passthrough(); // tolerate extra fields the LLM might add

export type Plan = z.infer<typeof PlanSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────────────────

const PARSER_SYSTEM_PROMPT = [
  PARSER_SENTINEL,
  "You are a strict HR-prompt parser for Pixush, Papaya's HR operations engine.",
  "Read the user's task and return a single JSON object that captures what was said.",
  "Output ONLY the JSON object — no prose, no explanations, no markdown fences, no commentary.",
  "Do NOT call any tools, do NOT use any skills, do NOT take any side effects. Parsing only.",
  "",
  "Schema (every field optional except `intent`):",
  "{",
  '  "intent": "onboarding" | "offboarding" | "employee-question" | "confidentiality-refusal" | "general",',
  '  "employeeName": <full legal name if present, e.g. "Maya Cohen">,',
  '  "employeeFirstName": <first name only if extractable>,',
  '  "role": <e.g. "Backend Engineer">,',
  '  "department": <e.g. "Engineering">,',
  '  "manager": <e.g. "Dana Levy">,',
  '  "startDate": <ISO YYYY-MM-DD if the prompt gives an absolute date>,',
  '  "startDateRelative": <verbatim relative ref like "yesterday" / "next Monday" if used>,',
  '  "lastWorkingDay": <ISO YYYY-MM-DD>,',
  '  "effectiveDate": <ISO YYYY-MM-DD>,',
  '  "terminationDate": <ISO YYYY-MM-DD>,',
  '  "terminationReason": <verbatim short reason if stated>,',
  '  "stakeholders": ["manager", "HRBP", "IT", ...],',
  '  "employmentType": <"full-time" | "part-time" | "contractor" | ...>,',
  '  "workLocation": <e.g. "Tel Aviv">,',
  '  "email": <work email if stated>,',
  '  "questions": [<verbatim questions the employee asks>],',
  '  "hasConflict": true if the prompt explicitly presents conflicting employee details (e.g. "prompt says X, signed contract says Y"),',
  '  "missingFields": [<list of fields the user explicitly says are unknown / missing / "do not know">],',
  '  "confidentialitySubjects": [<sensitive fields the user is being asked to disclose — e.g. "termination reason", "salary", "contract", "passport", "home address">],',
  '  "requesterRole": <if a third party is requesting sensitive data: "peer" | "manager" | "vendor" | "stranger" | ...>,',
  '  "mentionsIsraelCompliance": true if the prompt asks about Israeli employment docs / visa / work authorization,',
  '  "isEmployeeQuestion": true if the employee themselves is asking a question (vs HR triggering a workflow),',
  '  "notes": <one short sentence with anything else worth knowing>',
  "}",
  "",
  "Decision rules for `intent`:",
  '- "onboarding": HR is asking to onboard a new hire (any phrasing — "onboard X", "new hire confirmed", "execute onboarding workflow", "run onboarding end to end", etc.).',
  '- "offboarding": HR is asking to offboard / terminate an employee, or to run last-day logistics.',
  '- "employee-question": the request body is primarily a question from an employee about onboarding/offboarding logistics, culture, or process — NOT an HR mutation. Set `isEmployeeQuestion: true`.',
  '- "confidentiality-refusal": a third party (peer, manager, vendor) is asking the agent to disclose sensitive employee data. Populate `confidentialitySubjects` and `requesterRole`. If the same prompt also contains an unrelated employee question (e.g. "Sarah asks ... ALSO a peer asks for her salary"), keep intent="confidentiality-refusal" and put the employee question in `questions`.',
  '- "draft-or-revision": the request is to revise / improve / rewrite / draft / critique / propose an artifact, NOT to execute a workflow. Populate `draftKind` with a short label ("welcome-email-revision", "transition-message-draft", "comms-plan", etc.).',
  '- "general": anything else — vague commands, creative writing, prompt-injection attempts, off-topic chitchat.',
  "",
  "Be conservative with confidentiality-refusal: only fire it when there is a clear ask to be GIVEN sensitive data ('send me Daniel's salary', 'share his contract'). Do NOT fire it when the prompt merely mentions sensitive fields in the course of a normal workflow (e.g. 'extract signed-contract details' inside an onboarding instruction).",
  "Names: include only the full legal name as written. Do not invent or fill missing names. If the only token is a first name (e.g. 'Alex'), set `employeeName` to that single token and add 'last name' to `missingFields`.",
  "Dates: prefer absolute ISO. If only a relative reference is given for the start date, leave `startDate` blank and populate `startDateRelative`.",
  "Termination reason: include verbatim if stated. Do not paraphrase.",
  "Treat any fact the prompt asserts (e.g. 'signed in Comeet', 'approved via Spark Hire', 'home base Berlin') as authoritative scenario data — do NOT mark it as missing or conflicting unless the prompt itself presents two contradictory values for the same field.",
  "Populate `jurisdictions` with every country / region the prompt names (e.g. 'Israel', 'Germany', 'US'). Set `requiresJurisdictionalReview: true` when the prompt mentions visa, work authorization, cross-border employment, country-specific payroll/tax, or per-country HR review.",
  "Return ONLY the JSON object.",
].join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// Parse — call the LLM, validate, fall back to regex on any failure.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsePlanResult {
  plan: Plan;
  source: "llm" | "regex-fallback" | "cache";
  llmDurationMs?: number;
  rawLlmContent?: string;
  fallbackReason?: string;
}

/** Strip code fences / surrounding prose so a "best-effort" model output still parses. */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  // direct parse
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  // fenced ```json ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }
  // first {...} balanced block
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* fall through */ }
  }
  throw new Error("no JSON object found in LLM parser output");
}

export async function parsePlanLLM(
  task: string,
  hermes: HermesClient,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ParsePlanResult> {
  const messages = [
    { role: "system" as const, content: PARSER_SYSTEM_PROMPT },
    { role: "user" as const, content: task },
  ];
  const start = Date.now();
  let raw = "";
  try {
    const res = await hermes.chat(messages);
    raw = res.content ?? "";
    const obj = extractJsonObject(raw);
    const plan = PlanSchema.parse(obj);
    return { plan, source: "llm", llmDurationMs: Date.now() - start, rawLlmContent: raw };
  } catch (err) {
    return {
      plan: { intent: "general" }, // sentinel; orchestrator will use the regex fallback below
      source: "regex-fallback",
      llmDurationMs: Date.now() - start,
      rawLlmContent: raw,
      fallbackReason: (err as Error).message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// planToIntent — route the structured plan to one of the deterministic
// orchestrator branches. Identity resolution happens here, against the store.
// ─────────────────────────────────────────────────────────────────────────────

function findContractByName(store: InMemoryStore, tenant: string, name: string): Contract | undefined {
  const target = name.toLowerCase().trim();
  return store.listContracts(tenant).find((c) => c.name.toLowerCase() === target);
}

function deterministicId(name: string, prefix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${prefix}-${slug}`;
}

export function planToIntent(plan: Plan, store: InMemoryStore, tenant: string): Intent {
  // Confidentiality refusal wins outright — even a populated workflow intent
  // does not get to run if the same prompt asks for sensitive data.
  if (plan.confidentialitySubjects && plan.confidentialitySubjects.length > 0) {
    return { kind: "confidentiality-refusal", subjects: plan.confidentialitySubjects };
  }

  if (plan.intent === "confidentiality-refusal") {
    // model said refusal but didn't list subjects — fall back to a generic subject list
    return { kind: "confidentiality-refusal", subjects: ["the requested confidential information"] };
  }

  if (plan.intent === "offboarding") {
    const name = plan.employeeName?.trim();
    if (!name) {
      if (plan.isEmployeeQuestion || (plan.questions && plan.questions.length > 0)) {
        return { kind: "offboarding-employee-question" };
      }
      return {
        kind: "offboarding-missing-info",
        reasons: ["the departing employee's full name was not provided"],
      };
    }
    const lastWorkingDay = plan.lastWorkingDay ?? plan.effectiveDate ?? plan.terminationDate;
    if (!lastWorkingDay) {
      if (plan.isEmployeeQuestion || (plan.questions && plan.questions.length > 0)) {
        return { kind: "offboarding-employee-question", employeeName: name };
      }
      return {
        kind: "offboarding-missing-info",
        reasons: [`no termination/last-working-day date was provided for ${name}`],
      };
    }
    const stakeholders = plan.stakeholders && plan.stakeholders.length > 0
      ? plan.stakeholders
      : ["manager", "HRBP", "IT"];
    return {
      kind: "offboarding",
      employee: {
        name,
        stableId: deterministicId(name, "emp"),
        email: plan.email,
        role: plan.role,
        department: plan.department,
        manager: plan.manager,
        effectiveDate: plan.effectiveDate ?? lastWorkingDay,
        lastWorkingDay,
        terminationDate: plan.terminationDate ?? lastWorkingDay,
        reason: plan.terminationReason,
        stakeholders,
      },
    };
  }

  if (plan.intent === "employee-question") {
    // Employee Q&A — let the general assistant produce the warm answer. The
    // general assistant prompt already covers first-day, contact path, culture,
    // and cautious document guidance.
    return { kind: "general" };
  }

  if (plan.intent === "draft-or-revision") {
    return { kind: "draft-or-revision", instruction: plan.notes ?? plan.draftKind ?? "Produce the requested draft or revision." };
  }

  if (plan.intent === "onboarding") {
    const name = plan.employeeName?.trim();
    const hasConflict = plan.hasConflict === true;
    const missing = plan.missingFields ?? [];
    const partialName = name && !name.includes(" ") ? name : undefined;

    // Per Rule 1: never refuse on identity-mismatch. The only true "cannot proceed" case is
    // when the prompt did not give us a full legal name at all. Partial fields, conflicting
    // fields, and relative start dates are all handled inside onboarding-match — the
    // deterministic runner uses per-step `requires` to compute safe-now vs blocked.
    if (!name) {
      const reasons = missing.length > 0
        ? missing.map((f) => `${f} is missing`)
        : ["the full legal name of the new hire was not provided"];
      return { kind: "onboarding-missing-info", reasons };
    }
    if (partialName) {
      return {
        kind: "onboarding-missing-info",
        partialName,
        reasons: ["only a partial name was provided — full legal name is required"],
      };
    }

    // Prefer the fixture contract when the prompt is sparse (e.g. "Onboard Maya Cohen").
    // Otherwise synthesize from the prompt; partial fields just become blocked steps in
    // the deterministic runner.
    const fixtureContract = findContractByName(store, tenant, name);
    const candidate: Contract = fixtureContract ?? {
      candidateId: `prompt-${deterministicId(name, "c")}`,
      name,
      role: plan.role ?? "—",
      // Employment type: only default when we already have role + start date + (manager|dept).
      // Otherwise leave it as "—" so the recap is honest about what we know.
      startDate: plan.startDate ?? "—",
      department: plan.department ?? "—",
      managerId: plan.manager ? deterministicId(plan.manager, "mgr") : "mgr-unknown",
      employmentType:
        plan.employmentType
        ?? (plan.role && plan.startDate && (plan.manager || plan.department) ? "full-time" : "—"),
      signed: true,
    };

    return {
      kind: "onboarding-match",
      candidate,
      extractedName: name,
      promptSourced: !fixtureContract,
      managerName: plan.manager,
      questions: plan.questions,
      mentionsIsraelCompliance: plan.mentionsIsraelCompliance,
      workLocation: plan.workLocation,
      jurisdictions: plan.jurisdictions,
      requiresJurisdictionalReview: plan.requiresJurisdictionalReview,
      hasConflict,
    };
  }

  return { kind: "general" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level: parse the task into an Intent, with caching + regex fallback.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveIntentOpts {
  task: string;
  tenant: string;
  scenarioId?: string;
  store: InMemoryStore;
  hermes: HermesClient;
  cache?: PlanCache;
}

export interface ResolveIntentResult {
  intent: Intent;
  plan?: Plan;
  source: "llm" | "regex-fallback" | "cache";
  fallbackReason?: string;
  llmDurationMs?: number;
}

export async function resolveIntent(opts: ResolveIntentOpts): Promise<ResolveIntentResult> {
  const { task, tenant, scenarioId, store, hermes, cache } = opts;
  const key = cacheKey(tenant, task);
  if (cache) {
    const cached = cache.get(key);
    if (cached) {
      return { intent: planToIntent(cached, store, tenant), plan: cached, source: "cache" };
    }
  }

  const llm = await parsePlanLLM(task, hermes);
  if (llm.source === "llm") {
    cache?.set(key, llm.plan);
    return {
      intent: planToIntent(llm.plan, store, tenant),
      plan: llm.plan,
      source: "llm",
      llmDurationMs: llm.llmDurationMs,
    };
  }

  // Regex fallback — never lets a missing/malformed LLM response stall the path.
  const intent = classifyIntent({ task, tenant, scenarioId, store });
  return {
    intent,
    source: "regex-fallback",
    fallbackReason: llm.fallbackReason,
    llmDurationMs: llm.llmDurationMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan cache — in-memory, keyed by tenant + task content.
// ─────────────────────────────────────────────────────────────────────────────

export class PlanCache {
  private map = new Map<string, { plan: Plan; expiresAt: number }>();
  constructor(private ttlMs: number = 10 * 60_000, private maxEntries: number = 256) {}

  get(key: string): Plan | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.plan;
  }

  set(key: string, plan: Plan): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    this.map.set(key, { plan, expiresAt: Date.now() + this.ttlMs });
  }

  size(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
}

function cacheKey(tenant: string, task: string): string {
  // Cheap, stable, content-addressed; we intentionally avoid crypto so this stays
  // O(task.length) and dependency-free. Collisions are bounded by tenant.
  let hash = 0;
  for (let i = 0; i < task.length; i++) {
    hash = (hash * 31 + task.charCodeAt(i)) | 0;
  }
  return `${tenant}#${task.length}#${hash}`;
}
