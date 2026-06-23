import type { HermesClient, ChatMessage, ChatResult, ChatOpts } from "./hermes.js";
import { PARSER_SENTINEL } from "./plan.js";

// Simulates the agent. Two modes:
// 1) Parser mode — when the system prompt contains the PARSER_SENTINEL, return a JSON plan
//    extracted by tiny heuristics from the user task. No tool calls. This lets the
//    plan-first orchestrator round-trip through the stub without any external LLM.
// 2) Workflow mode — legacy behaviour for the no-creds smoke compose + dashboard e2e:
//    walk the onboarding playbook by calling each engine tool via /tools/execute, then
//    return a warm reply.
export class StubHermes implements HermesClient {
  constructor(private engineUrl: string) {}

  private call(name: string, args: unknown, runId?: string): Promise<Response> {
    return fetch(`${this.engineUrl}/tools/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, args, runId }),
    });
  }

  async chat(messages: ChatMessage[], opts?: ChatOpts): Promise<ChatResult> {
    const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const task = messages.find((m) => m.role === "user")?.content ?? "";
    if (sys.includes(PARSER_SENTINEL)) {
      return { content: JSON.stringify(stubPlanFromTask(task)) };
    }
    const tenant = "papaya";
    const runId = opts?.runId;

    const contractRes = (await (await this.call("ats.get_contract", { tenant, candidateId: "c1" }, runId)).json()) as {
      contract: { name: string; role: string; startDate: string; department: string; managerId: string; employmentType: string };
    };
    const c = contractRes.contract;

    await this.call("hiring_manager.ask", { tenant, managerId: c.managerId, question: "Which team and buddy for the new hire?" }, runId);
    await this.call("hris.upsert_employee", {
      tenant, id: "e1", name: c.name, role: c.role, startDate: c.startDate,
      department: c.department, managerId: c.managerId, employmentType: c.employmentType,
    }, runId);
    await this.call("teams.add_member", { tenant, employeeId: "e1", teams: ["Payments"] }, runId);
    await this.call("calendar.create_invite", {
      tenant, title: `Welcome ${c.name}`, date: c.startDate, attendees: ["e1", c.managerId], location: "Tel Aviv HQ",
    }, runId);
    await this.call("content.get_branding", { tenant }, runId);
    await this.call("channel.send_message", {
      tenant, to: c.name, role: "employee", channel: "email",
      body: `Welcome to Papaya, ${c.name} — it's genuinely great to have you joining us. Your first day is ${c.startDate}.`,
    }, runId);

    return {
      content:
        `Hi ${c.name}, welcome to Papaya! I've set up your record in Shapes, added you to the Payments team, ` +
        `scheduled your first day, and sent you a warm welcome. (task: ${task.slice(0, 30)})`,
    };
  }
}

/** Best-effort plan extraction for the stub parser path. Mirrors the LLM contract closely
 *  enough that the orchestrator's `planToIntent` makes the same routing decisions in tests. */
export function stubPlanFromTask(task: string): Record<string, unknown> {
  const lower = task.toLowerCase();

  // Confidentiality requests — peer/manager/etc. asking the agent to share sensitive data.
  const confSubjects: string[] = [];
  const askMarker = /\b(?:send|share|give|tell|forward|email|provide|disclose|reveal)\s+(?:me|us|to\s+me|to\s+us|the\s+team)\b/i;
  if (askMarker.test(task)) {
    if (/termination\s+reason/i.test(task)) confSubjects.push("termination reason");
    if (/\b(?:salary|compensation|pay\s+rate|wage)\b/i.test(task)) confSubjects.push("salary");
    if (/\b(?:contract\s+details|signed\s+contract|offer\s+terms)\b/i.test(task)) confSubjects.push("contract details");
    if (/\bpassport\b/i.test(task)) confSubjects.push("passport details");
    if (/\b(?:home\s+address|residential\s+address)\b/i.test(task)) confSubjects.push("home address");
  }
  if (confSubjects.length > 0) {
    return {
      intent: "confidentiality-refusal",
      confidentialitySubjects: confSubjects,
      requesterRole: /\bpeer\b/i.test(task) ? "peer" : /\bmanager\b/i.test(task) ? "manager" : "third party",
      questions: extractQuestions(task),
    };
  }

  const isOff = /\b(?:offboard|offboarding|terminate|termination|last\s+working\s+day|leaving)\b/i.test(lower);
  const isOn = !isOff && /\b(?:onboard|onboarding|new\s+hire|signed\s+contract|run\s+onboarding|execute\s+(?:the\s+)?(?:complete\s+)?onboarding)\b/i.test(lower);

  const name = extractStubName(task);

  const labelled = (field: string): string | undefined => {
    const m = task.match(new RegExp(`(?:^|\\n)\\s*${field}:\\s*([^\\n]+)`, "i"));
    return m ? m[1].trim() : undefined;
  };

  const parseDate = (v?: string): string | undefined => {
    if (!v) return undefined;
    const trim = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trim)) return trim;
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    };
    const m = trim.match(/\b(?:[a-z]+,?\s*)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
    if (m) return `${m[3]}-${months[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}`;
    return undefined;
  };
  const proseDate = (anchor: RegExp): string | undefined => {
    const m = task.match(anchor);
    if (!m) return undefined;
    const tail = task.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 80);
    return parseDate(tail);
  };

  const role = labelled("Role");
  const department = labelled("Department");
  const manager = labelled("Manager");
  const employmentType = labelled("Employment type");
  const workLocation = labelled("Work location");
  const email = labelled("Work email") ?? labelled("Email");
  const startDateLabelled = labelled("Start date");
  const startDateAbsolute = parseDate(startDateLabelled);
  const startDateRelative = startDateLabelled && !startDateAbsolute && /\b(?:today|tomorrow|yesterday|next\s+\w+|last\s+\w+)\b/i.test(startDateLabelled)
    ? startDateLabelled
    : undefined;
  const lastWorkingDay = parseDate(labelled("Last working day")) ?? proseDate(/\blast\s+working\s+day\s+(?:as|is|of|on)\b/i);
  const terminationDate = parseDate(labelled("Termination date"));
  const effectiveDate = parseDate(labelled("Effective date"));
  let terminationReason = labelled("Reason") ?? labelled("Termination reason");
  if (!terminationReason) {
    const m = task.match(/\breason(?:\s+as)?\s*(?:was|is|as|recorded\s+as)?\s*([^.\n]+?)(?:\.|$|\n)/i);
    if (m) terminationReason = m[1].trim();
  }
  const stakeholdersLine = labelled("Relevant parties(?:\\s+for\\s+last-day\\s+logistics)?");
  const stakeholders = stakeholdersLine
    ? stakeholdersLine.split(/,| and /i).map((s) => s.trim()).filter(Boolean)
    : (/\bfor\s+manager\/hrbp\/it\b/i.test(task) ? ["manager", "HRBP", "IT"] : []);

  const missingFields: string[] = [];
  if (/\bdo not know|don'?t know|unknown|not available|unverified|missing\b/i.test(task)) {
    const m = task.match(/(?:do not know|don'?t know)[^.\n]*?([^\n.]+)/i);
    if (m) {
      for (const piece of m[1].split(/,| and /i)) {
        const s = piece.trim().replace(/^the /i, "");
        if (s && s.length < 40) missingFields.push(s);
      }
    }
  }

  const hasConflict = /prompt\s+says[^.]*\.\s*signed\s+contract\s+says/is.test(task)
    || /prompt\s+says.*?contract\s+says/is.test(task);

  const questions = extractQuestions(task);
  const isEmployeeQuestion = !!questions.length && /\basks\b/i.test(task);

  const mentionsIsraelCompliance = /\b(?:israel|visa|work\s+authorization|passport|compliance|relocat)/i.test(task);

  if (isOn) {
    return {
      intent: "onboarding",
      employeeName: name,
      role, department, manager,
      startDate: startDateAbsolute,
      startDateRelative,
      employmentType, workLocation, email,
      questions,
      missingFields,
      hasConflict,
      mentionsIsraelCompliance,
    };
  }
  if (isOff) {
    return {
      intent: "offboarding",
      employeeName: name,
      role, department, manager, email,
      lastWorkingDay,
      effectiveDate,
      terminationDate,
      terminationReason,
      stakeholders,
      questions,
      isEmployeeQuestion,
    };
  }

  // Question-only employee asks → general (so the GA prompt answers warmly with culture etc.)
  if (questions.length > 0) {
    return { intent: "employee-question", questions, employeeName: name, mentionsIsraelCompliance };
  }
  return { intent: "general" };
}

function extractStubName(task: string): string | undefined {
  const labelled = task.match(/(?:^|\n)\s*Employee:\s*([^\n,]+)/i);
  if (labelled) {
    const n = labelled[1].trim();
    if (/^[A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+/.test(n)) return n;
  }
  const patterns = [
    /Onboard(?:ing)?\s+([A-Z][a-zA-Z'’\-]+(?:\s+[A-Z][a-zA-Z'’\-]+){1,3})/,
    /\b([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+),\s+(?:the\s+)?(?:new|departing)\b/,
    /\b([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+)\s+(?:is\s+leaving|asks(?:\s|:))/,
    /\bemployee\s+is\s+([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+)/i,
    /(?:new\s+(?:software\s+)?(?:engineer|hire|backend\s+engineer)[^,\n]*?,\s+)([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+)/i,
    /\bShare\s+([A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+)('s)?/,
    /Onboard(?:ing)?\s+([A-Z][a-zA-Z'’\-]+)\b/, // partial — single token
  ];
  for (const re of patterns) {
    const m = task.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

function extractQuestions(task: string): string[] {
  const out: string[] = [];
  const re = /"([^"\n]{6,}?\?)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(task)) !== null) out.push(m[1]);
  return out;
}
