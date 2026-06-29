/**
 * Process-wide runtime settings (in-memory, single-tenant for now).
 *
 * Today only `llmCacheEnabled` lives here. When it's true (default), the
 * intent-parser plan cache and the deterministic LLM-humanized welcome-body /
 * Q&A caches read+write as usual. When false, every LLM call is fresh — useful
 * for demos where we want to show real intent-parser latency in Langfuse.
 *
 * Seeded from `LLM_CACHE_ENABLED` env var (set explicitly to `"false"` to start
 * disabled). Mutated at runtime via `PATCH /settings` from the dashboard.
 */
let llmCacheEnabled: boolean = process.env.LLM_CACHE_ENABLED !== "false";

export function getLlmCacheEnabled(): boolean {
  return llmCacheEnabled;
}

export function setLlmCacheEnabled(value: boolean): void {
  llmCacheEnabled = value;
}
