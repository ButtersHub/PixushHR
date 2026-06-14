import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context that propagates through async boundaries.
 *
 * The orchestrator sets `runId` when /execute starts; any /tools/execute call made
 * while that request is in flight (including from the real Hermes via the hris-tool
 * skill, which doesn't know about runId) automatically inherits it — so every audit
 * entry of one run shares a single runId without requiring the agent skill to forward it.
 */
export interface RequestContext {
  runId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}
