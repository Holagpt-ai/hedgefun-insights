/**
 * Run sessionStorage / handoff writes after the current event turn so route
 * transitions are not blocked on the main thread (mobile Chrome).
 */
export function deferHandoffSideEffect(fn: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  setTimeout(fn, 0);
}
