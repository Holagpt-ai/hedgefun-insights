import { describe, expect, it } from "vitest";
import { etSessionBounds } from "@/lib/historical-backfill/dates";
import { attachHistoricalEventsFromStore } from "@/lib/episode-event-linkage/attach-events-to-comparables";
import { classifyEventEpisodeRelationship } from "@/lib/episode-event-linkage/classify-event-episode-relationship";
import { buildEpisodeSessionContext } from "@/lib/episode-event-linkage/episode-session-context";
import { linkCorporateEventsToEpisode } from "@/lib/episode-event-linkage/link-events-to-episodes";
import { catalystRowToCorporateEventDraft } from "@/lib/episode-event-linkage/map-catalyst-to-corporate-event";
import {
  buildHistoricalMemoryFromRepeatMoverContext,
  HISTORICAL_MEMORY_EVENT_CAUSATION_GUARDRAIL,
  assertHistoricalMemoryIsEvidenceOnly,
} from "@/lib/ai-analyst/historical-memory";
import { assertRepeatMoverContextIsEvidenceOnly } from "@/lib/repeat-movers/get-repeat-mover-context";
import type { CorporateEvent, EventReactionLink, MarketBehaviorEpisode } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111" as SecurityId;
const OTHER_SECURITY_ID = "22222222-2222-4222-8222-222222222222" as SecurityId;

function episode(sessionDate: string, overrides: Partial<MarketBehaviorEpisode> = {}): MarketBehaviorEpisode {
  const bounds = etSessionBounds(sessionDate)!;
  return {
    episodeId: `ep-${sessionDate}`,
    securityId: SECURITY_ID,
    episodeStart: bounds.open,
    episodeEnd: bounds.close,
    observedSymbol: "AAA",
    direction: "POSITIVE",
    tier: "NOTABLE",
    startPrice: 10,
    highPrice: 12,
    lowPrice: 9,
    endPrice: 11,
    maxPositiveMovePct: 10,
    maxNegativeMovePct: -2,
    volume: 1_000_000,
    dollarVolume: 11_000_000,
    rvol: 2,
    floatTurnover: null,
    haltCount: null,
    closeStrength: null,
    detectedBy: "test",
    origin: "HISTORICAL_BACKFILL",
    createdAt: bounds.open,
    updatedAt: bounds.open,
    source: "test",
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: bounds.open,
    quality: "DERIVED",
    freshness: "UNKNOWN",
    provenance: "DERIVED",
    ...overrides,
  };
}

function corporateEvent(input: {
  eventId: string;
  sessionDate: string;
  publishedAt?: string;
  securityId?: SecurityId;
  title?: string;
}): CorporateEvent {
  const bounds = etSessionBounds(input.sessionDate)!;
  const publishedAt = input.publishedAt ?? bounds.open;
  return {
    eventId: input.eventId,
    securityId: input.securityId ?? SECURITY_ID,
    observedSymbol: "AAA",
    eventType: "EARNINGS",
    eventAt: publishedAt,
    publishedAt,
    title: input.title ?? "Company earnings release",
    summary: null,
    source: "polygon",
    sourceUrl: null,
    providerEventId: `prov-${input.eventId}`,
    accessionId: null,
    metadata: null,
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: publishedAt,
    quality: "AUTHORITATIVE",
    freshness: "FRESH",
    provenance: "PROVIDER",
    createdAt: publishedAt,
  };
}

describe("episode event linkage v1", () => {
  const tradingDates = ["2024-05-01", "2024-05-02", "2024-05-03", "2024-05-06"];

  it("links same-security prior-session earnings before episode", () => {
    const ep = episode("2024-05-02");
    const session = buildEpisodeSessionContext(ep)!;
    const event = corporateEvent({
      eventId: "ev-1",
      sessionDate: "2024-05-01",
      publishedAt: etSessionBounds("2024-05-01")!.close,
    });
    const decision = classifyEventEpisodeRelationship({
      episodeSecurityId: SECURITY_ID,
      event,
      episode: session,
      tradingSessionDates: tradingDates,
    });
    expect(decision.eligible).toBe(true);
    expect(decision.temporalRelationship).toBe("EVENT_PRECEDES_EPISODE");
    expect(decision.relationType).toBe("PRECEDES_EPISODE");
  });

  it("rejects wrong-security events", () => {
    const ep = episode("2024-05-02");
    const session = buildEpisodeSessionContext(ep)!;
    const event = corporateEvent({
      eventId: "ev-wrong",
      sessionDate: "2024-05-01",
      securityId: OTHER_SECURITY_ID,
    });
    const decision = classifyEventEpisodeRelationship({
      episodeSecurityId: SECURITY_ID,
      event,
      episode: session,
      tradingSessionDates: tradingDates,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.rejectReason).toBe("wrong_security");
  });

  it("classifies same-session publication during regular hours", () => {
    const ep = episode("2024-05-02");
    const session = buildEpisodeSessionContext(ep)!;
    const event = corporateEvent({
      eventId: "ev-same",
      sessionDate: "2024-05-02",
      publishedAt: new Date(session.sessionOpenMs + 60_000).toISOString(),
    });
    const decision = classifyEventEpisodeRelationship({
      episodeSecurityId: SECURITY_ID,
      event,
      episode: session,
      tradingSessionDates: tradingDates,
    });
    expect(decision.eligible).toBe(true);
    expect(decision.temporalRelationship).toBe("EVENT_SAME_SESSION");
  });

  it("rejects events outside configured prior-session window", () => {
    const ep = episode("2024-05-06");
    const session = buildEpisodeSessionContext(ep)!;
    const event = corporateEvent({
      eventId: "ev-old",
      sessionDate: "2024-05-01",
      publishedAt: etSessionBounds("2024-05-01")!.open,
    });
    const decision = classifyEventEpisodeRelationship({
      episodeSecurityId: SECURITY_ID,
      event,
      episode: session,
      tradingSessionDates: tradingDates,
      config: { priorTradingSessionsLookback: 1 },
    });
    expect(decision.eligible).toBe(false);
    expect(decision.rejectReason).toBe("outside_linkage_window");
  });

  it("does not treat post-episode publication as pre-event evidence", () => {
    const ep = episode("2024-05-02");
    const session = buildEpisodeSessionContext(ep)!;
    const event = corporateEvent({
      eventId: "ev-late",
      sessionDate: "2024-05-02",
      publishedAt: new Date(session.episodeEndMs + 3600_000).toISOString(),
    });
    const decision = classifyEventEpisodeRelationship({
      episodeSecurityId: SECURITY_ID,
      event,
      episode: session,
      tradingSessionDates: tradingDates,
    });
    expect(decision.eligible).toBe(true);
    expect(decision.temporalRelationship).toBe("EVENT_FOLLOWS_EPISODE");
    expect(decision.relationType).toBe("FOLLOWS_EPISODE");
  });

  it("rejects missing publication/event timestamps", () => {
    const ep = episode("2024-05-02");
    const session = buildEpisodeSessionContext(ep)!;
    const event = corporateEvent({ eventId: "ev-missing", sessionDate: "2024-05-01" });
    const broken = { ...event, eventAt: "not-a-date", publishedAt: null, metadata: null };
    const decision = classifyEventEpisodeRelationship({
      episodeSecurityId: SECURITY_ID,
      event: broken,
      episode: session,
      tradingSessionDates: tradingDates,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.rejectReason).toBe("missing_event_timestamp");
  });

  it("preserves securityId linkage across ticker display changes", () => {
    const ep = episode("2024-05-02", { observedSymbol: "NEW" });
    const event = corporateEvent({
      eventId: "ev-ticker",
      sessionDate: "2024-05-01",
      publishedAt: etSessionBounds("2024-05-01")!.close,
    });
    const links = linkCorporateEventsToEpisode({
      episode: ep,
      events: [{ ...event, observedSymbol: "OLD" }],
      tradingSessionDates: tradingDates,
    });
    expect(links).toHaveLength(1);
    expect(links[0]?.securityId).toBe(SECURITY_ID);
  });

  it("deduplicates provider event ids within an episode linkage batch", () => {
    const ep = episode("2024-05-02");
    const event = corporateEvent({ eventId: "ev-dup", sessionDate: "2024-05-01" });
    const links = linkCorporateEventsToEpisode({
      episode: ep,
      events: [event, { ...event, title: "duplicate row" }],
      tradingSessionDates: tradingDates,
    });
    expect(links).toHaveLength(1);
  });

  it("attaches bounded historical events to repeat mover comparables", async () => {
    const ep = episode("2024-05-02");
    const event = corporateEvent({ eventId: "ev-rm", sessionDate: "2024-05-01" });
    const link: EventReactionLink = {
      linkId: "link-1",
      eventId: event.eventId,
      episodeId: ep.episodeId,
      securityId: SECURITY_ID,
      relationType: "PRECEDES_EPISODE",
      timeDeltaSeconds: 86_400,
      timeDeltaMinutes: 1440,
      confidence: null,
      evidence: '["SAME_SECURITY"]',
      provenance: "DERIVED",
      source: "episode_event_linkage_v1",
      sourceAsOf: null,
      createdAt: event.createdAt,
    };
    const attached = attachHistoricalEventsFromStore(
      [{
        episodeId: ep.episodeId,
        sessionDate: "2024-05-02",
        tier: "NOTABLE",
        direction: "POSITIVE",
        movePct: 10,
        volume: 1,
        rvol: 2,
        dollarVolume: null,
        closePosition: null,
        nextSessionMovePct: null,
        nextSessionContinuation: null,
        similarity: { sameDirection: true, sameTier: true, movePctDelta: null },
      }],
      [link],
      [event],
    );
    expect(attached[0]?.historicalEvents?.[0]?.eventType).toBe("EARNINGS");
    expect(attached[0]?.historicalEvents?.[0]?.temporalRelationship).toBe("EVENT_PRECEDES_EPISODE");
    assertRepeatMoverContextIsEvidenceOnly({
      version: "v1",
      securityId: SECURITY_ID,
      currentSymbol: "AAA",
      currentContext: {
        observedSymbol: "AAA",
        sessionDate: null,
        movePct: null,
        volume: null,
        rvol: null,
        dollarVolume: null,
        direction: null,
        tier: null,
        recordedAt: null,
      },
      profile: { profileAvailable: false } as never,
      comparableHistory: {
        comparableEpisodeCount: attached.length,
        closestComparableEpisodes: attached,
        mostRecentComparableEpisode: attached[0] ?? null,
      },
      evidenceLabels: [],
      assembledAt: "2026-09-22T00:00:00.000Z",
    });
  });

  it("exposes event facts and causation guardrail in AI historical memory", () => {
    const memory = buildHistoricalMemoryFromRepeatMoverContext({
      version: "v1",
      securityId: SECURITY_ID,
      currentSymbol: "AAA",
      currentContext: {
        observedSymbol: "AAA",
        sessionDate: "2024-05-02",
        movePct: 10,
        volume: 1,
        rvol: 2,
        dollarVolume: null,
        direction: "POSITIVE",
        tier: "NOTABLE",
        recordedAt: null,
      },
      profile: {
        profileAvailable: true,
        sampleSizeQuality: "LIMITED",
        sessionsObserved: 10,
        episodeCount: 1,
        notableCount: 1,
        significantCount: 0,
        extremeCount: 0,
        positiveEpisodeCount: 1,
        negativeEpisodeCount: 0,
        mixedEpisodeCount: 0,
        positiveEpisodePct: 100,
        negativeEpisodePct: 0,
        episodesPer30Sessions: null,
        episodesPer90Sessions: null,
        medianDaysBetweenEpisodes: null,
        positiveCloseUpperQuartilePct: null,
        positiveCloseNearHighPct: null,
        negativeCloseNearLowPct: null,
        nextSessionPositiveContinuationRate: null,
        nextSessionNegativeContinuationRate: null,
        historyStartDate: "2024-05-01",
        historyEndDate: "2024-05-02",
        computedAt: null,
        latestSourceHistoryDate: null,
        latestEpisodeDateUsed: null,
        sourceDailyRowCount: null,
        sourceEpisodeCount: null,
        episodesWithD1Outcome: null,
        episodesWithD5Outcome: null,
        forwardOutcomeCoveragePctD1: null,
        medianD1ReturnPct: null,
        medianD5ReturnPct: null,
        positiveD1Pct: null,
        negativeD1Pct: null,
        observedNextSessionSampleSize: null,
        observedNextSessionPositivePct: null,
        observedNextSessionNegativePct: null,
      },
      comparableHistory: {
        comparableEpisodeCount: 1,
        closestComparableEpisodes: [{
          episodeId: "ep-1",
          sessionDate: "2024-05-01",
          tier: "NOTABLE",
          direction: "POSITIVE",
          movePct: 8,
          volume: 1,
          rvol: 2,
          dollarVolume: null,
          closePosition: null,
          nextSessionMovePct: null,
          nextSessionContinuation: null,
          historicalEvents: [{
            eventType: "EARNINGS",
            title: "Q1 earnings",
            publishedAt: "2024-05-01T20:00:00.000Z",
            temporalRelationship: "EVENT_PRECEDES_EPISODE",
            source: "polygon",
          }],
          similarity: { sameDirection: true, sameTier: true, movePctDelta: 2 },
        }],
        mostRecentComparableEpisode: null,
      },
      evidenceLabels: [],
      assembledAt: "2026-09-22T00:00:00.000Z",
    }, "AAA");
    expect(memory.closestComparableEpisodes[0]?.historicalEvents).toHaveLength(1);
    expect(memory.eventCausationGuardrail).toBe(HISTORICAL_MEMORY_EVENT_CAUSATION_GUARDRAIL);
    assertHistoricalMemoryIsEvidenceOnly(memory);
    expect(JSON.stringify(memory)).not.toContain('"causalConfidence"');
  });

  it("maps catalyst feed rows to corporate event drafts without inventing headlines", () => {
    const draft = catalystRowToCorporateEventDraft({
      securityId: SECURITY_ID,
      dedupeKey: "dedupe-1",
      symbol: "AAA",
      eventType: "earnings",
      eventDate: "2024-05-01",
      eventTime: null,
      title: "Acme Corp reports Q1 results",
      description: null,
      sourceName: "Polygon",
      sourceUrl: "https://example.com/a",
      provider: "polygon",
      publishedAt: "2024-05-01T11:30:00.000Z",
    });
    expect(draft?.eventType).toBe("EARNINGS");
    expect(draft?.title).toBe("Acme Corp reports Q1 results");
    expect(draft?.providerEventId).toBe("dedupe-1");
  });
});
