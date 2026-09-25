import { useSyncExternalStore } from "react";

/**
 * One scanner-wide second clock.
 * Visible elapsed-age labels subscribe here instead of starting their own timers.
 */

let nowMs = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick(): void {
  nowMs = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  const starting = timer === null;
  listeners.add(listener);
  if (starting) {
    nowMs = Date.now();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return nowMs;
}

export function useScannerNowMs(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test hook: true only while at least one label is subscribed. */
export function scannerClockIsRunning(): boolean {
  return timer !== null;
}
