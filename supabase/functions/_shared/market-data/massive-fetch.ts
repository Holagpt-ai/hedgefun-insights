/**
 * Massive/Polygon fetch with bounded retries.
 * Each HTTP attempt is counted. A non-OK response is returned as a failure,
 * never rewritten into an empty quote or chart.
 */

import { noteMassiveAttempt } from "./market-data-meters.ts";

export const MASSIVE_MAX_ATTEMPTS = 3;

export type MassiveFetchResult =
  | { kind: "response"; response: Response; attempts: number }
  | { kind: "quota"; attempts: number }
  | { kind: "network_error"; attempts: number };

export async function fetchMassive(
  url: string,
  opts?: {
    beforeAttempt?: () => Promise<boolean> | boolean;
    maxAttempts?: number;
    delayMs?: number;
    fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<MassiveFetchResult> {
  const maxAttempts = opts?.maxAttempts ?? MASSIVE_MAX_ATTEMPTS;
  const delayMs = opts?.delayMs ?? 500;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let attempts = 0;
  let last: Response | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    const allowed = opts?.beforeAttempt ? await opts.beforeAttempt() : true;
    if (!allowed) {
      return last
        ? { kind: "response", response: last, attempts }
        : { kind: "quota", attempts };
    }
    attempts += 1;
    noteMassiveAttempt();
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (response.ok) return { kind: "response", response, attempts };
      last = response;
      if (response.status === 429) {
        if (i === maxAttempts - 1) return { kind: "network_error", attempts };
        await sleep(delayMs * 3);
        continue;
      }
      if (i === maxAttempts - 1) return { kind: "response", response, attempts };
    } catch {
      if (i === maxAttempts - 1) return { kind: "network_error", attempts };
    }
    await sleep(delayMs * (i + 1));
  }

  return last
    ? { kind: "response", response: last, attempts }
    : { kind: "network_error", attempts };
}
