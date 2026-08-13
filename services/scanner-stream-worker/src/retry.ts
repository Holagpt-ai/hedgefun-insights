export class RetryableError extends Error {
  readonly code = "provider_unavailable" as const;
  readonly status: number;
  constructor(status: number, message = "provider_unavailable") {
    super(message);
    this.name = "RetryableError";
    this.status = status;
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
  sleep?: (ms: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

function defaultShouldRetry(error: unknown): boolean {
  return error instanceof RetryableError;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const maxDelayMs = opts.maxDelayMs ?? 8_000;
  const jitter = opts.jitter ?? 0.2;
  const sleep = opts.sleep ?? defaultSleep;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === maxAttempts) throw error;
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const spread = exp * jitter * (Math.random() * 2 - 1);
      await sleep(Math.max(0, Math.round(exp + spread)));
    }
  }
  throw lastError;
}
