import { describe, expect, it } from "vitest";
import { sanitizeTraceValue, traceToolCall } from "../src/tracing.js";

describe("tool tracing", () => {
  it("redacts sensitive free text while preserving operational fields", () => {
    expect(sanitizeTraceValue({
      tenant: "papaya",
      employeeId: "daniel.rosen",
      effectiveDate: "2026-06-28",
      reason: "role eliminated",
      terminationReason: "role eliminated",
      body: "Dear Daniel...",
      nested: { authorization: "Bearer secret", status: "active" },
    })).toEqual({
      tenant: "papaya",
      employeeId: "daniel.rosen",
      effectiveDate: "2026-06-28",
      reason: "[REDACTED]",
      terminationReason: "[REDACTED]",
      body: "[REDACTED]",
      nested: { authorization: "[REDACTED]", status: "active" },
    });
  });

  it("does not alter execution when no parent trace is registered", async () => {
    const result = await traceToolCall(
      { runId: "r1", tenant: "papaya", name: "test.tool", input: { value: 1 } },
      async () => ({ ok: true }),
    );
    expect(result).toEqual({ ok: true });
  });
});
