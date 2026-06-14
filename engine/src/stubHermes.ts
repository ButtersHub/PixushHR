import type { HermesClient, ChatMessage, ChatResult } from "./hermes.js";

// Simulates the agent following the onboarding playbook: it calls each domain tool in order
// via the engine skill (HTTP callback to /tools/execute), then returns a warm reply.
// Used for code-e2e and dashboard e2e without real Hermes.
export class StubHermes implements HermesClient {
  constructor(private engineUrl: string) {}

  private call(name: string, args: unknown): Promise<Response> {
    return fetch(`${this.engineUrl}/tools/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, args }),
    });
  }

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const task = messages.find((m) => m.role === "user")?.content ?? "";
    const tenant = "papaya";

    const contractRes = (await (await this.call("ats.get_contract", { tenant, candidateId: "c1" })).json()) as {
      contract: { name: string; role: string; startDate: string; department: string; managerId: string; employmentType: string };
    };
    const c = contractRes.contract;

    await this.call("hiring_manager.ask", { tenant, managerId: c.managerId, question: "Which team and buddy for the new hire?" });
    await this.call("hris.upsert_employee", {
      tenant, id: "e1", name: c.name, role: c.role, startDate: c.startDate,
      department: c.department, managerId: c.managerId, employmentType: c.employmentType,
    });
    await this.call("teams.add_member", { tenant, employeeId: "e1", teams: ["Payments"] });
    await this.call("calendar.create_invite", {
      tenant, title: `Welcome ${c.name}`, date: c.startDate, attendees: ["e1", c.managerId], location: "Tel Aviv HQ",
    });
    await this.call("content.get_branding", { tenant });
    await this.call("channel.send_message", {
      tenant, to: c.name, role: "employee", channel: "email",
      body: `Welcome to Papaya, ${c.name} — it's genuinely great to have you joining us. Your first day is ${c.startDate}.`,
    });

    return {
      content:
        `Hi ${c.name}, welcome to Papaya! I've set up your record in Shapes, added you to the Payments team, ` +
        `scheduled your first day, and sent you a warm welcome. (task: ${task.slice(0, 30)})`,
    };
  }
}
