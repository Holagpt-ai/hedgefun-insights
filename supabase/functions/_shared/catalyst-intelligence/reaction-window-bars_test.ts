import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { eventReferenceInstant, priceBarsFromPolygonAggs } from "./event-bars.ts";
import { ingestCandidate } from "./pipeline.ts";
import { createMemoryStore } from "./persistence.ts";
import { runReactionBot } from "./run-bot.ts";
import type { NormalizedEventCandidate, SourceRecord } from "./types.ts";

const EVENT_AT = "2026-10-01T15:00:00.000Z";
const REACTION_NOW = new Date("2026-10-01T15:35:00.000Z");

function source(): SourceRecord {
  return {
    id: crypto.randomUUID(),
    sourceKey: "sec",
    companyName: null,
    ticker: null,
    cik: null,
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    hostname: "www.sec.gov",
    feedFormat: "atom",
    pollIntervalSeconds: 0,
    enabled: true,
    priority: 10,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "sec",
    lastSuccessAt: null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: {},
  };
}

function candidate(sourceId: string): NormalizedEventCandidate {
  return {
    raw: {
      sourceId,
      sourceType: "SEC_FILINGS",
      externalId: "window-bars",
      canonicalUrl: "https://www.sec.gov/example",
      publishedAt: EVENT_AT,
      discoveredAt: EVENT_AT,
      title: "8-K Example Corp",
      summary: null,
      contentHash: "window-bars-hash",
      metadata: { cik: "0000320193", formType: "8-K" },
    },
    title: "8-K Example Corp",
    summary: null,
    suggestedType: null,
    subtype: "8-K",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_1_PRIMARY",
    metadata: { cik: "0000320193" },
  };
}

function windowBars() {
  const eventMs = Date.parse(EVENT_AT);
  const minute = 60_000;
  return priceBarsFromPolygonAggs([
    { t: eventMs - minute, c: 100 },
    { t: eventMs, c: 100 },
    { t: eventMs + 4 * minute, c: 105 },
    { t: eventMs + 14 * minute, c: 110 },
    { t: eventMs + 29 * minute, c: 120 },
  ]);
}

Deno.test("reaction m5 m15 m30 use distinct bar-aligned window prices", async () => {
  const store = createMemoryStore();
  const src = source();
  await ingestCandidate(store, candidate(src.id), {
    now: REACTION_NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000320193", ["AAPL"]]]),
  });
  assertEquals(eventReferenceInstant(store.events()[0]), EVENT_AT);
  let radarCalls = 0;
  await runReactionBot({
    store,
    now: REACTION_NOW,
    batchLimit: 5,
    loadObservation: async () => {
      radarCalls += 1;
      return {
        symbol: "AAPL",
        observedAt: REACTION_NOW.toISOString(),
        freshness: "fresh" as const,
        referencePrice: null,
        currentPrice: 999,
        intradayHigh: null,
        intradayLow: null,
        volume: null,
        dollarVolume: null,
        rvol5m: 9.9,
        timeAdjustedRvol: null,
        volumeVelocity: null,
        volumeAcceleration: null,
        vwap: null,
        vwapSide: null,
        hodDistancePct: null,
        floatTurnover: null,
      };
    },
    loadReferenceBars: async () => windowBars(),
  });
  assertEquals(radarCalls, 0);
  const byWindow = new Map(store.reactions().map((row) => [row.windowKind, row]));
  assertEquals(byWindow.get("m5")?.currentPrice, 105);
  assertEquals(byWindow.get("m15")?.currentPrice, 110);
  assertEquals(byWindow.get("m30")?.currentPrice, 120);
  assertEquals(byWindow.get("m5")?.referencePrice, 100);
  assertEquals(byWindow.get("m30")?.rvol5m, null);
});
