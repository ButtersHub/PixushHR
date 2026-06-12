export interface Employee {
  id: string;
  name: string;
  role: string;
  startDate?: string;
  department?: string;
  managerId?: string;
  employmentType?: string;
}

export interface AuditEntry {
  ts: string;
  tenant: string;
  capability: string;
  target: string;
  summary: string;
}

export class InMemoryStore {
  private employees = new Map<string, Employee>();
  private auditLog: AuditEntry[] = [];

  private key(tenant: string, id: string): string {
    return `${tenant}#employee#${id}`;
  }

  upsertEmployee(tenant: string, emp: Employee): Employee {
    this.employees.set(this.key(tenant, emp.id), emp);
    return emp;
  }

  getEmployee(tenant: string, id: string): Employee | undefined {
    return this.employees.get(this.key(tenant, id));
  }

  audit(entry: Omit<AuditEntry, "ts">): void {
    this.auditLog.push({ ...entry, ts: new Date().toISOString() });
  }

  getAudit(tenant: string): AuditEntry[] {
    return this.auditLog.filter((e) => e.tenant === tenant);
  }
}
