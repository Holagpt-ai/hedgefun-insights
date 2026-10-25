import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAnalystHistoricalMemory } from "@/lib/ai-analyst/fetch-analyst-historical-memory";
import {
  persistRadarHistoricalContextForAnalyst,
  readRadarHistoricalFacts,
} from "@/lib/ai-analyst/radar-historical-handoff";
import { buildHistoricalMemoryFromRepeatMoverContext } from "@/lib/ai-analyst/historical-memory";
import { mergeHistoricalContextBatchIntoRows } from "@/lib/radar/apply-radar-historical-context";
import { buildRepeatMoverWorkflowHandoffs } from "@/lib/radar/radar-repeat-mover-handoffs";
import {
  historicalWorkflowMatchesRequest,
  repeatMoverContextMatchesHandoff,
} from "@/lib/historical-workflow/historical-handoff-identity";
import {
  persistHistoricalWorkflowHandoff,
  readPreloadedRepeatMoverContext,
} from "@/lib/historical-workflow/workflow-handoff-storage";
import { resolveWorkflowHistoricalContext } from "@/lib/historical-workflow/resolve-workflow-historical-context";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

const SEC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as SecurityId;
const SEC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as SecurityId;

function repeatContext(overrides: Partial<RepeatMoverContext> = {}): RepeatMoverContext {
  return {
    version: "v1",
    securityId: SEC_A,
    currentSymbol: "AAA",
    currentContext: {
      observedSymbol: "AAA",
      sessionDate: "2026-09-22",
      movePct: 5,
      volume: 1_000_000,
      rvol: 2,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: "2026-09-22T15:00:00.000Z",
    },
    profile: {
      profileAvailable: true,
      sampleSizeQuality: "ROBUST",
      sessionsObserved: 80,
      episodeCount: 6,
      notableCount: 3,
      significantCount: 2,
      extremeCount: 1,
      positiveEpisodeCount: 4,
      negativeEpisodeCount: 2,
      mixedEpisodeCount: 0,
      positiveEpisodePct: 66,
      negativeEpisodePct: 34,
      episodesPer30Sessions: 1,
      episodesPer90Sessions: 3,
      medianDaysBetweenEpisodes: 10,
      positiveCloseUpperQuartilePct: null,
      positiveCloseNearHighPct: null,
      negativeCloseNearLowPct: null,
      nextSessionPositiveContinuationRate: 0.55,
      nextSessionNegativeContinuationRate: 0.4,
      historyStartDate: "2024-01-02",
      historyEndDate: "2026-09-20",
      computedAt: new Date().toISOString(),
      latestSourceHistoryDate: "2026-09-20",
      latestEpisodeDateUsed: "2026-05-01",
      sourceDailyRowCount: 80,
      sourceEpisodeCount: 6,
      episodesWithD1Outcome: 4,
      episodesWithD5Outcome: 3,
      forwardOutcomeCoveragePctD1: 0.66,
      medianD1ReturnPct: 1.2,
      medianD5ReturnPct: -0.5,
      positiveD1Pct: 0.5,
      negativeD1Pct: 0.5,
      observedNextSessionSampleSize: 4,
      observedNextSessionPositivePct: 0.5,
      observedNextSessionNegativePct: 0.5,
    },
    comparableHistory: {
      comparableEpisodeCount: 2,
      closestComparableEpisodes: [{
        episodeId: "ep-1",
        sessionDate: "2026-05-01",
        tier: "NOTABLE",
        direction: "POSITIVE",
        movePct: 4,
        volume: 900_000,
        rvol: 3,
        dollarVolume: null,
        closePosition: 0.8,
        nextSessionMovePct: 2,
        nextSessionContinuation: true,
        similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
        historicalEvents: [{
          eventType: "EARNINGS",
          title: "Q1 results",
          publishedAt: "2026-04-30T20:00:00.000Z",
          temporalRelationship: "EVENT_PRECEDES_EPISODE",
          source: "polygon",
        }],
      }],
      mostRecentComparableEpisode: null,
    },
    evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
    assembledAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Batch 173 — handoff identity integrity", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("rejects repeat mover context when session symbol key does not match currentSymbol", () => {
    expect(
      repeatMoverContextMatchesHandoff(
        { symbol: "AAA", securityId: SEC_A },
        repeatContext({ currentSymbol: "BBB" }),
      ),
    ).toBe(false);
  });

  it("does not persist repeat mover context under a mismatched symbol key", () => {
    const workflow = persistHistoricalWorkflowHandoff(repeatContext(), {
      symbol: "WRONG",
      sourceSurface: "radar",
    });
    expect(workflow.historicalContextAvailable).toBe(false);
    expect(readPreloadedRepeatMoverContext("WRONG")).toBeNull();
    expect(readPreloadedRepeatMoverContext("AAA")).toBeNull();
  });

  it("readPreloadedRepeatMoverContext rejects stale session under wrong securityId hint", () => {
    persistHistoricalWorkflowHandoff(repeatContext(), { symbol: "AAA", sourceSurface: "radar" });
    expect(readPreloadedRepeatMoverContext("AAA", { securityId: SEC_B })).toBeNull();
    expect(readPreloadedRepeatMoverContext("AAA", { securityId: SEC_A })?.securityId).toBe(SEC_A);
  });

  it("Radar batch merge drops context when bridge symbol disagrees with row symbol", () => {
    const merged = mergeHistoricalContextBatchIntoRows(
      [{ symbol: "AAA", securityId: SEC_A } as never],
      {
        results: [{
          symbol: "AAA",
          securityId: SEC_A,
          historicalContext: repeatContext({ currentSymbol: "OTHER" }) as never,
        }],
      },
    );
    expect(merged[0]?.historicalContext).toBeNull();
    expect(merged[0]?.historicalContextLoadStatus).toBe("unavailable");
  });

  it("Radar → Repeat Movers → workflow routes preserve symbol and securityId", () => {
    persistHistoricalWorkflowHandoff(repeatContext(), {
      symbol: "AAA",
      sourceSurface: "repeat_movers",
    });
    const handoffs = buildRepeatMoverWorkflowHandoffs("AAA", SEC_A);
    expect(handoffs.aiAnalyst).toContain("symbol=AAA");
    expect(handoffs.aiAnalyst).toContain("securityId=");
    expect(handoffs.catalyst).toContain("symbol=AAA");
    expect(handoffs.watchlist).toContain("symbol=AAA");
    const routes = workflowSymbolRoutes("AAA");
    expect(routes?.journal).toContain(SEC_A);
  });

  it("AI Analyst client handoff preserves rich memory after Radar persist", async () => {
    persistRadarHistoricalContextForAnalyst("AAA", repeatContext());
    const facts = readRadarHistoricalFacts("AAA", { securityId: SEC_A });
    expect(facts?.contextLoaded).toBe(true);
    expect(facts?.nextSessionPositiveContinuationRate).toBe(0.55);
    expect(facts?.closestComparableEpisodes[0]?.historicalEvents).toHaveLength(1);

    const memory = await fetchAnalystHistoricalMemory({
      symbol: "AAA",
      preloadedContext: readPreloadedRepeatMoverContext("AAA") ?? undefined,
    });
    expect(memory.contextLoaded).toBe(true);
    expect(memory.eventCausationGuardrail).toMatch(/temporally associated/i);
    expect(memory.closestComparableEpisodes[0]?.historicalEvents).toHaveLength(1);
  });

  it("fetch fails soft when preloaded context identity mismatches requested symbol", async () => {
    const memory = await fetchAnalystHistoricalMemory({
      symbol: "BBB",
      preloadedContext: repeatContext({ currentSymbol: "AAA" }),
    });
    expect(memory.contextLoaded).toBe(false);
    expect(memory.episodeCount).toBeNull();
  });

  it("resolveWorkflowHistoricalContext ignores compact cache on security mismatch", async () => {
    persistHistoricalWorkflowHandoff(repeatContext(), { symbol: "AAA", sourceSurface: "radar" });
    const resolved = await resolveWorkflowHistoricalContext({
      symbol: "AAA",
      securityId: SEC_B,
      sourceSurface: "watchlist",
    });
    expect(resolved.repeatMoverContextLoaded).toBe(false);
    expect(resolved.workflow.historicalContextAvailable).toBe(false);
    expect(historicalWorkflowMatchesRequest(
      { symbol: "AAA", securityId: SEC_B },
      resolved.workflow,
    )).toBe(true);
  });

  it("navigation round trip: watchlist route hint keeps securityId when session matches", () => {
    persistHistoricalWorkflowHandoff(repeatContext(), { symbol: "AAA", sourceSurface: "watchlist" });
    const path = workflowSymbolRoutes("AAA", { securityId: SEC_A })?.catalyst;
    expect(path).toContain("securityId=");
    expect(path).toContain("symbol=AAA");
  });

  it("rich episode fields survive coerce → memory without zero-fill", () => {
    const memory = buildHistoricalMemoryFromRepeatMoverContext(repeatContext(), "AAA");
    expect(memory.medianD1ReturnPct).toBe(1.2);
    expect(memory.closestComparableEpisodes[0]?.nextSessionContinuation).toBe(true);
    expect(memory.closestComparableEpisodes[0]?.historicalEvents[0]?.title).toBe("Q1 results");
  });

  it("readRadarHistoricalFacts rejects facts cached for a different symbol", () => {
    persistRadarHistoricalContextForAnalyst("AAA", repeatContext());
    expect(readRadarHistoricalFacts("BBB")).toBeNull();
  });

  it("network fetch does not attach first batch row when symbol is missing from results", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    const memory = await fetchAnalystHistoricalMemory({
      symbol: "AAA",
      accessToken: "token",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          results: [{ symbol: "OTHER", securityId: SEC_B, historicalContext: repeatContext() }],
        }),
      }) as Response,
    });
    expect(memory.contextLoaded).toBe(false);
  });
});
