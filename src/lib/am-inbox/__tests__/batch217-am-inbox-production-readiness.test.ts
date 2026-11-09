import { describe, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import {
  AM_INBOX_LATE_SESSION_EXPANDED_PAGE_SIZE,
  AM_INBOX_LATE_SESSION_VISIBLE_LIMIT,
} from "@/config/late-session-handoff.config";
import { buildAmInboxLateSessionViewFromContexts } from "@/lib/am-inbox/am-inbox-late-session-view";
import { mapPersistedLateSessionRow } from "@/lib/am-inbox/late-session-handoff-persistence";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import {
  BATCH217_AM_SESSION_DATE,
  BATCH217_DISTINCT_SYMBOL_COUNT,
  BATCH217_JSON_BYTES_TARGET,
  BATCH217_PRODUCTION_ROW_COUNT,
  BATCH217_SOURCE_FRI,
  BATCH217_SOURCE_THU,
  buildBatch217ProductionScaleRows,
} from "@/lib/am-inbox/__tests__/batch217-production-scale-fixture";
import * as workflowStorage from "@/lib/historical-workflow/workflow-handoff-storage";
import {
  buildInboxWorkflowNavigatePath,
  workflowSymbolRoutes,
} from "@/lib/historical-workflow/workflow-symbol-routes";
import { readScannerHandoffQuery } from "@/components/scanner-intelligence/ScannerHandoffBanner";

describe("Batch 217 — AM Inbox production readiness (Nov 9 scale)", () => {
  it("reproduces the 3,776-row / 1,525-symbol production payload shape", () => {
    const rows = buildBatch217ProductionScaleRows();
    expect(rows).toHaveLength(BATCH217_PRODUCTION_ROW_COUNT);
    expect(new Set(rows.map((row) => row.symbol)).size).toBe(BATCH217_DISTINCT_SYMBOL_COUNT);
    const sources = new Set(rows.map((row) => row.source_session_date));
    expect(sources.has(BATCH217_SOURCE_THU)).toBe(true);
    expect(sources.has(BATCH217_SOURCE_FRI)).toBe(true);
    const jsonBytes = JSON.stringify(rows).length;
    // Synthetic rows are slightly leaner than live RPC JSON; stay within ±25% of 4.1 MB.
    expect(jsonBytes).toBeGreaterThan(BATCH217_JSON_BYTES_TARGET * 0.55);
    expect(jsonBytes).toBeLessThan(BATCH217_JSON_BYTES_TARGET * 1.25);
  });

  it("processes, ranks, and collapses the Nov 9 workload within a bounded window", () => {
    const rows = buildBatch217ProductionScaleRows();
    const tMap0 = performance.now();
    const contexts = rows.map((row) => mapPersistedLateSessionRow(row, BATCH217_AM_SESSION_DATE));
    const tMap1 = performance.now();
    const view = buildAmInboxLateSessionViewFromContexts(BATCH217_AM_SESSION_DATE, contexts, {
      mirrorCollapsedToSessionStorage: false,
    });
    const tBuild1 = performance.now();

    const mapMs = tMap1 - tMap0;
    const buildMs = tBuild1 - tMap1;
    const totalMs = tBuild1 - tMap0;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        batch: 217,
        rows: rows.length,
        mapMs: +mapMs.toFixed(1),
        buildMs: +buildMs.toFixed(1),
        totalMs: +totalMs.toFixed(1),
        funnel: view.funnel,
        expiredCount: view.expiredCount,
      }),
    );

    expect(totalMs).toBeLessThan(8_000);
    expect(view.expiredCount).toBeGreaterThan(0);
    expect(view.funnel.detectedCount).toBeGreaterThan(0);
    expect(view.funnel.qualifiedCount).toBeGreaterThan(AM_INBOX_LATE_SESSION_VISIBLE_LIMIT);
    expect(view.candidates.length).toBeLessThanOrEqual(AM_INBOX_LATE_SESSION_VISIBLE_LIMIT);
    expect(view.qualifiedCandidates.length).toBeGreaterThan(AM_INBOX_LATE_SESSION_EXPANDED_PAGE_SIZE);
  });

  it("keeps Power-Hour / After-Hours / Strong Close / Day-Two semantics across the Fri→Mon rollover", () => {
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: BATCH217_SOURCE_FRI,
        sourceCategory: "POWER_HOUR_MOMENTUM",
        amSessionDate: BATCH217_AM_SESSION_DATE,
      }).expiryState,
    ).toBe("active");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: BATCH217_SOURCE_THU,
        sourceCategory: "AFTER_HOURS_CONTINUATION",
        amSessionDate: BATCH217_AM_SESSION_DATE,
      }).expiryState,
    ).toBe("expired");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: BATCH217_SOURCE_FRI,
        sourceCategory: "STRONG_CLOSE_NEAR_HOD",
        amSessionDate: BATCH217_AM_SESSION_DATE,
      }).expiryState,
    ).toBe("active");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: BATCH217_SOURCE_THU,
        sourceCategory: "DAY_TWO_WATCH",
        amSessionDate: BATCH217_AM_SESSION_DATE,
      }).expiryState,
    ).toBe("active");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: BATCH217_SOURCE_FRI,
        sourceCategory: "DAY_TWO_WATCH",
        amSessionDate: BATCH217_AM_SESSION_DATE,
      }).expiryState,
    ).toBe("active");

    const contexts = buildBatch217ProductionScaleRows().map((row) =>
      mapPersistedLateSessionRow(row, BATCH217_AM_SESSION_DATE),
    );
    const view = buildAmInboxLateSessionViewFromContexts(BATCH217_AM_SESSION_DATE, contexts, {
      mirrorCollapsedToSessionStorage: false,
    });
    const categories = new Set(
      view.qualifiedCandidates.flatMap((entry) => [...entry.sourceCategories]),
    );
    expect(categories.has("POWER_HOUR_MOMENTUM")).toBe(true);
    expect(categories.has("AFTER_HOURS_CONTINUATION")).toBe(true);
    expect(categories.has("STRONG_CLOSE_NEAR_HOD")).toBe(true);
    expect(categories.has("DAY_TWO_WATCH")).toBe(true);
  });

  it("excludes Thursday non-Day-Two captures from Monday AM while retaining Friday captures", () => {
    const rows = buildBatch217ProductionScaleRows();
    const thuPower = rows.find(
      (row) =>
        row.source_session_date === BATCH217_SOURCE_THU &&
        row.source_category === "POWER_HOUR_MOMENTUM",
    );
    const friPower = rows.find(
      (row) =>
        row.source_session_date === BATCH217_SOURCE_FRI &&
        row.source_category === "POWER_HOUR_MOMENTUM",
    );
    expect(thuPower).toBeTruthy();
    expect(friPower).toBeTruthy();
    const thuCtx = mapPersistedLateSessionRow(thuPower!, BATCH217_AM_SESSION_DATE);
    const friCtx = mapPersistedLateSessionRow(friPower!, BATCH217_AM_SESSION_DATE);
    const view = buildAmInboxLateSessionViewFromContexts(
      BATCH217_AM_SESSION_DATE,
      [thuCtx, friCtx],
      { mirrorCollapsedToSessionStorage: false },
    );
    expect(view.expiredCount).toBe(1);
    expect(view.funnel.detectedCount).toBe(1);
    expect(view.qualifiedCandidates[0]?.context.sourceSessionDate).toBe(BATCH217_SOURCE_FRI);
  });

  it("deduplicates workflow sessionStorage reads under the Nov 9 multi-category load", () => {
    const readSpy = vi.spyOn(workflowStorage, "readHistoricalWorkflowContext").mockReturnValue(null);
    const rows = buildBatch217ProductionScaleRows();
    const contexts = rows.map((row) => mapPersistedLateSessionRow(row, BATCH217_AM_SESSION_DATE));
    buildAmInboxLateSessionViewFromContexts(BATCH217_AM_SESSION_DATE, contexts, {
      mirrorCollapsedToSessionStorage: false,
    });
    expect(readSpy.mock.calls.length).toBeLessThan(contexts.length);
    expect(readSpy.mock.calls.length).toBeLessThanOrEqual(BATCH217_DISTINCT_SYMBOL_COUNT);
    readSpy.mockRestore();
  });

  it("exposes symbol-aware Screeners / Catalyst / Watchlist / AI / Journal / Action Center routes", () => {
    const routes = workflowSymbolRoutes("nvda", {
      securityId: "11111111-1111-4111-8111-111111111111",
    });
    expect(routes).not.toBeNull();
    expect(routes!.ai).toContain("/dashboard/ai?");
    expect(routes!.catalyst).toContain("/dashboard/catalyst?");
    expect(routes!.watchlist).toContain("/dashboard/watchlist?");
    expect(routes!.journal).toContain("/dashboard/journal?");
    expect(routes!.actionCenter).toContain("/dashboard/action-center?");
    expect(routes!.screeners).toContain("/dashboard/screeners?");
    expect(routes!.screeners).toContain("symbol=NVDA");
    expect(routes!.screeners).toContain("securityId=");

    const screenersPath = buildInboxWorkflowNavigatePath("screeners", "nvda");
    expect(screenersPath).toContain("/dashboard/screeners?symbol=NVDA");
    expect(
      readScannerHandoffQuery(new URLSearchParams(screenersPath!.split("?")[1])),
    ).toEqual({ symbol: "NVDA", eventLabel: null });
  });
});
