import { describe, expect, it } from "vitest";
import {
  mergeWorkspaceLastKnownGood,
  preserveLastKnownGoodSection,
  REFRESH_UNAVAILABLE,
} from "@/lib/pre-market/last-known-good";
import { REASON_TEXT } from "@/components/pre-market/SectionShell";
import { numberOrDash } from "@/lib/pre-market/builders";
import type { PreMarketWorkspaceResponse, SectionEnvelope } from "@/types/pre-market";

function env<T>(partial: Partial<SectionEnvelope<T>> & { data: T }): SectionEnvelope<T> {
  return {
    status: "available",
    as_of: "2026-09-09T11:12:00.000Z",
    reason_code: null,
    ...partial,
  };
}

const watchlistRow = {
  ticker: "SPCX",
  company_name: null,
  direction: "neutral",
  explanation: "ok",
  failure_reason: null,
  price: 1,
  change_pct: 0,
  volume: 1000,
  rvol: null,
  rvol_class: null,
  market_signals: [],
  session_date: "2026-09-09",
  analyzed_at: "2026-09-09T11:00:00.000Z",
  valid_through: "2026-09-09T13:30:00.000Z",
  awaiting_refresh: false,
  request_status: "succeeded" as const,
};

const headline = {
  id: "h1",
  headline: "Markets open",
  source: "Reuters",
  url: "https://example.com/h",
  published_at: "2026-09-09T10:00:00.000Z",
  symbols: [] as string[],
};

function workspace(
  overrides: Partial<PreMarketWorkspaceResponse> = {},
): PreMarketWorkspaceResponse {
  const empty = env({ data: [] as never[] });
  return {
    contract_version: 1,
    server_now: "2026-09-09T11:15:00.000Z",
    earnings_confirmed_total: 0,
    watchlist_lifecycle: [],
    alerts_included: true,
    headlines_feed_sync: null,
    headlines_feed_sync_note: null,
    risk_attention_history: [],
    market_context: {
      status: "premarket",
      et_date: "2026-09-09",
      et_time: "7:15 AM",
      checked_at: "2026-09-09T11:15:00.000Z",
      source: "polygon_marketstatus",
      reason_code: null,
      official_open_at: null,
      official_close_at: null,
      next_known_session_at: null,
    },
    indexes: empty,
    watchlist_activity: env({ data: [watchlistRow] }),
    risk_attention: empty,
    catalyst_watch: empty,
    earnings: empty,
    volume_leaders: empty,
    journal_readiness: {
      status: "available",
      data: { open_trades: 0, missing_stop: 0, missing_target: 0, symbols: [] },
      as_of: "2026-09-09T11:15:00.000Z",
      reason_code: null,
    },
    headlines: env({ data: [headline] }),
    checklist: empty,
    ...overrides,
  };
}

describe("pre-market last-known-good", () => {
  it("keeps validated watchlist rows when a later refresh is QUERY_FAILED", () => {
    const previous = env({ data: [watchlistRow] });
    const next = env({
      status: "unavailable",
      data: [],
      as_of: null,
      reason_code: "QUERY_FAILED",
    });
    const kept = preserveLastKnownGoodSection(previous, next);
    expect(kept.status).toBe("stale");
    expect(kept.reason_code).toBe(REFRESH_UNAVAILABLE);
    expect(kept.data).toEqual([watchlistRow]);
    expect(kept.as_of).toBe("2026-09-09T11:12:00.000Z");
  });

  it("does not invent a snapshot when the first load failed", () => {
    const next = env({
      status: "unavailable",
      data: [],
      as_of: null,
      reason_code: "QUERY_FAILED",
    });
    const kept = preserveLastKnownGoodSection(null, next);
    expect(kept.status).toBe("unavailable");
    expect(kept.data).toEqual([]);
    expect(kept.reason_code).toBe("QUERY_FAILED");
  });

  it("replaces a stale snapshot when a later refresh is valid", () => {
    const stale = preserveLastKnownGoodSection(
      env({ data: [watchlistRow] }),
      env({ status: "unavailable", data: [], as_of: null, reason_code: "QUERY_FAILED" }),
    );
    const freshRow = { ...watchlistRow, ticker: "IREN" };
    const kept = preserveLastKnownGoodSection(stale, env({ data: [freshRow] }));
    expect(kept.status).toBe("available");
    expect(kept.data).toEqual([freshRow]);
    expect(kept.reason_code).toBeNull();
  });

  it("never promotes an unvalidated QUERY_FAILED envelope into last-known-good", () => {
    const invalid = env({
      status: "unavailable",
      data: [],
      as_of: null,
      reason_code: "QUERY_FAILED",
    });
    const next = env({
      status: "unavailable",
      data: [],
      as_of: null,
      reason_code: "QUERY_FAILED",
    });
    const kept = preserveLastKnownGoodSection(invalid, next);
    expect(kept.status).toBe("unavailable");
    expect(kept.data).toEqual([]);
  });

  it("does not preserve against calendar or session fail-closed reasons", () => {
    const previous = env({ data: [watchlistRow] });
    const next = env({
      status: "unavailable",
      data: [],
      as_of: null,
      reason_code: "CALENDAR_UNAVAILABLE",
    });
    expect(preserveLastKnownGoodSection(previous, next).reason_code).toBe("CALENDAR_UNAVAILABLE");
  });

  it("merges watchlist and headlines independently on a workspace refresh", () => {
    const prev = workspace();
    const next = workspace({
      watchlist_activity: env({
        status: "unavailable",
        data: [],
        as_of: null,
        reason_code: "QUERY_FAILED",
      }),
      headlines: env({
        status: "unavailable",
        data: [],
        as_of: null,
        reason_code: "QUERY_FAILED",
      }),
    });
    const merged = mergeWorkspaceLastKnownGood(prev, next);
    expect(merged.watchlist_activity.status).toBe("stale");
    expect(merged.watchlist_activity.data[0].ticker).toBe("SPCX");
    expect(merged.headlines.status).toBe("stale");
    expect(merged.headlines.data[0].id).toBe("h1");
  });

  it("surfaces honest refresh copy", () => {
    expect(REASON_TEXT.REFRESH_UNAVAILABLE).toContain("last validated");
  });

  it("never fabricates RVOL — missing values stay a dash", () => {
    expect(numberOrDash(null, (n) => n.toFixed(2))).toBe("—");
    expect(numberOrDash(undefined, (n) => n.toFixed(2))).toBe("—");
    expect(numberOrDash(1.5, (n) => n.toFixed(2))).toBe("1.50");
  });
});
