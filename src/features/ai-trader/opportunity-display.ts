import { formatHistoricalMatchChip } from "@/lib/historical-intelligence/radar-handoff";
import type { HistoricalMatchSummary } from "@/lib/historical-intelligence/historical-match-summary";
import { formatScreenerRvol5m } from "@/lib/screeners/screener-metric-display";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function historicalChip(meta: Record<string, unknown>): string | null {
  const raw = meta.historicalMatchSummary;
  if (!raw || typeof raw !== "object") return null;
  return formatHistoricalMatchChip(raw as HistoricalMatchSummary);
}

/** Compact intelligence line for AI Trader opportunity rows (no fabricated values). */
export function formatOpportunityIntelLine(signal: StocksistSignal): string {
  const meta = signal.metadata ?? {};
  const parts: string[] = [];
  const event = str(meta.scannerEventLabel) ?? str(meta.scannerEvent) ?? str(signal.eventType);
  if (event) parts.push(event);

  const rvol5m = formatScreenerRvol5m(num(meta.rvol5m));
  if (rvol5m !== "—") parts.push(`5m ${rvol5m}`);

  const vel = num(meta.volumeVelocity);
  if (vel != null) parts.push(`vel ${Math.round(vel).toLocaleString()}/min`);

  const accel = str(meta.volumeAccelerationState);
  if (accel) parts.push(accel);

  const vwap = str(meta.vwapState);
  if (vwap) parts.push(`VWAP ${vwap}`);

  const hod = meta.hodState;
  if (typeof hod === "number" && Number.isFinite(hod)) {
    parts.push(`${hod.toFixed(1)}% from HOD`);
  } else if (typeof hod === "string" && hod.trim()) {
    parts.push(hod);
  }

  const hist = historicalChip(meta);
  if (hist) parts.push(hist);

  return parts.length > 0 ? parts.join(" · ") : "Intelligence unavailable";
}

export function formatRejectionSummary(reasons: readonly string[]): string {
  if (reasons.length === 0) return "Approved";
  return reasons.join(", ");
}
