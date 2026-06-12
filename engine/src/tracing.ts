/**
 * Env-gated Langfuse tracing via OpenTelemetry.
 * If LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are absent (local dev, tests),
 * all exports are no-ops so the rest of the app is unaffected.
 *
 * Import this module FIRST in server.ts (side-effect: sdk.start()).
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, startObservation } from "@langfuse/tracing";
import type { LangfuseGeneration } from "@langfuse/tracing";
import type { PropagateAttributesParams } from "@langfuse/tracing";

const keysPresent =
  !!process.env.LANGFUSE_PUBLIC_KEY && !!process.env.LANGFUSE_SECRET_KEY;

let _spanProcessor: LangfuseSpanProcessor | undefined;

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
  }): GenerationHandle;
  end(): void;
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
      });
      return handle;
    },
    end() {
      gen.end();
    },
  };
  return handle;
}
