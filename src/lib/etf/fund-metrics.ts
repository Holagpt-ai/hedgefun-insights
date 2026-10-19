/**
 * Reported fund fields versus metrics that this product cannot verify.
 * Database values are shown only when the column's meaning is a stored report,
 * and a row timestamp is never treated as a fresh market observation.
 */

import { formatSessionDate } from "@/lib/market-calendar";
import type { NormalizedBar } from "@/lib/stock-chart/normalize-bars";
import { descriptiveProfile } from "./descriptive-profile";
import { formatPriceReturn, observedPriceRange, priceReturnForPeriod } from "./price-performance";
import { classifySnapshotDayVolume } from "./snapshot-volume";

export const UNAVAILABLE = "Unavailable";

export interface DisplayStat {
  label: string;
  value: string;
  tone?: "up" | "down";
}

export interface FundDetailRow {
  label: string;
  value: string;
  kind: "descriptive" | "reported" | "unavailable";
}

function finitePositive(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) return null;
  return value;
}

function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

export function formatReportedAum(value: unknown): string | null {
  const amount = finitePositive(value);
  if (amount === null) return null;
  if (amount >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(0)}M`;
  return `$${amount.toLocaleString("en-US")}`;
}

export function formatReportedExpenseRatio(value: unknown): string | null {
  const ratio = finiteNonNegative(value);
  if (ratio === null || ratio > 20) return null;
  return `${ratio.toFixed(2)}%`;
}

export function formatShareVolume(value: unknown): string | null {
  const volume = finitePositive(value);
  if (volume === null) return null;
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(1)}B`;
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
  return volume.toLocaleString("en-US");
}

export function formatInceptionDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  return utc.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatPx(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNAVAILABLE;
  return `$${value.toFixed(2)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export interface EtfReportedRecord {
  total_assets?: number | null;
  expense_ratio?: number | null;
  holdings?: number | null;
  volume?: number | null;
  inception_date?: string | null;
  provider?: string | null;
  asset_class?: string | null;
  name?: string | null;
  updated_at?: string | null;
}

function formatCoverageSpan(fromDate: string, toDate: string): string {
  return `${formatSessionDate(fromDate)} – ${formatSessionDate(toDate)}`;
}

function priceRangeStatLabels(range: NonNullable<ReturnType<typeof observedPriceRange>>): {
  highLabel: string;
  lowLabel: string;
} {
  if (range.coverage === "fifty_two_week") {
    return { highLabel: "52W High", lowLabel: "52W Low" };
  }
  if (range.coverage === "since_inception") {
    return { highLabel: "High since inception", lowLabel: "Low since inception" };
  }
  const span = formatCoverageSpan(range.fromDate, range.toDate);
  return {
    highLabel: `Observed high · ${span}`,
    lowLabel: `Observed low · ${span}`,
  };
}

export function buildEtfStatGrid(input: {
  record: EtfReportedRecord | null;
  snapshot: unknown;
  history: NormalizedBar[] | null;
  listDate: string | null;
  now?: Date;
}): DisplayStat[] {
  const now = input.now ?? new Date();
  const aum = formatReportedAum(input.record?.total_assets);
  const expense = formatReportedExpenseRatio(input.record?.expense_ratio);
  const inceptionIso = input.listDate ?? input.record?.inception_date ?? null;
  const priceRange = input.history ? observedPriceRange(input.history, now, inceptionIso) : null;
  const rangeLabels = priceRange ? priceRangeStatLabels(priceRange) : null;
  const ytd = input.history ? priceReturnForPeriod(input.history, "YTD", now) : null;
  const volumeView = classifySnapshotDayVolume(input.snapshot, now);
  const reportedVolume = formatShareVolume(input.record?.volume);
  const inception = formatInceptionDate(input.listDate) ?? formatInceptionDate(input.record?.inception_date);

  const ytdValue = ytd ? formatPriceReturn(ytd.displayPercent) : UNAVAILABLE;
  const ytdTone = ytd && ytd.displayPercent > 0 ? "up" : ytd && ytd.displayPercent < 0 ? "down" : undefined;

  let volumeStat: DisplayStat;
  if (volumeView?.kind === "current_session") {
    volumeStat = {
      label: "Session volume",
      value: formatShareVolume(volumeView.volume) ?? UNAVAILABLE,
    };
  } else if (volumeView?.kind === "prior_session") {
    const sessionNote = volumeView.observationSessionDate
      ? ` · ${volumeView.observationSessionDate}`
      : "";
    volumeStat = {
      label: `Prior session volume${sessionNote}`,
      value: formatShareVolume(volumeView.volume) ?? UNAVAILABLE,
    };
  } else {
    volumeStat = {
      label: "Reported volume",
      value: reportedVolume ?? UNAVAILABLE,
    };
  }

  return [
    { label: "Reported AUM", value: aum ?? UNAVAILABLE },
    { label: "Expense ratio", value: expense ?? UNAVAILABLE },
    {
      label: rangeLabels?.highLabel ?? "52W High",
      value: formatPx(priceRange?.high ?? null),
    },
    {
      label: rangeLabels?.lowLabel ?? "52W Low",
      value: formatPx(priceRange?.low ?? null),
    },
    volumeStat,
    { label: "Avg volume", value: UNAVAILABLE },
    { label: "YTD price return", value: ytdValue, tone: ytdTone },
    { label: "Inception date", value: inception ?? UNAVAILABLE },
  ];
}

export function buildFundDetailRows(input: {
  symbol: string;
  record: EtfReportedRecord | null;
  providerDescription: string | null;
}): { description: string | null; descriptionKind: "profile" | "provider" | "none"; rows: FundDetailRow[] } {
  const profile = descriptiveProfile(input.symbol);
  const provider = input.record?.provider?.trim() || profile?.provider || null;
  const assetClass = input.record?.asset_class?.trim() || profile?.assetClass || null;
  const holdingsCount = finitePositive(input.record?.holdings);
  const holdingsValue = holdingsCount !== null
    ? `${Math.round(holdingsCount).toLocaleString("en-US")}`
    : null;

  const row = (
    label: string,
    value: string | null,
    kind: FundDetailRow["kind"],
  ): FundDetailRow => ({
    label,
    value: value ?? UNAVAILABLE,
    kind: value ? kind : "unavailable",
  });

  return {
    description: profile?.description ?? (input.providerDescription?.trim() || null),
    descriptionKind: profile ? "profile" : input.providerDescription?.trim() ? "provider" : "none",
    rows: [
      row("Provider", provider, "reported"),
      row("Benchmark", profile?.benchmark ?? null, "descriptive"),
      row("Category", profile?.category ?? null, "descriptive"),
      row("Asset class", assetClass, input.record?.asset_class ? "reported" : "descriptive"),
      row("Region", profile?.region ?? null, "descriptive"),
      row("Style", profile?.style ?? null, "descriptive"),
      row("Holdings count", holdingsValue, "reported"),
      row("Dividend yield", null, "unavailable"),
      row("P/E ratio", null, "unavailable"),
      row("Beta", null, "unavailable"),
      row("Strategy", profile?.strategy ?? null, "descriptive"),
    ],
  };
}
