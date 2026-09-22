import { describe, expect, it } from "vitest";
import { corporateEventIdFromDedupeKey } from "@/lib/episode-event-linkage/deterministic-ids";
import {
  adaptCatalystRowsToCorporateEvents,
  type CatalystFeedRow,
} from "@/lib/episode-event-linkage/catalyst-corporate-event-adapter";
import { resolveCatalystEventSecurityId } from "@/lib/episode-event-linkage/resolve-catalyst-security-id";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { SecurityId } from "@/types/security-identity";

const SECURITY_A = "11111111-1111-4111-8111-111111111111" as SecurityId;
const SECURITY_B = "22222222-2222-4222-8222-222222222222" as SecurityId;

function seedStore(): SecurityIdentityStore {
  const store = new SecurityIdentityStore(() => SECURITY_A);
  store.loadState({
    securities: [{
      securityId: SECURITY_A,
      currentSymbol: "AAA",
      issuerName: "Alpha",
      securityType: "COMMON",
      exchange: "NASDAQ",
      country: "US",
      adrStatus: "NONE",
      active: true,
      resolutionState: "RESOLVED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, {
      securityId: SECURITY_B,
      currentSymbol: "AAA",
      issuerName: "Beta",
      securityType: "COMMON",
      exchange: "NYSE",
      country: "US",
      adrStatus: "NONE",
      active: true,
      resolutionState: "RESOLVED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }],
    history: [{
      securityId: SECURITY_A,
      symbol: "AAA",
      exchange: "NASDAQ",
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
      source: "test",
      sourceAsOf: null,
      provenance: "INTERNAL",
      observedAt: null,
      fetchedAt: null,
    }, {
      securityId: SECURITY_B,
      symbol: "AAA",
      exchange: "NYSE",
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
      source: "test",
      sourceAsOf: null,
      provenance: "INTERNAL",
      observedAt: null,
      fetchedAt: null,
    }],
    identifiers: [{
      securityId: SECURITY_A,
      kind: "PROVIDER_REFERENCE",
      value: "polygon:article-1",
      source: "test",
      sourceAsOf: null,
      provenance: "PROVIDER",
      observedAt: null,
      fetchedAt: null,
    }],
  });
  return store;
}

function feedRow(overrides: Partial<CatalystFeedRow> = {}): CatalystFeedRow {
  return {
    dedupe_key: "dedupe-a",
    symbol: "AAA",
    event_type: "earnings",
    event_date: "2024-05-02",
    event_time: "2024-05-02T12:00:00.000Z",
    title: "Alpha reports earnings",
    description: null,
    source_name: "Polygon",
    source_url: "https://example.com/a",
    provider: "polygon",
    provider_article_id: "article-1",
    published_at: "2024-05-02T12:00:00.000Z",
    facts: {},
    ...overrides,
  };
}

describe("catalyst adapter + linker", () => {
  it("resolves provider reference before symbol fallback", () => {
    const store = seedStore();
    const resolution = resolveCatalystEventSecurityId({
      store,
      symbol: "AAA",
      eventDate: "2024-05-02",
      provider: "polygon",
      providerArticleId: "article-1",
      dedupeKey: "dedupe-a",
    });
    expect(resolution.status).toBe("resolved");
    if (resolution.status === "resolved") {
      expect(resolution.securityId).toBe(SECURITY_A);
      expect(resolution.method).toBe("provider_reference");
    }
  });

  it("rejects ambiguous symbol-at-date matches", () => {
    const store = seedStore();
    const resolution = resolveCatalystEventSecurityId({
      store,
      symbol: "AAA",
      eventDate: "2024-05-02",
      provider: "polygon",
      providerArticleId: null,
      dedupeKey: "dedupe-x",
    });
    expect(resolution.status).toBe("unresolved");
    if (resolution.status === "unresolved") {
      expect(resolution.reason).toBe("ambiguous_symbol_at_date");
    }
  });

  it("preserves distinct same-day events via unique dedupe keys", () => {
    const store = seedStore();
    const first = adaptCatalystRowsToCorporateEvents({
      rows: [feedRow({ dedupe_key: "dedupe-1", title: "Morning release" })],
      store,
      ingestedAt: "2026-09-22T00:00:00.000Z",
    });
    const second = adaptCatalystRowsToCorporateEvents({
      rows: [feedRow({ dedupe_key: "dedupe-2", title: "Afternoon filing" })],
      store,
      ingestedAt: "2026-09-22T00:00:00.000Z",
    });
    expect(first.corporateEvents).toHaveLength(1);
    expect(second.corporateEvents).toHaveLength(1);
    expect(first.corporateEvents[0]?.eventId).not.toBe(second.corporateEvents[0]?.eventId);
  });

  it("is idempotent on adapter replay", () => {
    const store = seedStore();
    const rows = [feedRow()];
    const first = adaptCatalystRowsToCorporateEvents({ rows, store, ingestedAt: "2026-09-22T00:00:00.000Z" });
    const replay = adaptCatalystRowsToCorporateEvents({ rows, store, ingestedAt: "2026-09-22T01:00:00.000Z" });
    expect(first.corporateEvents[0]?.eventId).toBe(replay.corporateEvents[0]?.eventId);
    expect(first.corporateEvents[0]?.eventId).toBe(corporateEventIdFromDedupeKey("dedupe-a"));
  });

  it("skips rows missing published/event timestamps when no safe fallback exists", () => {
    const store = seedStore();
    const adapted = adaptCatalystRowsToCorporateEvents({
      rows: [feedRow({
        event_date: null,
        published_at: null,
        event_time: null,
        provider_article_id: "article-1",
        dedupe_key: "dedupe-no-date",
      })],
      store,
      ingestedAt: "2026-09-22T00:00:00.000Z",
    });
    expect(adapted.corporateEvents).toHaveLength(0);
    expect(adapted.skips.some((row) => row.reason === "missing_event_date")).toBe(true);
  });
});
