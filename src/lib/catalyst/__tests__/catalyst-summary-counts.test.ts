import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countUpcomingEarningsInRows,
  fetchCatalystUpcomingEarningsCount,
  fetchCatalystPublishedLast24Count,
  isUpcomingEarningsSummaryRow,
} from "@/lib/catalyst/catalyst-summary-counts";

const NOON_ET_NOV_12 = Date.parse("2026-11-12T17:00:00.000Z"); // 12:00 ET
const MORNING_ET = Date.parse("2026-11-12T14:00:00.000Z"); // 09:00 ET

function earningsRow(overrides: Partial<{
  event_date: string | null;
  event_time: string | null;
  published_at: string | null;
  verification_state: "provider_reported";
}> = {}) {
  return {
    event_type: "earnings" as const,
    event_date: "2026-11-15",
    event_time: null,
    published_at: "2026-11-01T12:00:00.000Z",
    verification_state: "provider_reported" as const,
    ...overrides,
  };
}

describe("isUpcomingEarningsSummaryRow", () => {
  it("counts future date-only earnings with older published_at (not demoted)", () => {
    const row = earningsRow({
      event_date: "2026-11-20",
      published_at: "2026-11-09T12:00:00.000Z",
    });
    expect(isUpcomingEarningsSummaryRow(row, NOON_ET_NOV_12, 30)).toBe(true);
  });

  it("keeps today after-close date-only earnings upcoming at noon ET", () => {
    const row = earningsRow({
      event_date: "2026-11-12",
      event_time: null,
      published_at: "2026-11-10T20:00:00.000Z",
    });
    expect(isUpcomingEarningsSummaryRow(row, NOON_ET_NOV_12, 30)).toBe(true);
  });

  it("excludes today earnings when event_time is before now", () => {
    const row = earningsRow({
      event_date: "2026-11-12",
      event_time: new Date(MORNING_ET - 3_600_000).toISOString(),
    });
    expect(isUpcomingEarningsSummaryRow(row, NOON_ET_NOV_12, 30)).toBe(false);
  });

  it("includes today earnings when event_time is after now", () => {
    const row = earningsRow({
      event_date: "2026-11-12",
      event_time: new Date(NOON_ET_NOV_12 + 3_600_000).toISOString(),
    });
    expect(isUpcomingEarningsSummaryRow(row, NOON_ET_NOV_12, 30)).toBe(true);
  });

  it("rejects missing schedule fields", () => {
    const row = earningsRow({ event_date: null, event_time: null });
    expect(isUpcomingEarningsSummaryRow(row, NOON_ET_NOV_12, 30)).toBe(false);
  });

  it("rejects non-earnings and non-provider-reported", () => {
    expect(
      isUpcomingEarningsSummaryRow(
        { ...earningsRow(), event_type: "company_news" },
        NOON_ET_NOV_12,
        30,
      ),
    ).toBe(false);
  });

  it("rejects earnings beyond the upcoming window", () => {
    const row = earningsRow({ event_date: "2027-01-15" });
    expect(isUpcomingEarningsSummaryRow(row, NOON_ET_NOV_12, 30)).toBe(false);
  });
});

describe("countUpcomingEarningsInRows", () => {
  it("saturation: feed-first-500 historical rows yield zero; full set counts upcoming", () => {
    const historical = Array.from({ length: 500 }, (_, i) =>
      earningsRow({
        event_date: `2026-11-${String(9 + (i % 3)).padStart(2, "0")}`,
        published_at: "2026-11-09T09:30:00.000Z",
      }),
    );
    const feedOnly = countUpcomingEarningsInRows(historical, NOON_ET_NOV_12, 30);
    expect(feedOnly).toBe(0);

    const withUpcoming = [
      ...historical,
      earningsRow({ event_date: "2026-11-13" }),
      earningsRow({ event_date: "2026-11-14" }),
    ];
    expect(countUpcomingEarningsInRows(withUpcoming, NOON_ET_NOV_12, 30)).toBe(2);
  });

  it("returns zero for empty input", () => {
    expect(countUpcomingEarningsInRows([], NOON_ET_NOV_12, 30)).toBe(0);
  });
});

function mockChain(result: { data?: unknown[]; error?: { message: string } | null; count?: number }) {
  const terminal = {
    then(onFulfilled: (v: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  const chain = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return terminal.then.bind(terminal);
        return () => chain;
      },
    },
  );
  return chain;
}

describe("fetchCatalystUpcomingEarningsCount", () => {
  it("surfaces PostgREST errors without throwing", async () => {
    const client = {
      from() {
        return {
          select() {
            return mockChain({ data: undefined, error: { message: "permission denied" } });
          },
        };
      },
    } as unknown as SupabaseClient;
    const r = await fetchCatalystUpcomingEarningsCount(client, { nowMs: NOON_ET_NOV_12 });
    expect(r.count).toBe(0);
    expect(r.error).toBe("permission denied");
  });
});

describe("fetchCatalystPublishedLast24Count", () => {
  it("surfaces head count errors", async () => {
    const client = {
      from() {
        return {
          select() {
            return mockChain({ count: null, error: { message: "timeout" } });
          },
        };
      },
    } as unknown as SupabaseClient;
    const r = await fetchCatalystPublishedLast24Count(client, { nowMs: NOON_ET_NOV_12 });
    expect(r.count).toBe(0);
    expect(r.error).toBe("timeout");
  });
});
