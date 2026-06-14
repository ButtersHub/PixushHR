import { randomUUID } from "node:crypto";
import type { ConnectorState } from "./integrations.js";
import type { WorkflowDefinition } from "./workflows/types.js";

export interface Employee {
  id: string;
  name: string;
  role: string;
  startDate?: string;
  department?: string;
  managerId?: string;
  employmentType?: string;
}

export interface Contract {
  candidateId: string;
  name: string;
  role: string;
  startDate: string;
  department: string;
  managerId: string;
  employmentType: string;
  signed: boolean;
}

export interface Manager {
  id: string;
  name: string;
  department: string;
  cannedAnswer: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface BrandingPack {
  companyStory: string;
  cultureVideoUrl: string;
  welcomeNote: string;
}

export interface Message {
  id: string;
  tenant: string;
  from: "agent" | "employee";
  to: string;
  role: string;
  channel: "email" | "teams" | "slack";
  body: string;
  ts: string;
}

export interface CalendarInvite {
  id: string;
  tenant: string;
  title: string;
  date: string;
  attendees: string[];
  location: string;
}

export interface TeamMembership {
  tenant: string;
  employeeId: string;
  teams: string[];
}

export type AuditActor = "pixush" | "user" | "trigger" | "system";
export type AuditStatus = "success" | "error" | "escalated";

export interface AuditEntry {
  id: string;             // stable identifier (random uuid)
  ts: string;             // ISO timestamp
  tenant: string;
  /** stable capability id (e.g. "hris.upsert_employee" or "integrations.install") */
  capability: string;
  /** friendly display label (e.g. "Update employee record") */
  label?: string;
  /** which connector/system this action affected (role-port id, e.g. "HRIS", "Channels") */
  integration?: string;
  /** the affected entity — an employee name, a recipient, a connector id */
  target: string;
  /** one-line description of what happened */
  summary: string;
  /** who/what initiated the action */
  actor: AuditActor;
  /** the execution this action belongs to (groups all actions of a single agent run) */
  runId?: string;
  /** outcome */
  status: AuditStatus;
  /** elapsed time in ms */
  durationMs?: number;
  /** raw inputs passed to the action (synthetic data, safe to surface) */
  inputs?: unknown;
  /** raw output the action returned, or the error message */
  outputs?: unknown;
}

export class InMemoryStore {
  private employees = new Map<string, Employee>();
  private contracts = new Map<string, Contract>();
  private managers = new Map<string, Manager>();
  private departments = new Map<string, Department>();
  private branding = new Map<string, BrandingPack>();
  private messages: Message[] = [];
  private invites: CalendarInvite[] = [];
  private memberships: TeamMembership[] = [];
  private auditLog: AuditEntry[] = [];
  private connectorStates = new Map<string, ConnectorState>();
  private workflows = new Map<string, WorkflowDefinition>();

  private key(tenant: string, kind: string, id: string): string {
    return `${tenant}#${kind}#${id}`;
  }

  upsertEmployee(tenant: string, emp: Employee): Employee {
    this.employees.set(this.key(tenant, "employee", emp.id), emp);
    return emp;
  }

  getEmployee(tenant: string, id: string): Employee | undefined {
    return this.employees.get(this.key(tenant, "employee", id));
  }

  addContract(tenant: string, c: Contract): Contract {
    this.contracts.set(this.key(tenant, "contract", c.candidateId), c);
    return c;
  }

  getContract(tenant: string, candidateId: string): Contract | undefined {
    return this.contracts.get(this.key(tenant, "contract", candidateId));
  }

  addManager(tenant: string, m: Manager): Manager {
    this.managers.set(this.key(tenant, "manager", m.id), m);
    return m;
  }

  getManager(tenant: string, id: string): Manager | undefined {
    return this.managers.get(this.key(tenant, "manager", id));
  }

  addDepartment(tenant: string, d: Department): Department {
    this.departments.set(this.key(tenant, "department", d.id), d);
    return d;
  }

  getDepartment(tenant: string, id: string): Department | undefined {
    return this.departments.get(this.key(tenant, "department", id));
  }

  setBranding(tenant: string, b: BrandingPack): BrandingPack {
    this.branding.set(tenant, b);
    return b;
  }

  getBranding(tenant: string): BrandingPack | undefined {
    return this.branding.get(tenant);
  }

  addMessage(msg: Omit<Message, "id" | "ts">): Message {
    const full: Message = { ...msg, id: randomUUID(), ts: new Date().toISOString() };
    this.messages.push(full);
    return full;
  }

  getMessages(tenant: string): Message[] {
    return this.messages.filter((m) => m.tenant === tenant);
  }

  addInvite(tenant: string, invite: Omit<CalendarInvite, "id" | "tenant">): CalendarInvite {
    const full: CalendarInvite = { ...invite, id: randomUUID(), tenant };
    this.invites.push(full);
    return full;
  }

  getInvites(tenant: string): CalendarInvite[] {
    return this.invites.filter((i) => i.tenant === tenant);
  }

  addMembership(m: TeamMembership): TeamMembership {
    this.memberships.push(m);
    return m;
  }

  getMemberships(tenant: string): TeamMembership[] {
    return this.memberships.filter((m) => m.tenant === tenant);
  }

  audit(entry: Omit<AuditEntry, "id" | "ts">): AuditEntry {
    const full: AuditEntry = { ...entry, id: randomUUID(), ts: new Date().toISOString() };
    this.auditLog.push(full);
    return full;
  }

  getAudit(tenant: string): AuditEntry[] {
    return this.auditLog.filter((e) => e.tenant === tenant);
  }

  listEmployees(tenant: string): Employee[] {
    return [...this.employees.entries()].filter(([k]) => k.startsWith(`${tenant}#employee#`)).map(([, v]) => v);
  }

  listContracts(tenant: string): Contract[] {
    return [...this.contracts.entries()].filter(([k]) => k.startsWith(`${tenant}#contract#`)).map(([, v]) => v);
  }

  getConnectorState(tenant: string, id: string): ConnectorState | undefined {
    return this.connectorStates.get(this.key(tenant, "connector", id));
  }

  setConnectorState(tenant: string, id: string, state: ConnectorState): void {
    this.connectorStates.set(this.key(tenant, "connector", id), state);
  }

  getWorkflow(tenant: string, id: string): WorkflowDefinition | undefined {
    return this.workflows.get(this.key(tenant, "workflow", id));
  }

  setWorkflow(tenant: string, def: WorkflowDefinition): void {
    this.workflows.set(this.key(tenant, "workflow", def.id), def);
  }

  listWorkflows(tenant: string): WorkflowDefinition[] {
    return [...this.workflows.entries()]
      .filter(([k]) => k.startsWith(`${tenant}#workflow#`))
      .map(([, v]) => v);
  }

  reset(): void {
    this.employees.clear();
    this.contracts.clear();
    this.managers.clear();
    this.departments.clear();
    this.branding.clear();
    this.messages = [];
    this.invites = [];
    this.memberships = [];
    this.auditLog = [];
    this.connectorStates.clear();
    this.workflows.clear();
  }
}
