export const GENERATOR_INVOKE_TIMEOUT_MS = 100_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 750;

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Invoke generate-daily-brief from the dispatcher with project apikey, bounded
 * timeout, and one retry for transient gateway/cold-start failures.
 */
export async function fetchGenerateDailyBrief(args: {
  supabaseUrl: string;
  syncSecret: string;
  publishableKey: string;
  body: Record<string, unknown>;
  fetchImpl?: FetchLike;
}): Promise<Response> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = `${args.supabaseUrl.replace(/\/$/, "")}/functions/v1/generate-daily-brief`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${args.syncSecret}`,
    apikey: args.publishableKey,
  };
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(args.body),
        signal: AbortSignal.timeout(GENERATOR_INVOKE_TIMEOUT_MS),
      });
      if (attempt === 0 && RETRYABLE_STATUS.has(res.status)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      throw e;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("generator_invoke_failed");
}
