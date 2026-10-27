import { describe, expect, it, vi } from "vitest";
import {
  buildAmInboxLateSessionViewFromContexts,
} from "@/lib/am-inbox/am-inbox-late-session-view";
import { mapPersistedLateSessionRow } from "@/lib/am-inbox/late-session-handoff-persistence";
import { resolveAmInboxSessionDate } from "@/lib/am-inbox/resolve-am-inbox-session-date";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import { AM_INBOX_LATE_SESSION_EXPANDED_PAGE_SIZE, AM_INBOX_LATE_SESSION_VISIBLE_LIMIT } from "@/config/late-session-handoff.config";
import * as workflowStorage from "@/lib/historical-workflow/workflow-handoff-storage";
import {
  BATCH186_AM_SESSION_DATE,
  BATCH186_FRIDAY_DAY_TWO_COUNT,
  BATCH186_MONDAY_SOURCE_COUNT,
  BATCH186_PRODUCTION_ROW_COUNT,
  buildBatch186ProductionScaleRows,
} from "@/lib/am-inbox/__tests__/batch186-production-scale-fixture";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";

describe("Batch 186 — AM Inbox continuation acceptance", () => {
  it("resolveAmInboxSessionDate prefers workspace et_date", () => {
    expect(resolveAmInboxSessionDate("2026-10-27", Date.UTC(2026, 9, 27, 12))).toBe("2026-10-27");
    expect(resolveAmInboxSessionDate("", Date.UTC(2026, 9, 27, 12))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("processes 3,131 production-scale rows within a bounded window", () => {
    const rows = buildBatch186ProductionScaleRows();
    expect(rows).toHaveLength(BATCH186_PRODUCTION_ROW_COUNT);
    const contexts = rows.map((row) => mapPersistedLateSessionRow(row, BATCH186_AM_SESSION_DATE));
    const started = performance.now();
    const view = buildAmInboxLateSessionViewFromContexts(BATCH186_AM_SESSION_DATE, contexts, {
      mirrorCollapsedToSessionStorage: false,
    });
    const elapsedMs = performance.now() - started;
    expect(elapsedMs).toBeLessThan(8_000);
    expect(view.funnel.detectedCount).toBeGreaterThan(0);
    expect(view.candidates.length).toBeLessThanOrEqual(AM_INBOX_LATE_SESSION_VISIBLE_LIMIT);
    expect(view.qualifiedCandidates.length).toBeGreaterThan(AM_INBOX_LATE_SESSION_VISIBLE_LIMIT);
  });

  it("Monday captures visible on Tuesday AM; Monday AM omits Monday-source rows", () => {
    const mondayRow = buildBatch186ProductionScaleRows()[0]!;
    const tuesdayCtx = mapPersistedLateSessionRow(mondayRow, "2026-10-27");
    const mondayCtx = mapPersistedLateSessionRow(mondayRow, "2026-10-26");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: tuesdayCtx.sourceSessionDate,
        sourceCategory: tuesdayCtx.sourceCategory,
        amSessionDate: "2026-10-27",
      }).expiryState,
    ).toBe("active");
    const mondayView = buildAmInboxLateSessionViewFromContexts("2026-10-26", [mondayCtx], {
      mirrorCollapsedToSessionStorage: false,
    });
    expect(mondayView.funnel.detectedCount).toBe(0);
    expect(mondayView.expiredCount).toBe(1);
  });

  it("Friday Day-Two carryover remains valid on Tuesday AM", () => {
    const fridayRows = buildBatch186ProductionScaleRows().slice(BATCH186_MONDAY_SOURCE_COUNT);
    expect(fridayRows).toHaveLength(BATCH186_FRIDAY_DAY_TWO_COUNT);
    const contexts = fridayRows.map((row) => mapPersistedLateSessionRow(row, BATCH186_AM_SESSION_DATE));
    const view = buildAmInboxLateSessionViewFromContexts(BATCH186_AM_SESSION_DATE, contexts, {
      mirrorCollapsedToSessionStorage: false,
    });
    expect(view.funnel.detectedCount).toBe(BATCH186_FRIDAY_DAY_TWO_COUNT);
  });

  it("deduplicates workflow sessionStorage reads per symbol at scale", () => {
    const readSpy = vi.spyOn(workflowStorage, "readHistoricalWorkflowContext").mockReturnValue(null);
    const base = buildBatch186ProductionScaleRows()[0]!;
    const dupCategory = {
      ...base,
      id: "dup-2",
      source_category: "AFTER_HOURS_CONTINUATION" as const,
    };
    const rows = [base, dupCategory, ...buildBatch186ProductionScaleRows().slice(1, 400)];
    const contexts = rows.map((row) => mapPersistedLateSessionRow(row, BATCH186_AM_SESSION_DATE));
    buildAmInboxLateSessionViewFromContexts(BATCH186_AM_SESSION_DATE, contexts, {
      mirrorCollapsedToSessionStorage: false,
    });
    const monSymbolReads = readSpy.mock.calls.filter(([sym]) => sym === base.symbol).length;
    expect(monSymbolReads).toBe(1);
    expect(readSpy.mock.calls.length).toBeLessThan(contexts.length);
    readSpy.mockRestore();
  });

  it("six-card default, qualified fallback, and pagination pool sizing", () => {
    const contexts = buildBatch186ProductionScaleRows().map((row) =>
      mapPersistedLateSessionRow(row, BATCH186_AM_SESSION_DATE),
    );
    const view = buildAmInboxLateSessionViewFromContexts(BATCH186_AM_SESSION_DATE, contexts, {
      mirrorCollapsedToSessionStorage: false,
    });
    expect(view.candidates.length).toBeLessThanOrEqual(AM_INBOX_LATE_SESSION_VISIBLE_LIMIT);
    const expandedCap = AM_INBOX_LATE_SESSION_EXPANDED_PAGE_SIZE;
    expect(view.qualifiedCandidates.length).toBeGreaterThan(expandedCap);
  });

  it("deterministic ordering across two builds", () => {
    const sample = buildBatch186ProductionScaleRows().slice(0, 200).map((row) =>
      mapPersistedLateSessionRow(row, BATCH186_AM_SESSION_DATE),
    );
    const a = buildAmInboxLateSessionViewFromContexts(BATCH186_AM_SESSION_DATE, sample, {
      mirrorCollapsedToSessionStorage: false,
    });
    const b = buildAmInboxLateSessionViewFromContexts(BATCH186_AM_SESSION_DATE, sample, {
      mirrorCollapsedToSessionStorage: false,
    });
    expect(a.candidates.map((c) => c.context.symbol)).toEqual(
      b.candidates.map((c) => c.context.symbol),
    );
  });

  it("distinct security identities sharing ticker collapse with category union", () => {
    const base = buildLateSessionContinuationContext({
      symbol: "DUAL",
      sourceSessionDate: "2026-10-26",
      sourceTimestamp: "2026-10-26T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 2_000_000,
      rvol: 3,
    });
    const other = {
      ...base,
      securityId: "00000000-0000-4000-8000-000000000002" as const,
      sourceCategory: "AFTER_HOURS_CONTINUATION" as const,
    };
    const view = buildAmInboxLateSessionViewFromContexts(
      BATCH186_AM_SESSION_DATE,
      [base, other],
      { mirrorCollapsedToSessionStorage: false },
    );
    expect(view.funnel.detectedCount).toBe(2);
    expect(view.candidates.length).toBeGreaterThan(0);
  });
});
