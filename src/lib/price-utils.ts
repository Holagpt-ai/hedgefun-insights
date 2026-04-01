/**
 * Shared price resolution utilities used site-wide.
 * Single source of truth for current-price fallback chains and market-session detection.
 */

/** Resolve the best available price from a Polygon snapshot/ticker object. */
export function resolveCurrentPrice(ticker: any): number {
  const dayClose = ticker?.day?.c;
  const minClose = ticker?.min?.c;
  const lastTrade = ticker?.lastTrade?.p;
  const prevClose = ticker?.prevDay?.c;

  if (dayClose && dayClose > 0) return dayClose;
  if (minClose && minClose > 0) return minClose;
  if (lastTrade && lastTrade > 0) return lastTrade;
  if (prevClose && prevClose > 0) return prevClose;
  return 0;
}

/** Determine the current US equity market session based on Eastern Time. */
export function resolveMarketSession(): "pre-market" | "market" | "after-hours" | "closed" {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = etStr.split(":").map(Number);
  const mins = h * 60 + m;

  if (mins >= 240 && mins < 570) return "pre-market";
  if (mins >= 570 && mins <= 960) return "market";
  if (mins > 960 && mins <= 1200) return "after-hours";
  return "closed";
}

/** Build a human-readable session price label (e.g. "After-hours: $650.09 −0.25 (−0.04%)"). */
export function resolveSessionLabel(
  session: string,
  price: number,
  change: number,
  changePercent: number,
): string {
  const sign = change >= 0 ? "+" : "";
  const priceStr = `$${price.toFixed(2)} ${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;

  if (session === "pre-market") return `Pre-market: ${priceStr}`;
  if (session === "after-hours") return `After-hours: ${priceStr}`;
  return "";
}

/** Get Eastern-Time formatted date string. */
export function estDate(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Get Eastern-Time formatted time string. */
export function estTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
