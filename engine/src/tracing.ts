/**
 * Env-gated Langfuse tracing via OpenTelemetry.
 * If LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are absent (local dev, tests),
 * all exports are no-ops so the rest of the app is unaffected.
 *
 * Import this module FIRST in server.ts (side-effect: sdk.start()).
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, startActiveObservation, startObservation } from "@langfuse/tracing";
import type { LangfuseGeneration } from "@langfuse/tracing";
import type { PropagateAttributesParams } from "@langfuse/tracing";
import type { SpanContext } from "@opentelemetry/api";

const keysPresent =
  !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY;

let _spanProcessor: LangfuseSpanProcessor | undefined;
const toolParents = new Map<string, SpanContext>();

if (keysPresent) {
  _spanProcessor = new LangfuseSpanProcessor();
  const sdk = new NodeSDK({ spanProcessors: [_spanProcessor] });
  sdk.start();
}

export const tracingEnabled: boolean = keysPresent;

/** On graceful shutdown, flush buffered spans to Langfuse. */
export async function flushTracing(): Promise<void> {
  if (_spanProcessor) {
    await _spanProcessor.forceFlush();
  }
}

export interface TraceAttrs {
  traceName?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, string>;
  tags?: string[];
}

/** Wrap fn with a Langfuse trace context; falls back to plain fn() when tracing is off. */
export async function withTrace<T>(
  attrs: TraceAttrs,
  fn: () => Promise<T>,
): Promise<T> {
  if (!keysPresent) {
    return fn();
  }
  return propagateAttributes(attrs as PropagateAttributesParams, fn);
}

export interface GenerationHandle {
  update(attrs: {
    output?: unknown;
    model?: string;
    usageDetails?: { input?: number; output?: number };
    level?: "DEFAULT" | "ERROR";
    statusMessage?: string;
  }): GenerationHandle;
  end(): void;
  spanContext(): SpanContext;
}

/**
 * Start a generation observation.
 * Returns undefined when tracing is disabled — callers guard with `gen?.`.
 * NOTE: input is deliberately set to the messages array only, not the full request
 * context, to avoid capturing sensitive request data (masking best practice).
 */
export function startGeneration(
  name: string,
  attrs: { model?: string; input?: unknown },
): GenerationHandle | undefined {
  if (!keysPresent) {
    return undefined;
  }
  const gen: LangfuseGeneration = startObservation(
    name,
    { model: attrs.model, input: attrs.input },
    { asType: "generation" },
  );

  const handle: GenerationHandle = {
    update(updAttrs) {
      gen.update({
        output: updAttrs.output,
        model: updAttrs.model,
        usageDetails: updAttrs.usageDetails as Record<string, number> | undefined,
        level: updAttrs.level,
        statusMessage: updAttrs.statusMessage,
      });
      return handle;
    },
    end() {
      gen.end();
    },
    spanContext() {
      return gen.otelSpan.spanContext();
    },
  };
  return handle;
}

export function registerToolTraceParent(runId: string, generation: GenerationHandle | undefined): void {
  if (generation) toolParents.set(runId, generation.spanContext());
}

export function clearToolTraceParent(runId: string): void {
  toolParents.delete(runId);
}

const REDACTED_KEYS = /(?:authorization|api[_-]?key|authref|password|secret|token|body|reason)/i;

export function sanitizeTraceValue(value: unknown, key = "", depth = 0): unknown {
  if (REDACTED_KEYS.test(key)) return "[REDACTED]";
  if (depth >= 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeTraceValue(item, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([childKey, childValue]) => [childKey, sanitizeTraceValue(childValue, childKey, depth + 1)]),
    );
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export async function traceToolCall<T>(
  attrs: { runId?: string; tenant: string; name: string; input: unknown },
  fn: () => Promise<T>,
): Promise<T> {
  const parentSpanContext = attrs.runId ? toolParents.get(attrs.runId) : undefined;
  if (!keysPresent || !parentSpanContext) return fn();

  const startedAt = Date.now();
  const tool = startObservation(
    attrs.name,
    {
      input: sanitizeTraceValue(attrs.input),
      metadata: { runId: attrs.runId, tenant: attrs.tenant },
    },
    { asType: "tool", parentSpanContext },
  );

  try {
    const result = await fn();
    tool.update({
      output: sanitizeTraceValue(result),
      metadata: { runId: attrs.runId, tenant: attrs.tenant, durationMs: Date.now() - startedAt },
    });
    return result;
  } catch (error) {
    tool.update({
      level: "ERROR",
      statusMessage: (error as Error).message,
      output: { ok: false, error: (error as Error).message },
      metadata: { runId: attrs.runId, tenant: attrs.tenant, durationMs: Date.now() - startedAt },
    });
    throw error;
  } finally {
    tool.end();
  }
}

/**
 * Wrap fn in a Langfuse span that is the active OTel context for the duration of fn.
 * Child observations created inside fn naturally nest under this span without needing
 * an explicit parent. No-ops cleanly when tracing is disabled.
 */
export async function withActiveSpan<T>(
  name: string,
  attrs: { metadata?: Record<string, unknown>; input?: unknown },
  fn: () => Promise<T>,
): Promise<T> {
  if (!keysPresent) return fn();
  return startActiveObservation(
    name,
    async (span) => {
      span.update({
        input: attrs.input !== undefined ? sanitizeTraceValue(attrs.input) : undefined,
        metadata: attrs.metadata,
      });
      try {
        return await fn();
      } catch (error) {
        span.update({ level: "ERROR", statusMessage: (error as Error).message });
        throw error;
      }
    },
    { asType: "span" },
  ) as Promise<T>;
}

/**
 * Inline tool observation that inherits the current OTel context. Use inside an
 * active span (e.g. withActiveSpan) so each tool call appears as a child observation
 * in the same trace. Differs from traceToolCall, which requires an explicit
 * registered parent (used by the HTTP /tools/execute path).
 */
export async function runTracedTool<T>(
  attrs: { name: string; input: unknown; runId?: string; tenant?: string },
  fn: () => Promise<T>,
): Promise<T> {
  if (!keysPresent) return fn();
  const startedAt = Date.now();
  const tool = startObservation(
    attrs.name,
    {
      input: sanitizeTraceValue(attrs.input),
      metadata: { runId: attrs.runId, tenant: attrs.tenant },
    },
    { asType: "tool" },
  );
  try {
    const result = await fn();
    tool.update({
      output: sanitizeTraceValue(result),
      metadata: { runId: attrs.runId, tenant: attrs.tenant, durationMs: Date.now() - startedAt },
    });
    return result;
  } catch (error) {
    tool.update({
      level: "ERROR",
      statusMessage: (error as Error).message,
      output: { ok: false, error: (error as Error).message },
      metadata: { runId: attrs.runId, tenant: attrs.tenant, durationMs: Date.now() - startedAt },
    });
    throw error;
  } finally {
    tool.end();
  }
}

/**
 * Emit a short event-style observation in the current OTel context. Used for
 * markers like "intent-cache-hit" or "intent-regex-fallback" where there's no
 * meaningful duration to track but we want a visible node in the trace.
 */
export function emitTraceEvent(
  name: string,
  attrs: { metadata?: Record<string, unknown>; input?: unknown; output?: unknown } = {},
): void {
  if (!keysPresent) return;
  startObservation(
    name,
    {
      input: attrs.input !== undefined ? sanitizeTraceValue(attrs.input) : undefined,
      output: attrs.output !== undefined ? sanitizeTraceValue(attrs.output) : undefined,
      metadata: attrs.metadata,
    },
    { asType: "event" },
  );
}
