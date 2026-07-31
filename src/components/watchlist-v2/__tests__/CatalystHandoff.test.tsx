import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { V2AddSymbol } from "@/components/watchlist-v2/V2AddSymbol";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import { CatalystEventCard } from "@/components/catalyst/CatalystEventCard";
import type { CatalystEvent } from "@/types/catalyst";

function catalystEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "evt_1",
    symbol: "AAPL",
    company_name: "Apple Inc.",
    event_type: "earnings",
    title: "Apple Inc. earnings",
    description: null,
    event_date: "2026-07-30",
    event_time: null,
    time_of_day: "amc",
    source_name: "Provider",
    source_url: null,
    published_at: null,
    verification_state: "provider_reported",
    facts: {},
    related_symbols: [],
    ...(overrides as CatalystEvent),
  };
}

describe("Catalyst → Watchlist handoff", () => {
  it("Catalyst preserves the symbol in the Watchlist route", () => {
    const { getByRole } = render(
      <MemoryRouter>
        <CatalystEventCard
          event={catalystEvent({ symbol: "MSFT" })}
          isSaved={false}
          isReviewed={false}
          onToggleSaved={() => {}}
          onToggleReviewed={() => {}}
        />
      </MemoryRouter>,
    );
    const link = getByRole("link", { name: /open watchlist/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/dashboard/watchlist?symbol=MSFT");
  });

  it("URL-encodes symbols with special characters", () => {
    const { getByRole } = render(
      <MemoryRouter>
        <CatalystEventCard
          event={catalystEvent({ symbol: "BRK.B" })}
          isSaved={false}
          isReviewed={false}
          onToggleSaved={() => {}}
          onToggleReviewed={() => {}}
        />
      </MemoryRouter>,
    );
    const link = getByRole("link", { name: /open watchlist/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/dashboard/watchlist?symbol=BRK.B");
  });
});

describe("normalizeHandoffSymbol", () => {
  it("normalizes valid symbols to uppercase", () => {
    expect(normalizeHandoffSymbol("aapl")).toBe("AAPL");
    expect(normalizeHandoffSymbol("  msft  ")).toBe("MSFT");
    expect(normalizeHandoffSymbol("BRK.B")).toBe("BRK.B");
  });

  it("ignores invalid or empty symbols", () => {
    expect(normalizeHandoffSymbol(null)).toBeNull();
    expect(normalizeHandoffSymbol("")).toBeNull();
    expect(normalizeHandoffSymbol("1AAPL")).toBeNull();
    expect(normalizeHandoffSymbol("<script>")).toBeNull();
    expect(normalizeHandoffSymbol("A".repeat(20))).toBeNull();
  });
});

describe("V2AddSymbol handoff behavior", () => {
  it("prefills but does not auto-add when a valid initialSymbol arrives", () => {
    const onAdd = vi.fn();
    render(<V2AddSymbol onAdd={onAdd} initialSymbol="NVDA" />);
    const input = screen.getByLabelText(/add ticker/i) as HTMLInputElement;
    expect(input.value).toBe("NVDA");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("ignores invalid initialSymbol values", () => {
    const onAdd = vi.fn();
    render(<V2AddSymbol onAdd={onAdd} initialSymbol="1BAD" />);
    const input = screen.getByLabelText(/add ticker/i) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("preserves manual add flow", () => {
    const onAdd = vi.fn();
    render(<V2AddSymbol onAdd={onAdd} />);
    const input = screen.getByLabelText(/add ticker/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "tsla" } });
    fireEvent.submit(input.closest("form")!);
    expect(onAdd).toHaveBeenCalledWith("TSLA");
  });

  it("only fires onAdd on explicit submit, even after prefill", () => {
    const onAdd = vi.fn();
    const { rerender } = render(<V2AddSymbol onAdd={onAdd} initialSymbol={null} />);
    rerender(<V2AddSymbol onAdd={onAdd} initialSymbol="AMZN" />);
    const input = screen.getByLabelText(/add ticker/i) as HTMLInputElement;
    expect(input.value).toBe("AMZN");
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.submit(input.closest("form")!);
    expect(onAdd).toHaveBeenCalledWith("AMZN");
  });
});

// Integration-style: WatchlistV2Page targets an existing row and prefills only
// when the ticker is not on the watchlist. We stub the hook and route.
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

vi.mock("@/hooks/useCatalystEnrichmentForSymbols", () => ({
  fetchCatalystEventsForEnrichment: async () => [],
  useCatalystEnrichmentForSymbols: () => ({ data: new Map(), isLoading: false }),
}));

const hookState: {
  rows: Array<{ ticker: string; companyName?: string | null; changePct?: number | null; hasV2?: boolean; direction?: string; volume?: number | null; rvol?: number | null; rvolClass?: string | null; recentEvents?: unknown[]; keyLevels?: Record<string, number | null>; inputsQuality?: Record<string, unknown>; sessionType?: string; analyzedAt?: string; validThrough?: string; requestStatus?: string; requestError?: string | null; price?: number | null; intraday?: unknown[]; marketSignals?: unknown[]; failureReason?: string | null; explanation?: string; driverIds?: string[]; sessionDate?: string }>;
  addSymbol: ReturnType<typeof vi.fn>;
} = { rows: [], addSymbol: vi.fn() };

function stubRow(ticker: string) {
  return {
    ticker,
    companyName: null,
    direction: "neutral",
    explanation: "",
    failureReason: null,
    price: 100,
    changePct: 0,
    volume: 1_000_000,
    rvol: 1,
    rvolClass: "normal",
    sessionType: "rth",
    sessionDate: "2026-07-31",
    analyzedAt: "2026-07-31T15:00:00Z",
    validThrough: "2026-07-31T16:00:00Z",
    intraday: [],
    driverIds: [],
    marketSignals: [],
    recentEvents: [],
    keyLevels: {
      vwap: null,
      hod: null,
      lod: null,
      premarket_high: null,
      premarket_low: null,
      prior_close: null,
    },
    inputsQuality: {},
    requestStatus: "succeeded",
    requestError: null,
    hasV2: true,
  };
}

vi.mock("@/hooks/useWatchlistV2", () => ({
  useWatchlistV2: () => ({
    isAuthenticated: true,
    isLoading: false,
    rows: hookState.rows,
    refresh: () => {},
    refreshingSymbol: null,
    addSymbol: hookState.addSymbol,
    removeSymbol: () => {},
    isAdding: false,
  }),
}));

vi.mock("@/components/watchlist-v2/WatchlistRowV2", () => ({
  WatchlistRowV2: ({ row }: { row: { ticker: string } }) => (
    <div>row:{row.ticker}</div>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import WatchlistV2Page from "@/pages/watchlist/WatchlistV2Page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function renderPage(url: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/dashboard/watchlist" element={<WatchlistV2Page />} />
          <Route path="/watchlist" element={<WatchlistV2Page />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WatchlistV2Page handoff", () => {
  it("existing ticker: highlights the row and does not prefill or duplicate", () => {
    hookState.rows = [stubRow("AAPL")];
    hookState.addSymbol = vi.fn();

    const { container } = renderPage("/dashboard/watchlist?symbol=AAPL");
    const row = container.querySelector('[data-ticker="AAPL"]') as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.className).toMatch(/ring-2/);

    const input = screen.getByLabelText(/add ticker/i) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(hookState.addSymbol).not.toHaveBeenCalled();
  });

  it("missing ticker: prefills the Add input but does not auto-add", () => {
    hookState.rows = [stubRow("MSFT")];
    hookState.addSymbol = vi.fn();

    renderPage("/dashboard/watchlist?symbol=NVDA");
    const input = screen.getByLabelText(/add ticker/i) as HTMLInputElement;
    expect(input.value).toBe("NVDA");
    expect(hookState.addSymbol).not.toHaveBeenCalled();
  });

  it("invalid symbol: ignored — no prefill, no highlight, no add", () => {
    hookState.rows = [stubRow("AAPL")];
    hookState.addSymbol = vi.fn();

    const { container } = renderPage("/dashboard/watchlist?symbol=%3Cscript%3E");
    const input = screen.getByLabelText(/add ticker/i) as HTMLInputElement;
    expect(input.value).toBe("");
    const highlighted = container.querySelector(".ring-2");
    expect(highlighted).toBeNull();
    expect(hookState.addSymbol).not.toHaveBeenCalled();
  });
});
