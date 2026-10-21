export async function withBoundedRetry<T>(
  operation: () => Promise<T>,
  options: {
    retryCount: number;
    retryBackoffMs: number;
    sleep: (ms: number) => Promise<void>;
    /** Invoked immediately before each attempt (including retries). */
    beforeAttempt?: () => void;
  },
): Promise<T> {
  const attempts = options.retryCount + 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    options.beforeAttempt?.();
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await options.sleep(options.retryBackoffMs * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("provider request failed");
}
