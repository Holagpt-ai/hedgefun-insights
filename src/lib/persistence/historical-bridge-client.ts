import { HISTORICAL_BACKFILL_WRITE_BATCH_SIZE } from "@/config/historical-backfill.config";

export const DEFAULT_HISTORICAL_BRIDGE_TIMEOUT_MS = 60_000;
export const HISTORICAL_BRIDGE_PAGE_LIMIT = 500;
export const HISTORICAL_BRIDGE_MAX_ATTEMPTS = 3;

export class HistoricalBridgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HistoricalBridgeError";
  }
}

class RetryableBridgeError extends Error {
  constructor(readonly status: number) {
    super("retryable");
    this.name = "RetryableBridgeError";
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof RetryableBridgeError) || attempt >= HISTORICAL_BRIDGE_MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(Math.min(250 * attempt, 2000));
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type HistoricalBridgeClientOptions = {
  bridgeUrl: string;
  workerSecret: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function requireHistoricalBridgeConfig(): { bridgeUrl: string; workerSecret: string } {
  const bridgeUrl = (process.env.RADAR_BRIDGE_URL ?? "").trim();
  const workerSecret = (process.env.RADAR_WORKER_SECRET ?? "").trim();
  if (!bridgeUrl) throw new Error("RADAR_BRIDGE_URL is required");
  if (!workerSecret) throw new Error("RADAR_WORKER_SECRET is required");
  if (!bridgeUrl.startsWith("https://")) throw new Error("RADAR_BRIDGE_URL must use https");
  return { bridgeUrl, workerSecret };
}

export class HistoricalBridgeClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: HistoricalBridgeClientOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_HISTORICAL_BRIDGE_TIMEOUT_MS;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async call(action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const requestId = crypto.randomUUID();
    const payload = JSON.stringify({ action, ...body, request_id: requestId });
    return withRetry(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(this.opts.bridgeUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.opts.workerSecret}`,
            "Content-Type": "application/json",
          },
          body: payload,
          signal: ctrl.signal,
        });
        if (res.status === 401) {
          throw new HistoricalBridgeError("bridge unauthorized", 401);
        }
        const text = await res.text();
        if (!res.ok && isRetryableStatus(res.status)) {
          let parsed: unknown = null;
          if (text.trim()) {
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = null;
            }
          }
          if (isRecord(parsed) && parsed.ok === false && parsed.error === "persist_failed") {
            const detail = typeof parsed.detail === "string" ? parsed.detail : "persist_failed";
            throw new HistoricalBridgeError(detail, res.status);
          }
          throw new RetryableBridgeError(res.status);
        }
        let parsed: unknown = null;
        if (text.trim()) {
          try {
            parsed = JSON.parse(text);
          } catch {
            throw new HistoricalBridgeError("bridge invalid json", 502);
          }
        }
        if (!res.ok) {
          if (isRecord(parsed) && parsed.ok === false && parsed.error === "persist_failed") {
            const detail = typeof parsed.detail === "string" ? parsed.detail : "persist_failed";
            throw new HistoricalBridgeError(detail, res.status);
          }
          const reason = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : "bridge_http_error";
          throw new HistoricalBridgeError(reason, res.status);
        }
        if (!isRecord(parsed)) throw new HistoricalBridgeError("bridge empty response", 502);
        if (parsed.error === "invalid_body" || parsed.error === "unknown_action") {
          throw new HistoricalBridgeError(String(parsed.error), 400);
        }
        if (parsed.ok === false && parsed.error === "persist_failed") {
          const detail = typeof parsed.detail === "string" ? parsed.detail : "persist_failed";
          throw new HistoricalBridgeError(detail, 502);
        }
        return parsed;
      } catch (error) {
        if (error instanceof HistoricalBridgeError || error instanceof RetryableBridgeError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          throw new RetryableBridgeError(504);
        }
        throw new RetryableBridgeError(503);
      } finally {
        clearTimeout(timer);
      }
    }, this.sleep);
  }

  async fetchAllRows(
    action: string,
    baseBody: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let offset = 0;
    for (;;) {
      const page = await this.call(action, {
        ...baseBody,
        page_offset: offset,
        page_limit: HISTORICAL_BRIDGE_PAGE_LIMIT,
      });
      const chunk = Array.isArray(page.rows) ? page.rows as Record<string, unknown>[] : [];
      rows.push(...chunk);
      if (page.has_more !== true || chunk.length === 0) break;
      offset += chunk.length;
      if (offset > 500_000) throw new HistoricalBridgeError("bridge pagination limit exceeded", 502);
    }
    return rows;
  }
}

export const historicalBridgeBatchSize = HISTORICAL_BACKFILL_WRITE_BATCH_SIZE;
