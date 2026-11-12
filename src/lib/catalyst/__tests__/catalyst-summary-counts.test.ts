import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalystTimeOfDay } from "@/types/catalyst";
import {
  addEtCalendarDays,
  countUpcomingEarningsInRows,
  CATALYST_UPCOMING_EARNINGS_PAGE_SIZE,
  CATALYST_UPCOMING_EARNINGS_SCAN_CAP,
  fetchCatalystUpcomingEarningsCount,
  fetchCatalystPublishedLast24Count,
  isEarningsReportingWindowStillOpen,
  isEventDateWithinUpcomingHorizon,
  isUpcomingEarningsSummaryRow,
  upcomingEarningsHorizonEndEt,
  type UpcomingEarningsRow,
} from "@/lib/catalyst/catalyst-summary-counts";

const NOON_ET_NOV_12 = Date.parse("2026-11-12T17:00:00.000Z"); // 12:00 ET
const MORNING_ET = Date.parse("2026-11-12T14:00:00.000Z"); // 09:00 ET
const LATE_EVENING_ET_NOV_12 = Date.parse("2026-11-13T03:30:00.000Z"); // 22:30 ET Nov 12

function earningsRow(
  overrides: Partial<UpcomingEarningsRow> & { id?: string } = {},
): UpcomingEarningsRow {
  return {
    id: overrides.id ?? "earn-1",
    event_type: "earnings",
    event_date: "2026-11-15",
    event_time: null,
    time_of_day: null,
    published_at: "2026-11-01T12:00:00.000Z",
    verification_state: "provider_reported",
    ...overrides,
  };
}

describe("ET horizon boundaries", () => {
  it("adds calendar days across DST spring-forward week", () => {
    expect(addEtCalendarDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addEtCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("uses inclusive ET last day for upcomingDays", () => {
    const end = upcomingEarningsHorizonEndEt(NOON_ET_NOV_12, 30);
    expect(end).toBe(addEtCalendarDays("2026-11-12", 30));
    expect(
      isEventDateWithinUpcomingHorizon("2026-12-12", NOON_ET_NOV_12, 30),
    ).toBe(true);
    expect(
      isEventDateWithinUpcomingHorizon("2026-12-13", NOON_ET_NOV_12, 30),
    ).toBe(false);
  });

  it("classifies late-evening ET queries on the correct calendar day", () => {
    expect(isEventDateWithinUpcomingHorizon("2026-11-12", LATE_EVENING_ET_NOV_12, 30)).toBe(
      true,
    );
    expect(
      isUpcomingEarningsSummaryRow(
        earningsRow({
          event_date: "2026-11-12",
          time_of_day: "after_close",
        }),
        LATE_EVENING_ET_NOV_12,
        30,
      ),
    ).toBe(false);
  });
});

describe("isEarningsReportingWindowStillOpen", () => {
  it("excludes before-open on today after 9:30 AM ET", () => {
    const row = earningsRow({
      event_date: "2026-11-12",
      time_of_day: "before_open",
    });
    expect(isEarningsReportingWindowStillOpen(row, MORNING_ET)).toBe(true);
    expect(isEarningsReportingWindowStillOpen(row, NOON_ET_NOV_12)).toBe(false);
  });

  it("keeps after-close today upcoming before the window ends", () => {
    const row = earningsRow({
      event_date: "2026-11-12",
      time_of_day: "after_close",
    });
    expect(isEarningsReportingWindowStillOpen(row, NOON_ET_NOV_12)).toBe(true);
  });

  it("treats unknown timing on today as still open (unconfirmed)", () => {
    const row = earningsRow({
      event_date: "2026-11-12",
      time_of_day: "unknown",
    });
    expect(isEarningsReportingWindowStillOpen(row, NOON_ET_NOV_12)).toBe(true);
  });

  it("uses exact event_time when supplied", () => {
    const future = earningsRow({
      event_date: "2026-11-12",
      event_time: new Date(NOON_ET_NOV_12 + 3_600_000).toISOString(),
      time_of_day: "after_close",
    });
    const past = earningsRow({
      event_date: "2026-11-12",
      event_time: new Date(MORNING_ET - 3_600_000).toISOString(),
    });
    expect(isEarningsReportingWindowStillOpen(future, NOON_ET_NOV_12)).toBe(true);
    expect(isEarningsReportingWindowStillOpen(past, NOON_ET_NOV_12)).toBe(false);
  });
});

describe("isUpcomingEarningsSummaryRow", () => {
  it("counts future earnings with older published_at", () => {
    expect(
      isUpcomingEarningsSummaryRow(
        earningsRow({
          event_date: "2026-11-20",
          published_at: "2026-11-09T12:00:00.000Z",
        }),
        NOON_ET_NOV_12,
        30,
      ),
    ).toBe(true);
  });

  it("rejects today before_open after the open window", () => {
    expect(
      isUpcomingEarningsSummaryRow(
        earningsRow({ event_date: "2026-11-12", time_of_day: "before_open" }),
        NOON_ET_NOV_12,
        30,
      ),
    ).toBe(false);
  });

  it("keeps today after_close before reporting at noon", () => {
    expect(
      isUpcomingEarningsSummaryRow(
        earningsRow({ event_date: "2026-11-12", time_of_day: "after_close" }),
        NOON_ET_NOV_12,
        30,
      ),
    ).toBe(true);
  });

  it("rejects non-earnings and missing schedule", () => {
    expect(
      isUpcomingEarningsSummaryRow(
        { ...earningsRow(), event_type: "company_news" },
        NOON_ET_NOV_12,
        30,
      ),
    ).toBe(false);
    expect(
      isUpcomingEarningsSummaryRow(
        earningsRow({ event_date: null as unknown as string }),
        NOON_ET_NOV_12,
        30,
      ),
    ).toBe(false);
  });
});

describe("countUpcomingEarningsInRows", () => {
  it("saturation: feed-first-500 historical rows yield zero; full set counts upcoming", () => {
    const historical = Array.from({ length: 500 }, (_, i) =>
      earningsRow({
        id: `h-${i}`,
        event_date: `2026-11-${String(9 + (i % 3)).padStart(2, "0")}`,
      }),
    );
    expect(countUpcomingEarningsInRows(historical, NOON_ET_NOV_12, 30)).toBe(0);

    const withUpcoming = [
      ...historical,
      earningsRow({ id: "u1", event_date: "2026-11-13" }),
      earningsRow({ id: "u2", event_date: "2026-11-14" }),
    ];
    expect(countUpcomingEarningsInRows(withUpcoming, NOON_ET_NOV_12, 30)).toBe(2);
  });
});

function mockPagedClient(allRows: UpcomingEarningsRow[]) {
  const ranges: Array<{ from: number; to: number }> = [];
  const orders: string[] = [];
  const client = {
    from() {
      return {
        select() {
          const api: Record<string, unknown> = {};
          const self = () => api;
          api.eq = self;
          api.gte = self;
          api.lte = self;
          api.order = (col: string) => {
            orders.push(col);
            return api;
          };
          api.range = (from: number, to: number) => {
            ranges.push({ from, to });
            const slice = allRows.slice(from, to + 1);
            return Promise.resolve({ data: slice, error: null });
          };
          return api;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, ranges, orders };
}

describe("fetchCatalystUpcomingEarningsCount pagination", () => {
  it("scans >1 page on shared event_date without duplicate or missing ids", async () => {
    const total = CATALYST_UPCOMING_EARNINGS_PAGE_SIZE + 250;
    const rows: UpcomingEarningsRow[] = Array.from({ length: total }, (_, i) =>
      earningsRow({
        id: `uuid-${String(i).padStart(5, "0")}`,
        event_date: "2026-11-20",
        time_of_day: "after_close" as CatalystTimeOfDay,
      }),
    );
    const { client, ranges, orders } = mockPagedClient(rows);
    const result = await fetchCatalystUpcomingEarningsCount(client, {
      nowMs: NOON_ET_NOV_12,
    });
    expect(result.error).toBeUndefined();
    expect(result.count).toBe(total);
    expect(ranges).toEqual([
      { from: 0, to: CATALYST_UPCOMING_EARNINGS_PAGE_SIZE - 1 },
      {
        from: CATALYST_UPCOMING_EARNINGS_PAGE_SIZE,
        to: CATALYST_UPCOMING_EARNINGS_PAGE_SIZE + CATALYST_UPCOMING_EARNINGS_PAGE_SIZE - 1,
      },
    ]);
    expect(orders.filter((c) => c === "event_date")).toHaveLength(2);
    expect(orders.filter((c) => c === "id")).toHaveLength(2);
  });

  it(
    "marks truncated when scan cap is reached",
    async () => {
      const rows: UpcomingEarningsRow[] = Array.from(
        { length: CATALYST_UPCOMING_EARNINGS_SCAN_CAP },
        (_, i) =>
          earningsRow({
            id: `cap-${i}`,
            event_date: "2026-11-25",
          }),
      );
      const { client } = mockPagedClient(rows);
      const result = await fetchCatalystUpcomingEarningsCount(client, {
        nowMs: NOON_ET_NOV_12,
      });
      expect(result.truncated).toBe(true);
      expect(result.count).toBe(CATALYST_UPCOMING_EARNINGS_SCAN_CAP);
    },
    20_000,
  );

  it("surfaces PostgREST errors without throwing", async () => {
    const client = {
      from() {
        return {
          select() {
            const chain = {
              eq: () => chain,
              gte: () => chain,
              lte: () => chain,
              order: () => chain,
              range: () =>
                Promise.resolve({ data: null, error: { message: "permission denied" } }),
            };
            return chain;
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
            const chain = {
              eq: () => chain,
              gte: () => chain,
              lte: () => chain,
              then(onFulfilled: (v: unknown) => unknown) {
                return Promise.resolve({ count: null, error: { message: "timeout" } }).then(
                  onFulfilled,
                );
              },
            };
            return chain;
          },
        };
      },
    } as unknown as SupabaseClient;
    const r = await fetchCatalystPublishedLast24Count(client, { nowMs: NOON_ET_NOV_12 });
    expect(r.count).toBe(0);
    expect(r.error).toBe("timeout");
  });

  it("applies upper bound on published_at", async () => {
    const filters: { gte?: string; lte?: string } = {};
    const client = {
      from() {
        return {
          select() {
            const chain = {
              eq: () => chain,
              gte: (_col: string, v: string) => {
                filters.gte = v;
                return chain;
              },
              lte: (_col: string, v: string) => {
                filters.lte = v;
                return chain;
              },
              then(onFulfilled: (v: unknown) => unknown) {
                return Promise.resolve({ count: 12, error: null }).then(onFulfilled);
              },
            };
            return chain;
          },
        };
      },
    } as unknown as SupabaseClient;
    await fetchCatalystPublishedLast24Count(client, { nowMs: NOON_ET_NOV_12 });
    expect(filters.gte).toBeDefined();
    expect(filters.lte).toBe(new Date(NOON_ET_NOV_12).toISOString());
  });
});
