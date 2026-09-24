import { RADAR_CAPABILITIES } from "./radar-capabilities";

/**
 * Halt rail slot. Stocksist has no verified halt feed, so this stays hidden.
 * Do not infer halts from price. Future states: HALTED, RESUME PENDING, RESUME, RESUMED.
 */
export function HaltsRail({ verifiedHaltCount = 0 }: { verifiedHaltCount?: number | null }) {
  if (!RADAR_CAPABILITIES.halts || !verifiedHaltCount) return null;
  return (
    <section data-testid="halts-rail" className="rounded-lg border border-border bg-card px-3 py-2 text-[12px]">
      <div className="font-semibold tracking-wide">HALTS</div>
      <p className="text-muted-foreground">
        Volatility halt — reopening may move sharply in either direction.
      </p>
    </section>
  );
}
