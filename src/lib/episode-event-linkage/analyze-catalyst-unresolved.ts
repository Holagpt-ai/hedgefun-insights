import type { CatalystFeedRow } from "@/lib/episode-event-linkage/catalyst-corporate-event-adapter";
import { resolveCatalystEventSecurityId } from "@/lib/episode-event-linkage/resolve-catalyst-security-id";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";

export type CatalystSymbolClassification =
  | "resolved"
  | "no_identity_match"
  | "ambiguous_symbol_at_date"
  | "ambiguous_current_symbol"
  | "ambiguous_provider_reference"
  | "missing_symbol"
  | "missing_event_date"
  | "invalid_symbol"
  | "not_in_eligible_universe"
  | "ineligible_ticker_type"
  | "ambiguous_eligible_exchange";

export interface EligibleTickerRow {
  symbol: string;
  exchange: string | null;
  name: string;
}

export interface CatalystUnresolvedSymbolStats {
  symbol: string;
  rowCount: number;
  earliestEventDate: string | null;
  latestEventDate: string | null;
  providers: Record<string, number>;
  eventTypes: Record<string, number>;
  classification: CatalystSymbolClassification;
}

export function buildEligibleTickerIndex(rows: readonly EligibleTickerRow[]): {
  bySymbol: Map<string, EligibleTickerRow[]>;
  uniqueSymbolCount: number;
} {
  const bySymbol = new Map<string, EligibleTickerRow[]>();
  for (const row of rows) {
    const symbol = row.symbol.trim().toUpperCase();
    if (!symbol) continue;
    const bucket = bySymbol.get(symbol) ?? [];
    bucket.push({ ...row, symbol });
    bySymbol.set(symbol, bucket);
  }
  return { bySymbol, uniqueSymbolCount: bySymbol.size };
}

export function classifyCatalystSymbolForCoverage(input: {
  symbol: string;
  store: SecurityIdentityStore;
  eligibleBySymbol: Map<string, EligibleTickerRow[]>;
}): CatalystSymbolClassification {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return "missing_symbol";
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return "invalid_symbol";

  const resolution = resolveCatalystEventSecurityId({
    store: input.store,
    symbol,
    eventDate: "2026-01-02",
    provider: "coverage_probe",
    providerArticleId: null,
    dedupeKey: `probe:${symbol}`,
  });
  if (resolution.status === "resolved") return "resolved";
  if (resolution.reason !== "no_identity_match") {
    return resolution.reason as CatalystSymbolClassification;
  }

  const eligible = input.eligibleBySymbol.get(symbol);
  if (!eligible || eligible.length === 0) return "not_in_eligible_universe";
  const exchanges = new Set(eligible.map((row) => row.exchange?.trim().toUpperCase() ?? ""));
  if (exchanges.size > 1) return "ambiguous_eligible_exchange";
  return "no_identity_match";
}

export function analyzeCatalystUnresolvedSymbols(input: {
  rows: readonly CatalystFeedRow[];
  store: SecurityIdentityStore;
  eligibleTickers: readonly EligibleTickerRow[];
}): {
  totalRows: number;
  resolvedRows: number;
  unresolvedRows: number;
  uniqueSymbols: number;
  uniqueUnresolvedSymbols: number;
  bySymbol: CatalystUnresolvedSymbolStats[];
  classificationCounts: Record<string, number>;
  unresolvedReasonCounts: Record<string, number>;
} {
  const { bySymbol: eligibleBySymbol } = buildEligibleTickerIndex(input.eligibleTickers);
  const symbolAgg = new Map<string, {
    rowCount: number;
    earliest: string | null;
    latest: string | null;
    providers: Map<string, number>;
    eventTypes: Map<string, number>;
  }>();

  let resolvedRows = 0;
  const unresolvedReasonCounts: Record<string, number> = {};

  for (const row of input.rows) {
    const symbol = row.symbol.trim().toUpperCase();
    const eventDate = row.event_date?.slice(0, 10) ?? null;
    const resolution = resolveCatalystEventSecurityId({
      store: input.store,
      symbol: row.symbol,
      eventDate,
      provider: row.provider,
      providerArticleId: row.provider_article_id,
      dedupeKey: row.dedupe_key,
      facts: row.facts ?? null,
    });
    if (resolution.status === "resolved") {
      resolvedRows += 1;
      continue;
    }
    unresolvedReasonCounts[resolution.reason] = (unresolvedReasonCounts[resolution.reason] ?? 0) + 1;

    const bucket = symbolAgg.get(symbol) ?? {
      rowCount: 0,
      earliest: null,
      latest: null,
      providers: new Map<string, number>(),
      eventTypes: new Map<string, number>(),
    };
    bucket.rowCount += 1;
    if (eventDate) {
      bucket.earliest = bucket.earliest == null || eventDate < bucket.earliest ? eventDate : bucket.earliest;
      bucket.latest = bucket.latest == null || eventDate > bucket.latest ? eventDate : bucket.latest;
    }
    bucket.providers.set(row.provider, (bucket.providers.get(row.provider) ?? 0) + 1);
    bucket.eventTypes.set(row.event_type, (bucket.eventTypes.get(row.event_type) ?? 0) + 1);
    symbolAgg.set(symbol, bucket);
  }

  const classificationCounts: Record<string, number> = {};
  const bySymbol: CatalystUnresolvedSymbolStats[] = [];
  for (const [symbol, agg] of symbolAgg.entries()) {
    const classification = classifyCatalystSymbolForCoverage({
      symbol,
      store: input.store,
      eligibleBySymbol,
    });
    classificationCounts[classification] = (classificationCounts[classification] ?? 0) + 1;
    bySymbol.push({
      symbol,
      rowCount: agg.rowCount,
      earliestEventDate: agg.earliest,
      latestEventDate: agg.latest,
      providers: Object.fromEntries(agg.providers),
      eventTypes: Object.fromEntries(agg.eventTypes),
      classification,
    });
  }

  bySymbol.sort((a, b) => b.rowCount - a.rowCount);

  return {
    totalRows: input.rows.length,
    resolvedRows,
    unresolvedRows: input.rows.length - resolvedRows,
    uniqueSymbols: new Set(input.rows.map((row) => row.symbol.trim().toUpperCase())).size,
    uniqueUnresolvedSymbols: bySymbol.length,
    bySymbol,
    classificationCounts,
    unresolvedReasonCounts,
  };
}
