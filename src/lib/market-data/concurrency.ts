export function createConcurrencyGate(limit: number) {
  const max = Math.max(1, limit);
  let active = 0;
  const waiting: Array<() => void> = [];

  async function acquire() {
    if (active >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
      return;
    }
    active += 1;
  }

  function release() {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }

  return {
    get active() {
      return active;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const out: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return out;
}
