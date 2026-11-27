import { describe, expect, it } from "vitest";
import {
  newestProviderAsOfForTabRows,
  resolveActiveTabSessionReference,
} from "@/lib/screeners/tab-session-reference";

describe("tab session reference", () => {
  const nowMs = Date.parse("2026-11-27T19:00:00.000Z"); // 2:00 PM ET early-close RTH

  it("prefers newest provider_as_of on the active tab", () => {
    const ref = resolveActiveTabSessionReference({
      nowMs,
      activeTabId: "new_highs_lows",
      rows: [
        { tab_id: "gappers", provider_as_of: "2026-11-27T15:00:00.000Z" },
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-26T21:00:00.000Z" },
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-27T18:30:00.000Z" },
      ],
      syncedAt: "2026-11-27T18:00:00.000Z",
      providerAsOfMax: "2026-11-27T18:30:00.000Z",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "evaluated",
          baseline_status: "available",
          baseline_quote_count: 100,
          universe_count: 100,
          selected_count: 0,
        },
      },
    });
    expect(newestProviderAsOfForTabRows(
      [
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-27T18:30:00.000Z" },
      ],
      "new_highs_lows",
    )).toBe("2026-11-27T18:30:00.000Z");
    expect(ref).toBe("2026-11-27T18:30:00.000Z");
  });

  it("falls back to synced_at when tab evaluated current but row provider_as_of lags", () => {
    const ref = resolveActiveTabSessionReference({
      nowMs,
      activeTabId: "new_highs_lows",
      rows: [
        { tab_id: "new_highs_lows", provider_as_of: "2026-11-26T21:00:00.000Z" },
      ],
      syncedAt: "2026-11-27T18:00:00.000Z",
      providerAsOfMax: "2026-11-26T21:00:00.000Z",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "evaluated",
          baseline_status: "available",
          baseline_quote_count: 100,
          universe_count: 100,
          selected_count: 0,
        },
      },
    });
    expect(ref).toBe("2026-11-27T18:00:00.000Z");
  });
});