/** User-facing copy: observation time vs in-app notification delivery. */

export function formatPriceAlertToastDescription(input: {
  observedPrice: number;
  thresholdLabel: string;
  dataLatency: string;
  triggeredAt: string;
}): string {
  const observed = `Observed $${input.observedPrice.toFixed(2)} vs ${input.thresholdLabel} (${input.dataLatency})`;
  const when = formatObservationEt(input.triggeredAt);
  return when ? `${observed}\nMarket observation: ${when} ET` : observed;
}

function formatObservationEt(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}
