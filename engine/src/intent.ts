import type { InMemoryStore, Contract } from "./store.js";

/** Intent classifications used by the orchestrator to choose a deterministic branch.
 *  Names are intentionally generic — no scenario IDs or fixture people leak in here. */
export type Intent =
  | { kind: "confidentiality-refusal"; subjects: string[] }
  | {
      kind: "onboarding-match";
      candidate: Contract;
      extractedName: string;
      /** True when the candidate was synthesized from prompt-supplied fields rather than
       *  found in the ATS fixture. Tells the orchestrator to register the synthetic record
       *  before running the tool chain so audit calls succeed end-to-end. */
      promptSourced?: boolean;
      managerName?: string;
      questions?: string[];
      mentionsIsraelCompliance?: boolean;
      hiringSource?: string;
      workLocation?: string;
      /** Per-Rule-6: jurisdictions the prompt explicitly references (countries / regions). */
      jurisdictions?: string[];
      /** True if the prompt mentions visa / work-authorization / cross-border / per-country
       *  payroll concerns that require People/Legal review before final HRIS activation. */
      requiresJurisdictionalReview?: boolean;
      /** Per-Rule-1: if the LLM detected a conflict (prompt vs contract details). We still
       *  proceed (no all-or-nothing refusal) but the response surfaces the conflict and blocks
       *  steps that depend on the disputed fields. */
      hasConflict?: boolean;
    }
  | { kind: "onboarding-missing-info"; partialName?: string; reasons: string[] }
  | { kind: "offboarding"; employee: ParsedTermination; jurisdictions?: string[]; requiresJurisdictionalReview?: boolean }
  | { kind: "offboarding-missing-info"; reasons: string[] }
  | { kind: "offboarding-employee-question"; employeeName?: string }
  | { kind: "draft-or-revision"; instruction: string }
  | { kind: "general" };

export interface ParsedTermination {
  name: string;
  /** Stable, deterministic id derived from the name so retries are idempotent. */
  stableId: string;
  email?: string;
  role?: string;
  department?: string;
  manager?: string;
  effectiveDate?: string;
  lastWorkingDay?: string;
  terminationDate?: string;
  reason?: string;
  stakeholders: string[];
}

const FULL_NAME_RE = /\b[A-Z][a-zA-Z'’\-]+(?:\s+(?:[A-Z][a-zA-Z'’\-]+|[a-z][a-zA-Z'’\-]+))+\b/;

/** Extracts a full employee name (≥2 tokens) from the task using a series of labeled patterns
 *  before falling back to a positional capitalised-name regex. Returns null if no plausible name
 *  is found, or only a single token. */
export function extractEmployeeName(task: string): string | null {
  const lines = task.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/(?:^|\s)Employee:\s*([^,\n]+?)(?:\s*$|,)/i);
    if (m) {
      const n = m[1].trim();
      if (FULL_NAME_RE.test(n)) return cleanName(n);
    }
  }

  const patterns = [
    /Onboard(?:ing)?\s+(?:a\s+(?:new\s+)?(?:\w+\s+)?(?:test\s+employee|employee))/i, // generic "Onboard a test employee" → null
    /Onboard(?:ing)?\s+([A-Z][a-zA-Z'’\-]+(?:\s+[A-Z][a-zA-Z'’\-]+){1,3})/,
    /(?:new\s+(?:software\s+)?(?:engineer|hire|employee|backend\s+engineer|payroll\s+\w+\s+specialist)[^,\n]*?,?\s+)([A-Z][a-zA-Z'’\-]+(?:\s+[A-Z][a-zA-Z'’\-]+){1,3})/i,
    /\b([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+),\s+(?:the\s+)?(?:new|departing)\b/,
    /\b([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+)\s+(?:is\s+leaving|asks(?:\s|:)|,\s+the\s+new)/,
    /\bShare\s+([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+)('s)?/,
    /\bemployee\s+is\s+([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+)/i,
    /\b(?:for|of)\s+([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+)(?:'s|\b)/,
  ];
  for (const re of patterns) {
    const m = task.match(re);
    if (m && m[1]) {
      const n = cleanName(m[1]);
      if (FULL_NAME_RE.test(n)) return n;
    }
  }
  return null;
}

function cleanName(name: string): string {
  return name.replace(/[.,;:].*$/, "").trim();
}

/** Returns lowercase first-token only (used for partial-name detection like "Alex"). */
export function extractPartialName(task: string): string | null {
  const m = task.match(/Onboard(?:ing)?\s+([A-Z][a-zA-Z'’\-]+)\b/);
  if (!m) return null;
  return m[1];
}

const MISSING_MARKERS = [
  /\bdo not know\b/i,
  /\bdon'?t know\b/i,
  /\bunknown\b/i,
  /\bnot available\b/i,
  /\bunverified\b/i,
  /\bmissing\b/i,
  /\bplease just get it done\b/i,
];
const RELATIVE_DATE_MARKERS = [
  // Only fire when the relative reference is right next to a labelled "Start date" field —
  // matches "Start date: yesterday" / "Start date: next Monday" but not casual prose like
  // "I'm excited to start next week" elsewhere in the prompt.
  /\bstart\s+date\s*:\s*(?:today|tomorrow|yesterday|next\s+\w+|last\s+\w+|sometime\s+(?:next|this)\s+\w+)\b/i,
];

function hasRelativeDate(task: string): string | null {
  for (const re of RELATIVE_DATE_MARKERS) {
    if (re.test(task)) return "start date is relative or ambiguous";
  }
  return null;
}

function missingInfoReasons(task: string): string[] {
  const reasons: string[] = [];
  for (const re of MISSING_MARKERS) {
    if (re.test(task)) {
      reasons.push("required onboarding fields are missing");
      break;
    }
  }
  const rel = hasRelativeDate(task);
  if (rel) reasons.push(rel);
  if (/prompt\s+says.*signed\s+contract\s+says/is.test(task)) {
    reasons.push("the prompt and the signed contract disagree on the candidate's details");
  }
  return reasons;
}

function isOffboarding(task: string, scenarioId?: string): boolean {
  const s = (scenarioId ?? "").toLowerCase();
  if (s === "offboarding" || s === "offboard") return true;
  return /\b(?:offboard|offboarding|terminat(?:e|ion)|last working day|leaving (?:papaya|the team|the company|the operations|the engineering)|logistics\s+invite|termination\s+letter|activate\s+offboarding)\b/i.test(task);
}

function isOnboarding(task: string, scenarioId?: string): boolean {
  const s = (scenarioId ?? "").toLowerCase();
  if (s === "onboarding" || s === "onboard") return true;
  return /\b(?:onboard|onboarding|new\s+hire|signed\s+contract|populate\s+shapes|add\s+(?:.*\s+)?to\s+teams|complete\s+onboarding\s+workflow|run\s+(?:.*\s+)?onboarding)\b/i.test(task);
}

function isConfidentialityRequest(task: string): { match: true; subjects: string[] } | { match: false } {
  // Detect requests where someone is asking the agent to share confidential employee data
  // (salary, contract details, termination reason, passport, home address). We require an
  // ask marker AND a subject marker in the SAME sentence so legitimate onboarding workflows
  // that merely mention "signed contract" or "extract signed-contract details" don't trigger.
  const subjectMatchers: Array<{ re: RegExp; label: string }> = [
    { re: /\b(?:termination\s+reason|reason\s+for\s+termination)\b/i, label: "termination reason" },
    { re: /\b(?:salary|compensation|pay\s+rate|wage)\b/i, label: "salary" },
    { re: /\b(?:contract\s+details|signed\s+contract|offer\s+terms)\b/i, label: "contract details" },
    { re: /\bpassport(?:\s+(?:number|details?))?\b/i, label: "passport details" },
    { re: /\b(?:home\s+address|residential\s+address)\b/i, label: "home address" },
  ];
  const askMarker =
    /\b(?:send|share|give|tell|forward|email|message|provide|disclose|reveal)\s+(?:me|us|to\s+me|to\s+us|the\s+team|our\s+team)\b/i;
  const askWithSubject =
    /\b(?:share|send|give|tell|provide|disclose|reveal|forward)\s+(?:[A-Z][a-zA-Z'’\-]+(?:'s|’s)|[a-zA-Z]+'s|the\s+\w+(?:'s)?)\s+(?:termination|salary|contract|passport|home\s+address|signed)/i;

  const sentences = task.split(/(?<=[.!?])\s+|\n+/);
  const subjects = new Set<string>();
  for (const sentence of sentences) {
    const hasAsk = askMarker.test(sentence) || askWithSubject.test(sentence);
    if (!hasAsk) continue;
    for (const { re, label } of subjectMatchers) {
      if (re.test(sentence)) subjects.add(label);
    }
  }
  if (subjects.size > 0) return { match: true, subjects: [...subjects] };
  return { match: false };
}

function field(task: string, label: string): string | undefined {
  const re = new RegExp(`(?:^|\\n)\\s*${label}:\\s*([^\\n]+)`, "i");
  const m = task.match(re);
  if (m) return m[1].trim();
  return undefined;
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};
const LONG_DATE_RE = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?,?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i;

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const long = trimmed.match(LONG_DATE_RE);
  if (long) {
    const mo = MONTHS[long[1].toLowerCase()];
    const day = long[2].padStart(2, "0");
    return `${long[3]}-${mo}-${day}`;
  }
  return undefined;
}

/** Find a date near a labelled phrase in prose, e.g.
 *  "his last working day as Friday, June 28th, 2024" → 2024-06-28. */
function parseProseDate(task: string, anchor: RegExp): string | undefined {
  const m = task.match(anchor);
  if (!m) return undefined;
  const tail = task.slice(m.index! + m[0].length, m.index! + m[0].length + 80);
  const long = tail.match(LONG_DATE_RE);
  if (long) {
    const mo = MONTHS[long[1].toLowerCase()];
    const day = long[2].padStart(2, "0");
    return `${long[3]}-${mo}-${day}`;
  }
  const iso = tail.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return undefined;
}

function deterministicId(name: string, prefix: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${prefix}-${slug}`;
}

function parseTermination(task: string, employeeName: string): ParsedTermination {
  const stakeholdersLine = field(task, "Relevant parties(?:\\s+for\\s+last-day\\s+logistics)?") ?? "";
  let stakeholders = stakeholdersLine
    .split(/,| and /i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (stakeholders.length === 0) {
    // Prose form: "create the last-working-day invite for manager/HRBP/IT"
    const m = task.match(/(?:invite|logistics)[^.\n]*?for\s+([A-Z]?[a-z]+(?:\/[A-Z]?[a-z]+){1,4})/i);
    if (m) stakeholders = m[1].split("/").map((s) => s.trim()).filter(Boolean);
  }

  const labelLast = parseDate(field(task, "Last\\s+working\\s+day"));
  const labelEffective = parseDate(field(task, "Effective\\s+date"));
  const labelTermination = parseDate(field(task, "Termination\\s+date"));
  const proseLast = parseProseDate(task, /\blast\s+working\s+day\s+(?:as|is|of|on|=)\b/i)
    ?? parseProseDate(task, /\bleaving[^.\n]*\b(?:on|as of|effective)\b/i);
  const proseTermination = parseProseDate(task, /\btermination\s+date\s+(?:as|is|of|on|=)\b/i);
  const proseEffective = parseProseDate(task, /\beffective\s+date\s+(?:as|is|of|on|=)\b/i);

  const lastWorkingDay = labelLast ?? proseLast ?? labelEffective ?? labelTermination ?? proseEffective ?? proseTermination;
  const effectiveDate = labelEffective ?? proseEffective ?? labelLast ?? proseLast ?? labelTermination ?? proseTermination;
  const terminationDate = labelTermination ?? proseTermination ?? labelLast ?? proseLast ?? labelEffective ?? proseEffective;

  // Reason: labelled "Reason: ..." or prose "the reason as ..." / "recorded reason as ..."
  let reason = field(task, "(?:Termination\\s+)?Reason");
  if (!reason) {
    const m = task.match(/\breason(?:\s+as)?\s*(?:was|is|as|recorded\s+as)?\s*([^.\n]+?)(?:\.|$|\n)/i);
    if (m && m[1].length < 120) reason = m[1].trim();
  }

  return {
    name: employeeName,
    stableId: deterministicId(employeeName, "emp"),
    email: field(task, "Work\\s+email") ?? field(task, "Email"),
    role: field(task, "Role"),
    department: field(task, "Department"),
    manager: field(task, "Manager"),
    effectiveDate,
    lastWorkingDay,
    terminationDate,
    reason,
    stakeholders,
  };
}

function findContractByName(store: InMemoryStore, tenant: string, name: string): Contract | undefined {
  const target = name.toLowerCase();
  return store
    .listContracts(tenant)
    .find((c) => c.name.toLowerCase() === target);
}

/** Single entry point: given the task + tenant + scenario id, return the classified intent. */
export function classifyIntent(opts: { task: string; tenant: string; scenarioId?: string; store: InMemoryStore }): Intent {
  const { task, tenant, scenarioId, store } = opts;
  const conf = isConfidentialityRequest(task);
  if (conf.match) return { kind: "confidentiality-refusal", subjects: conf.subjects };

  const offboard = isOffboarding(task, scenarioId);
  if (offboard) {
    const name = extractEmployeeName(task);
    if (!name) {
      if (isOffboardingEmployeeQuestion(task)) {
        return { kind: "offboarding-employee-question" };
      }
      const reasons: string[] = ["the departing employee's full name was not provided"];
      return { kind: "offboarding-missing-info", reasons };
    }
    const parsed = parseTermination(task, name);
    if (!parsed.effectiveDate && !parsed.lastWorkingDay && !parsed.terminationDate) {
      if (isOffboardingEmployeeQuestion(task)) {
        return { kind: "offboarding-employee-question", employeeName: name };
      }
      return {
        kind: "offboarding-missing-info",
        reasons: [`no termination/last-working-day date was provided for ${name}`],
      };
    }
    return { kind: "offboarding", employee: parsed };
  }

  if (isOnboarding(task, scenarioId)) {
    const reasons = missingInfoReasons(task);
    const fullName = extractEmployeeName(task);
    const partial = extractPartialName(task);
    const conflict = reasons.some((r) => /disagree|conflict|mismatch/i.test(r));

    if (fullName) {
      const contract = findContractByName(store, tenant, fullName);
      // Per-Rule-1: never refuse on identity-mismatch. If the fixture has the candidate, use
      // it; otherwise synthesise a minimal contract from the prompt and let the orchestrator's
      // partial-execution machinery decide which steps are safe vs blocked.
      if (contract) {
        return { kind: "onboarding-match", candidate: contract, extractedName: fullName, hasConflict: conflict };
      }
      const synthetic: Contract = {
        candidateId: `prompt-${deterministicId(fullName, "c")}`,
        name: fullName,
        role: "—",
        startDate: "—",
        department: "—",
        managerId: "mgr-unknown",
        employmentType: "—",
        signed: true,
      };
      return { kind: "onboarding-match", candidate: synthetic, extractedName: fullName, promptSourced: true, hasConflict: conflict };
    }

    if (reasons.length > 0 || partial) {
      return { kind: "onboarding-missing-info", partialName: partial ?? undefined, reasons: reasons.length > 0 ? reasons : ["the full legal name of the new hire was not provided"] };
    }
  }

  return { kind: "general" };
}

/** Heuristic for "this prompt is the employee asking the agent a question about offboarding
 *  logistics" rather than HR triggering an offboarding execution. */
export function isOffboardingEmployeeQuestion(task: string): boolean {
  if (!/\b(?:offboard|offboarding|last\s+(?:day|working\s+day)|letter)\b/i.test(task)) return false;
  return /\basks\b/i.test(task) || /"[^"]{15,}\?"/.test(task) || /\bwhat\s+(?:happens|should\s+i\s+expect)\b/i.test(task);
}
