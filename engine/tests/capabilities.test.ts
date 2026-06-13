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
});
