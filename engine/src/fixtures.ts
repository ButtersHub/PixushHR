import type { InMemoryStore } from "./store.js";
import { CONNECTORS, defaultState } from "./integrations.js";
import { onboardingWorkflow } from "./workflows/onboarding.js";
import { offboardingWorkflow } from "./workflows/offboarding.js";

// Synthetic onboarding fixtures. Loaded at startup and on POST /reset.
export function seedFixtures(store: InMemoryStore, tenant = "papaya"): void {
  store.addDepartment(tenant, { id: "d1", name: "Engineering" });

  store.addManager(tenant, {
    id: "m1",
    name: "Daniel Levi",
    department: "Engineering",
    cannedAnswer:
      "Maya joins the Payments squad. Her buddy is Noa Bar-On and her first project is the " +
      "reconciliation service. Please seat her near the Payments pod.",
  });

  store.addContract(tenant, {
    candidateId: "c1",
    name: "Maya Cohen",
    role: "Engineer",
    startDate: "2026-07-01",
    department: "Engineering",
    managerId: "m1",
    employmentType: "Full-time",
    signed: true,
  });

  store.setBranding(tenant, {
    companyStory:
      "Papaya Global makes paying people anywhere in the world simple, compliant, and human.",
    cultureVideoUrl: "https://papaya.example/culture",
    welcomeNote: "We're genuinely glad you're joining us.",
  });

  for (const def of CONNECTORS) {
    store.setConnectorState(tenant, def.id, defaultState(def));
  }
  // store a deep copy so editor edits never mutate the module constant
  store.setWorkflow(tenant, JSON.parse(JSON.stringify(onboardingWorkflow)));
  store.setWorkflow(tenant, JSON.parse(JSON.stringify(offboardingWorkflow)));
}
