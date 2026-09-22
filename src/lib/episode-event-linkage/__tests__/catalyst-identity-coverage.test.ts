import { describe, expect, it } from "vitest";
import {
  analyzeCatalystUnresolvedSymbols,
  buildEligibleTickerIndex,
} from "@/lib/episode-event-linkage/analyze-catalyst-unresolved";
import { selectCatalystIdentityExpansionCandidates } from "@/lib/episode-event-linkage/expand-catalyst-identity-coverage";
import type { CatalystFeedRow } from "@/lib/episode-event-linkage/catalyst-corporate-event-adapter";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { SecurityId } from "@/types/security-identity";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111" as SecurityId;

function feed(overrides: Partial<CatalystFeedRow> = {}): CatalystFeedRow {
  return {
    dedupe_key: "dedupe-1",
    symbol: "ZZZZ",
    event_type: "earnings",
    event_date: "2024-05-02",
    event_time: null,
    title: "Example headline",
    description: null,
    source_name: "Polygon",
    source_url: null,
    provider: "polygon",
    provider_article_id: "article-1",
    published_at: "2024-05-02T12:00:00.000Z",
    facts: {},
    ...overrides,
  };
}

describe("catalyst identity coverage", () => {
  it("loads eligible ticker index with unique symbol counts", () => {
    const index = buildEligibleTickerIndex([
      { symbol: "AAA", exchange: "NASDAQ", name: "Alpha" },
      { symbol: "AAA", exchange: "NYSE", name: "Alpha B" },
    ]);
    expect(index.uniqueSymbolCount).toBe(1);
    expect(index.bySymbol.get("AAA")).toHaveLength(2);
  });

  it("classifies unresolved symbols outside eligible universe separately", () => {
    const store = new SecurityIdentityStore();
    store.loadState({ securities: [], history: [], identifiers: [] });
    const analysis = analyzeCatalystUnresolvedSymbols({
      rows: [feed({ symbol: "NOELIG" })],
      store,
      eligibleTickers: [{ symbol: "AAA", exchange: "NASDAQ", name: "Alpha" }],
    });
    expect(analysis.unresolvedRows).toBe(1);
    expect(analysis.bySymbol[0]?.classification).toBe("not_in_eligible_universe");
  });

  it("accepts expansion-shaped observations in SecurityIdentityStore", () => {
    const store = new SecurityIdentityStore();
    store.loadState({ securities: [], history: [], identifiers: [] });
    const result = store.resolve({
      symbol: "NEWCO",
      exchange: "NASDAQ",
      effectiveDate: "2024-03-01",
      issuerName: "New Co",
      securityType: "COMMON_STOCK",
      country: "US",
      adrStatus: "NOT_ADR",
      provenance: "PROVIDER",
      source: "catalyst_identity_coverage_v1",
      sourceAsOf: "2026-01-01T00:00:00.000Z",
      observedAt: "2026-01-01T00:00:00.000Z",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.securityId).toBeTruthy();
    expect(result.created).toBe(true);
  });

  it("selects expansion candidates only for uniquely-listed eligible tickers", () => {
    const candidates = selectCatalystIdentityExpansionCandidates({
      unresolvedSymbols: [{
        symbol: "NEWCO",
        classification: "no_identity_match",
        earliestEventDate: "2024-03-01",
        rowCount: 12,
      }],
      eligibleTickers: [{ symbol: "NEWCO", exchange: "NASDAQ", name: "New Co" }],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.exchange).toBe("NASDAQ");
  });

  it("rejects ambiguous eligible exchange listings", () => {
    const store = new SecurityIdentityStore();
    store.loadState({ securities: [], history: [], identifiers: [] });
    const analysis = analyzeCatalystUnresolvedSymbols({
      rows: [feed({ symbol: "DUAL" })],
      store,
      eligibleTickers: [
        { symbol: "DUAL", exchange: "NASDAQ", name: "A" },
        { symbol: "DUAL", exchange: "NYSE", name: "B" },
      ],
    });
    expect(analysis.bySymbol[0]?.classification).toBe("ambiguous_eligible_exchange");
  });

  it("resolves rows when security history covers the event date", () => {
    const store = new SecurityIdentityStore();
    store.loadState({
      securities: [{
        securityId: SECURITY_ID,
        currentSymbol: "HIST",
        issuerName: "Hist",
        securityType: "COMMON_STOCK",
        exchange: "NASDAQ",
        country: "US",
        adrStatus: "NOT_ADR",
        active: true,
        resolutionState: "RESOLVED",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      history: [{
        securityId: SECURITY_ID,
        symbol: "HIST",
        exchange: "NASDAQ",
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
        source: "test",
        sourceAsOf: null,
        provenance: "INTERNAL",
        observedAt: null,
        fetchedAt: null,
      }],
      identifiers: [],
    });
    const analysis = analyzeCatalystUnresolvedSymbols({
      rows: [feed({ symbol: "HIST", event_date: "2024-05-02" })],
      store,
      eligibleTickers: [],
    });
    expect(analysis.resolvedRows).toBe(1);
    expect(analysis.unresolvedRows).toBe(0);
  });
});
