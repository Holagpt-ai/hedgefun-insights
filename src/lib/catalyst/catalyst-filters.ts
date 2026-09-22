// Lightweight Catalyst tab filters (pure).

import type { CatalystDisplayCategory } from "@/lib/catalyst/catalyst-event-visuals";

export const CATALYST_CATEGORY_FILTERS = [
  "all",
  "earnings",
  "sec_filings",
  "offerings",
  "fda_regulatory",
  "contracts_partnerships",
  "other",
] as const;

export type CatalystCategoryFilter = (typeof CATALYST_CATEGORY_FILTERS)[number];

export const CATALYST_CATEGORY_FILTER_LABEL: Record<CatalystCategoryFilter, string> = {
  all: "All",
  earnings: "Earnings",
  sec_filings: "SEC Filings",
  offerings: "Offerings",
  fda_regulatory: "FDA / Regulatory",
  contracts_partnerships: "Contracts / Partnerships",
  other: "Other",
};

const FILTER_CATEGORIES: Record<
  Exclude<CatalystCategoryFilter, "all" | "other">,
  readonly CatalystDisplayCategory[]
> = {
  earnings: ["EARNINGS", "GUIDANCE"],
  sec_filings: ["SEC_FILING"],
  offerings: ["OFFERING"],
  fda_regulatory: ["FDA_REGULATORY"],
  contracts_partnerships: ["CONTRACT_AWARD", "PARTNERSHIP"],
};

export function matchesCatalystCategoryFilter(
  filter: CatalystCategoryFilter,
  category: CatalystDisplayCategory,
): boolean {
  if (filter === "all") return true;
  if (filter === "other") {
    return !Object.values(FILTER_CATEGORIES).some((list) => list.includes(category));
  }
  return FILTER_CATEGORIES[filter].includes(category);
}

export const CATALYST_RECENCY_FILTERS = ["any", "today", "recent", "has_history"] as const;
export type CatalystRecencyFilter = (typeof CATALYST_RECENCY_FILTERS)[number];

export const CATALYST_RECENCY_FILTER_LABEL: Record<CatalystRecencyFilter, string> = {
  any: "Any Time",
  today: "Today",
  recent: "Recent",
  has_history: "Has Historical Context",
};

const RECENT_WINDOW_HOURS = 72;

export function matchesCatalystRecencyFilter(input: {
  filter: CatalystRecencyFilter;
  publishedAtIso: string | null;
  eventDate: string | null;
  hasHistoricalContext: boolean;
  nowMs: number;
}): boolean {
  const { filter } = input;
  if (filter === "any") return true;
  if (filter === "has_history") return input.hasHistoricalContext;

  const stampMs = input.publishedAtIso ? Date.parse(input.publishedAtIso) : Number.NaN;
  if (filter === "recent") {
    if (!Number.isFinite(stampMs)) return false;
    return input.nowMs - stampMs <= RECENT_WINDOW_HOURS * 3_600_000;
  }

  // today
  const today = new Date(input.nowMs).toISOString().slice(0, 10);
  if (input.eventDate === today) return true;
  if (!Number.isFinite(stampMs)) return false;
  return new Date(stampMs).toISOString().slice(0, 10) === today;
}
