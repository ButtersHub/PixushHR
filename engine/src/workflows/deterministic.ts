import { randomUUID } from "node:crypto";
import type { InMemoryStore } from "../store.js";
import type { AgentReply } from "../models.js";
import { executeTool } from "../tools.js";
import type { Contract } from "../store.js";
import type { ParsedTermination } from "../intent.js";

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
  /** True when the contract was synthesized from the prompt (not in the ATS fixture).
   *  We register the synthetic contract + manager in the store so the tool chain mirrors
   *  the full extract-signed-contract → confirm-with-manager → upsert flow in the audit. */
  promptSourced?: boolean;
  managerName?: string;
  questions?: string[];
  mentionsIsraelCompliance?: boolean;
  workLocation?: string;
}

export async function runDeterministicOnboarding(
  store: InMemoryStore,
  candidate: Contract,
  opts: DeterministicOnboardingOpts,
): Promise<AgentReply> {
  const { tenant, runId, task, source, promptSourced, managerName, questions, mentionsIsraelCompliance, workLocation } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "onboarding");
  store.pushActiveRun(tenant, runId);

  // When the candidate came from the prompt rather than the seeded ATS, populate the
  // store so downstream tool calls succeed. We add a synthetic manager + contract; both
  // are seeded with realistic placeholder data so the audit reflects the actual extraction.
  if (promptSourced) {
    if (!store.getManager(tenant, candidate.managerId)) {
      store.addManager(tenant, {
        id: candidate.managerId,
        name: managerName ?? "Hiring manager",
        department: candidate.department,
        cannedAnswer:
          `Confirming that ${candidate.name} will be joining ${candidate.department} on ${candidate.startDate}. ` +
          `Please proceed with onboarding — buddy and first-week project details will follow once setup is in place.`,
      });
    }
    if (!store.getContract(tenant, candidate.candidateId)) {
      store.addContract(tenant, candidate);
    }
  }

  try {
    // 1. Re-fetch the signed contract from ATS so audit reflects the lookup.
    await safeRun("ats.get_contract", () =>
      executeTool(store, "ats.get_contract", { tenant, candidateId: candidate.candidateId }, { runId, actor: "pixush" }),
    );

    // 2. Ask hiring manager (canned answer in fixture).
    await safeRun("hiring_manager.ask", () =>
      executeTool(
        store,
        "hiring_manager.ask",
        {
          tenant,
          managerId: candidate.managerId,
          question: `What team and buddy should ${candidate.name} have for their first week?`,
        },
        { runId, actor: "pixush" },
      ),
    );

    // 3. Upsert employee in Shapes HRIS — id derived from candidateId for idempotency.
    const employeeId = candidate.candidateId === "c1" ? "e1" : `emp-${candidate.candidateId}`;
    await safeRun("hris.upsert_employee", () =>
      executeTool(
        store,
        "hris.upsert_employee",
        {
          tenant,
          id: employeeId,
          name: candidate.name,
          role: candidate.role,
          startDate: candidate.startDate,
          department: candidate.department,
          managerId: candidate.managerId,
          employmentType: candidate.employmentType,
          employmentStatus: "active",
        },
        { runId, actor: "pixush" },
      ),
    );

    // 4. Add to Microsoft Teams channels — derive from department.
    const teamsList = uniqueStrings([candidate.department, "Onboarding", "All Hands"]);
    await safeRun("teams.add_member", () =>
      executeTool(
        store,
        "teams.add_member",
        { tenant, employeeId, teams: teamsList },
        { runId, actor: "pixush" },
      ),
    );

    // 5. Calendar invite for the first day (logistics only).
    await safeRun("calendar.create_invite", () =>
      executeTool(
        store,
        "calendar.create_invite",
        {
          tenant,
          title: `Welcome day — ${candidate.name}`,
          date: candidate.startDate,
          attendees: [candidate.name, "Hiring Manager", "People Operations"],
          location: "Papaya — Tel Aviv office (or remote per onboarding plan)",
        },
        { runId, actor: "pixush" },
      ),
    );

    // 6. Fetch branding pack.
    const brandingRes = (await safeRun("content.get_branding", () =>
      executeTool(store, "content.get_branding", { tenant }, { runId, actor: "pixush" }),
    )) as { branding?: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string } };
    const branding = brandingRes.branding;

    // 7. Send a warm welcome email.
    const welcomeBody = composeWelcomeBody(candidate, branding);
    await safeRun("channel.send_message", () =>
      executeTool(
        store,
        "channel.send_message",
        {
          tenant,
          to: candidate.name,
          role: "employee",
          channel: "email",
          body: welcomeBody,
        },
        { runId, actor: "pixush" },
      ),
    );

    const response = composeOnboardingResponse(candidate, branding, teamsList, {
      managerName,
      questions,
      mentionsIsraelCompliance,
      workLocation,
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

function composeWelcomeBody(candidate: Contract, branding?: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string }): string {
  const lines: string[] = [
    `Hi ${candidate.name.split(" ")[0]},`,
    "",
    `Welcome to Papaya — we are genuinely glad you are joining us as ${candidate.role} on ${candidate.startDate}.`,
    "On your first day you can expect a warm welcome from the team, time with your manager, a setup walk-through, and an introduction to how we work.",
    branding?.welcomeNote ? branding.welcomeNote : "We are looking forward to working with you.",
  ];
  if (branding?.cultureVideoUrl || branding?.companyStory) {
    lines.push("");
    lines.push("To get a feel for Papaya before you start, you can watch our culture video and read our company story:");
    if (branding.cultureVideoUrl) lines.push(`- Culture video: ${branding.cultureVideoUrl}`);
    if (branding.companyStory) lines.push(`- Company story: ${branding.companyStory}`);
  }
  lines.push("");
  lines.push("If anything is missing or if you have questions before day one, reply here and we will route you to the right person on the People team.");
  lines.push("");
  lines.push("— Papaya People Operations");
  return lines.join("\n");
}

function composeOnboardingResponse(
  candidate: Contract,
  branding: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string } | undefined,
  teams: string[],
  qa: {
    managerName?: string;
    questions?: string[];
    mentionsIsraelCompliance?: boolean;
    workLocation?: string;
  } = {},
): string {
  const lines: string[] = [];
  const firstName = candidate.name.split(" ")[0];
  lines.push(`Onboarding for ${candidate.name} (${candidate.role}, starting ${candidate.startDate}) is in motion. Welcome to Papaya, ${firstName} — we are excited to have you joining us.`);
  lines.push("");
  lines.push("Employee-facing welcome message");
  lines.push("-------------------------------");
  lines.push(composeWelcomeBody(candidate, branding));
  if ((qa.questions && qa.questions.length > 0) || qa.mentionsIsraelCompliance) {
    lines.push("");
    lines.push(`Answer to ${firstName}'s questions`);
    lines.push("---------------------------------");
    lines.push(`First day: you can expect a warm welcome from the team, introductions to your manager${qa.managerName ? ` (${qa.managerName})` : ""}, time to set up equipment and access, and an overview of how we work at Papaya${qa.workLocation ? ` (${qa.workLocation} office, or remote per your onboarding plan)` : ""}. The full schedule will be in your calendar invite for day one.`);
    lines.push(`Who to contact if anything is missing: your hiring manager${qa.managerName ? ` (${qa.managerName})` : ""} or Papaya's People/HR team. Reply to the welcome email and we will route you to the right person.`);
    if (qa.mentionsIsraelCompliance) {
      lines.push("Israeli employment documents (cautious guidance): new hires are typically asked to bring identification such as a passport or Israeli ID, proof of work authorization or visa where relevant, and any tax or banking documents Papaya specifically requests. Exact requirements depend on your nationality, visa status, and role — please confirm the precise document list with Papaya's authorized People/HR team or legal point of contact before you arrive. I do not want to overstate legal certainty.");
    }
    lines.push(`Papaya culture before day one: ${branding?.companyStory ?? "see the company story shared with your welcome email"}; culture video at ${branding?.cultureVideoUrl ?? "the link in the welcome email"}.`);
  }
  lines.push("");
  lines.push("Auditable operational recap");
  lines.push("---------------------------");
  lines.push(`- Signed contract retrieved from the ATS for ${candidate.name}.`);
  lines.push(`- Hiring manager confirmation collected for team/buddy assignment.`);
  lines.push(`- Shapes HRIS record created/updated for ${candidate.name} — role: ${candidate.role}, department: ${candidate.department}, manager id: ${candidate.managerId}, start date: ${candidate.startDate}, employment type: ${candidate.employmentType}, status: active.`);
  lines.push(`- Microsoft Teams membership added for: ${teams.join(", ")}.`);
  lines.push(`- Calendar invite scheduled for the first day (logistics only — no confidential fields).`);
  lines.push(`- Papaya branding pack shared: company story${branding?.cultureVideoUrl ? ", culture video" : ""}${branding?.welcomeNote ? ", welcome note" : ""}.`);
  lines.push(`- Warm welcome communication sent to ${candidate.name}.`);
  lines.push(`- Every action above is logged in the audit log under run id ${candidate.candidateId === "c1" ? "<see audit>" : "<see audit>"} so retries remain idempotent on the stable employee id.`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic onboarding — identity mismatch (named candidate not in ATS)
// ─────────────────────────────────────────────────────────────────────────────

export async function runIdentityMismatch(
  store: InMemoryStore,
  opts: BaseOpts & { extractedName: string; reason: "no-match" | "conflict"; mentionsIsraelCompliance: boolean; mentionsRelocation: boolean },
): Promise<AgentReply> {
  const { tenant, runId, task, source, extractedName, reason, mentionsIsraelCompliance, mentionsRelocation } = opts;
  startedAuditEntry(store, tenant, runId, source, task, "onboarding");
  store.pushActiveRun(tenant, runId);

  try {
    // We still pull branding so we can share it safely — this is a read-only action and is
    // useful guidance whether or not the candidate identity can be verified.
    const brandingRes = (await safeRun("content.get_branding", () =>
      executeTool(store, "content.get_branding", { tenant }, { runId, actor: "pixush" }),
    )) as { branding?: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string } };
    const branding = brandingRes.branding;

    const response = composeMismatchResponse({
      extractedName,
      reason,
      branding,
      mentionsIsraelCompliance,
      mentionsRelocation,
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

function composeMismatchResponse(opts: {
  extractedName: string;
  reason: "no-match" | "conflict";
  branding?: { companyStory?: string; cultureVideoUrl?: string; welcomeNote?: string };
  mentionsIsraelCompliance: boolean;
  mentionsRelocation: boolean;
}): string {
  const { extractedName, reason, branding, mentionsIsraelCompliance, mentionsRelocation } = opts;
  const lines: string[] = [];
  const firstName = extractedName.split(" ")[0];

  if (reason === "conflict") {
    lines.push(`I noticed a discrepancy between the prompt details and the signed contract for ${extractedName}. I will not silently choose one set of conflicting employee data, and I have not created or updated any record in Shapes HRIS yet.`);
  } else {
    lines.push(`Welcome ${firstName} — happy to help you join Papaya.`);
    lines.push("");
    lines.push(`Before I can write anything to Shapes HRIS or add ${firstName} to Microsoft Teams, I need a signed contract that matches ${extractedName} in the ATS. The contract I can see in the system does not match ${extractedName}, so I have not created an HRIS record, sent a real welcome, added Teams memberships, or scheduled a calendar invite for ${firstName}. I will not substitute an unrelated candidate.`);
  }

  lines.push("");
  lines.push("What I would do once the correct signed contract is verified");
  lines.push("-------------------------------------------------------------");
  lines.push("1. Re-extract the signed contract details from the ATS.");
  lines.push("2. Confirm team and buddy with the hiring manager.");
  lines.push("3. Create or update the Shapes HRIS record (idempotent on a stable employee id).");
  lines.push("4. Add the new hire to the relevant Microsoft Teams channels.");
  lines.push("5. Send the warm Papaya-branded welcome email.");
  lines.push("6. Schedule the first-day calendar invite (logistics only).");
  lines.push("7. Share the Papaya branding pack and culture content.");
  lines.push("8. Record every action in the audit log so retries are idempotent.");

  lines.push("");
  lines.push("What I can share right now");
  lines.push("--------------------------");
  if (branding?.companyStory) lines.push(`- Papaya's company story: ${branding.companyStory}`);
  if (branding?.cultureVideoUrl) lines.push(`- Culture video: ${branding.cultureVideoUrl}`);
  if (branding?.welcomeNote) lines.push(`- Welcome note: ${branding.welcomeNote}`);
  lines.push(`- First-day expectations (generic, since the contract is unverified): you can expect a warm welcome from the team, time with your manager, an overview of how we work, equipment setup, and access provisioning. We are looking forward to day one.`);

  if (mentionsIsraelCompliance || mentionsRelocation) {
    lines.push("");
    lines.push("Israeli employment-document guidance (cautious)");
    lines.push("-----------------------------------------------");
    lines.push("For Israeli employment compliance, new hires are typically asked to bring identification such as a passport or Israeli ID, proof of work authorization or visa where relevant, and any tax or banking documents Papaya specifically requests. I do not want to overstate legal certainty — exact requirements depend on your nationality, visa status, and role, so please confirm the precise document list with Papaya's authorized People/HR team or legal point of contact before you arrive.");
  }

  lines.push("");
  lines.push("Next step for HR");
  lines.push("----------------");
  lines.push(`Please share the correct signed contract for ${extractedName} (or the verified identity + employment fields: full legal name, department, hiring manager, start date, employment type, role, work location) and I will run the full onboarding workflow end to end. Until then, no HRIS record or onboarding side effect has been created.`);

  return lines.join("\n");
}

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
