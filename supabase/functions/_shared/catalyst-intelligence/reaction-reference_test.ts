import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { eventReferenceInstant, priceBarsFromPolygonAggs, referencePriceAtOrBefore } from "./event-bars.ts";
import { assessReactionMarketContext } from "./market-reaction.ts";
import { ingestCandidate } from "./pipeline.ts";
import { createMemoryStore } from "./persistence.ts";
import { runReactionBot } from "./run-bot.ts";
import type { NormalizedEventCandidate, SourceRecord } from "./types.ts";

const BNS_EVENT_AT = "2026-10-01T17:37:12.000Z";
const REACTION_NOW = new Date("2026-10-01T18:00:00.000Z");

function source(partial: Partial<SourceRecord> & Pick<SourceRecord, "sourceType" | "url" | "evidenceTier">): SourceRecord {
  const url = new URL(partial.url);
  return {
    id: partial.id ?? crypto.randomUUID(),
    sourceKey: partial.sourceKey ?? partial.sourceType.toLowerCase(),
    companyName: partial.companyName ?? null,
    ticker: partial.ticker ?? null,
    cik: partial.cik ?? null,
    sourceType: partial.sourceType,
    url: partial.url,
    hostname: url.hostname,
    feedFormat: partial.feedFormat ?? "rss",
    pollIntervalSeconds: partial.pollIntervalSeconds ?? 0,
    enabled: partial.enabled ?? true,
    priority: partial.priority ?? 10,
    evidenceTier: partial.evidenceTier,
    authorityKey: partial.authorityKey ?? partial.sourceKey ?? partial.sourceType.toLowerCase(),
    lastSuccessAt: partial.lastSuccessAt ?? null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: partial.metadata ?? {},
  };
}

function secCandidate(sourceId: string, externalId: string): NormalizedEventCandidate {
  return {
    raw: {
      sourceId,
      sourceType: "SEC_FILINGS",
      externalId,
      canonicalUrl: `https://www.sec.gov/Archives/edgar/data/bns/${externalId}`,
      publishedAt: BNS_EVENT_AT,
      discoveredAt: BNS_EVENT_AT,
      title: "424B2 - Bank of Nova Scotia",
      summary: null,
      contentHash: `hash-${externalId}`,
      metadata: { cik: "0000009631", formType: "424B2" },
    },
    title: "424B2 - Bank of Nova Scotia",
    summary: null,
    suggestedType: null,
    subtype: "424B2",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_1_PRIMARY",
    metadata: { cik: "0000009631" },
  };
}

function bnsMinuteBars(): ReturnType<typeof priceBarsFromPolygonAggs> {
  const eventMs = Date.parse(BNS_EVENT_AT);
  const minute = 60_000;
  return priceBarsFromPolygonAggs([
    { t: eventMs - 2 * minute, c: 54.1 },
    { t: eventMs - minute, c: 54.25 },
    { t: eventMs, c: 54.99 },
  ]);
}

Deno.test("reference bar: open event-minute bar is rejected; prior completed bar wins", () => {
  const eventMs = Date.parse(BNS_EVENT_AT);
  const bars = bnsMinuteBars();
  assertEquals(referencePriceAtOrBefore(bars, eventMs), 54.25);
});

Deno.test("reaction: past event without Radar still loads Polygon reference price", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, secCandidate(src.id, "bns-424b2"), {
    now: REACTION_NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000009631", ["BNS"]]]),
  });
  const event = store.events()[0];
  assertEquals(eventReferenceInstant(event), BNS_EVENT_AT);
  let polygonCalls = 0;
  await runReactionBot({
    store,
    now: REACTION_NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return bnsMinuteBars();
    },
  });
  assertEquals(polygonCalls, 1);
  const reaction = store.reactions()[0];
  assertEquals(reaction.referencePrice, 54.25);
  assertEquals(reaction.currentPrice, null);
  assertEquals(reaction.percentMove, null);
  assertEquals(reaction.volume, null);
  assertEquals(reaction.rvol5m, null);
  assertEquals(reaction.availability, "unavailable");
  assertEquals(store.events()[0].reactionScore, null);
});

Deno.test("reaction: Radar present and Polygon reference both apply", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, secCandidate(src.id, "bns-radar"), {
    now: REACTION_NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000009631", ["BNS"]]]),
  });
  let polygonCalls = 0;
  const observation = {
    symbol: "BNS",
    observedAt: REACTION_NOW.toISOString(),
    freshness: "fresh" as const,
    referencePrice: null,
    currentPrice: 55.5,
    intradayHigh: 56,
    intradayLow: 54,
    volume: 120_000,
    dollarVolume: null,
    rvol5m: 2.1,
    timeAdjustedRvol: null,
    volumeVelocity: 4,
    volumeAcceleration: null,
    vwap: 55.1,
    vwapSide: "above" as const,
    hodDistancePct: null,
    floatTurnover: null,
  };
  await runReactionBot({
    store,
    now: REACTION_NOW,
    batchLimit: 5,
    loadObservation: async () => observation,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return bnsMinuteBars();
    },
  });
  assertEquals(polygonCalls, 1);
  const reaction = store.reactions()[0];
  assertEquals(reaction.referencePrice, 54.25);
  assertEquals(reaction.currentPrice, 55.5);
  assertEquals(reaction.percentMove != null && Math.abs(reaction.percentMove - 2.304147465437788) < 1e-9, true);
  assertEquals(reaction.rvol5m, 2.1);
  assertEquals(reaction.availability, "available");
});

Deno.test("reaction: no Radar and no valid Polygon bar stays null-safe", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, secCandidate(src.id, "bns-empty"), {
    now: REACTION_NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000009631", ["BNS"]]]),
  });
  await runReactionBot({
    store,
    now: REACTION_NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => [],
  });
  const reaction = store.reactions()[0];
  assertEquals(reaction.referencePrice, null);
  assertEquals(reaction.currentPrice, null);
  assertEquals(reaction.percentMove, null);
  assertEquals(reaction.availability, "unavailable");
});

Deno.test("reaction: future scheduled event does not call Polygon", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "COMPANY_EVENTS",
    url: "https://ir.example.test/events",
    evidenceTier: "TIER_1_PRIMARY",
    ticker: "BNS",
  });
  const futureStart = "2026-10-02T17:37:12.000Z";
  await ingestCandidate(store, {
    ...secCandidate(src.id, "future"),
    raw: {
      ...secCandidate(src.id, "future").raw,
      sourceType: "COMPANY_EVENTS",
    },
    scheduledStart: futureStart,
    isAnnouncement: false,
    metadata: {},
  }, { now: REACTION_NOW, allowFixtures: false, source: src });
  const event = store.events()[0];
  assertEquals(event.scheduledStartAt, futureStart);
  let polygonCalls = 0;
  await runReactionBot({
    store,
    now: REACTION_NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return bnsMinuteBars();
    },
  });
  assertEquals(polygonCalls, 0);
  assertEquals(store.reactions().length, 0);
});

Deno.test("reaction: stored reference price skips repeat Polygon fetch", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, secCandidate(src.id, "bns-reuse"), {
    now: REACTION_NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000009631", ["BNS"]]]),
  });
  let polygonCalls = 0;
  await runReactionBot({
    store,
    now: REACTION_NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return bnsMinuteBars();
    },
  });
  assertEquals(polygonCalls, 1);
  await runReactionBot({
    store,
    now: REACTION_NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return [{ startMs: 0, durationMs: 60_000, close: 1 }];
    },
  });
  assertEquals(polygonCalls, 1);
  assertEquals(store.reactions()[0].referencePrice, 54.25);
});

Deno.test("assessReactionMarketContext: reference without current price keeps percent move null", () => {
  const assessment = assessReactionMarketContext(null, 54.25, REACTION_NOW);
  assertEquals(assessment.referencePrice, 54.25);
  assertEquals(assessment.currentPrice, null);
  assertEquals(assessment.percentMove, null);
  assertEquals(assessment.reactionScore, null);
  assertEquals(assessment.availability, "unavailable");
});
