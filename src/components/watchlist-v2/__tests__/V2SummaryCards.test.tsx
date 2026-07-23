import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { V2SummaryCards } from "@/components/watchlist-v2/V2SummaryCards";
import type { V2Row } from "@/hooks/useWatchlistV2";
import { parseKeyLevels } from "@/lib/watchlist-v2/parsers";

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

describe("V2SummaryCards", () => {
  it("counts strictly by the four approved categories", () => {
    const rows: V2Row[] = [
      row({ ticker: "A", direction: "bullish" }),
      row({ ticker: "B", direction: "bullish", rvolClass: "unusual" }),
      row({ ticker: "C", direction: "bearish" }),
      row({ ticker: "D", direction: "neutral", rvolClass: "unusual" }),
      row({
        ticker: "E",
        direction: "data_unavailable",
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
      row({ ticker: "F", hasV2: false }),
    ];
    const { getByText, container } = render(<V2SummaryCards rows={rows} />);
    expect(getByText("Bullish")).toBeInTheDocument();
    expect(getByText("Bearish")).toBeInTheDocument();
    expect(getByText("Unusual Activity")).toBeInTheDocument();
    expect(getByText("Recent News & Events")).toBeInTheDocument();
    const vals = Array.from(container.querySelectorAll(".text-2xl")).map(
      (el) => el.textContent,
    );
    expect(vals).toEqual(["2", "1", "2", "1"]);
  });
});
