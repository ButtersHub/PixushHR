// Typed onboarding workflow (decisions #19, #46). Phase A is linear + happy-path;
// conditions/escalation are added in Phase B. The dashboard workflow editor (A10)
// will render and edit this same structure.
export type Audience = "employee" | "manager" | "hr" | "team";

export interface WorkflowStep {
  intent: string; // human-readable description of the step
  capability: string; // the tool name the agent should call
  audience: Audience; // who this step concerns (used by the confidentiality gate later)
}

export interface WorkflowDefinition {
  id: string;
  trigger: string;
  steps: WorkflowStep[];
}

export const onboardingWorkflow: WorkflowDefinition = {
  id: "onboarding",
  trigger: "A new hire needs to be onboarded.",
  steps: [
    { intent: "Extract the signed contract for the new hire.", capability: "ats.get_contract", audience: "hr" },
    { intent: "Ask the hiring manager for team placement and buddy details.", capability: "hiring_manager.ask", audience: "manager" },
    { intent: "Create the employee record in the HRIS.", capability: "hris.upsert_employee", audience: "hr" },
    { intent: "Add the new hire to their Microsoft Teams.", capability: "teams.add_member", audience: "team" },
    { intent: "Schedule a first-day welcome invite (logistics only).", capability: "calendar.create_invite", audience: "employee" },
    { intent: "Fetch Papaya branding content to share.", capability: "content.get_branding", audience: "employee" },
    { intent: "Send a warm welcome message to the new hire.", capability: "channel.send_message", audience: "employee" },
  ],
};
