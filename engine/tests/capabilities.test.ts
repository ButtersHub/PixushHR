import { describe, it, expect } from "vitest";
import { capabilitySpecs } from "../src/tools.js";

describe("capabilitySpecs", () => {
  it("derives required/optional fields from each tool's zod schema", () => {
    const specs = capabilitySpecs();
    const upsert = specs.find((s) => s.name === "hris.upsert_employee");
    expect(upsert).toBeTruthy();
    const byName = Object.fromEntries(upsert!.fields.map((f) => [f.name, f]));
    expect(byName.name.required).toBe(true);
    expect(byName.startDate.required).toBe(false);
    expect(byName.tenant.system).toBe(true);
    expect(upsert!.sideEffectful).toBe(true);
  });

  it("marks read-only tools as not sideEffectful", () => {
    const specs = capabilitySpecs();
    expect(specs.find((s) => s.name === "ats.get_contract")?.sideEffectful).toBe(false);
  });

  it("emits kind, connector, label, inputSchema, and outputSchema for each capability", () => {
    const specs = capabilitySpecs();
    const gmail = specs.find((s) => s.name === "gmail.send_email")!;
    expect(gmail.kind).toBe("external-hermes");
    expect(gmail.connector).toBe("gmail");
    expect(gmail.label).toBe("Send welcome email");
    expect(gmail.inputSchema).toMatchObject({ kind: "object" });
    expect(gmail.outputSchema).toMatchObject({ kind: "object" });
    // input has `to` as a required string field
    expect((gmail.inputSchema as any).fields.to).toMatchObject({ kind: "string", required: true });
    expect((gmail.inputSchema as any).fields.from).toMatchObject({ kind: "string", required: false });
  });

  it("renders the object tree recursively for nested outputs", () => {
    const specs = capabilitySpecs();
    const contract = specs.find((s) => s.name === "ats.get_contract")!;
    const out = contract.outputSchema as any;
    expect(out.kind).toBe("object");
    expect(out.fields.contract.kind).toBe("object");
    expect(out.fields.contract.fields.name.kind).toBe("string");
  });
});
