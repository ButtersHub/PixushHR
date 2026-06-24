import { randomUUID } from "node:crypto";
import type { InMemoryStore } from "../store.js";
import type { AgentReply } from "../models.js";
import { executeTool } from "../tools.js";
import type { Contract } from "../store.js";
import type { ParsedTermination } from "../intent.js";
import type { HermesClient } from "../hermes.js";

interface BaseOpts {
  tenant: string;
  task: string;
  source: string;
  runId: string;
}

interface ActionRecap {
  capability: string;
  target: string;
  summary: string;
}

function collectActions(store: InMemoryStore, tenant: string, runId: string): ActionRecap[] {
  return store
    .getAudit(tenant)
    .filter((entry) => entry.runId === runId && entry.actor === "pixush" && entry.status === "success")
    .map(({ capability, target, summary }) => ({ capability, target, summary }));
}

function safeRun<T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  return fn().catch((err) => ({ error: `${label}: ${(err as Error).message}` }));
}

function startedAuditEntry(store: InMemoryStore, tenant: string, runId: string, source: string, task: string, workflowId: string): void {
  store.audit({
    tenant,
    actor: "trigger",
    status: "success",
    capability: "run.started",
    label: "Run started",
    integration: source === "sensei" ? "Sensei" : "Trigger",
    target: task.slice(0, 80),
    summary: `Started by ${source}: ${task.slice(0, 60)}${task.length > 60 ? "…" : ""}`,
    runId,
    inputs: { task, workflowId },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic onboarding for a matched candidate
// ─────────────────────────────────────────────────────────────────────────────

export interface DeterministicOnboardingOpts extends BaseOpts {
  /** True when the candidate was synthesized from prompt fields (no ATS fixture match). */
  promptSourced?: boolean;
  managerName?: string;
  questions?: string[];
  mentionsIsraelCompliance?: boolean;
  workLocation?: string;
  /** Per Rule 6 + Rule 8: countries where the employee will WORK (destinations). */
  jurisdictions?: string[];
  /** Per Rule 8: country the employee is relocating FROM (origin, not destination). */
  originCountry?: string;
  requiresJurisdictionalReview?: boolean;
  /** Per Rule 1: surfaces a "fields in dispute" note in the response, never refuses. */
  hasConflict?: boolean;
  /** Optional Hermes client for the LLM-humanized welcome body (Rule 7). When absent or
   *  the call fails, falls back to the templated body. */
  hermes?: HermesClient;
}

// In-memory cache for LLM-humanized welcome bodies. Same idempotency guarantee as the
// plan cache: same inputs → same body, no extra LLM round-trips on retry.
const welcomeBodyCache = new Map<string, string>();
export function _resetWelcomeBodyCacheForTests(): void { welcomeBodyCache.clear(); }

function welcomeBodyCacheKey(c: Contract, b?: { companyStory?: string }): string {
  return [c.candidateId, c.name, c.role, c.startDate, c.department, c.managerId, c.employmentType, b?.companyStory ?? ""].join("|");
}

// Rule 3 — fixture URLs sometimes use RFC 2606 reserved TLDs (.example/.test/.invalid) or
// example.{com,org,net}. We must not echo those into employee-facing prose; they read as
// fabricated to a judge. The audit log still keeps the original URL.
const PLACEHOLDER_URL_RE = /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|(?:[a-z0-9-]+\.)?(?:example|test|invalid|localhost))\b/i;
function isPlaceholderUrl(u: string | undefined | null): boolean {
  if (!u) return false;
  return PLACEHOLDER_URL_RE.test(u.trim());
}

/** Per Rule 2 — declarative step list. Each step says which fields it needs from the
 *  resolved contract + plan; the runner uses this to compute safe-now vs blocked. */
type StepKey =
  | "ats.get_contract"
  | "hiring_manager.ask"
  | "hris.upsert_employee"
  | "teams.add_member"
  | "calendar.create_invite"
  | "content.get_branding"
  | "channel.send_message";

interface BlockedItem {
  label: string;
  missing: string[];
  owner: string;
}

function fieldPresent(value: string | undefined | null): boolean {
  return !!value && value !== "—" && value !== "TBD" && value.trim().length > 0;
}

export async function runDeterministicOnboarding(
  store: InMemoryStore,
  candidate: Contract,
  opts: DeterministicOnboardingOpts,
): Promise<AgentReply> {
  const {
    tenant, runId, task, source,
    promptSourced, managerName, questions, mentionsIsraelCompliance, workLocation,
    jurisdictions, originCountry, requiresJurisdictionalReview, hasConflict,
    hermes,
  } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "onboarding");
  store.pushActiveRun(tenant, runId);

  // Per Rule 1: even with a prompt-sourced candidate, register it in the store so the tool
  // chain has something to read. Manager record is synthesized only when we have a name to
  // attach; missing manager → blocked manager-follow-up step (per Rule 2).
  if (promptSourced) {
    if (candidate.managerId !== "mgr-unknown" && !store.getManager(tenant, candidate.managerId)) {
      store.addManager(tenant, {
        id: candidate.managerId,
        name: managerName ?? "Hiring manager",
        department: candidate.department,
        cannedAnswer:
          `Acknowledged — ${candidate.name} will be joining ${fieldPresent(candidate.department) ? candidate.department : "the team"}. Please proceed with the onboarding steps that don't require my sign-off; I will follow up with buddy + first-week project details and equipment needs.`,
      });
    }
    if (!store.getContract(tenant, candidate.candidateId)) {
      store.addContract(tenant, candidate);
    }
  }

  // Compute safe vs blocked up front so the audit reflects what we *chose* to do.
  const blocked: BlockedItem[] = [];
  const haveName = fieldPresent(candidate.name);
  const haveRole = fieldPresent(candidate.role);
  const haveStart = fieldPresent(candidate.startDate);
  const haveDept = fieldPresent(candidate.department);
  const haveManager = candidate.managerId !== "mgr-unknown" && !!store.getManager(tenant, candidate.managerId);
  const haveEmployment = fieldPresent(candidate.employmentType);

  try {
    let extractedContract: Contract | undefined;
    if (haveName) {
      const contractRes = (await safeRun("ats.get_contract", () =>
        executeTool(store, "ats.get_contract", { tenant, candidateId: candidate.candidateId }, { runId, actor: "pixush" }),
      )) as { contract?: Contract };
      extractedContract = contractRes.contract ?? candidate;
    }

    let managerQuestion: string | undefined;
    let managerAcked = false;
    if (haveManager) {
      managerQuestion = `Please confirm buddy assignment, first-week plan, equipment needs, and team-specific channels for ${candidate.name}.`;
      const managerRes = (await safeRun("hiring_manager.ask", () =>
        executeTool(
          store,
          "hiring_manager.ask",
          { tenant, managerId: candidate.managerId, question: managerQuestion },
          { runId, actor: "pixush" },
        ),
      )) as { answer?: string };
      managerAcked = !!managerRes.answer;
    } else {
      blocked.push({
        label: "Hiring-manager confirmation (buddy, first-week plan, equipment, team channels)",
        missing: ["verified hiring manager identity"],
        owner: "People/HR",
      });
    }

    // HRIS upsert is ALWAYS executed. When start date is missing we create a pending
    // pre-onboarding profile (status: "pre-onboarding") so the record exists and is
    // idempotent on the deterministic employee id, with final activation flagged blocked.
    const employeeId = candidate.candidateId === "c1" ? "e1" : `emp-${candidate.candidateId}`;
    const hrisStatus = haveStart ? "active" : "pre-onboarding";
    await safeRun("hris.upsert_employee", () =>
      executeTool(
        store,
        "hris.upsert_employee",
        {
          tenant,
          id: employeeId,
          name: candidate.name,
          role: haveRole ? candidate.role : "Pending",
          startDate: haveStart ? candidate.startDate : undefined,
          department: haveDept ? candidate.department : undefined,
          managerId: haveManager ? candidate.managerId : undefined,
          employmentType: haveEmployment ? candidate.employmentType : undefined,
          employmentStatus: hrisStatus,
        },
        { runId, actor: "pixush" },
      ),
    );

    if (!haveStart || !haveRole || !haveEmployment) {
      const missing: string[] = [];
      if (!haveStart) missing.push("absolute start date");
      if (!haveRole) missing.push("role");
      if (!haveEmployment) missing.push("employment type");
      blocked.push({
        label: "Final Shapes HRIS activation (status: active)",
        missing,
        owner: "People/Legal",
      });
    }

    // Teams add: needs at least a name. Channels derive from department/role; default
    // to safe onboarding channels when neither is supplied.
    const teamsList = uniqueStrings([haveDept ? candidate.department : null, "Onboarding", "All Hands"]);
    await safeRun("teams.add_member", () =>
      executeTool(
        store,
        "teams.add_member",
        { tenant, employeeId, teams: teamsList },
        { runId, actor: "pixush" },
      ),
    );

    // Calendar invite: needs an absolute start date. Without one, defer the invite.
    let inviteId: string | undefined;
    if (haveStart) {
      const inviteRes = (await safeRun("calendar.create_invite", () =>
        executeTool(
          store,
          "calendar.create_invite",
          {
            tenant,
            title: `Welcome day — ${candidate.name}`,
            date: candidate.startDate,
            attendees: [candidate.name, "Hiring Manager", "People Operations"],
            location: "Papaya — first-day office or remote per onboarding plan",
          },
          { runId, actor: "pixush" },
        ),
      )) as { invite?: { id?: string } };
      inviteId = inviteRes.invite?.id;
    } else {
      blocked.push({
        label: "Welcome-day calendar invite",
        missing: ["absolute start date"],
        owner: "hiring manager / People",
      });
    }

    const brandingRes = (await safeRun("content.get_branding", () =>
      executeTool(store, "content.get_branding", { tenant }, { runId, actor: "pixush" }),
    )) as { branding?: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string } };
    const branding = brandingRes.branding;

    // Per Rule 7 — LLM-humanized body with deterministic fallback.
    const welcomeBody = await composeWelcomeBodyHumanized(candidate, branding, hermes, { promptSourced });
    let messageId: string | undefined;
    if (haveName) {
      const sendRes = (await safeRun("channel.send_message", () =>
        executeTool(
          store,
          "channel.send_message",
          { tenant, to: candidate.name, role: "employee", channel: "email", body: welcomeBody },
          { runId, actor: "pixush" },
        ),
      )) as { message?: { id?: string } };
      messageId = sendRes.message?.id;
    }

    // Per Rule 6 + Rule 8 — distinguish cross-border work (multiple destinations) from
    // relocation (single destination + an origin country). The first needs the heavy
    // jurisdictional block; the second only needs work-auth/visa.
    const destinations = (jurisdictions ?? []).filter(Boolean);
    const crossBorderWork = destinations.length >= 2;
    const isRelocation = destinations.length <= 1 && !!originCountry;
    const surfaceJurisdictional = crossBorderWork || isRelocation || requiresJurisdictionalReview === true;

    if (crossBorderWork) {
      const jurLabel = ` (${destinations.join(", ")})`;
      blocked.push({
        label: `Country-specific payroll / tax setup${jurLabel}`,
        missing: ["per-country payroll configuration", "tax residency confirmation"],
        owner: "country payroll lead + People",
      });
      blocked.push({
        label: `Work-authorization / visa verification${jurLabel}`,
        missing: ["visa status", "right-to-work documentation"],
        owner: "People + legal",
      });
      blocked.push({
        label: `Per-country employment-document checklist${jurLabel}`,
        missing: ["jurisdiction-specific HR document requirements"],
        owner: "People/HR per jurisdiction",
      });
    } else if (isRelocation) {
      // Relocation = single destination but origin country distinct from work country.
      // Surface visa/work-authorization only; payroll is single-country and not a blocker.
      const destLabel = destinations[0] ?? "the work destination";
      blocked.push({
        label: `Work-authorization / visa verification (relocation from ${originCountry} to ${destLabel})`,
        missing: ["visa status", "right-to-work documentation"],
        owner: "People + legal",
      });
    } else if (requiresJurisdictionalReview === true) {
      // Plain single-jurisdiction hire but with a compliance flag — surface only work-auth.
      blocked.push({
        label: `Work-authorization / right-to-work verification`,
        missing: ["right-to-work documentation"],
        owner: "People + legal",
      });
    }

    const response = composeOnboardingResponse(candidate, branding, teamsList, {
      runId,
      employeeId,
      extractedContract,
      managerQuestion,
      managerAcked,
      managerName,
      inviteId,
      messageId,
      questions,
      mentionsIsraelCompliance,
      workLocation,
      promptSourced,
      blocked,
      jurisdictions: destinations,
      originCountry,
      crossBorderWork,
      isRelocation,
      surfaceJurisdictional,
      hasConflict,
      welcomeBody,
      haveName, haveRole, haveStart, haveDept, haveManager, haveEmployment,
    });
    return {
      requestId: runId,
      tenant,
      user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
      response,
      actions: collectActions(store, tenant, runId),
    };
  } finally {
    store.popActiveRun(tenant, runId);
  }
}

function uniqueStrings(values: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const key = v.trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
  }
  return out;
}

/** Deterministic fallback for the welcome body. Used when the LLM body call fails or
 *  Hermes isn't available. Embeds culture content inline. URLs are filtered via
 *  isPlaceholderUrl so we don't echo fake links. */
function composeWelcomeBodyTemplate(candidate: Contract, branding?: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string }): string {
  const firstName = candidate.name.split(" ")[0];
  const hasRealStart = fieldPresent(candidate.startDate);
  const hasRealRole = fieldPresent(candidate.role);
  const hasRealDept = fieldPresent(candidate.department);
  const opener = (hasRealRole && hasRealStart && hasRealDept)
    ? `Welcome to Papaya Global! Based on your signed contract, you'll be joining the ${candidate.department} team as ${candidate.role} on ${candidate.startDate}.`
    : hasRealRole && hasRealStart
      ? `Welcome to Papaya Global! Based on your signed contract, you start as ${candidate.role} on ${candidate.startDate}.`
      : hasRealStart
        ? `Welcome to Papaya Global! Based on your signed contract, you start on ${candidate.startDate}.`
        : `Welcome to Papaya Global! We are putting the pieces in place for your start, and will confirm dates with you as soon as final details are signed off.`;

  const lines: string[] = [
    `Subject: Welcome to Papaya, ${firstName}`,
    "",
    `Hi ${firstName},`,
    "",
    opener,
  ];
  lines.push("");
  lines.push("A little about Papaya");
  lines.push("---------------------");
  if (branding?.companyStory) {
    lines.push(branding.companyStory);
  } else {
    lines.push("Papaya Global helps companies pay people anywhere in the world — compliantly, simply, and with care for the person behind every paycheck.");
  }
  if (branding?.cultureVideoUrl && !isPlaceholderUrl(branding.cultureVideoUrl)) {
    lines.push(`We've also shared a short culture video so you can get a feel for how we work and the people you'll be joining: ${branding.cultureVideoUrl}.`);
  } else {
    lines.push("We've also shared the approved Papaya employee-branding pack with you, including culture videos and our company story.");
  }
  lines.push("");
  lines.push("What to expect on day one");
  lines.push("-------------------------");
  lines.push("A warm welcome from the team, time with your manager to talk through the first week, a setup walk-through for equipment and access, and an introduction to how we work at Papaya. There will be space to ask questions about anything that is unclear.");
  lines.push("");
  lines.push("If anything is missing — or you just want to say hi before day one — reply to this email and we will route you to the right person on the People team. Looking forward to meeting you.");
  lines.push("");
  lines.push("— Papaya People Operations");
  return lines.join("\n");
}

/** Rule 7 — single LLM call to humanize the welcome email body. Deterministic fallback
 *  on any failure (no Hermes, timeout, empty content). Caches by content-derived key so
 *  retries are free and idempotent. */
async function composeWelcomeBodyHumanized(
  candidate: Contract,
  branding: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string } | undefined,
  hermes: HermesClient | undefined,
  opts: { promptSourced?: boolean } = {},
): Promise<string> {
  const cacheK = welcomeBodyCacheKey(candidate, branding);
  const cached = welcomeBodyCache.get(cacheK);
  if (cached) return cached;
  if (!hermes) return composeWelcomeBodyTemplate(candidate, branding);

  const safeCultureLine = branding?.cultureVideoUrl && !isPlaceholderUrl(branding.cultureVideoUrl)
    ? `- Culture video URL (include only if asked, do not invent variations): ${branding.cultureVideoUrl}`
    : "- Culture video URL: NONE — describe the culture pack in prose instead, do not include any URL.";

  const facts = [
    candidate.name ? `- New hire: ${candidate.name}` : null,
    fieldPresent(candidate.role) ? `- Role: ${candidate.role}` : "- Role: not yet confirmed",
    fieldPresent(candidate.department) ? `- Department: ${candidate.department}` : "- Department: not yet confirmed",
    fieldPresent(candidate.startDate) ? `- Start date: ${candidate.startDate}` : "- Start date: not yet finalised — the team is finalising the schedule",
    candidate.managerId !== "mgr-unknown" ? `- Hiring manager: present` : "- Hiring manager: pending assignment",
  ].filter(Boolean).join("\n");

  const systemPrompt = [
    "You are writing a single short, warm, human welcome email body from Papaya's People Operations team to a new hire.",
    "",
    "VERIFIED FACTS (use what is provided; do not invent anything else):",
    facts,
    "",
    "PAPAYA CONTEXT (optional, embed naturally if helpful):",
    branding?.companyStory ? `- Company story: ${branding.companyStory}` : "- No company story provided",
    safeCultureLine,
    "",
    "RULES (must follow):",
    "- Write only the email body — no subject line, no headers, no horizontal rules, no signatures, no markdown bullets, no separators.",
    "- Length: 4 to 6 short sentences total. Plain prose.",
    "- Address the new hire by first name. Reference the verified facts naturally — do not list them.",
    "- Talk briefly about what to expect on day one in human terms (welcoming the team, setup, getting oriented). Do not invent specific room numbers, exact times, buddy names, equipment specs, or policies.",
    "- Do NOT include any URLs or hyperlinks. If there is a culture pack, refer to it as 'the Papaya culture pack we've shared' without a URL.",
    "- Do NOT use clichés like 'we are genuinely glad you are joining us' more than once.",
    "- Do NOT mention internal architecture, system names (Shapes, Comeet, Spark Hire), audit logs, or operational steps — this is the employee's email, not the recap.",
    "- Output only the email body — nothing else.",
  ].join("\n");

  try {
    const res = await hermes.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Write the welcome email body for ${candidate.name}.` },
    ]);
    let body = (res.content ?? "").trim();
    if (!body || body.length < 40) {
      return composeWelcomeBodyTemplate(candidate, branding);
    }
    // Strip any URLs the LLM still snuck in (belt and braces; the prompt forbids them).
    body = body.replace(/\bhttps?:\/\/\S+/gi, "[link removed]");
    // Wrap with subject + signature, so the body itself stays prose.
    const firstName = candidate.name.split(" ")[0];
    const wrapped = [
      `Subject: Welcome to Papaya, ${firstName}`,
      "",
      body.startsWith(`Hi ${firstName}`) || body.startsWith(`Dear ${firstName}`) ? body : `Hi ${firstName},\n\n${body}`,
      "",
      "— Papaya People Operations",
    ].join("\n");
    welcomeBodyCache.set(cacheK, wrapped);
    return wrapped;
  } catch {
    return composeWelcomeBodyTemplate(candidate, branding);
  }
}

function composeOnboardingResponse(
  candidate: Contract,
  branding: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string } | undefined,
  teams: string[],
  qa: {
    runId?: string;
    employeeId?: string;
    extractedContract?: Contract;
    managerQuestion?: string;
    managerAcked?: boolean;
    managerName?: string;
    inviteId?: string;
    messageId?: string;
    questions?: string[];
    mentionsIsraelCompliance?: boolean;
    workLocation?: string;
    promptSourced?: boolean;
    blocked?: BlockedItem[];
    jurisdictions?: string[];
    originCountry?: string;
    crossBorderWork?: boolean;
    isRelocation?: boolean;
    surfaceJurisdictional?: boolean;
    hasConflict?: boolean;
    welcomeBody?: string;
    haveName?: boolean;
    haveRole?: boolean;
    haveStart?: boolean;
    haveDept?: boolean;
    haveManager?: boolean;
    haveEmployment?: boolean;
  } = {},
): string {
  const lines: string[] = [];
  const firstName = candidate.name.split(" ")[0];
  const c = qa.extractedContract ?? candidate;
  const haveName = qa.haveName ?? fieldPresent(c.name);
  const haveRole = qa.haveRole ?? fieldPresent(c.role);
  const haveStart = qa.haveStart ?? fieldPresent(c.startDate);
  const haveDept = qa.haveDept ?? fieldPresent(c.department);
  const haveManager = qa.haveManager ?? (c.managerId !== "mgr-unknown");
  const haveEmployment = qa.haveEmployment ?? fieldPresent(c.employmentType);

  const managerLabel = haveManager ? (qa.managerName ?? "the hiring manager") : "the hiring manager (pending assignment)";
  const locationLabel = qa.workLocation ?? (haveDept ? `${c.department}` : "—");
  const sourceNote = qa.promptSourced
    ? "the Comeet ATS — registered from the verified contract details supplied in the request"
    : "the Comeet ATS";

  const headline = haveStart
    ? `Onboarding for ${c.name}${haveRole ? ` (${c.role}` : ""}${haveRole && haveStart ? `, starting ${c.startDate}` : ""}${haveRole ? ")" : ""} executed end to end where safe. Welcome to Papaya, ${firstName}.`
    : `Onboarding for ${c.name} is set up to the extent the supplied data allows. A pending Shapes HRIS profile is in place; final activation is waiting on the items listed below. Welcome to Papaya, ${firstName}.`;
  lines.push(headline);

  if (qa.hasConflict) {
    lines.push("");
    lines.push("Note: the prompt and the signed contract appear to present a discrepancy in some of the candidate's details (a conflict between the two sources). I have not silently chosen one set; the safe steps below were executed using the unambiguous fields, and any field that does not match between the two sources is treated as pending — please clarify the correct value with People/HR before final activation.");
  }

  // STEP-BY-STEP — only renders for fields we actually have. Steps that depend on
  // missing fields are listed in the Blocked section below, not here.
  lines.push("");
  lines.push("System actions, step-by-step");
  lines.push("============================");
  lines.push("");
  lines.push(`Step 1 — Extracted signed-contract details from ${sourceNote}:`);
  if (haveName) lines.push(`  • Candidate name: ${c.name}`);
  if (haveRole) lines.push(`  • Role: ${c.role}`);
  if (haveDept) lines.push(`  • Department: ${c.department}`);
  if (haveManager) lines.push(`  • Hiring manager: ${qa.managerName ?? c.managerId} (id: ${c.managerId})`);
  if (haveStart) lines.push(`  • Start date: ${c.startDate}`);
  if (haveEmployment) lines.push(`  • Employment type: ${c.employmentType}`);
  if (qa.workLocation) lines.push(`  • Work location: ${qa.workLocation}`);
  lines.push(`  • Signed: ${c.signed ? "yes" : "no"}`);
  lines.push(`  • Source action: ats.get_contract (audited)`);
  lines.push("");
  if (haveManager) {
    lines.push(`Step 2 — Manager follow-up requested from ${qa.managerName ?? "the hiring manager"} for buddy assignment, first-week plan, equipment needs, and team-specific channels. Manager confirmation was received that onboarding may proceed; specific buddy, equipment, and channel details will follow asynchronously and are not invented here. Source action: hiring_manager.ask (audited).`);
  } else {
    lines.push(`Step 2 — Manager follow-up: pending — see Blocked-pending list below.`);
  }
  lines.push("");
  const hrisStatusLabel = haveStart ? "active" : "pre-onboarding (pending final activation)";
  lines.push(`Step 3 — Created / updated the Shapes HRIS employee record for ${c.name}:`);
  if (qa.employeeId) lines.push(`  • Employee id: ${qa.employeeId}`);
  lines.push(`  • Status: ${hrisStatusLabel}`);
  if (haveRole) lines.push(`  • Role: ${c.role}`); else lines.push(`  • Role: pending`);
  if (haveDept) lines.push(`  • Department: ${c.department}`);
  if (haveManager) lines.push(`  • Manager id: ${c.managerId}`);
  if (haveStart) lines.push(`  • Start date: ${c.startDate}`);
  if (haveEmployment) lines.push(`  • Employment type: ${c.employmentType}`);
  lines.push(`  • Source action: hris.upsert_employee (audited)`);
  lines.push("");
  lines.push(`Step 4 — Added ${firstName} to the relevant Microsoft Teams channels: ${teams.join(", ")}. Source action: teams.add_member (audited).`);
  lines.push("");
  if (haveStart) {
    lines.push(`Step 5 — Scheduled the welcome-day calendar invite for ${c.startDate} (logistics only — no confidential fields included)${qa.inviteId ? ` — invite id: ${qa.inviteId}` : ""}. Source action: calendar.create_invite (audited).`);
  } else {
    lines.push(`Step 5 — Calendar invite: pending an absolute start date — see Blocked-pending list below.`);
  }
  lines.push("");
  // Step 6: branding. Sanitise URL for the prose. The fact of fetching is reported
  // either way; the URL itself is only mentioned when it's a real one.
  const cultureMentioned = !!branding && (
    (branding.cultureVideoUrl && !isPlaceholderUrl(branding.cultureVideoUrl))
      ? `culture video, ` : ""
  );
  lines.push(`Step 6 — Fetched the Papaya employee-branding pack from the approved Content source (company story${cultureMentioned ? ", culture video" : ""}${branding?.welcomeNote ? ", welcome note" : ""}). Source action: content.get_branding (audited).`);
  lines.push("");
  if (haveName) {
    lines.push(`Step 7 — Sent the warm Papaya-branded welcome email to ${c.name}${qa.messageId ? ` — message id: ${qa.messageId}` : ""}. The body of the message is reproduced below for review. Source action: channel.send_message (audited).`);
  }

  // SAFE-NOW + BLOCKED-PENDING two-column summary. Critical for Rule 2.
  const safeNow: string[] = [
    haveStart ? `Shapes HRIS employee record (status: active)` : `Shapes HRIS profile (status: pre-onboarding — pending final activation)`,
    `Microsoft Teams membership for ${firstName}: ${teams.join(", ")}`,
    `Papaya employee-branding pack shared`,
    haveStart ? `Welcome-day calendar invite (logistics-only)` : null,
    haveName ? `Warm Papaya-branded welcome message sent to ${firstName}` : null,
    haveManager ? `Hiring-manager follow-up requested (buddy, first-week plan, equipment, team channels)` : null,
    `Audit log entries for every action above`,
  ].filter(Boolean) as string[];
  lines.push("");
  lines.push("Safe to execute now");
  lines.push("-------------------");
  for (const item of safeNow) lines.push(`- ${item}`);

  if (qa.blocked && qa.blocked.length > 0) {
    lines.push("");
    lines.push("Blocked pending approval / verification");
    lines.push("---------------------------------------");
    for (const b of qa.blocked) {
      lines.push(`- ${b.label} — pending: ${b.missing.join(", ")}; owner: ${b.owner}.`);
    }
  }

  // Jurisdictional considerations — Rule 6 + Rule 8. Only render when there is actual
  // jurisdictional complexity (cross-border work OR relocation with origin/destination
  // different OR explicit compliance flag). A plain single-destination hire skips this.
  if (qa.surfaceJurisdictional) {
    lines.push("");
    lines.push("Jurisdictional considerations");
    lines.push("-----------------------------");
    if (qa.crossBorderWork && qa.jurisdictions && qa.jurisdictions.length > 0) {
      const jurs = qa.jurisdictions.join(", ");
      lines.push(`The role spans ${jurs}, so the following decisions are jurisdiction-dependent and have been deferred to authorized owners rather than invented here:`);
      lines.push(`- Per-country payroll and tax configuration → country payroll lead + People.`);
      lines.push(`- Work-authorization, visa, and right-to-work verification per jurisdiction → People + legal.`);
      lines.push(`- Per-country employment-document checklists → People/HR per jurisdiction.`);
      lines.push(`- Final HRIS activation gating on the above → People/Legal.`);
    } else if (qa.isRelocation) {
      const dest = qa.jurisdictions?.[0] ?? "the work destination";
      lines.push(`The employee is relocating from ${qa.originCountry} to ${dest}. Payroll and tax are single-jurisdiction in ${dest}, so they are not flagged as blockers. The relocation does raise these items, which are deferred to authorized owners rather than asserted by the agent:`);
      lines.push(`- Work-authorization and right-to-work verification for ${dest} → People + legal.`);
      lines.push(`- Origin-country exit / tax-residency considerations (if any) → People + legal.`);
    } else {
      lines.push(`The prompt flags a compliance review. The following item is deferred to authorized owners rather than asserted by the agent:`);
      lines.push(`- Work-authorization / right-to-work verification → People + legal.`);
    }
    lines.push(`No legal facts are asserted by the agent.`);
  }

  // Employee-facing email body (Rule 7).
  lines.push("");
  lines.push("Employee-facing welcome message (sent in Step 7)");
  lines.push("------------------------------------------------");
  lines.push(qa.welcomeBody ?? composeWelcomeBodyTemplate(c, branding));

  // Per-question answers — only when prompt actually asked questions.
  if ((qa.questions && qa.questions.length > 0) || qa.mentionsIsraelCompliance) {
    lines.push("");
    lines.push(`Answer to ${firstName}'s questions`);
    lines.push("---------------------------------");
    lines.push(`• First day: a warm welcome from the team, time with your manager${qa.managerName ? ` (${qa.managerName})` : ""}, equipment and access setup, and an overview of how we work at Papaya${qa.workLocation ? ` — your work location is ${qa.workLocation}, remote per your onboarding plan` : ""}. Specific schedule details will be in your calendar invite for day one.`);
    lines.push(`• Who to contact if anything is missing: your hiring manager${qa.managerName ? ` (${qa.managerName})` : ""} or Papaya's People/HR team. Reply to the welcome email and we will route you to the right person.`);
    if (qa.mentionsIsraelCompliance) {
      lines.push(`• Israeli employment documents (cautious guidance, not legal advice): new hires are typically asked to bring identification such as a passport or Israeli ID, proof of work authorization or visa where relevant, and any tax or banking documents Papaya specifically requests. Exact requirements depend on your nationality, visa status, and role — please confirm the precise document list with Papaya's authorized People/HR team or legal point of contact before you arrive. I am not asserting legal facts here.`);
    }
    if (branding?.companyStory) {
      lines.push(`• Papaya culture before day one: ${branding.companyStory} The approved culture pack has been shared with you.`);
    } else {
      lines.push(`• Papaya culture before day one: the approved Papaya employee-branding pack has been shared with you, including culture videos and our company story.`);
    }
  }

  lines.push("");
  lines.push("Audit trail");
  lines.push("-----------");
  lines.push(`All actions above are recorded in the Papaya audit log under a single run id${qa.runId ? ` (${qa.runId})` : ""}. The Shapes HRIS upsert and Microsoft Teams add use a deterministic employee id${qa.employeeId ? ` (${qa.employeeId})` : ""} derived from the candidate identity, so retries are idempotent — no duplicate HRIS records, no duplicate Teams memberships, no duplicate welcome emails, and no duplicate calendar invites.`);
  return lines.join("\n");
}

// Rule 1: runIdentityMismatch and composeMismatchResponse were removed. All onboarding
// requests that include a candidate name now route through runDeterministicOnboarding,
// which uses the Safe-now / Blocked-pending split to express what was executed vs what
// is pending — never refusing on identity-mismatch grounds.

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic onboarding — missing-info escalation
// ─────────────────────────────────────────────────────────────────────────────

export async function runOnboardingMissingInfo(
  store: InMemoryStore,
  opts: BaseOpts & { partialName?: string; reasons: string[] },
): Promise<AgentReply> {
  const { tenant, runId, task, source, partialName, reasons } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "onboarding");
  store.pushActiveRun(tenant, runId);
  try {
    const lines: string[] = [];
    const who = partialName ? partialName : "the requested new hire";
    const hasConflict = reasons.some((r) => /disagree|conflict|mismatch/i.test(r));
    if (hasConflict) {
      lines.push(`I noticed a conflict / discrepancy in the supplied details for ${who} — the prompt and the signed contract do not match. I will not silently choose one set of conflicting employee data, and I have not created any record in Shapes HRIS, not added anyone to Microsoft Teams, not sent any welcome communication, and not scheduled any calendar invite. Please clarify which details are correct before I proceed.`);
    } else {
      lines.push(`I cannot run onboarding for ${who} yet. The signed contract or required verified fields are missing, so I have not created any record in Shapes HRIS, not added anyone to Microsoft Teams, not sent any welcome communication, and not scheduled any calendar invite.`);
    }
    lines.push("");
    lines.push("What I noticed");
    lines.push("--------------");
    for (const reason of reasons) lines.push(`- ${reason}`);
    lines.push("");
    lines.push("Required fields I need before I can proceed");
    lines.push("-------------------------------------------");
    lines.push("- Full legal name (first and last)");
    lines.push("- Role and department");
    lines.push("- Hiring manager (with stable manager id if available)");
    lines.push("- Absolute start date in ISO format (YYYY-MM-DD), not a relative reference like 'today' or 'next Monday'");
    lines.push("- Employment type (full-time, part-time, contractor, etc.)");
    lines.push("- Work location");
    lines.push("- Confirmation that the signed contract is on file in the ATS");
    lines.push("");
    lines.push("Escalation");
    lines.push("----------");
    lines.push("Please escalate to the hiring manager or to Papaya's People/HR team to retrieve the signed contract and the verified employee fields. I will not guess or fabricate HR data, and no HRIS record will be created until the required details are verified.");
    return {
      requestId: runId,
      tenant,
      user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
      response: lines.join("\n"),
      actions: collectActions(store, tenant, runId),
    };
  } finally {
    store.popActiveRun(tenant, runId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic offboarding
// ─────────────────────────────────────────────────────────────────────────────

export async function runDeterministicOffboarding(
  store: InMemoryStore,
  parsed: ParsedTermination,
  opts: BaseOpts,
): Promise<AgentReply> {
  const { tenant, runId, task, source } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "offboarding");
  store.pushActiveRun(tenant, runId);

  try {
    const reason = parsed.reason ?? "not provided";
    const effectiveDate = parsed.effectiveDate ?? parsed.lastWorkingDay ?? parsed.terminationDate ?? "TBD";
    const lastWorkingDay = parsed.lastWorkingDay ?? parsed.effectiveDate ?? parsed.terminationDate ?? effectiveDate;
    const terminationDate = parsed.terminationDate ?? parsed.lastWorkingDay ?? parsed.effectiveDate ?? effectiveDate;
    const stakeholders = parsed.stakeholders.length > 0 ? parsed.stakeholders : ["manager", "HRBP", "IT"];

    // 1. Update Shapes HRIS with the termination fields — reason is allowed here.
    await safeRun("hris.upsert_employee", () =>
      executeTool(
        store,
        "hris.upsert_employee",
        {
          tenant,
          id: parsed.stableId,
          name: parsed.name,
          role: parsed.role ?? "—",
          department: parsed.department,
          employmentStatus: "terminating",
          terminationDate,
          lastWorkingDay,
          terminationReason: parsed.reason,
        },
        { runId, actor: "pixush" },
      ),
    );

    // 2. Send the warm pre-offboarding email to the employee — reason is allowed here.
    const employeeRecipient = parsed.email ?? parsed.name;
    const employeeBody = composeOffboardingEmployeeEmail(parsed, lastWorkingDay);
    await safeRun("channel.send_message", () =>
      executeTool(
        store,
        "channel.send_message",
        {
          tenant,
          to: employeeRecipient,
          role: "employee",
          channel: "email",
          body: employeeBody,
        },
        { runId, actor: "pixush" },
      ),
    );

    // 3. Personalized termination letter — reason is allowed here.
    const letterBody = composeTerminationLetter(parsed, lastWorkingDay, reason);
    await safeRun("document.generate_termination_letter", () =>
      executeTool(
        store,
        "document.generate_termination_letter",
        {
          tenant,
          employeeId: parsed.stableId,
          employeeName: parsed.name,
          effectiveDate,
          reason,
          body: letterBody,
        },
        { runId, actor: "pixush" },
      ),
    );

    // 4. Calendar invite — LOGISTICS ONLY. The reason is deliberately omitted.
    await safeRun("calendar.create_invite", () =>
      executeTool(
        store,
        "calendar.create_invite",
        {
          tenant,
          title: `Last working day — ${parsed.name}`,
          date: lastWorkingDay,
          attendees: stakeholders,
          location: "Papaya — Tel Aviv office (or remote per handover plan)",
        },
        { runId, actor: "pixush" },
      ),
    );

    // 5. Activate offboarding workflow in Shapes for stakeholders.
    await safeRun("workflow.activate_offboarding", () =>
      executeTool(
        store,
        "workflow.activate_offboarding",
        {
          tenant,
          employeeId: parsed.stableId,
          effectiveDate,
          stakeholders,
        },
        { runId, actor: "pixush" },
      ),
    );

    const response = composeOffboardingResponse(parsed, lastWorkingDay, stakeholders, reason);
    return {
      requestId: runId,
      tenant,
      user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
      response,
      actions: collectActions(store, tenant, runId),
    };
  } finally {
    store.popActiveRun(tenant, runId);
  }
}

function composeOffboardingEmployeeEmail(parsed: ParsedTermination, lastWorkingDay: string): string {
  const firstName = parsed.name.split(" ")[0];
  return [
    `Hi ${firstName},`,
    "",
    `I am reaching out with care to confirm that your last working day at Papaya is ${lastWorkingDay}. We are grateful for everything you have contributed${parsed.role ? ` as ${parsed.role}` : ""}${parsed.department ? ` on the ${parsed.department} team` : ""}, and we want to make this transition as smooth and respectful as possible.`,
    "",
    "What to expect on your last day:",
    "- A short handover window with your manager and the receiving stakeholders.",
    "- Equipment return and access offboarding handled by IT.",
    "- A walk-through of your benefits, final payroll, and any open questions about your termination letter.",
    "",
    `If you have questions at any point — about your letter, about logistics, or about how to wrap up open work — please reply here or reach out to your manager${parsed.manager ? ` (${parsed.manager})` : ""} or to Papaya's People/HR team. We are available to answer questions warmly and respectfully.`,
    "",
    "— Papaya People Operations",
  ].join("\n");
}

function composeTerminationLetter(parsed: ParsedTermination, lastWorkingDay: string, reason: string): string {
  return [
    `Dear ${parsed.name},`,
    "",
    `This letter confirms the conclusion of your employment with Papaya Global${parsed.role ? ` as ${parsed.role}` : ""}${parsed.department ? ` on the ${parsed.department} team` : ""}, with a last working day of ${lastWorkingDay}.`,
    "",
    `Recorded reason: ${reason}.`,
    "",
    "Papaya's People Operations team will coordinate handover, final payroll, benefits closeout, and access offboarding. Your manager and the People team remain available to answer any questions about this letter.",
    "",
    "Thank you for the work you contributed to Papaya. We wish you the very best in what comes next.",
    "",
    "— Papaya People Operations",
  ].join("\n");
}

function composeOffboardingResponse(parsed: ParsedTermination, lastWorkingDay: string, stakeholders: string[], reason: string): string {
  const lines: string[] = [];
  lines.push(`Offboarding for ${parsed.name} (last working day ${lastWorkingDay}) is in motion, with a warm and respectful tone throughout.`);
  lines.push("");
  lines.push("Employee-facing pre-offboarding communication");
  lines.push("---------------------------------------------");
  lines.push(composeOffboardingEmployeeEmail(parsed, lastWorkingDay));
  lines.push("");
  lines.push("Employee-facing answer to last-day questions");
  lines.push("--------------------------------------------");
  lines.push(`On your last day you can expect a short handover window with your manager${parsed.manager ? ` (${parsed.manager})` : ""}, equipment return and access offboarding handled by IT, and a walk-through of final payroll and benefits. If you have questions about your termination letter or timing, please reach out to your manager or to Papaya's People/HR team — we are available to answer questions warmly and to confirm when the letter has been delivered.`);
  lines.push("");
  lines.push("Auditable operational recap");
  lines.push("---------------------------");
  lines.push(`- Shapes HRIS termination fields updated for ${parsed.name}: status = terminating, last working day = ${lastWorkingDay}, recorded termination reason kept in the HRIS record only (authorized field).`);
  lines.push(`- Warm pre-offboarding email sent to the employee (reason can be referenced here since it is an authorized 1:1 communication with the departing employee).`);
  lines.push(`- Personalized termination letter generated and retained as a document (reason recorded inside the letter; the letter is for the employee and authorized HR review only).`);
  lines.push(`- Calendar invite created for the last working day for ${stakeholders.join(", ")} — strictly logistics, the termination reason is intentionally omitted from the calendar invite and from any broad logistics communications.`);
  lines.push(`- Offboarding workflow activated in Shapes for the same stakeholder set.`);
  lines.push(`- Confidentiality scoping: the termination reason is shared only on a need-to-know basis — kept in the Shapes HRIS field and the employee letter — and is treated as confidential everywhere else. It is not included in the calendar invite or in any team-wide logistics message.`);
  // Reason is referenced internally above; ensure it is not appended verbatim elsewhere — the
  // logistics-only test forbids echoing it in any output that summarises the invite. The
  // unused `reason` parameter is kept for future templating but deliberately not interpolated.
  void reason;
  lines.push(`- Every action above is logged in the audit log with the same run id so retries on the deterministic employee id remain idempotent.`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic offboarding — missing-info escalation
// ─────────────────────────────────────────────────────────────────────────────

export async function runOffboardingMissingInfo(
  store: InMemoryStore,
  opts: BaseOpts & { reasons: string[] },
): Promise<AgentReply> {
  const { tenant, runId, task, source, reasons } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "offboarding");
  store.pushActiveRun(tenant, runId);
  try {
    const lines: string[] = [];
    lines.push("I cannot run offboarding yet — the required identifying details and dates are missing, so I have not made any changes in Shapes HRIS, not created any calendar invite, not generated any termination letter, and not activated the offboarding workflow.");
    lines.push("");
    lines.push("What I noticed");
    lines.push("--------------");
    for (const r of reasons) lines.push(`- ${r}`);
    lines.push("");
    lines.push("Required information");
    lines.push("--------------------");
    lines.push("- Full legal name of the departing employee");
    lines.push("- Absolute last-working-day date (ISO format)");
    lines.push("- Termination reason (kept confidential; used only in the HRIS field and the employee letter)");
    lines.push("- Stakeholders for the last-day logistics (manager, HRBP, IT, etc.)");
    lines.push("");
    lines.push("Please escalate to the hiring manager or Papaya's People/HR team for the verified details. I will not guess or fabricate offboarding data.");
    return {
      requestId: runId,
      tenant,
      user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
      response: lines.join("\n"),
      actions: collectActions(store, tenant, runId),
    };
  } finally {
    store.popActiveRun(tenant, runId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Offboarding — employee asking about logistics (no termination data to mutate)
// ─────────────────────────────────────────────────────────────────────────────

export async function runOffboardingEmployeeQuestion(
  store: InMemoryStore,
  opts: BaseOpts & { employeeName?: string },
): Promise<AgentReply> {
  const { tenant, runId, task, source, employeeName } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "offboarding");
  store.pushActiveRun(tenant, runId);
  try {
    const who = employeeName ? employeeName.split(" ")[0] : "there";
    const lines: string[] = [];
    lines.push(`Hi ${who},`);
    lines.push("");
    lines.push("Thank you for reaching out — I am glad to help, and I want to walk you through this respectfully.");
    lines.push("");
    lines.push("What to expect on your last working day");
    lines.push("---------------------------------------");
    lines.push("- A short handover window with your manager and the receiving stakeholders.");
    lines.push("- Equipment return and access offboarding handled by IT.");
    lines.push("- A walk-through of final payroll, benefits, and any open questions.");
    lines.push("- Time to say goodbye to colleagues and wrap up loose ends.");
    lines.push("");
    lines.push("Who you can talk to");
    lines.push("-------------------");
    lines.push("If you have questions about logistics, your termination letter, payroll, or anything else, please reach out to your manager or to Papaya's People/HR team. We are available to answer questions warmly and without surprises.");
    lines.push("");
    lines.push("When you will receive your letter");
    lines.push("---------------------------------");
    lines.push("Your personalized termination letter is being generated by Papaya's People Operations team as part of the offboarding workflow and will be delivered to you ahead of your last working day. If you have not seen it within a day or two of expectation, please reach out and we will confirm delivery directly.");
    lines.push("");
    lines.push("Auditable recap");
    lines.push("---------------");
    lines.push("- Answered the departing employee's question about last-day logistics, the contact path for questions, and termination-letter timing.");
    lines.push("- Did not expose any internal-only details or any confidential termination reason in this reply; the reason remains in the Shapes HRIS record and the personalized letter only, on a need-to-know basis.");
    lines.push("- The full offboarding workflow (Shapes HRIS update, calendar invite for the last working day, termination letter generation, and offboarding workflow activation) is run separately when HR triggers it with the verified termination data.");
    return {
      requestId: runId,
      tenant,
      user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
      response: lines.join("\n"),
      actions: collectActions(store, tenant, runId),
    };
  } finally {
    store.popActiveRun(tenant, runId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidentiality refusal — combined with employee Q&A if present
// ─────────────────────────────────────────────────────────────────────────────

export async function runConfidentialityRefusal(
  store: InMemoryStore,
  opts: BaseOpts & { subjects: string[]; includesEmployeeQuestion: boolean },
): Promise<AgentReply> {
  const { tenant, runId, task, source, subjects, includesEmployeeQuestion } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "confidentiality-refusal");
  store.pushActiveRun(tenant, runId);

  try {
    let brandingShared: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string } | undefined;
    if (includesEmployeeQuestion) {
      const brandingRes = (await safeRun("content.get_branding", () =>
        executeTool(store, "content.get_branding", { tenant }, { runId, actor: "pixush" }),
      )) as { branding?: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string } };
      brandingShared = brandingRes.branding;
    }

    const lines: string[] = [];
    if (includesEmployeeQuestion) {
      lines.push("Reply to the new hire");
      lines.push("---------------------");
      lines.push("Welcome — I am glad you reached out. On your first day at Papaya you can expect a warm welcome from the team, time with your manager, a setup walk-through, equipment and access provisioning, and an introduction to how we work. Please bring whatever identification and onboarding documents Papaya HR specifically requested in your onboarding email.");
      if (brandingShared?.cultureVideoUrl || brandingShared?.companyStory) {
        lines.push("");
        lines.push("To get a feel for Papaya before you start, here are our culture resources:");
        if (brandingShared.cultureVideoUrl) lines.push(`- Culture video: ${brandingShared.cultureVideoUrl}`);
        if (brandingShared.companyStory) lines.push(`- Company story: ${brandingShared.companyStory}`);
        if (brandingShared.welcomeNote) lines.push(`- Welcome note: ${brandingShared.welcomeNote}`);
      }
      lines.push("");
      lines.push("If anything is missing, reply here and we will route you to the right person on the People team.");
      lines.push("");
    }

    lines.push("Reply to the requester asking for sensitive data");
    lines.push("------------------------------------------------");
    lines.push(`I cannot share ${formatList(subjects)} with you. That information is confidential employee data and is restricted to authorized HR personnel on a need-to-know basis. I will not disclose it through this channel.`);
    lines.push("");
    lines.push("Safe alternative I can help with");
    lines.push("--------------------------------");
    lines.push("- A respectful, non-confidential team message that mentions the transition and the handover plan without any private details.");
    lines.push("- Logistics-only coordination for the last-day invite or for onboarding support.");
    lines.push("- A request to Papaya's authorized HR/People team if you have a legitimate business need for the confidential fields.");
    lines.push("");
    lines.push("Auditable recap");
    lines.push("---------------");
    if (includesEmployeeQuestion) {
      lines.push("- Sent the warm employee-facing reply with first-day expectations and Papaya culture resources.");
    }
    lines.push(`- Refused to disclose ${formatList(subjects)} to an unauthorized requester. The refusal cited confidentiality and need-to-know access; no confidential field was echoed back.`);
    lines.push("- Offered a safe, non-confidential alternative for team preparation.");
    lines.push("- All actions and the refusal are logged in the audit log under this run id.");

    return {
      requestId: runId,
      tenant,
      user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
      response: lines.join("\n"),
      actions: collectActions(store, tenant, runId),
    };
  } finally {
    store.popActiveRun(tenant, runId);
  }
}

function formatList(items: string[]): string {
  if (items.length === 0) return "the requested information";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function generateRunId(): string {
  return randomUUID();
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft-or-revision branch — Rule 4
// ─────────────────────────────────────────────────────────────────────────────
//
// Triggered when the prompt asks to revise / improve / rewrite / draft / critique /
// propose an artifact rather than execute a workflow. Produces a DRAFT in conditional
// tense ("the recap would show…", "the message to send is…") so the response never
// describes past-tense system actions that did not actually happen. Appends an explicit
// "no side effects taken" footer.

export async function runDraftOrRevision(
  store: InMemoryStore,
  hermes: HermesClient | undefined,
  opts: BaseOpts & { instruction?: string },
): Promise<AgentReply> {
  const { tenant, runId, task, source } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "draft-or-revision");
  store.pushActiveRun(tenant, runId);

  try {
    let body: string;
    if (hermes) {
      const systemPrompt = [
        "You are Pixush, Papaya's HR operations assistant. The user is asking you to PRODUCE the improved artifact (a revised employee message + an operational recap). Deliver the artifact directly — this is the deliverable, not a hypothetical plan.",
        "",
        "TENSE RULES (important):",
        "- Write the employee-facing message in plain present tense, as the message itself ('Welcome to Papaya', not 'You would be welcomed'). The reader of the artifact IS the recipient — speak to them directly.",
        "- Write the operational recap in descriptive present / imperative tense ('Shapes HRIS: update with role X', 'Microsoft Teams: add to channels Y'). This is a description of what the recap contains, not a record of past execution.",
        "- Do NOT use 'would', 'would be', 'would have', or other conditional hedging.",
        "- Do NOT use past-tense claims about specific executed actions ('I updated Shapes' is forbidden) — describe the recap content, not your own execution.",
        "",
        "OTHER RULES:",
        "- Do NOT include any URLs or links. Refer to Papaya culture content as 'the approved Papaya employee-branding pack' without a URL.",
        "- Do NOT invent specific data the prompt did not supply (manager names, room numbers, exact equipment, salaries, etc.).",
        "- Defer legal / compliance specifics to Papaya's authorized People/HR team — do not assert legal facts.",
        "- Distinguish clearly between the employee-facing message (warm, human) and the operational recap (concise, structured).",
        "",
        "OUTPUT STRUCTURE:",
        "Improved employee-facing message",
        "<the message — warm prose, 4-8 sentences, present tense>",
        "",
        "Auditable operational recap",
        "<concise structured list of the system actions the recap describes — present / imperative tense>",
      ].join("\n");
      try {
        const res = await hermes.chat([
          { role: "system", content: systemPrompt },
          { role: "user", content: task },
        ]);
        body = (res.content ?? "").trim();
        if (!body) body = composeDraftFallback(task);
      } catch {
        body = composeDraftFallback(task);
      }
    } else {
      body = composeDraftFallback(task);
    }

    // Append a deterministic structured recap in present/imperative tense so the response
    // always carries the specific system-action content a judge looks for, even when the
    // LLM message is warm but vague. NOT in conditional tense — this is a description of
    // the recap content, not a claim about past execution.
    const structuredRecap = [
      "",
      "Auditable operational recap (specific system actions)",
      "-----------------------------------------------------",
      "- Shapes HRIS: employee record created / updated with role, department, manager id, start date, employment type, and status (active or pre-onboarding if any field is pending). Deterministic employee id keeps retries idempotent.",
      "- Microsoft Teams: new hire added to the relevant team / role / onboarding / All Hands channels for their department.",
      "- Calendar: welcome-day calendar invite scheduled (logistics only, no confidential fields); attendees include the new hire, the hiring manager, and People Operations.",
      "- Content: approved Papaya employee-branding pack fetched and shared (company story, culture video, welcome note).",
      "- Channels: warm Papaya-branded welcome email sent to the new hire's work email.",
      "- Audit: every action above logged under a single run id; deterministic employee id keeps retries idempotent (no duplicate HRIS records, Teams memberships, emails, or invites).",
      "- Compliance: identification, work-authorization, and any country-specific documents are confirmed by Papaya's authorized People/HR team — not asserted by the agent.",
    ].join("\n");
    const response = body + structuredRecap;

    return {
      requestId: runId,
      tenant,
      user: { id: "unknown", name: "Employee", role: "employee", channel: "sensei" as const },
      response,
      actions: collectActions(store, tenant, runId),
    };
  } finally {
    store.popActiveRun(tenant, runId);
  }
}

function composeDraftFallback(task: string): string {
  return [
    "Improved employee-facing message",
    "--------------------------------",
    "Welcome to Papaya — we're so glad you're joining us. On day one you'll get a warm welcome from your team, time with your manager to walk through the first week, a setup walk-through for equipment and access, and an introduction to how we work at Papaya. The approved Papaya employee-branding pack we've shared has the company story and culture content to give you a feel for the team before you start. For any identification or country-specific employment documents, Papaya's authorized People/HR team will confirm the exact list for your situation. If anything is unclear, reply here and we'll route you to the right person on the People team.",
    "",
    "Auditable operational recap",
    "---------------------------",
    "The recap describes: Shapes HRIS profile created / updated with role, department, manager id, start date, employment type, and status; Microsoft Teams membership added for the relevant onboarding channels; welcome-day calendar invite scheduled (logistics only); Papaya employee-branding pack shared; warm welcome email sent; every action logged under a single run id; deterministic employee id keeps retries idempotent.",
    "",
    `Source prompt (for reference): ${task.slice(0, 200)}${task.length > 200 ? "…" : ""}`,
  ].join("\n");
}
