import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WatchlistRowV2 } from "@/components/watchlist-v2/WatchlistRowV2";
import type { V2Row } from "@/hooks/useWatchlistV2";
import { parseKeyLevels } from "@/lib/watchlist-v2/parsers";

function row(overrides: Partial<V2Row>): V2Row {
  return {
    ticker: "VRAX",
    companyName: null,
    direction: "data_unavailable",
    explanation: "Market snapshot is stale.",
    failureReason: "SNAPSHOT_STALE",
    price: 3.12,
    changePct: null,
    volume: 64526,
    rvol: null,
    rvolClass: null,
    sessionType: "rth",
    sessionDate: "2026-07-24",
    analyzedAt: "2026-07-24T19:20:14Z",
    validThrough: "2026-07-24T19:30:14Z",
    intraday: [],
    driverIds: ["driver.trend_up"],
    marketSignals: [
      {
        signal_id: "sig.a",
        label: "Above VWAP",
        category: "level",
        kind: "state",
        direction: "bullish",
        observed_at: "2026-07-24T19:00:00Z",
      },
    ],
    recentEvents: [],
    keyLevels: parseKeyLevels(null),
    inputsQuality: {},
    requestStatus: "none",
    requestError: null,
    hasV2: true,
    ...overrides,
  };
}

function renderRow(r: V2Row) {
  return render(
    <MemoryRouter>
      <WatchlistRowV2 row={r} onRefresh={() => {}} onRemove={() => {}} isRefreshing={false} />
    </MemoryRouter>,
  ) as unknown as { container: HTMLElement; getByText: (t: string | RegExp) => HTMLElement };
}

describe("WatchlistRowV2 data_unavailable contract", () => {
  it("shows Data Unavailable badge without long provider errors on the collapsed row", () => {
    const { getByText, container } = renderRow(row({}));
    expect(getByText(/Data Unavailable/i)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/Market snapshot too stale to analyze/i);
  });

  it("surfaces trader-friendly failure reason inside expanded diagnostics", () => {
    const { container, getByText } = renderRow(row({}));
    const toggle = container.querySelector('button[title="Expand"]') as HTMLButtonElement | null;
    if (toggle) fireEvent.click(toggle);
    const diag = container.querySelector("button") &&
      Array.from(container.querySelectorAll("button")).find((b) =>
        /provider diagnostics/i.test(b.textContent ?? ""),
      );
    expect(diag).toBeTruthy();
    fireEvent.click(diag!);
    expect(getByText(/Market snapshot too stale to analyze/i)).toBeInTheDocument();
  });

  it("never surfaces market signals when direction=data_unavailable", () => {
    const { container } = renderRow(row({}));
    const toggle = container.querySelector('button[title="Expand"]') as HTMLButtonElement | null;
    if (toggle) fireEvent.click(toggle);
    const html = container.innerHTML;
    expect(html).not.toContain("Above VWAP");
    expect(html).not.toContain("driver.trend_up");
  });

  it("does render market signals when direction is directional", () => {
    const { container } = renderRow(
      row({ direction: "bullish", failureReason: null, explanation: "ok" }),
    );
    const toggle = container.querySelector('button[title="Expand"]') as HTMLButtonElement | null;
    if (toggle) fireEvent.click(toggle);
    expect(container.innerHTML).toContain("Above VWAP");
  });

  it("never renders raw driver_ids or evidence hashes, even when directional", () => {
    const { container } = renderRow(
      row({
        direction: "bullish",
        failureReason: null,
        explanation: "ok",
        driverIds: [
          "event:2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
          "signal:above_vwap",
          "level:vwap",
          "metric:rvol",
        ],
      }),
    );
    const toggle = container.querySelector('button[title="Expand"]') as HTMLButtonElement | null;
    if (toggle) fireEvent.click(toggle);
    const html = container.innerHTML;
    expect(html).not.toMatch(/event:[a-f0-9]/i);
    expect(html).not.toContain("signal:above_vwap");
    expect(html).not.toContain("level:vwap");
    expect(html).not.toContain("metric:rvol");
  });
});
