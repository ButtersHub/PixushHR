import type { WorkflowDefinition } from "./types.js";

// Onboarding as a typed node-graph (decision #19). Phase A is a linear action chain; conditions
// and escalation land in Phase B. The dashboard workflow editor renders/edits this exact shape.
export const onboardingWorkflow: WorkflowDefinition = {
  id: "onboarding",
  name: "Onboarding",
  version: 1,
  trigger: {
    type: "candidate.hired",
    connector: "comeet",
    sample: {
      candidateId: "c1",
      candidate: { name: "Maya Cohen", email: "maya@cohen.io", role: "Engineer" },
    },
  },
  root: "n1",
  nodes: {
    n1: { id: "n1", kind: "action", capability: "ats.get_contract", audience: "hr",
      input: { tenant: { kind: "literal", value: "papaya" }, candidateId: { kind: "literal", value: "c1" } }, next: "n2" },
    n2: { id: "n2", kind: "action", capability: "hiring_manager.ask", audience: "manager",
      input: { tenant: { kind: "literal", value: "papaya" }, managerId: { kind: "ref", from: "step.n1.output.contract.managerId" }, question: { kind: "agent" } }, next: "n3" },
    n3: { id: "n3", kind: "action", capability: "hris.upsert_employee", audience: "hr",
      input: { tenant: { kind: "literal", value: "papaya" }, id: { kind: "literal", value: "e1" }, name: { kind: "ref", from: "step.n1.output.contract.name" }, role: { kind: "ref", from: "step.n1.output.contract.role" } }, next: "n4" },
    n4: { id: "n4", kind: "action", capability: "teams.add_member", audience: "team",
      input: { tenant: { kind: "literal", value: "papaya" }, employeeId: { kind: "literal", value: "e1" }, teams: { kind: "agent" } }, next: "n5" },
    n5: { id: "n5", kind: "action", capability: "calendar.create_invite", audience: "employee",
      input: { tenant: { kind: "literal", value: "papaya" }, title: { kind: "agent" }, date: { kind: "ref", from: "step.n1.output.contract.startDate" }, attendees: { kind: "agent" }, location: { kind: "agent" } }, next: "n6" },
    n6: { id: "n6", kind: "action", capability: "content.get_branding", audience: "employee",
      input: { tenant: { kind: "literal", value: "papaya" } }, next: "n7" },
    n7: { id: "n7", kind: "action", capability: "channel.send_message", audience: "employee",
      input: { tenant: { kind: "literal", value: "papaya" }, to: { kind: "ref", from: "step.n1.output.contract.name" }, role: { kind: "literal", value: "employee" }, channel: { kind: "literal", value: "email" }, body: { kind: "agent" } } },
  },
};
