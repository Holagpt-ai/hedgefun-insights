import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildHistoricalWorkflowContext } from "@/lib/historical-workflow/build-historical-workflow-context";
import {
  journalReferenceFromWorkflow,
  persistJournalObservationalHistoricalReference,
  readJournalObservationalHistoricalReference,
} from "@/lib/historical-workflow/journal-historical-reference";
import {
  resetWorkflowHistoricalContextInflightForTests,
  resolveWorkflowHistoricalContext,
} from "@/lib/historical-workflow/resolve-workflow-historical-context";
import {
  persistHistoricalWorkflowHandoff,
  readHistoricalWorkflowContext,
  readHistoricalWorkflowContextBySecurityId,
  readPreloadedRepeatMoverContext,
  WORKFLOW_HISTORICAL_BY_ID_PREFIX,
  WORKFLOW_HISTORICAL_SESSION_PREFIX,
} from "@/lib/historical-workflow/workflow-handoff-storage";
import { buildInboxWorkflowNavigatePath, workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { RepeatMoverContext } from "@/types/repeat-mover";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";

function baseContext(overrides: Partial<RepeatMoverContext> = {}): RepeatMoverContext {
  return {
    version: "v1",
    securityId: SECURITY_ID,
    currentSymbol: "ABC",
    currentContext: {
      observedSymbol: "ABC",
      sessionDate: "2026-09-22",
      movePct: 5,
      volume: 1_000_000,
      rvol: null,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: "2026-09-22T15:00:00.000Z",
    },
    profile: {
      profileAvailable: true,
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
      sampleSizeQuality: "ROBUST",
      sessionsObserved: 100,
      episodeCount: 8,
      notableCount: 4,
      significantCount: 3,
      extremeCount: 1,
      positiveEpisodeCount: 5,
      negativeEpisodeCount: 3,
      mixedEpisodeCount: 0,
      positiveEpisodePct: 62.5,
      negativeEpisodePct: 37.5,
      episodesPer30Sessions: 1.2,
      episodesPer90Sessions: 3.5,
      medianDaysBetweenEpisodes: 12,
      positiveCloseUpperQuartilePct: null,
      positiveCloseNearHighPct: null,
      negativeCloseNearLowPct: null,
      nextSessionPositiveContinuationRate: null,
      nextSessionNegativeContinuationRate: null,
      historyStartDate: "2024-01-02",
      historyEndDate: "2026-09-20",
      computedAt: new Date().toISOString(),
      latestSourceHistoryDate: "2026-09-20",
      latestEpisodeDateUsed: "2026-05-14",
      sourceDailyRowCount: 100,
      sourceEpisodeCount: 8,
    },
    comparableHistory: {
      comparableEpisodeCount: 3,
      closestComparableEpisodes: [],
      mostRecentComparableEpisode: {
        episodeId: "ep-1",
        sessionDate: "2026-05-14",
        tier: "NOTABLE",
        direction: "POSITIVE",
        movePct: 4,
        volume: null,
        rvol: null,
        dollarVolume: null,
        closePosition: null,
        nextSessionMovePct: null,
        nextSessionContinuation: null,
        similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
      },
    },
    evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
    assembledAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Historical workflow integration V1", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetWorkflowHistoricalContextInflightForTests();
  });

  it("persists compact workflow context and full repeat mover context for Radar handoff", () => {
    const context = baseContext();
    const workflow = persistHistoricalWorkflowHandoff(context, {
      symbol: "ABC",
      sourceSurface: "radar",
    });
    expect(workflow.securityId).toBe(SECURITY_ID);
    expect(workflow.historicalContextAvailable).toBe(true);
    expect(readHistoricalWorkflowContext("ABC")?.evidenceLabels).toContain("SIMILAR_PRIOR_EPISODES_FOUND");
    expect(readHistoricalWorkflowContextBySecurityId(SECURITY_ID)?.symbol).toBe("ABC");
    expect(readPreloadedRepeatMoverContext("ABC")?.securityId).toBe(SECURITY_ID);
  });

  it("builds routes with securityId query param from session", () => {
    persistHistoricalWorkflowHandoff(baseContext(), { symbol: "ABC", sourceSurface: "repeat_movers" });
    const routes = workflowSymbolRoutes("ABC");
    expect(routes?.ai).toContain("securityId=");
    expect(routes?.journal).toContain("symbol=ABC");
  });

  it("reuses preloaded context in resolve without fetch", async () => {
    const context = baseContext();
    const resolved = await resolveWorkflowHistoricalContext({
      symbol: "ABC",
      preloadedRepeatMoverContext: context,
      sourceSurface: "ai_analyst",
    });
    expect(resolved.repeatMoverContextLoaded).toBe(true);
    expect(resolved.workflow.securityId).toBe(SECURITY_ID);
    expect(sessionStorage.getItem(`${WORKFLOW_HISTORICAL_SESSION_PREFIX}ABC`)).toBeTruthy();
  });

  it("refetches when session context is stale", async () => {
    const stale = baseContext({
      profile: {
        ...baseContext().profile,
        computedAt: "2026-01-01T00:00:00.000Z",
        latestSourceHistoryDate: "2025-12-01",
        historyEndDate: "2026-09-01",
      },
    });
    persistHistoricalWorkflowHandoff(stale, { symbol: "ABC", sourceSurface: "radar" });

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ symbol: "ABC", securityId: SECURITY_ID, historicalContext: baseContext() }],
      }),
    })) as unknown as typeof fetch;

    const resolved = await resolveWorkflowHistoricalContext({
      symbol: "ABC",
      accessToken: "token",
      sourceSurface: "watchlist",
      nowMs: Date.parse("2026-09-22T16:00:00.000Z"),
      fetchImpl,
    });

    expect(resolved.repeatMoverContextLoaded).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("fails soft when context is missing", async () => {
    const resolved = await resolveWorkflowHistoricalContext({ symbol: "NOPE" });
    expect(resolved.workflow.historicalContextAvailable).toBe(false);
    expect(resolved.workflow.securityId).toBeNull();
    expect(resolved.repeatMoverContextLoaded).toBe(false);
  });

  it("stores journal observational reference without predictive fields", () => {
    const workflow = buildHistoricalWorkflowContext({
      symbol: "ABC",
      sourceSurface: "journal",
      repeatMoverContext: baseContext(),
    });
    const ref = journalReferenceFromWorkflow(workflow);
    persistJournalObservationalHistoricalReference(ref);
    const stored = readJournalObservationalHistoricalReference("ABC");
    expect(stored?.historicalContextAvailable).toBe(true);
    expect(stored?.comparableEpisodeCount).toBe(3);
    expect(JSON.stringify(stored).toLowerCase()).not.toContain("probability");
  });

  it("preserves inbox navigation identity via workflow routes", () => {
    persistHistoricalWorkflowHandoff(baseContext(), { symbol: "ABC", sourceSurface: "radar" });
    const aiPath = buildInboxWorkflowNavigatePath("ai", "ABC");
    expect(aiPath).toContain("securityId=");
    expect(readHistoricalWorkflowContext("ABC")?.sourceSurface).toBe("inbox");
  });

  it("does not zero-fill unavailable workflow context", () => {
    const workflow = buildHistoricalWorkflowContext({
      symbol: "ABC",
      sourceSurface: "unknown",
      repeatMoverContext: null,
    });
    expect(workflow.comparableEpisodeCount).toBe(0);
    expect(workflow.sampleSizeQuality).toBeNull();
    expect(workflow.historicalContextAvailable).toBe(false);
  });
});
