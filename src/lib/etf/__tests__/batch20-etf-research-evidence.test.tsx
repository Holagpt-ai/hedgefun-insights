import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EtfFundOverview } from "@/components/etf/EtfFundOverview";
import { EtfHoldingsSection } from "@/components/etf/EtfHoldingsSection";
import { EtfPerformanceChart } from "@/components/etf/EtfPerformanceChart";
import { EtfSectorBreakdown } from "@/components/etf/EtfSectorBreakdown";
import { getEtParts, isTradingDay, previousTradingDay } from "@/lib/market-calendar";
import { estTimezoneAbbr } from "@/lib/price-utils";
import { resolveChartAggregateRequest } from "@/lib/stock-chart/chart-ranges";
import { formatChartDataDisclosure } from "@/lib/stock-chart/chart-disclosure";
import { fetchChartAggregateBars } from "@/lib/stock-chart/fetch-aggregates";
import { normalizeAggregateBars, toOhlcvSeries, type NormalizedBar } from "@/lib/stock-chart/normalize-bars";
import { buildEtfStatGrid, buildFundDetailRows, formatReportedAum } from "@/lib/etf/fund-metrics";
import { classifySnapshotDayVolume, dailyAggregateBarDate } from "@/lib/etf/snapshot-volume";
import { largestInternalTradingGap, observedPriceRange } from "@/lib/etf/price-performance";
import {
  isSyntheticWeightLadder,
  presentEtfHoldings,
} from "@/lib/etf/holdings-evidence";
import {
  buildEtfPerformance,
  formatPriceReturn,
  loadEtfDailyBars,
  periodBoundaryDate,
  priceReturnForPeriod,
} from "@/lib/etf/price-performance";
import { etfResearchQueryKeys } from "@/lib/etf/query-keys";
import { presentEtfQuote } from "@/lib/etf/quote-state";
import { presentSectorExposure } from "@/lib/etf/sector-exposure";
import EtfDetailPage from "@/pages/etf/EtfDetailPage";

const { aggregatesMock, snapshotMock, detailsMock, newsMock, fromMock, invokeMock } = vi.hoisted(() => ({
  aggregatesMock: vi.fn(),
  snapshotMock: vi.fn(),
  detailsMock: vi.fn(),
  newsMock: vi.fn(),
  fromMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock("@/lib/polygon", () => ({
  getAggregates: (...args: unknown[]) => aggregatesMock(...args),
  getTickerSnapshot: (...args: unknown[]) => snapshotMock(...args),
  getTickerDetails: (...args: unknown[]) => detailsMock(...args),
  getTickerNews: (...args: unknown[]) => newsMock(...args),
}));

vi.mock("@/components/charts/TradingViewChart", () => ({
  default: ({ loading, data }: { loading?: boolean; data: { time: string | number }[] }) => (
    <div data-testid="etf-chart">
      {loading ? "loading" : data.length ? data.map((bar) => String(bar.time)).join("|") : "empty"}
    </div>
  ),
}));

vi.mock("@/components/layout/AdBanner", () => ({
  AdBanner: () => <div data-testid="ad-banner" />,
}));

vi.mock("recharts", () => {
  const Frame = ({ children }: { children?: unknown }) => {
    const content = typeof children === "function"
      ? (children as (size: { width: number; height: number }) => unknown)({ width: 400, height: 200 })
      : children;
    return <div>{content as never}</div>;
  };
  const Pass = ({ children }: { children?: unknown }) => <div>{children as never}</div>;
  return {
    ResponsiveContainer: Frame,
    PieChart: Pass,
    Pie: () => null,
    Cell: () => null,
    Tooltip: () => null,
    BarChart: Pass,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

function daily(date: string, close: number, high = close + 1, low = close - 0.5): NormalizedBar {
  return {
    utcMs: Date.parse(`${date}T00:00:00.000Z`),
    open: close,
    high,
    low,
    close,
    volume: 1_000,
  };
}

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dailyHistoryForTradingDays(from: string, to: string, close = 100): NormalizedBar[] {
  const bars: NormalizedBar[] = [];
  let cursor = from;
  while (cursor <= to) {
    const weekday = new Date(`${cursor}T12:00:00.000Z`).getUTCDay();
    if (isTradingDay(cursor, weekday)) {
      bars.push(daily(cursor, close + bars.length * 0.01, close + 5, close - 5));
    }
    cursor = shiftIsoDate(cursor, 1);
  }
  return bars;
}

const MARCH_16 = new Date("2026-03-16T15:00:00.000Z");

function ytdBars(): NormalizedBar[] {
  return [
    daily("2026-03-16", 120, 130, 90),
    daily("2025-12-31", 100, 101, 99),
    daily("2026-01-02", 110, 112, 108),
  ];
}

function renderEtf(symbol = "spy") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/etf/${symbol}`]}>
        <Routes>
          <Route path="/etf/:symbol" element={<EtfDetailPage />} />
          <Route
            path="/etf-switch"
            element={<TickerSwitchHarness />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function TickerSwitchHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/etf/qqq")}>Open QQQ</button>
      <Routes>
        <Route path="/etf/:symbol" element={<EtfDetailPage />} />
      </Routes>
    </>
  );
}

beforeEach(() => {
  aggregatesMock.mockReset();
  snapshotMock.mockReset();
  detailsMock.mockReset();
  newsMock.mockReset();
  fromMock.mockReset();
  invokeMock.mockReset();
  newsMock.mockResolvedValue([]);
  detailsMock.mockImplementation(async (symbol: string) => ({
    name: symbol === "QQQ" ? "Invesco QQQ Trust" : "SPDR S&P 500 ETF Trust",
    primary_exchange: "ARCX",
    list_date: "1993-01-22",
    description: "Provider description text",
  }));
  snapshotMock.mockResolvedValue({
    day: { c: 510, v: 3_000_000, h: 512, l: 500, t: Date.now() - 60_000 },
    prevDay: { c: 500 },
    todaysChange: 10,
    todaysChangePerc: 2,
  });
  aggregatesMock.mockResolvedValue([]);
  fromMock.mockImplementation(() => ({
    select: () => ({
      eq: (_column: string, symbol: string) => ({
        maybeSingle: async () => ({
          data: {
            id: "1",
            symbol,
            name: symbol === "QQQ" ? "Invesco QQQ Trust" : "SPDR S&P 500 ETF Trust",
            price: 400,
            change_percent: null,
            total_assets: 500_000_000_000,
            expense_ratio: 0.0945,
            holdings: null,
            volume: 1_000_000,
            asset_class: "Equity",
            provider: "State Street Global Advisors",
            inception_date: "1993-01-22",
            updated_at: "2026-03-01T15:00:00.000Z",
            ytd_return: 99,
          },
          error: null,
        }),
      }),
    }),
  }));
});

describe("Batch 20 — holdings evidence", () => {
  it("does not show the old hardcoded SPY book as current holdings", () => {
    expect(presentEtfHoldings("SPY", null)).toEqual({ status: "unavailable", reason: "no_verified_feed" });
    expect(presentEtfHoldings("SPY", { kind: "static_catalog" }).status).toBe("unavailable");
    render(<EtfHoldingsSection evidence={presentEtfHoldings("SPY", null)} />);
    expect(screen.getByText("Holdings composition unavailable")).toBeInTheDocument();
    expect(screen.queryByText("7.12%")).not.toBeInTheDocument();
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
  });

  it("never classifies related-company records as constituents", () => {
    const evidence = presentEtfHoldings("ARKK", {
      kind: "related_companies",
      records: [
        { ticker: "AAPL", name: "Apple" },
        { ticker: "MSFT", name: "Microsoft" },
      ],
    });
    expect(evidence).toEqual({ status: "unavailable", reason: "related_companies" });
  });

  it("does not invent portfolio weights for records that lack them", () => {
    expect(isSyntheticWeightLadder([10, 9.2, 8.4])).toBe(true);
    const evidence = presentEtfHoldings("XLK", {
      kind: "verified",
      source: "issuer",
      asOf: "2026-09-30",
      holdings: [
        { symbol: "AAPL", name: "Apple" },
        { symbol: "MSFT", name: "Microsoft" },
      ],
    });
    expect(evidence.status).toBe("unavailable");
    expect(JSON.stringify(evidence)).not.toContain("10.00");
    expect(JSON.stringify(evidence)).not.toContain("9.20");
  });

  it("keeps sourced constituents, drops malformed rows, and rejects duplicate symbols", () => {
    const evidence = presentEtfHoldings("SPY", {
      kind: "verified",
      source: "Issuer holdings file",
      asOf: "2026-09-30",
      holdings: [
        { symbol: "bad symbol", name: "Nope", weight: 5 },
        { symbol: "AAPL", name: "Apple", weight: "7.50%" },
        { symbol: "MSFT", name: "Microsoft", weight: 0 },
        { ticker: "NVDA", name: "NVIDIA", weightPercent: 6.25 },
      ],
    });
    expect(evidence.status).toBe("available");
    if (evidence.status !== "available") return;
    expect(evidence.asOf).toBe("2026-09-30");
    expect(evidence.holdings.map((row) => row.symbol)).toEqual(["AAPL", "NVDA"]);
    render(
      <MemoryRouter>
        <EtfHoldingsSection evidence={evidence} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "AAPL" })).toHaveAttribute("href", "/stocks/aapl");
    expect(screen.getByText("Source: Issuer holdings file · As of 2026-09-30")).toBeInTheDocument();

    const duplicate = presentEtfHoldings("SPY", {
      kind: "verified",
      source: "Issuer holdings file",
      holdings: [
        { symbol: "AAPL", weight: 7 },
        { symbol: "AAPL", weight: 8 },
      ],
    });
    expect(duplicate).toEqual({ status: "unavailable", reason: "invalid_records" });

    const overAllocated = presentEtfHoldings("SPY", {
      kind: "verified",
      source: "Issuer holdings file",
      holdings: [
        { symbol: "AAPL", weight: 80 },
        { symbol: "MSFT", weight: 30 },
      ],
    });
    expect(overAllocated.status).toBe("unavailable");
  });
});

describe("Batch 20 — sector exposure", () => {
  it("does not render fabricated sector allocations", () => {
    expect(presentSectorExposure(null)).toEqual({ status: "unavailable", reason: "no_verified_feed" });
    const inferred = presentSectorExposure({ kind: "holdings_inference" });
    expect(inferred.status === "unavailable" && inferred.reason).toBe("inferred_from_holdings");
    render(<EtfSectorBreakdown evidence={presentSectorExposure(null)} />);
    expect(screen.getByText("Sector exposure unavailable")).toBeInTheDocument();
    expect(screen.queryByText("31.4%")).not.toBeInTheDocument();
    expect(screen.getByTestId("etf-sectors").className).toContain("mb-6");
    expect(screen.getByText("Sector exposure unavailable").parentElement?.className).toContain("sm:flex-row");
  });

  it("labels full coverage and partial coverage separately and keeps as-of metadata", () => {
    const full = presentSectorExposure({
      kind: "verified",
      source: "Fund report",
      asOf: "2026-06-30",
      allocations: [
        { name: "Technology", weight: 60 },
        { name: "Healthcare", weight: 40 },
      ],
    });
    expect(full.status).toBe("available");
    if (full.status !== "available") return;
    expect(full.coverage).toBe("full_portfolio");
    expect(full.asOf).toBe("2026-06-30");
    const fullView = render(<EtfSectorBreakdown evidence={full} />);
    expect(screen.getByText(/Full portfolio allocation/)).toBeInTheDocument();
    expect(screen.getByText(/As of 2026-06-30/)).toBeInTheDocument();
    fullView.unmount();

    const partial = presentSectorExposure({
      kind: "verified",
      source: "Fund report",
      asOf: "2026-06-30",
      allocations: [{ name: "Technology", weight: 40 }],
    });
    expect(partial.status).toBe("available");
    if (partial.status !== "available") return;
    expect(partial.coverage).toBe("partial");
    render(<EtfSectorBreakdown evidence={partial} />);
    expect(screen.getByText(/Partial sector coverage/)).toBeInTheDocument();
    expect(screen.queryByText(/Full portfolio allocation/)).not.toBeInTheDocument();

    expect(presentSectorExposure({
      kind: "verified",
      source: "Fund report",
      allocations: [
        { name: "Technology", weight: 80 },
        { name: "Technology", weight: 20 },
      ],
    }).status).toBe("unavailable");
  });
});

describe("Batch 20 — price returns", () => {
  it("leaves benchmark empty unless a separate series was observed", () => {
    const model = buildEtfPerformance(ytdBars(), null, MARCH_16);
    const ytd = model.periods.find((period) => period.period === "YTD");
    expect(ytd?.kind).toBe("price");
    expect(ytd?.displayPercent).toBe(20);
    expect(ytd?.benchmarkDisplayPercent).toBeNull();
    expect(model.hasAnyBenchmarkReturn).toBe(false);
    const estimated = 20 + 0.0945 * (75 / 365);
    expect(ytd?.benchmarkDisplayPercent).not.toBe(Math.round(estimated * 10) / 10);
  });

  it("uses an observed benchmark series and does not relabel price return as total return", () => {
    const benchmarkBars = [
      daily("2025-12-31", 200),
      daily("2026-03-16", 210),
    ];
    const model = buildEtfPerformance(ytdBars(), { name: "S&P 500", bars: benchmarkBars }, MARCH_16);
    const ytd = model.periods.find((period) => period.period === "YTD");
    expect(ytd?.benchmarkDisplayPercent).toBe(5);
    render(<EtfPerformanceChart symbol="SPY" status="ready" model={model} />);
    expect(screen.getByText(/Not a dividend-adjusted total return/)).toBeInTheDocument();
    expect(screen.queryByText(/Total return vs/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("+20.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+5.0%").length).toBeGreaterThan(0);
  });

  it("keeps missing periods unavailable and sorts bars before calculating", () => {
    const model = buildEtfPerformance(ytdBars(), null, MARCH_16);
    expect(model.periods.find((period) => period.period === "5Y")?.displayPercent).toBeNull();
    expect(model.periods.find((period) => period.period === "1M")?.displayPercent).toBeNull();
    expect(formatPriceReturn(null)).toBe("Unavailable");
    expect(formatPriceReturn(Number.POSITIVE_INFINITY)).toBe("Unavailable");

    const ordered = priceReturnForPeriod(
      [daily("2026-03-16", 120), daily("2025-12-31", 100)],
      "YTD",
      MARCH_16,
    );
    expect(ordered?.displayPercent).toBe(20);
    expect(priceReturnForPeriod([daily("2026-01-02", 110), daily("2026-03-16", 120)], "YTD", MARCH_16)).toBeNull();

    render(<EtfPerformanceChart symbol="SPY" status="ready" model={model} />);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
    expect(screen.queryByText("Benchmark")).not.toBeInTheDocument();
  });

  it("uses the Eastern Time year for the YTD boundary", () => {
    const newYearsEveEt = new Date("2026-01-01T04:30:00.000Z");
    expect(getEtParts(newYearsEveEt).date).toBe("2025-12-31");
    expect(periodBoundaryDate("YTD", newYearsEveEt)).toBe("2025-01-01");
    expect(priceReturnForPeriod([daily("2025-12-31", 100)], "YTD", new Date("2026-01-01T15:00:00.000Z"))).toBeNull();
  });
});

describe("Batch 20 — chart timestamps and quote provenance", () => {
  it("keeps 1D and 5D bars on distinct UTC timestamps and daily bars on dates", () => {
    const oneDay = resolveChartAggregateRequest("1D", MARCH_16);
    const fiveDay = resolveChartAggregateRequest("5D", MARCH_16);
    expect(oneDay.timespan).toBe("minute");
    expect(oneDay.granularity).toBe("intraday");
    expect(fiveDay.granularity).toBe("intraday");

    const bars = normalizeAggregateBars([
      { t: Date.parse("2026-03-16T14:05:00.000Z"), o: 10.5, h: 11, l: 10, c: 10.8, v: 80 },
      { t: Date.parse("2026-03-16T14:00:00.000Z"), o: 10, h: 11, l: 9.5, c: 10.5, v: 100 },
      { t: Date.parse("2026-03-16T14:05:00.000Z"), o: 11, h: 12, l: 10.5, c: 11.5, v: 90 },
      { t: Date.parse("2026-03-16T14:10:00.000Z"), o: 0, h: 1, l: 0, c: 0, v: 1 },
    ]);
    const intraday = toOhlcvSeries(bars, oneDay.granularity);
    expect(intraday.map((bar) => bar.time)).toEqual([
      Math.floor(Date.parse("2026-03-16T14:00:00.000Z") / 1000),
      Math.floor(Date.parse("2026-03-16T14:05:00.000Z") / 1000),
    ]);
    expect(new Set(intraday.map((bar) => bar.time)).size).toBe(2);

    const dailySeries = toOhlcvSeries(bars, resolveChartAggregateRequest("1Y", MARCH_16).granularity);
    expect(dailySeries.every((bar) => typeof bar.time === "string")).toBe(true);
  });

  it("discloses a previous regular session when the 1D window is empty", async () => {
    const sunday = new Date("2026-10-18T15:00:00.000Z");
    aggregatesMock.mockImplementation(async (_ticker: string, _multiplier: number, timespan: string, from: string, to: string) => {
      if (timespan !== "minute") return [];
      if (from === "2026-10-18" && to === "2026-10-18") return [];
      return [
        { t: Date.parse("2026-10-16T14:30:00.000Z"), o: 10, h: 11, l: 9, c: 10.5, v: 100 },
        { t: Date.parse("2026-10-16T14:45:00.000Z"), o: 10.5, h: 12, l: 10, c: 11, v: 80 },
      ];
    });
    const bundle = await fetchChartAggregateBars("SPY", "1D", sunday);
    expect(bundle.usesPriorSessionFallback).toBe(true);
    expect(bundle.bars).toHaveLength(2);
    expect(formatChartDataDisclosure({
      granularity: bundle.request.granularity,
      lastObservedAt: new Date(bundle.bars[1].utcMs).toISOString(),
      usesPriorSessionFallback: true,
    })).toMatch(/Previous regular session/);
  });

  it("labels weekends, holidays, EST, and EDT without using the clock as the price time", () => {
    const laborDay = new Date("2026-09-07T15:00:00.000Z");
    const fridayMs = Date.parse("2026-09-04T20:00:00.000Z");
    const holiday = presentEtfQuote({
      snapshotStatus: "success",
      snapshot: {
        day: { c: 400, h: 401, l: 399, v: 1_000, t: fridayMs },
        prevDay: { c: 398 },
        todaysChange: 2,
        todaysChangePerc: 0.5,
      },
      databasePrice: null,
      databaseUpdatedAt: null,
      now: laborDay,
    });
    expect(holiday.status).toBe("snapshot");
    if (holiday.status !== "snapshot") return;
    expect(holiday.sessionLine).toMatch(/Labor Day/);
    expect(holiday.sessionLine).toMatch(/EDT/);
    expect(holiday.priorSession).toBe(true);
    expect(holiday.delayDisclosure).toBe("15-minute delayed market data");
    expect(holiday.observationLine).toMatch(/As of/);
    expect(holiday.sessionLine).not.toBe(holiday.observationLine);

    const winter = new Date("2026-01-15T18:00:00.000Z");
    const summer = new Date("2026-07-15T18:00:00.000Z");
    expect(estTimezoneAbbr(winter)).toBe("EST");
    expect(estTimezoneAbbr(summer)).toBe("EDT");
    const winterQuote = presentEtfQuote({
      snapshotStatus: "success",
      snapshot: { day: { c: 100, t: Date.parse("2026-01-15T15:00:00.000Z") }, todaysChange: 1, todaysChangePerc: 1 },
      databasePrice: null,
      databaseUpdatedAt: null,
      now: winter,
    });
    const summerQuote = presentEtfQuote({
      snapshotStatus: "success",
      snapshot: { day: { c: 100, t: Date.parse("2026-07-15T15:00:00.000Z") }, todaysChange: 1, todaysChangePerc: 1 },
      databasePrice: null,
      databaseUpdatedAt: null,
      now: summer,
    });
    expect(winterQuote.status === "snapshot" && winterQuote.sessionLine).toMatch(/EST/);
    expect(summerQuote.status === "snapshot" && summerQuote.sessionLine).toMatch(/EDT/);

    const now = new Date("2026-03-16T15:00:00.000Z");
    const tradeMs = Date.parse("2026-03-16T14:00:00.000Z");
    const separated = presentEtfQuote({
      snapshotStatus: "success",
      snapshot: {
        day: { c: 11, t: tradeMs },
        todaysChange: 1,
        todaysChangePerc: 1,
      },
      databasePrice: 99,
      databaseUpdatedAt: now.toISOString(),
      now,
    });
    expect(separated.status).toBe("snapshot");
    if (separated.status !== "snapshot") return;
    expect(separated.sessionLine).toMatch(/11:00/);
    expect(separated.observationLine).toMatch(/10:00/);
    expect(separated.change).toBe(1);
    expect(separated.priorSession).toBe(false);

    const midnightUtcBar = presentEtfQuote({
      snapshotStatus: "success",
      snapshot: {
        day: { c: 11, t: Date.parse("2026-03-16T00:00:00.000Z") },
        todaysChange: 1,
        todaysChangePerc: 1,
      },
      databasePrice: null,
      databaseUpdatedAt: null,
      now,
    });
    expect(midnightUtcBar.status === "snapshot" && midnightUtcBar.priorSession).toBe(false);

    const missingTimestamp = presentEtfQuote({
      snapshotStatus: "success",
      snapshot: { day: { c: 510, v: 1_000_000 }, todaysChange: 1, todaysChangePerc: 0.2 },
      databasePrice: null,
      databaseUpdatedAt: null,
      now,
    });
    expect(missingTimestamp.status === "snapshot" && missingTimestamp.observationTimeUnavailable).toBe(true);
    expect(missingTimestamp.status === "snapshot" && missingTimestamp.observationLine).toBeNull();

    const mondayPremarket = new Date("2026-03-16T12:00:00.000Z");
    const fridayUtcMidnightMs = Date.parse("2026-03-13T00:00:00.000Z");
    expect(dailyAggregateBarDate(fridayUtcMidnightMs)).toBe("2026-03-13");
    const priorVolume = classifySnapshotDayVolume(
      { day: { v: 2_500_000, t: fridayUtcMidnightMs } },
      mondayPremarket,
    );
    expect(priorVolume?.kind).toBe("prior_session");
    const mondayStats = buildEtfStatGrid({
      record: { volume: 8_000_000 },
      snapshot: { day: { v: 2_500_000, t: fridayUtcMidnightMs } },
      history: ytdBars(),
      listDate: "1993-01-22",
      now: mondayPremarket,
    });
    expect(mondayStats.find((stat) => stat.label.startsWith("Prior session volume"))?.value).toBe("2.5M");
    expect(mondayStats.some((stat) => stat.label === "Session volume")).toBe(false);

    const mondayUtcMidnightMs = Date.parse("2026-03-16T00:00:00.000Z");
    expect(dailyAggregateBarDate(mondayUtcMidnightMs)).toBe("2026-03-16");
    const currentVolume = classifySnapshotDayVolume(
      { day: { v: 1_200_000, t: mondayUtcMidnightMs } },
      now,
    );
    expect(currentVolume?.kind).toBe("current_session");

    const saturday = new Date("2026-10-17T15:00:00.000Z");
    const weekendVolume = classifySnapshotDayVolume(
      { day: { v: 900_000, t: Date.parse("2026-10-16T00:00:00.000Z") } },
      saturday,
    );
    expect(weekendVolume?.kind).toBe("prior_session");

    const laborDayClosed = new Date("2026-09-07T15:00:00.000Z");
    const holidayVolume = classifySnapshotDayVolume(
      { day: { v: 800_000, t: Date.parse("2026-09-04T00:00:00.000Z") } },
      laborDayClosed,
    );
    expect(holidayVolume?.kind).toBe("prior_session");
  });

  it("distinguishes a database fallback and an unavailable quote from a snapshot", () => {
    const now = new Date("2026-03-16T15:00:00.000Z");
    const fallback = presentEtfQuote({
      snapshotStatus: "error",
      snapshot: null,
      databasePrice: 432.1,
      databaseUpdatedAt: "2026-03-01T15:00:00.000Z",
      now,
    });
    expect(fallback.status).toBe("database_fallback");
    if (fallback.status !== "database_fallback") return;
    expect(fallback.detail).toMatch(/Provider quote unavailable/);
    expect(fallback.detail).toMatch(/Database price/);
    expect(fallback.detail).toMatch(/not a live quote/);
    expect(fallback.detail).toMatch(/record updated/);
    expect(fallback.detail).not.toMatch(/Mar 16/);

    const missingStamp = presentEtfQuote({
      snapshotStatus: "error",
      snapshot: null,
      databasePrice: 10,
      databaseUpdatedAt: null,
      now,
    });
    expect(missingStamp.status === "database_fallback" && missingStamp.detail).toMatch(/observation time unavailable/);

    const unavailable = presentEtfQuote({
      snapshotStatus: "error",
      snapshot: null,
      databasePrice: Number.NaN,
      databaseUpdatedAt: null,
      now,
    });
    expect(unavailable).toMatchObject({ status: "error", message: "Market data unavailable" });

    const blank = presentEtfQuote({
      snapshotStatus: "success",
      snapshot: {},
      databasePrice: null,
      databaseUpdatedAt: null,
      now,
    });
    expect(blank).toMatchObject({ status: "unavailable", message: "Quote unavailable" });

    const noMove = presentEtfQuote({
      snapshotStatus: "success",
      snapshot: { day: { c: 50, t: Date.parse("2026-03-16T14:00:00.000Z") } },
      databasePrice: null,
      databaseUpdatedAt: null,
      now,
    });
    expect(noMove.status === "snapshot" && noMove.change).toBeNull();
  });

  it("normalizes daily history and drops invalid bars", async () => {
    aggregatesMock.mockResolvedValueOnce([
      { t: 3000, o: 2, h: 3, l: 1.5, c: 2.5, v: 10 },
      { t: 1000, o: 1, h: 2, l: 0.5, c: 1.5, v: 5 },
      { t: 3000, o: 9, h: 10, l: 8, c: 9.5, v: 3 },
      { t: 2000, o: 0, h: 1, l: 0, c: 0, v: 1 },
    ]);
    const bars = await loadEtfDailyBars("SPY", MARCH_16);
    expect(bars.map((bar) => bar.utcMs)).toEqual([1000, 3000]);
    expect(bars[1].close).toBe(9.5);
  });
});

describe("Batch 20 — fund metrics", () => {
  it("labels 52-week extremes only with verified full-year coverage", () => {
    const partial = observedPriceRange(ytdBars(), MARCH_16, "1993-01-22");
    expect(partial?.coverage).toBe("observed_window");
    expect(partial?.high).toBe(130);

    const partialStats = buildEtfStatGrid({
      record: null,
      snapshot: null,
      history: ytdBars(),
      listDate: "1993-01-22",
      now: MARCH_16,
    });
    expect(partialStats.some((stat) => stat.label === "52W High")).toBe(false);
    expect(partialStats.some((stat) => stat.label.startsWith("Observed high"))).toBe(true);

    const endpointOnlyBars = [
      daily("2025-03-17", 100, 105, 95),
      daily("2026-03-16", 120, 130, 90),
    ];
    expect(largestInternalTradingGap(["2025-03-17", "2026-03-16"])).toBeGreaterThan(7);
    const sparseEndpoints = observedPriceRange(endpointOnlyBars, MARCH_16, "1993-01-22");
    expect(sparseEndpoints?.coverage).toBe("observed_window");

    const gappedHistory = [
      ...dailyHistoryForTradingDays("2025-03-17", "2025-03-31"),
      ...dailyHistoryForTradingDays("2026-03-01", "2026-03-16"),
    ];
    expect(observedPriceRange(gappedHistory, MARCH_16, "1993-01-22")?.coverage).toBe("observed_window");

    const fullYearBars = dailyHistoryForTradingDays("2025-03-17", "2026-03-16");
    const full = observedPriceRange(fullYearBars, MARCH_16, "1993-01-22");
    expect(full?.coverage).toBe("fifty_two_week");

    const inceptionBars = dailyHistoryForTradingDays("2026-01-02", "2026-03-16");
    const sinceLaunch = observedPriceRange(inceptionBars, MARCH_16, "2026-01-02");
    expect(sinceLaunch?.coverage).toBe("since_inception");
    const inceptionStats = buildEtfStatGrid({
      record: null,
      snapshot: null,
      history: inceptionBars,
      listDate: "2026-01-02",
      now: MARCH_16,
    });
    const inceptionHigh = Math.max(...inceptionBars.map((bar) => bar.high));
    expect(inceptionStats.find((stat) => stat.label === "High since inception")?.value).toBe(`$${inceptionHigh.toFixed(2)}`);
  });

  it("shows reported fields and leaves unverified ratios unavailable", () => {
    const overview = buildFundDetailRows({
      symbol: "SPY",
      record: {
        total_assets: 500_000_000_000,
        expense_ratio: 0.0945,
        holdings: null,
        provider: "State Street Global Advisors",
        asset_class: "Equity",
      },
      providerDescription: null,
    });
    expect(overview.descriptionKind).toBe("profile");
    expect(overview.rows.find((row) => row.label === "Dividend yield")?.value).toBe("Unavailable");
    expect(overview.rows.find((row) => row.label === "P/E ratio")?.value).toBe("Unavailable");
    expect(overview.rows.find((row) => row.label === "Beta")?.value).toBe("Unavailable");
    expect(overview.rows.find((row) => row.label === "Holdings count")?.value).toBe("Unavailable");
    expect(JSON.stringify(overview)).not.toContain("1.28%");
    expect(JSON.stringify(overview)).not.toContain("23.8");
    expect(JSON.stringify(overview)).not.toContain("503");

    const counted = buildFundDetailRows({
      symbol: "SPY",
      record: { holdings: 500 },
      providerDescription: null,
    });
    expect(counted.rows.find((row) => row.label === "Holdings count")?.value).toBe("500");

    const stats = buildEtfStatGrid({
      record: { total_assets: 500_000_000_000, expense_ratio: 0.0945, volume: 8_000_000, ytd_return: 99 } as never,
      snapshot: { day: { v: 2_500_000, t: Date.parse("2026-03-16T15:00:00.000Z") } },
      history: ytdBars(),
      listDate: "1993-01-22",
      now: MARCH_16,
    });
    expect(stats.find((stat) => stat.label === "Reported AUM")?.value).toBe("$500.00B");
    expect(stats.find((stat) => stat.label === "Expense ratio")?.value).toBe("0.09%");
    expect(stats.find((stat) => stat.label === "Session volume")?.value).toBe("2.5M");
    expect(stats.find((stat) => stat.label === "Avg volume")?.value).toBe("Unavailable");
    expect(stats.find((stat) => stat.label === "YTD price return")?.value).toBe("+20.0%");
    expect(stats.some((stat) => stat.label.startsWith("Observed high"))).toBe(true);
    expect(stats.some((stat) => stat.label === "52W High")).toBe(false);

    const unverifiedVolumeStats = buildEtfStatGrid({
      record: { volume: 8_000_000 },
      snapshot: { day: { v: 2_500_000 } },
      history: ytdBars(),
      listDate: "1993-01-22",
      now: MARCH_16,
    });
    expect(unverifiedVolumeStats.find((stat) => stat.label === "Reported volume")?.value).toBe("8.0M");
    expect(unverifiedVolumeStats.some((stat) => stat.label === "Session volume")).toBe(false);
    expect(stats.some((stat) => stat.value === "99" || stat.value === "+99.0%" || stat.value === "99%")).toBe(false);
    expect(formatReportedAum(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatReportedAum(Number.NaN)).toBeNull();

    render(
      <EtfFundOverview
        description={overview.description}
        descriptionKind={overview.descriptionKind}
        rows={overview.rows}
      />,
    );
    expect(screen.getByText("Descriptive fund profile. Not a live holdings or valuation feed.")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(3);
  });
});

describe("Batch 20 — query isolation and page states", () => {
  it("isolates ETF query keys by ticker and range", () => {
    expect(etfResearchQueryKeys("spy", "1D").chart).toEqual(["etf-chart", "SPY", "1D"]);
    expect(etfResearchQueryKeys("spy", "1D").chart).not.toEqual(etfResearchQueryKeys("qqq", "1D").chart);
    expect(etfResearchQueryKeys("SPY").snapshot).not.toEqual(etfResearchQueryKeys("QQQ").snapshot);
    expect(JSON.stringify(etfResearchQueryKeys("SPY", "1Y"))).not.toContain("related_companies");
  });

  it("renders honest empty states and does not call related companies", async () => {
    aggregatesMock.mockImplementation(async (_ticker: string, _multiplier: number, timespan: string, from: string, to: string) => {
      if (timespan === "minute") {
        const today = getEtParts(new Date()).date;
        if (from === today && to === today) return [];
        return [
          { t: Date.parse(`${previousTradingDay(today).date}T14:30:00.000Z`), o: 10, h: 11, l: 9, c: 10.5, v: 100 },
          { t: Date.parse(`${previousTradingDay(today).date}T14:45:00.000Z`), o: 10.5, h: 12, l: 10, c: 11, v: 120 },
        ];
      }
      return [
        { t: Date.parse("2025-12-31T00:00:00.000Z"), o: 100, h: 101, l: 99, c: 100, v: 1000 },
        { t: Date.parse("2026-10-16T00:00:00.000Z"), o: 120, h: 130, l: 90, c: 120, v: 1000 },
      ];
    });

    renderEtf("spy");
    expect(await screen.findByText("Holdings composition unavailable")).toBeInTheDocument();
    const quoteBlock = await screen.findByTestId("etf-quote");
    expect(quoteBlock.textContent?.match(/15-minute delayed market data/g)?.length ?? 0).toBe(1);
    expect(screen.getByText("Sector exposure unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("etf-stats").className).toContain("grid-cols-2");
    expect(screen.getByTestId("etf-stats").className).toContain("sm:grid-cols-4");
    expect(screen.getByTestId("etf-sidebar").className).toContain("hidden");
    expect(screen.getByTestId("etf-sidebar").className).toContain("lg:flex");
    expect(screen.queryByText("7.12%")).not.toBeInTheDocument();
    expect(screen.queryByText("1.28%")).not.toBeInTheDocument();
    expect(screen.queryByText(/Total return vs/i)).not.toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "1D" }));
    await waitFor(() => {
      expect(screen.getByTestId("etf-chart-disclosure").textContent).toMatch(/Previous regular session/);
    });
    const chartText = screen.getByTestId("etf-chart").textContent ?? "";
    const stamps = chartText.split("|").filter(Boolean);
    expect(new Set(stamps).size).toBe(stamps.length);
    expect(stamps.length).toBe(2);
    expect(aggregatesMock.mock.calls.some((call) => call[0] === "SPY" && call[2] === "minute")).toBe(true);
  });

  it("switches tickers without reusing the previous fund query", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/etf/spy"]}>
          <TickerSwitchHarness />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "SPDR S&P 500 ETF Trust" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open QQQ" }));
    expect(await screen.findByRole("heading", { name: "Invesco QQQ Trust" })).toBeInTheDocument();
    await waitFor(() => {
      expect(aggregatesMock.mock.calls.some((call) => call[0] === "QQQ")).toBe(true);
    });
    expect(snapshotMock.mock.calls.some((call) => call[0] === "QQQ")).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("etfs");
  });
});
