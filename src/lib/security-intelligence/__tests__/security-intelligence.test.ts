import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import type { SecurityIdentityObservation } from "@/types/security-identity";

const RECORDED = "2026-09-21T16:00:00.000Z";

function identityObservation(overrides: Partial<SecurityIdentityObservation>): SecurityIdentityObservation {
  return {
    symbol: "ABC",
    exchange: "NASDAQ",
    effectiveDate: "2020-01-02",
    source: "reference-feed",
    provenance: "PROVIDER",
    recordedAt: RECORDED,
    ...overrides,
  };
}

function securities() {
  const identity = createSecurityIdentityStore();
  const first = identity.resolve(identityObservation({ figi: "BBG000000001", effectiveDate: "2020-01-02" }));
  identity.resolve(identityObservation({ symbol: "DEF", figi: "BBG000000001", effectiveDate: "2022-01-03" }));
  const reused = identity.resolve(
    identityObservation({ symbol: "ABC", figi: "BBG000000002", effectiveDate: "2024-01-02", issuerName: "Other Issuer" }),
  );
  return { firstId: first.securityId!, reusedId: reused.securityId! };
}

describe("Security Intelligence data model V1", () => {
  it("1. daily history is keyed by securityId and session date", () => {
    const { firstId } = securities();
    const model = createSecurityIntelligenceStore();
    const monday = model.putDailyHistory({
      securityId: firstId,
      sessionDate: "2024-06-03",
      observedSymbol: "DEF",
      close: 10,
      volume: 1000,
      quality: "AUTHORITATIVE",
      freshness: "FRESH",
      provenance: "PROVIDER",
      source: "daily-bars",
    });
    const tuesday = model.putDailyHistory({
      securityId: firstId,
      sessionDate: "2024-06-04",
      observedSymbol: "DEF",
      close: 11,
      volume: 1100,
    });
    const duplicate = model.putDailyHistory({
      securityId: firstId,
      sessionDate: "2024-06-03",
      observedSymbol: "DEF",
      close: 99,
    });
    expect(monday.ok).toBe(true);
    expect(tuesday.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
    expect(model.listDailyHistory().map((row) => row.sessionDate).sort()).toEqual(["2024-06-03", "2024-06-04"]);
    expect(model.listDailyHistory().every((row) => row.securityId === firstId)).toBe(true);
  });

  it("2. the same ticker reused by different securities stays separate", () => {
    const { firstId, reusedId } = securities();
    expect(firstId).not.toBe(reusedId);
    const model = createSecurityIntelligenceStore();
    model.putDailyHistory({ securityId: firstId, sessionDate: "2021-06-01", observedSymbol: "ABC", close: 5 });
    model.putDailyHistory({ securityId: reusedId, sessionDate: "2024-06-03", observedSymbol: "ABC", close: 20 });
    const rows = model.listDailyHistory();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.securityId))).toEqual(new Set([firstId, reusedId]));
    expect(rows.map((row) => row.observedSymbol)).toEqual(["ABC", "ABC"]);
  });

  it("3/4. a corporate event attaches to securityId and does not imply causation", () => {
    const { firstId, reusedId } = securities();
    const model = createSecurityIntelligenceStore();
    const event = model.putCorporateEvent({
      securityId: firstId,
      observedSymbol: "DEF",
      eventType: "EARNINGS",
      eventAt: "2024-06-03T20:00:00.000Z",
      title: "Reports quarterly results",
      source: "edgar",
      providerEventId: "0001",
      provenance: "PROVIDER",
      quality: "AUTHORITATIVE",
      recordedAt: RECORDED,
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;
    expect(event.record.securityId).toBe(firstId);
    expect(event.record.observedSymbol).toBe("DEF");
    expect(model.listLinks()).toEqual([]);

    const episode = model.putEpisode({
      securityId: firstId,
      episodeStart: "2024-06-04T13:30:00.000Z",
      direction: "POSITIVE",
      tier: "NOTABLE",
      origin: "HISTORICAL_BACKFILL",
      recordedAt: RECORDED,
    });
    expect(episode.ok).toBe(true);
    if (!episode.ok) return;
    const caused = model.putEventReactionLink({
      eventId: event.record.eventId,
      episodeId: episode.record.episodeId,
      securityId: firstId,
      relationType: "CAUSED",
      recordedAt: RECORDED,
    });
    expect(caused.ok).toBe(false);
    const link = model.putEventReactionLink({
      eventId: event.record.eventId,
      episodeId: episode.record.episodeId,
      securityId: firstId,
      relationType: "PRECEDES_EPISODE",
      confidence: null,
      recordedAt: RECORDED,
    });
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(link.record.relationType).toBe("PRECEDES_EPISODE");
    expect(link.record).not.toHaveProperty("causation");
    expect(link.record.confidence).toBeNull();
    const crossed = model.putEventReactionLink({
      eventId: event.record.eventId,
      episodeId: episode.record.episodeId,
      securityId: reusedId,
      relationType: "SAME_WINDOW",
      recordedAt: RECORDED,
    });
    expect(crossed.ok).toBe(false);
  });

  it("5/6. episode direction, tier, and origin validate", () => {
    const { firstId } = securities();
    const model = createSecurityIntelligenceStore();
    const historical = model.putEpisode({
      securityId: firstId,
      episodeStart: "2024-06-03T13:30:00.000Z",
      direction: "NEGATIVE",
      tier: "EXTREME",
      origin: "HISTORICAL_BACKFILL",
      recordedAt: RECORDED,
    });
    const live = model.putEpisode({
      securityId: firstId,
      episodeStart: "2024-06-04T13:30:00.000Z",
      direction: "MIXED",
      tier: "SIGNIFICANT",
      origin: "STOCKSIST_LIVE",
      recordedAt: RECORDED,
    });
    const normal = model.putEpisode({
      securityId: firstId,
      episodeStart: "2024-06-05T13:30:00.000Z",
      direction: "POSITIVE",
      tier: "NORMAL",
      origin: "STOCKSIST_LIVE",
      recordedAt: RECORDED,
    });
    const badOrigin = model.putEpisode({
      securityId: firstId,
      episodeStart: "2024-06-05T13:30:00.000Z",
      direction: "POSITIVE",
      tier: "NOTABLE",
      origin: "POLYGON",
      recordedAt: RECORDED,
    });
    expect(historical.ok && live.ok).toBe(true);
    expect(normal.ok).toBe(false);
    expect(badOrigin.ok).toBe(false);
    expect(model.listEpisodes().map((row) => row.origin).sort()).toEqual([
      "HISTORICAL_BACKFILL",
      "STOCKSIST_LIVE",
    ]);
  });

  it("7/8/9. horizons validate, unknown metrics stay null, and provenance is retained", () => {
    const { firstId } = securities();
    const model = createSecurityIntelligenceStore();
    const daily = model.putDailyHistory({
      securityId: firstId,
      sessionDate: "2024-06-03",
      observedSymbol: "DEF",
      close: 10,
      volume: 1000,
      source: "daily-bars",
      sourceAsOf: "2024-06-03T20:00:00.000Z",
      fetchedAt: "2024-06-03T20:05:00.000Z",
      quality: "AUTHORITATIVE",
      freshness: "FRESH",
      provenance: "PROVIDER",
    });
    expect(daily.ok).toBe(true);
    if (!daily.ok) return;
    expect(daily.record.dollarVolume).toBeNull();
    expect(daily.record.previousClose).toBeNull();
    expect(daily.record.movePct).toBeNull();
    expect(daily.record.provenance).toBe("PROVIDER");
    expect(daily.record.source).toBe("daily-bars");
    expect(daily.record.sourceAsOf).toBe("2024-06-03T20:00:00.000Z");

    const episode = model.putEpisode({
      securityId: firstId,
      episodeStart: "2024-06-03T13:30:00.000Z",
      direction: "POSITIVE",
      tier: "NOTABLE",
      origin: "HISTORICAL_BACKFILL",
      startPrice: 10,
      recordedAt: RECORDED,
      provenance: "INTERNAL",
      source: "episode-detector",
    });
    expect(episode.ok).toBe(true);
    if (!episode.ok) return;
    expect(episode.record.rvol).toBeNull();
    expect(episode.record.floatTurnover).toBeNull();
    expect(episode.record.haltCount).toBeNull();
    expect(episode.record.closeStrength).toBeNull();
    expect(episode.record.dollarVolume).toBeNull();
    expect(episode.record.provenance).toBe("INTERNAL");

    const outcome = model.putForwardOutcome({
      episodeId: episode.record.episodeId,
      horizon: "D1",
      referencePrice: 10,
      outcomePrice: 12,
    });
    const badHorizon = model.putForwardOutcome({
      episodeId: episode.record.episodeId,
      horizon: "D7",
    });
    expect(outcome.ok).toBe(true);
    expect(badHorizon.ok).toBe(false);
    if (!outcome.ok) return;
    expect(outcome.record.returnPct).toBeNull();
    expect(outcome.record.maxGainPct).toBeNull();
    expect(outcome.record.maxDrawdownPct).toBeNull();
    expect(outcome.record.dataAvailable).toBe(false);
    expect(outcome.record.quality).toBe("UNAVAILABLE");
    expect(outcome.record.provenance).toBe("UNKNOWN");
  });

  it("10. backfill job checkpoint and state transitions validate", () => {
    const model = createSecurityIntelligenceStore();
    const created = model.createBackfillJob({
      jobType: "SECURITY_DAILY_HISTORY",
      dateFrom: "2021-01-04",
      dateTo: "2021-01-29",
      recordedAt: RECORDED,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.record.state).toBe("PENDING");
    expect(created.record.processedCount).toBe(0);
    const running = model.transitionBackfillJob(created.record.jobId, {
      to: "RUNNING",
      recordedAt: "2026-09-21T16:05:00.000Z",
      cursorDate: "2021-01-08",
      processedCount: 4,
    });
    expect(running.ok).toBe(true);
    if (!running.ok) return;
    expect(running.record.startedAt).toBe("2026-09-21T16:05:00.000Z");
    expect(running.record.cursorDate).toBe("2021-01-08");
    const outside = model.transitionBackfillJob(created.record.jobId, {
      to: "PAUSED",
      recordedAt: "2026-09-21T16:06:00.000Z",
      cursorDate: "2022-01-01",
    });
    expect(outside.ok).toBe(false);
    const paused = model.transitionBackfillJob(created.record.jobId, {
      to: "PAUSED",
      recordedAt: "2026-09-21T16:06:00.000Z",
    });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    expect(paused.record.cursorDate).toBe("2021-01-08");
    expect(paused.record.processedCount).toBe(4);
    const resumed = model.transitionBackfillJob(created.record.jobId, {
      to: "RUNNING",
      recordedAt: "2026-09-21T16:10:00.000Z",
    });
    const complete = model.transitionBackfillJob(created.record.jobId, {
      to: "COMPLETE",
      recordedAt: "2026-09-21T18:00:00.000Z",
      processedCount: 20,
    });
    const again = model.transitionBackfillJob(created.record.jobId, {
      to: "RUNNING",
      recordedAt: "2026-09-21T19:00:00.000Z",
    });
    expect(resumed.ok && complete.ok).toBe(true);
    expect(again.ok).toBe(false);
    if (!complete.ok) return;
    expect(complete.record.state).toBe("COMPLETE");
    expect(complete.record.completedAt).toBe("2026-09-21T18:00:00.000Z");
    expect(complete.record.processedCount).toBe(20);
  });

  it("11. Radar and screener behavior stays unchanged", () => {
    const untouched = [
      "src/lib/screeners/radar-v2-adapter.ts",
      "src/components/dashboard/ScreenerTable.tsx",
      "src/features/day-trade-radar-v2/RadarGrid.tsx",
      "src/features/day-trade-radar-v2/RadarMobileCard.tsx",
    ];
    for (const file of untouched) {
      expect(readFileSync(file, "utf8")).not.toMatch(/security-intelligence/);
    }
    const migration = readFileSync("drizzle/migrations/0006_security_intelligence_data_model_v1.sql", "utf8");
    expect(migration).not.toMatch(/radar_v2|screener_results|float_shares|market_cap/i);
    expect(migration).not.toMatch(/ALTER TABLE public\.securities/i);

    const louder: RadarV2CandidateRow = {
      symbol: "LOUD",
      generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      trading_date: "2026-09-03",
      session_kind: "market",
      lifecycle: "ACTIVE",
      signal_status: "EXPLOSIVE",
      last_price: 10,
      move_15s_pct: 1,
      move_60s_pct: 1,
      volume_5s: 1,
      volume_15s: 1,
      volume_60s: 1,
      session_volume: 50,
      dollar_volume_60s: 1,
      acceleration_5m: 0,
      session_high: 11,
      session_low: 9,
      distance_from_hod_pct: 1,
      session_vwap: 10,
      vwap_side: "above",
      freshness_class: "fresh",
      provider_as_of: "2026-09-03T14:00:00.000Z",
      updated_at: "2026-09-03T14:00:00.000Z",
    };
    expect(compareCandidatesVolumeFirst({ ...louder, symbol: "QUIET", session_volume: 5 }, louder)).toBeGreaterThan(0);
  });
});
