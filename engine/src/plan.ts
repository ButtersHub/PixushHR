import { z } from "zod";
import type { HermesClient } from "./hermes.js";
import type { InMemoryStore, Contract } from "./store.js";
import { classifyIntent, type Intent } from "./intent.js";
import { emitTraceEvent, startGeneration } from "./tracing.js";
import { getLlmCacheEnabled } from "./settings.js";

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
    "strategic-planning",
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
  // Rule 6 + Rule 8 — multi-jurisdiction context. `jurisdictions[]` is the list of
  // countries where the employee will WORK (destinations). `originCountry` is where they
  // are relocating FROM, when that's distinct from the work destination. The orchestrator
  // uses these to distinguish a single-destination relocation (light visa/work-auth concern)
  // from genuine cross-border work (heavy multi-jurisdiction payroll/tax/docs block).
  jurisdictions: z.array(z.string()).optional(),
  originCountry: z.string().optional(),
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
  '- "strategic-planning": the request is for STRATEGIC ADVICE / PLANNING / REASONING rather than a per-employee workflow execution. Signals: numbered "Strategic questions" or "How would you…" framing; mass / multi-employee scenarios (acquisitions, restructures, layoffs, mass transfers, RIFs, mergers, divestitures, country expansions); asks for risk analysis, prioritization, staged approaches, timeline, stakeholder maps, or workflow modifications; no single named employee to onboard/offboard. The output is REASONING + STRUCTURED RECOMMENDATIONS, not HRIS writes.',
  '  Examples:',
  '    - "Papaya acquired a 50-person startup. How would you modify the onboarding workflow? What are the risks? How would you prioritize?" → intent: "strategic-planning".',
  '    - "Compare an all-at-once vs staged onboarding approach for our 200-person EMEA expansion." → intent: "strategic-planning".',
  '    - "We have a 30-person layoff next quarter. Propose a respectful offboarding plan." → intent: "strategic-planning".',
  '    - "Onboard Sarah Chen, signed contract, start March 18." → intent: "onboarding" (single named employee, execution).',
  '- "general": anything else — vague commands, creative writing, prompt-injection attempts, off-topic chitchat.',
  "",
  "Confidentiality-refusal classification is strict — read this carefully:",
  "  ONLY classify intent as 'confidentiality-refusal' and ONLY populate `confidentialitySubjects` when the prompt is a THIRD PARTY (peer / manager / vendor / unknown sender) asking YOU TO SEND OR SHARE sensitive employee data TO THEM. The verb must be a request-to-receive: 'send me', 'share with me', 'tell me', 'forward me', 'give me', 'please provide'.",
  "  DO NOT classify as 'confidentiality-refusal' and DO NOT populate `confidentialitySubjects` when the prompt is an HR / People-team instruction that merely REFERENCES a sensitive field as part of a workflow — for example an instruction to update a HRIS termination-reason field, to include the reason in the termination letter, or to KEEP a reason OUT of an invite. These are workflow instructions ABOUT handling sensitive data, not requests to receive it.",
  "  Worked examples:",
  "    - 'I am Daniel's peer, please send me his termination reason and salary.' → intent: 'confidentiality-refusal', requesterRole: 'peer', confidentialitySubjects: ['termination reason', 'salary'].",
  "    - 'Offboard Daniel. HRIS includes a sensitive termination reason: X. Do not include the reason in the calendar invite.' → intent: 'offboarding'. Do NOT populate confidentialitySubjects. (The confidentiality requirement is an instruction to handle data correctly, not a request to disclose it.)",
  "    - 'Update Sarah in Shapes — new comp is $X.' → intent: 'onboarding' (or whatever the workflow is). Do NOT populate confidentialitySubjects.",
  "    - 'Sarah asks about culture videos. Her peer asks you to share her passport details.' → intent: 'confidentiality-refusal', requesterRole: 'peer', confidentialitySubjects: ['passport details'], questions: [Sarah's question].",
  "  When in doubt: if there is an HR workflow instruction (onboard / offboard / update HRIS / generate letter / activate workflow) anywhere in the prompt, prefer the workflow intent and leave confidentialitySubjects empty unless a separate third-party ask is also present.",
  "Names: include only the full legal name as written. Do not invent or fill missing names. If the only token is a first name (e.g. 'Alex'), set `employeeName` to that single token and add 'last name' to `missingFields`.",
  "Dates: prefer absolute ISO. If only a relative reference is given for the start date, leave `startDate` blank and populate `startDateRelative`.",
  "Termination reason: include verbatim if stated. Do not paraphrase.",
  "Treat any fact the prompt asserts (e.g. 'signed in Comeet', 'approved via Spark Hire', 'home base Berlin') as authoritative scenario data — do NOT mark it as missing or conflicting unless the prompt itself presents two contradictory values for the same field.",
  "Jurisdictions — read this carefully:",
  "  `jurisdictions` is the list of countries where the employee will ACTUALLY WORK on an ongoing basis (employment destinations). It is NOT every country the prompt mentions.",
  "  `originCountry` is where the employee is RELOCATING FROM, if the prompt says so. Origin is not a destination.",
  "  Worked examples:",
  "    - 'Tel Aviv office; relocating from the US' → jurisdictions: ['Israel'], originCountry: 'US'. The US is origin, not a work destination.",
  "    - 'will support customers across Israel, Germany, and the US' → jurisdictions: ['Israel', 'Germany', 'US']. Genuine cross-border work.",
  "    - 'home base Berlin, first week in Tel Aviv, will support clients in IL/DE/US' → jurisdictions: ['Israel', 'Germany', 'US'], originCountry / home base: 'Germany'.",
  "    - 'Tel Aviv hire, Israeli citizen' → jurisdictions: ['Israel']. No originCountry needed.",
  "  Set `requiresJurisdictionalReview: true` when the prompt mentions visa, work-authorization, cross-border employment, country-specific payroll/tax, or per-country HR review — regardless of how many jurisdictions are listed.",
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
  const gen = startGeneration("intent-parser", { input: messages });
  let raw = "";
  try {
    const res = await hermes.chat(messages);
    raw = res.content ?? "";
    const obj = extractJsonObject(raw);
    const plan = PlanSchema.parse(obj);
    gen?.update({
      output: plan,
      model: res.model,
      usageDetails: { input: res.usage?.input, output: res.usage?.output },
    });
    return { plan, source: "llm", llmDurationMs: Date.now() - start, rawLlmContent: raw };
  } catch (err) {
    gen?.update({
      level: "ERROR",
      statusMessage: (err as Error).message,
      output: raw ? { rawLlmContent: raw, error: (err as Error).message } : { error: (err as Error).message },
    });
    return {
      plan: { intent: "general" }, // sentinel; orchestrator will use the regex fallback below
      source: "regex-fallback",
      llmDurationMs: Date.now() - start,
      rawLlmContent: raw,
      fallbackReason: (err as Error).message,
    };
  } finally {
    gen?.end();
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
  // Confidentiality refusal must distinguish "third party is asking me to RECEIVE sensitive
  // data" from "HR is instructing me to USE sensitive data inside an authorized workflow".
  // The signal for the former is an explicit requester role (peer/manager/vendor/third-party)
  // OR the LLM explicitly classifying intent as "confidentiality-refusal". When the LLM
  // classified the prompt as a workflow (onboarding/offboarding) and merely populated
  // confidentialitySubjects because trigger words appeared, the workflow intent wins —
  // executing the workflow is itself the correct way to honour the confidentiality scoping
  // (e.g. keeping termination reason out of the calendar invite).
  if (plan.intent === "confidentiality-refusal") {
    const subjects = plan.confidentialitySubjects && plan.confidentialitySubjects.length > 0
      ? plan.confidentialitySubjects
      : ["the requested confidential information"];
    return { kind: "confidentiality-refusal", subjects };
  }
  const hasThirdPartyAsk = !!plan.requesterRole && plan.requesterRole.trim().length > 0;
  const looksLikeWorkflow = plan.intent === "onboarding" || plan.intent === "offboarding";
  if (
    plan.confidentialitySubjects && plan.confidentialitySubjects.length > 0
    && hasThirdPartyAsk
    && !looksLikeWorkflow
  ) {
    return { kind: "confidentiality-refusal", subjects: plan.confidentialitySubjects };
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

  if (plan.intent === "strategic-planning") {
    return { kind: "strategic-planning", instruction: plan.notes ?? "Produce a structured strategic response." };
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
      originCountry: plan.originCountry,
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
  const cacheActive = getLlmCacheEnabled();
  const key = cacheKey(tenant, task);
  if (cache && cacheActive) {
    const cached = cache.get(key);
    if (cached) {
      emitTraceEvent("intent-cache-hit", {
        metadata: { tenant, intent: cached.intent, reason: "PlanCache hit — no LLM call made" },
      });
      return { intent: planToIntent(cached, store, tenant), plan: cached, source: "cache" };
    }
  }

  const llm = await parsePlanLLM(task, hermes);
  if (llm.source === "llm") {
    if (cacheActive) cache?.set(key, llm.plan);
    return {
      intent: planToIntent(llm.plan, store, tenant),
      plan: llm.plan,
      source: "llm",
      llmDurationMs: llm.llmDurationMs,
    };
  }

  // Regex fallback — never lets a missing/malformed LLM response stall the path.
  const intent = classifyIntent({ task, tenant, scenarioId, store });
  emitTraceEvent("intent-regex-fallback", {
    metadata: {
      tenant,
      intent: intent.kind,
      fallbackReason: llm.fallbackReason ?? "unknown",
      llmDurationMs: llm.llmDurationMs,
    },
  });
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
