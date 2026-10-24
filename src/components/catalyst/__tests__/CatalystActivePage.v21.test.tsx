import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalystDetailPanel } from "@/components/catalyst/CatalystDetailPanel";
import { CatalystEventRow } from "@/components/catalyst/CatalystEventRow";
import { CatalystHandoffs } from "@/components/catalyst/CatalystHandoffs";
import {
  readScannerHandoffQuery,
  ScannerHandoffBanner,
} from "@/components/scanner-intelligence/ScannerHandoffBanner";
import type { CatalystHistoricalSummary } from "@/lib/catalyst/catalyst-historical-facts";
import type { CatalystEvent } from "@/types/catalyst";
import Catalyst from "@/pages/dashboard/Catalyst";

const eventsState: { events: CatalystEvent[] } = { events: [] };

vi.mock("@/hooks/useCatalystEvents", () => ({
  useCatalystEvents: () => ({ data: eventsState.events, isLoading: false, error: null }),
  useCatalystUserState: () => ({ data: [] }),
  useCatalystLastSync: () => ({ data: null }),
  useToggleCatalystSaved: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleCatalystReviewed: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useCatalystHistoricalContext", () => ({
  useCatalystHistoricalContext: () => ({ contexts: {}, loadingSymbols: new Set<string>() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

const emptySummary: CatalystHistoricalSummary = {
  available: false,
  lines: [],
  linkedEventCount: 0,
  comparableEpisodeCount: 0,
  priorEvents: [],
};

const NOW = Date.parse("2026-10-23T18:00:00.000Z");

function secEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "sec-1",
    dedupe_key: "sec:0000123456-26-000001:NVDA",
    symbol: "NVDA",
    company_name: "NVIDIA Corp",
    event_type: "sec_filing_news",
    verification_state: "provider_reported",
    event_date: "2026-10-22",
    event_time: "2026-10-23T16:00:00.000Z",
    time_of_day: null,
    title: "NVDA filed Form 8-K",
    description: "Form 8-K — Items 2.02",
    source_name: "SEC EDGAR",
    source_url: "https://www.sec.gov/Archives/edgar/data/example.htm",
    provider: "sec_edgar",
    related_symbols: [],
    facts: {
      form_type: "8-K",
      filing_date: "2026-10-22",
      accepted_at: "2026-10-23T16:00:00.000Z",
      sec_items: ["2.02"],
      attribution_level: "security",
    },
    published_at: "2026-10-23T16:00:00.000Z",
    ...overrides,
  };
}

function earningsEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "earn-1",
    dedupe_key: "earn:AAPL:2026-10-22",
    symbol: "AAPL",
    company_name: "Apple Inc.",
    event_type: "earnings",
    verification_state: "provider_reported",
    event_date: "2026-10-22",
    event_time: null,
    time_of_day: "after_close",
    title: "AAPL earnings",
    description: null,
    source_name: "Provider",
    source_url: "https://example.test/earnings",
    provider: "earnings_calendar",
    related_symbols: [],
    facts: { surprise_percent: 4.2 },
    published_at: "2026-10-22T21:00:00.000Z",
    ...overrides,
  };
}

function queryFromHref(href: string | null): URLSearchParams {
  const query = (href ?? "").split("?")[1] ?? "";
  return new URLSearchParams(query);
}

function renderRow(event: CatalystEvent) {
  return render(
    <MemoryRouter>
      <CatalystEventRow
        event={event}
        summary={emptySummary}
        historyLoading={false}
        isSaved={false}
        isReviewed={false}
        onOpen={() => {}}
        onToggleSaved={() => {}}
        onToggleReviewed={() => {}}
        nowMs={NOW}
      />
    </MemoryRouter>,
  );
}

function renderDetail(event: CatalystEvent) {
  return render(
    <MemoryRouter>
      <CatalystDetailPanel
        event={event}
        summary={emptySummary}
        historyLoading={false}
        open
        onOpenChange={() => {}}
        nowMs={NOW}
      />
    </MemoryRouter>,
  );
}

function renderPage(url = "/dashboard/catalyst") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dashboard/catalyst" element={<Catalyst />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("active Catalyst page SEC integration", () => {
  beforeEach(() => {
    eventsState.events = [];
  });

  it("renders SEC provenance on the live event row", () => {
    renderRow(secEvent());
    const row = screen.getByTestId("catalyst-event-row");
    expect(within(row).getByTestId("sec-provenance-compact")).toBeInTheDocument();
    expect(within(row).getByText("Form 8-K")).toBeInTheDocument();
    expect(within(row).getByText("Items 2.02")).toBeInTheDocument();
    expect(within(row).getByText(/Filing date/)).toBeInTheDocument();
    expect(within(row).getByText(/SEC accepted/)).toBeInTheDocument();
    expect(within(row).getByText("Ticker attributed (security-level)")).toBeInTheDocument();
    expect(within(row).queryByText(/bullish|bearish|market reaction/i)).toBeNull();
  });

  it("keeps non-SEC rows on the existing card path", () => {
    renderRow(earningsEvent());
    expect(screen.getByTestId("catalyst-event-row")).toBeInTheDocument();
    expect(screen.getByText("AAPL earnings")).toBeInTheDocument();
    expect(screen.queryByTestId("sec-provenance-compact")).toBeNull();
    expect(screen.queryByText("Form 8-K")).toBeNull();
    expect(screen.getByRole("link", { name: /view in screeners/i })).toHaveAttribute(
      "href",
      "/dashboard/screeners?symbol=AAPL",
    );
  });

  it("shows full SEC provenance and honest missing timestamps in the detail panel", () => {
    renderDetail(secEvent());
    const panel = screen.getByTestId("catalyst-detail-panel");
    const provenance = within(panel).getByTestId("sec-provenance");
    expect(provenance).toBeInTheDocument();
    expect(within(provenance).getByText("Form 8-K")).toBeInTheDocument();
    expect(provenance.textContent).toMatch(/Items 2\.02/);
    expect(provenance.textContent).toMatch(/Filing date/);
    expect(provenance.textContent).toMatch(/SEC accepted/);
    expect(within(panel).getByTestId("sec-filing-source")).toHaveAttribute(
      "href",
      "https://www.sec.gov/Archives/edgar/data/example.htm",
    );
    expect(within(panel).getByTestId("sec-relevance-signals").textContent).toMatch(/Filing type: 8-K/);
    expect(within(panel).getByTestId("catalyst-trader-read")).toBeInTheDocument();
    expect(within(panel).queryByText(/Market reaction:/)).toBeNull();
  });

  it("labels missing SEC timestamps and source instead of inventing them", () => {
    renderDetail(
      secEvent({
        facts: { form_type: "10-Q" },
        source_url: null,
      }),
    );
    expect(screen.getByText("Filing date unavailable")).toBeInTheDocument();
    expect(screen.getByText("SEC acceptance time unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("sec-filing-source-missing")).toHaveTextContent(
      "SEC filing source unavailable",
    );
  });

  it("preserves ticker on Screeners and Action Center handoffs that destinations consume", () => {
    render(
      <MemoryRouter>
        <CatalystHandoffs symbol="nvda" />
      </MemoryRouter>,
    );
    const screeners = screen.getByRole("link", { name: /view in screeners/i });
    const action = screen.getByRole("link", { name: /action center/i });
    expect(screeners).toHaveAttribute("href", "/dashboard/screeners?symbol=NVDA");
    expect(action).toHaveAttribute("href", "/dashboard/action-center?symbol=NVDA");

    expect(readScannerHandoffQuery(queryFromHref(screeners.getAttribute("href")))).toEqual({
      symbol: "NVDA",
      eventLabel: null,
    });
    expect(readScannerHandoffQuery(queryFromHref(action.getAttribute("href")))).toEqual({
      symbol: "NVDA",
      eventLabel: null,
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={["/dashboard/screeners?symbol=NVDA"]}>
        <ScannerHandoffBanner matched={null} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("scanner-handoff-banner")).toHaveTextContent("NVDA");
    unmount();

    render(
      <MemoryRouter initialEntries={["/dashboard/action-center?symbol=NVDA"]}>
        <ScannerHandoffBanner matched={false} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("scanner-handoff-banner")).toHaveTextContent("NVDA");
    expect(screen.getByTestId("scanner-handoff-banner")).toHaveTextContent("No current row for NVDA");
  });

  it("renders the live page path without duplicate cards and excludes invalidated SEC rows", () => {
    eventsState.events = [
      secEvent({ id: "sec-1", dedupe_key: "sec:a:NVDA" }),
      secEvent({
        id: "sec-2",
        dedupe_key: "sec:b:NVDA",
        title: "NVDA filed Form 8-K amendment",
        facts: {
          form_type: "8-K/A",
          filing_date: "2026-10-22",
          accepted_at: "2026-10-23T17:00:00.000Z",
          sec_items: ["8.01"],
          attribution_level: "security",
        },
      }),
      secEvent({
        id: "sec-invalid",
        verification_state: "attribution_invalidated" as CatalystEvent["verification_state"],
        title: "Invalidated filing",
      }),
      earningsEvent(),
    ];

    renderPage();

    const rows = screen.getAllByTestId("catalyst-event-row");
    expect(rows).toHaveLength(3);
    expect(screen.queryByText("Invalidated filing")).toBeNull();
    expect(screen.getByText("NVDA filed Form 8-K")).toBeInTheDocument();
    expect(screen.getByText("NVDA filed Form 8-K amendment")).toBeInTheDocument();
    expect(screen.getByText("AAPL earnings")).toBeInTheDocument();
    expect(screen.getAllByTestId("sec-provenance-compact")).toHaveLength(2);
    expect(document.querySelectorAll('[data-testid="catalyst-event-row"]').length).toBe(3);

    fireEvent.click(screen.getByText("NVDA filed Form 8-K"));
    expect(screen.getByTestId("catalyst-detail-panel")).toBeInTheDocument();
    expect(screen.getByTestId("sec-provenance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /original sec filing/i })).toBeInTheDocument();
  });
});
