import { SCANNER_EVENT_DISPLAY } from "../radar-v22/scanner-events.ts";
import type { ScannerAlertFiring } from "./types.ts";

const CATALYST_LABELS: Record<string, string> = {
  earnings: "Earnings",
  sec_filing_news: "SEC Filing",
  corporate_action: "Corporate Action",
  fda_biotech: "FDA / Regulatory",
  product_contract: "Contract / Partnership",
  company_news: "Company News",
  merger_acquisition: "Merger / Acquisition",
  analyst_action: "Analyst Action",
};

function fmtVolume(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function fmtRvol(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  return `${n.toFixed(1)}x`;
}

function fmtPct(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtDateEt(isoDate: string | null): string | null {
  if (!isoDate) return null;
  try {
    return new Date(`${isoDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
  } catch {
    return isoDate.slice(0, 10);
  }
}

export function catalystDisplayLabel(
  eventType: string | null,
  title: string | null,
): string | null {
  if (!eventType) return null;
  const lower = (title ?? "").toLowerCase();
  if (lower.includes("split")) return "Stock Split";
  if (lower.includes("offering")) return "Offering";
  return CATALYST_LABELS[eventType] ?? eventType.replace(/_/g, " ");
}

export function buildScannerAlertCopy(input: {
  firing: ScannerAlertFiring;
  repeatMoverLabel: string | null;
  lastEpisodeDate: string | null;
  comparableCount: number | null;
  catalystLabel: string | null;
}): { headline: string; summary: string } {
  const sym = input.firing.symbol.toUpperCase();
  const eventLabel = SCANNER_EVENT_DISPLAY[input.firing.event_type] ??
    input.firing.event_type;
  const headline = `${sym} — ${eventLabel}`;

  const parts: string[] = [];
  const vol = fmtVolume(input.firing.today_volume);
  const rvol = fmtRvol(input.firing.rvol_5m);
  const vel = fmtVolume(input.firing.volume_velocity);
  const accel = fmtPct(input.firing.volume_acceleration_pct);

  const momentum: string[] = [];
  if (vol) momentum.push(`${vol} volume`);
  if (rvol) momentum.push(`${rvol} 5m RVOL`);
  if (vel) momentum.push(`${vel}/min velocity`);
  if (accel) momentum.push(`${accel} acceleration`);
  if (momentum.length > 0) {
    parts.push(`${eventLabel} with ${momentum.join(", ")}.`);
  } else {
    parts.push(`${eventLabel} detected on live scanner surveillance.`);
  }

  if (input.repeatMoverLabel) {
    parts.push(input.repeatMoverLabel);
  }
  if (input.lastEpisodeDate) {
    const d = fmtDateEt(input.lastEpisodeDate);
    if (d) parts.push(`Last significant Stocksist episode: ${d}.`);
  }
  if (input.comparableCount !== null && input.comparableCount > 0) {
    parts.push(
      `${input.comparableCount} comparable historical episode${
        input.comparableCount === 1 ? "" : "s"
      } available.`,
    );
  }

  if (input.catalystLabel) {
    parts.push(`Current catalyst: ${input.catalystLabel}.`);
  } else {
    parts.push("No verified catalyst.");
  }

  return { headline, summary: parts.join(" ") };
}

export function severityForEvent(
  eventType: ScannerAlertFiring["event_type"],
): "info" | "attention" | "high" {
  switch (eventType) {
    case "HOD_MOMENTUM":
      return "high";
    case "VOLUME_EXPLOSION":
      return "attention";
    default:
      return "info";
  }
}
