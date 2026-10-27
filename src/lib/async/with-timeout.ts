export class AsyncTimeoutError extends Error {
  readonly code = "ASYNC_TIMEOUT";

  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "AsyncTimeoutError";
  }
}

/** Rejects with {@link AsyncTimeoutError} when `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AsyncTimeoutError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
