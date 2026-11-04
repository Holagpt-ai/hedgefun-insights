/** Extend Edge CPU budget for non-critical follow-up after the HTTP response. */
export function deferEdgeWork(work: () => Promise<void>): void {
  const pending = work().catch(() => {});
  const waitUntil = (globalThis as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") waitUntil(pending);
}
