/**
 * Screener Intelligence UI V1 — pure presentation helpers.
 *
 * Consumes already-normalized values. Does not score, rank, or wire live tables.
 */

import { CONTINUATION_CATEGORY_PRIORITY } from "@/config/continuation.config";
import {
  CATALYST_DISPLAY_LABELS,
  CONTINUATION_BADGE_LABELS,
  SCREENER_INTELLIGENCE_COLUMNS,
  SCREENER_INTELLIGENCE_TOOLTIPS,
  SCREENER_INTELLIGENCE_UNAVAILABLE,
  SCREENER_INTELLIGENCE_UI_FLAGS,
  SHORT_FLOAT_FRESHNESS_LABELS,
  TRADE_QUALITY_DISPLAY_LABELS,
  TRIGGER_SUMMARY_LINE_LABELS,
  type ScreenerIntelligenceColumnDefinition,
  type ScreenerIntelligenceColumnId,
  type ScreenerIntelligenceFlags,
  type ScreenerIntelligenceFlagKey,
} from "@/config/screener-intelligence-ui.config";
import { isFiniteNumber, isPositiveFinite, parseTimestampMs } from "@/lib/screeners/contract";
import { easternParts } from "@/lib/market-session";
import type {
  ContinuationBadgePresentation,
  MobileIntelligencePresentation,
  ScreenerIntelligenceDisplayInput,
  ShortFloatPresentation,
  TradeQualityPresentation,
  TriggerPresentation,
} from "@/types/screener-intelligence-ui";
import type { ContinuationCategory } from "@/config/continuation.config";
import type { TriggerSummary } from "@/types/trigger-time";

export const UNAVAILABLE_DISPLAY = SCREENER_INTELLIGENCE_UNAVAILABLE;

export function resolveIntelligenceFlags(
  overrides?: Partial<ScreenerIntelligenceFlags>,
): ScreenerIntelligenceFlags {
  return { ...SCREENER_INTELLIGENCE_UI_FLAGS, ...overrides };
}

export function isIntelligenceColumnActive(
  column: ScreenerIntelligenceColumnDefinition,
  flags: ScreenerIntelligenceFlags = SCREENER_INTELLIGENCE_UI_FLAGS,
): boolean {
  if (column.rollout === "existing") return true;
  if (!column.flag) return false;
  return flags[column.flag] === true;
}

export function getIntelligenceColumn(
  id: ScreenerIntelligenceColumnId,
): ScreenerIntelligenceColumnDefinition | undefined {
  return SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === id);
}

export function getIntelligenceTooltip(
  id: keyof typeof SCREENER_INTELLIGENCE_TOOLTIPS,
): string {
  return SCREENER_INTELLIGENCE_TOOLTIPS[id];
}

export function visibleIntelligenceColumns(
  flags: Partial<ScreenerIntelligenceFlags> = {},
): ScreenerIntelligenceColumnDefinition[] {
  const resolved = resolveIntelligenceFlags(flags);
  return SCREENER_INTELLIGENCE_COLUMNS.filter((column) => isIntelligenceColumnActive(column, resolved));
}

function finiteDisplayNumber(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null;
  return value;
}

export function formatCompactDollarVolume(value: number | null | undefined): string {
  const n = finiteDisplayNumber(value);
  if (n === null || n < 0) return UNAVAILABLE_DISPLAY;
  if (n === 0) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatRatio(value: number | null | undefined): string {
  const n = finiteDisplayNumber(value);
  if (n === null || n < 0) return UNAVAILABLE_DISPLAY;
  return `${n.toFixed(1)}x`;
}

export function formatPercent(value: number | null | undefined): string {
  const n = finiteDisplayNumber(value);
  if (n === null) return UNAVAILABLE_DISPLAY;
  return `${n.toFixed(1)}%`;
}

export function formatSignedMove(value: number | null | undefined): string {
  const n = finiteDisplayNumber(value);
  if (n === null) return UNAVAILABLE_DISPLAY;
  const abs = formatPercent(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

export function formatCompactVolume(value: number | null | undefined): string {
  const n = finiteDisplayNumber(value);
  if (n === null || n < 0) return UNAVAILABLE_DISPLAY;
  if (n === 0) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function formatDiscoveryRank(rank: number | null | undefined): string {
  if (!isFiniteNumber(rank) || rank <= 0 || !Number.isInteger(rank)) return UNAVAILABLE_DISPLAY;
  return `#${rank}`;
}

export function formatPrice(value: number | null | undefined): string {
  if (!isPositiveFinite(value)) return UNAVAILABLE_DISPLAY;
  return `$${value.toFixed(2)}`;
}

export function formatTriggerMarketTime(value: string | null | undefined): string {
  const ms = parseTimestampMs(value);
  if (ms === null) return UNAVAILABLE_DISPLAY;
  const parts = easternParts(ms);
  if (!parts) return UNAVAILABLE_DISPLAY;
  const hour24 = parts.hour;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minute = String(parts.minute).padStart(2, "0");
  return `${hour12}:${minute} ${suffix}`;
}

export function formatFreshness(state: string | null | undefined): string | null {
  if (!state) return null;
  return SHORT_FLOAT_FRESHNESS_LABELS[state as keyof typeof SHORT_FLOAT_FRESHNESS_LABELS] ?? null;
}

export function formatTradeQuality(input: {
  score?: number | null;
  label?: string | null;
  coveragePct?: number | null;
}): TradeQualityPresentation {
  if (input.label === "INCOMPLETE" || input.score == null || !isFiniteNumber(input.score)) {
    return {
      compact: "Incomplete",
      label: TRADE_QUALITY_DISPLAY_LABELS.INCOMPLETE,
      coverage: isFiniteNumber(input.coveragePct) ? `Coverage ${Math.round(input.coveragePct)}%` : null,
      incomplete: true,
    };
  }
  const labelKey = input.label as keyof typeof TRADE_QUALITY_DISPLAY_LABELS | undefined;
  return {
    compact: String(Math.round(input.score)),
    label: labelKey && TRADE_QUALITY_DISPLAY_LABELS[labelKey] ? TRADE_QUALITY_DISPLAY_LABELS[labelKey] : "Scored",
    coverage: isFiniteNumber(input.coveragePct) ? `Coverage ${Math.round(input.coveragePct)}%` : null,
    incomplete: false,
  };
}

export function formatCatalystQuality(value: string | null | undefined): string {
  if (value == null || value === "UNKNOWN") return UNAVAILABLE_DISPLAY;
  return CATALYST_DISPLAY_LABELS[value as keyof typeof CATALYST_DISPLAY_LABELS] ?? UNAVAILABLE_DISPLAY;
}

export function formatShortFloat(input: {
  shortFloatPct?: number | null;
  freshness?: string | null;
  quality?: string | null;
  sourceAsOf?: string | null;
}): ShortFloatPresentation {
  if (input.quality === "DISCREPANCY") {
    return {
      compact: "Check",
      detail: "Provider and derived short float disagree.",
      freshness: formatFreshness(input.freshness),
      stale: input.freshness === "STALE",
      discrepancy: true,
    };
  }
  const compact = formatPercent(input.shortFloatPct);
  if (compact === UNAVAILABLE_DISPLAY) {
    return {
      compact: UNAVAILABLE_DISPLAY,
      detail: "Data unavailable",
      freshness: formatFreshness(input.freshness),
      stale: false,
      discrepancy: false,
    };
  }
  const freshness = formatFreshness(input.freshness);
  const asOf = formatTriggerMarketTime(input.sourceAsOf);
  return {
    compact,
    detail: [compact, asOf !== UNAVAILABLE_DISPLAY ? `As of ${asOf}` : null, freshness ? `Freshness: ${freshness}` : null]
      .filter(Boolean)
      .join(" · "),
    freshness,
    stale: input.freshness === "STALE",
    discrepancy: false,
  };
}

export function formatTriggerPresentation(summary: TriggerSummary | null | undefined): TriggerPresentation {
  if (!summary) {
    return { compact: UNAVAILABLE_DISPLAY, lines: [] };
  }
  const compact = formatTriggerMarketTime(summary.firstTriggerAt);
  const lines = (Object.keys(TRIGGER_SUMMARY_LINE_LABELS) as Array<keyof typeof TRIGGER_SUMMARY_LINE_LABELS>)
    .map((key) => {
      const value = formatTriggerMarketTime(summary[key]);
      if (value === UNAVAILABLE_DISPLAY) return null;
      return { label: TRIGGER_SUMMARY_LINE_LABELS[key], value };
    })
    .filter((line): line is { label: string; value: string } => line !== null);
  return { compact, lines };
}

export function formatContinuationBadges(
  categories: readonly ContinuationCategory[] | null | undefined,
): ContinuationBadgePresentation {
  if (!categories || categories.length === 0) {
    return { compact: UNAVAILABLE_DISPLAY, badges: [], extraCount: 0 };
  }
  const sorted = [...categories].sort(
    (a, b) => CONTINUATION_CATEGORY_PRIORITY[b] - CONTINUATION_CATEGORY_PRIORITY[a],
  );
  const badges = sorted.map((category) => CONTINUATION_BADGE_LABELS[category]);
  const extraCount = Math.max(0, badges.length - 1);
  return {
    compact: extraCount > 0 ? `${badges[0]} +${extraCount}` : badges[0] ?? UNAVAILABLE_DISPLAY,
    badges,
    extraCount,
  };
}

function columnValue(
  columnId: ScreenerIntelligenceColumnId,
  input: ScreenerIntelligenceDisplayInput,
): string {
  switch (columnId) {
    case "discoveryRank":
      return formatDiscoveryRank(input.discoveryRank);
    case "symbol":
      return input.symbol?.trim() ? input.symbol.trim().toUpperCase() : UNAVAILABLE_DISPLAY;
    case "price":
      return formatPrice(input.price);
    case "move":
      return formatSignedMove(input.movePct);
    case "volume":
      return formatCompactVolume(input.volume);
    case "dollarVolume":
      return formatCompactDollarVolume(input.dollarVolume);
    case "volumeRatioPrior":
      return formatRatio(input.volumeRatioPrior);
    case "rvol20d":
      return formatRatio(input.rvol20d);
    case "floatTurnover":
      return formatRatio(input.floatTurnover);
    case "shortFloat":
      return formatShortFloat({
        shortFloatPct: input.shortFloatPct,
        freshness: input.shortFloatFreshness,
        quality: input.shortFloatQuality,
        sourceAsOf: input.shortFloatSourceAsOf,
      }).compact;
    case "tradeQuality":
      return formatTradeQuality({
        score: input.tradeQualityScore,
        label: input.tradeQualityLabel,
        coveragePct: input.tradeQualityCoveragePct,
      }).compact;
    case "catalyst":
      return formatCatalystQuality(input.catalystQuality);
    case "triggerTime":
      return formatTriggerPresentation(input.triggerSummary).compact;
    case "continuation":
      return formatContinuationBadges(input.continuationCategories).compact;
  }
}

export function buildMobileIntelligencePresentation(
  input: ScreenerIntelligenceDisplayInput,
  flags?: Partial<ScreenerIntelligenceFlags>,
): MobileIntelligencePresentation {
  const resolved = resolveIntelligenceFlags(flags);
  const active = visibleIntelligenceColumns(resolved);

  const pick = (slot: ScreenerIntelligenceColumnDefinition["mobileSlot"]) =>
    active
      .filter((column) => column.mobileSlot === slot && column.id !== "discoveryRank" && column.id !== "symbol" && column.id !== "price" && column.id !== "move")
      .map((column) => ({
        slot,
        label: column.shortLabel,
        value: columnValue(column.id, input),
        columnId: column.id,
      }));

  return {
    header: {
      rank: formatDiscoveryRank(input.discoveryRank),
      symbol: input.symbol?.trim() ? input.symbol.trim().toUpperCase() : UNAVAILABLE_DISPLAY,
      price: formatPrice(input.price),
      move: formatSignedMove(input.movePct),
    },
    secondary: pick("secondary"),
    intelligence: pick("intelligence"),
    details: pick("details"),
  };
}

export function intelligenceFlagForColumn(
  id: ScreenerIntelligenceColumnId,
): ScreenerIntelligenceFlagKey | undefined {
  return getIntelligenceColumn(id)?.flag;
}
