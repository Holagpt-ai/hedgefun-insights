import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { WatchlistSummaryStrip } from "@/components/watchlist-v2/WatchlistSummaryStrip";
import type { V2Row } from "@/hooks/useWatchlistV2";
import { parseKeyLevels } from "@/lib/watchlist-v2/parsers";
import { computeSummaryMetrics } from "@/lib/watchlist-v2/metrics";
import type { EarningsBadge } from "@/lib/watchlist-v2/earnings";
import type { CatalystEvent } from "@/types/catalyst";

function row(overrides: Partial<V2Row>): V2Row {
  return {
    ticker: "TEST",
    companyName: null,
    direction: "neutral",
    explanation: "",
    failureReason: null,
    price: null,
    changePct: null,
    volume: null,
    rvol: null,
    rvolClass: null,
    sessionType: "rth",
    sessionDate: "",
    analyzedAt: "",
    validThrough: "",
    intraday: [],
    driverIds: [],
    marketSignals: [],
    recentEvents: [],
    keyLevels: parseKeyLevels(null),
    inputsQuality: {},
    requestStatus: "none",
    requestError: null,
    hasV2: true,
    ...overrides,
  };
}

function earningsBadge(symbol: string): EarningsBadge {
  const event = {
    id: `e-${symbol}`,
    dedupe_key: `e-${symbol}`,
    symbol,
    company_name: null,
    event_type: "earnings" as const,
    verification_state: "provider_reported" as const,
    event_date: "2026-08-02",
    event_time: null,
    time_of_day: null,
    title: `${symbol} earnings`,
    description: null,
    source_name: "Provider",
    source_url: null,
    provider: "test",
    related_symbols: [],
    facts: {},
    published_at: "2026-07-01T00:00:00.000Z",
  } satisfies CatalystEvent;
  return {
    event,
    kind: "upcoming",
    sortMs: Date.parse("2026-08-02T04:00:00.000Z"),
    label: "Earnings in 2d",
  };
}

describe("WatchlistSummaryStrip / computeSummaryMetrics", () => {
  it("derives honest counts and uses — when a metric cannot be evaluated", () => {
    const rows: V2Row[] = [
      row({ ticker: "A", changePct: 2.1, direction: "bullish" }),
      row({ ticker: "B", changePct: -1.2, direction: "bearish", rvolClass: "unusual" }),
      row({
        ticker: "C",
        changePct: null,
        direction: "data_unavailable",
        keyLevels: parseKeyLevels({ hod: 10, lod: 8 }),
        price: 9.9,
      }),
      row({
        ticker: "D",
        hasV2: true,
        recentEvents: [
          {
            event_id: "1",
            event_type: "news",
            title: "x",
            event_time: "2026-01-01T00:00:00Z",
            source_name: "s",
            source_url: null,
            verification_state: "provider_reported",
          },
        ],
      }),
    ];
    const earnings = new Map<string, EarningsBadge>([["A", earningsBadge("A")]]);
    const metrics = computeSummaryMetrics(rows, earnings);
    const byKey = Object.fromEntries(metrics.map((m) => [m.key, m.value]));

    expect(byKey.advancing).toBe(1);
    expect(byKey.declining).toBe(1);
    expect(byKey.high_rvol).toBe(1);
    expect(byKey.near_hod).toBe(1);
    expect(byKey.earnings_7d).toBe(1);
    expect(byKey.fresh_catalysts).toBe(1);
  });

  it("renders — for unevaluable metrics and toggles filter on click", () => {
    const metrics = computeSummaryMetrics([], new Map());
    let active: "all" | "movers" = "all";
    const { getByText, container } = render(
      <WatchlistSummaryStrip
        metrics={metrics}
        activeFilter={active}
        onFilter={(f) => {
          active = f as typeof active;
        }}
      />,
    );
    expect(getByText("Advancing")).toBeInTheDocument();
    const dashes = Array.from(container.querySelectorAll(".tabular-nums")).map(
      (el) => el.textContent,
    );
    expect(dashes.every((t) => t === "—")).toBe(true);

    fireEvent.click(getByText("Advancing").closest("button")!);
  });
});
