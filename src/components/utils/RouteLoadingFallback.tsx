/** Shown while a lazy route chunk loads; keeps layout chrome from parent layouts when nested. */
export function RouteLoadingFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}
