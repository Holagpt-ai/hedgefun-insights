import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { aggregateTrades, calculateTrade, dailyMetrics } from "../calc";
import { AUGUST_DEMO_TRADES, DEMO_ACCOUNTS, DEMO_MISSING_REVIEWS, DEMO_WORKSPACE_LABEL } from "../demo/august-fixtures";
import { JOURNAL_BASE } from "../nav";
import { NewTradePage } from "./NewTradePage";
import { TradeDetailPage } from "./TradeDetailPage";

const { workspaceMock } = vi.hoisted(() => ({
  workspaceMock: { current: {} as Record<string, unknown> },
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() }) },
  },
}));

vi.mock("../workspace/JournalWorkspace", () => ({
  useJournalWorkspace: () => workspaceMock.current,
}));

function demoWorkspace() {
  const trades = AUGUST_DEMO_TRADES;
  return {
    mode: "demo",
    loading: false,
    error: null,
    allTrades: trades,
    trades,
    calculations: trades.map(calculateTrade),
    metrics: aggregateTrades(trades),
    daily: dailyMetrics(trades),
    selectedAccountId: "all",
    range: "augustDemo",
    asset: "all",
    setAccountId: () => {},
    setRange: () => {},
    setAsset: () => {},
    accounts: DEMO_ACCOUNTS,
    dataQualityCount: 0,
    dataQualityIssues: [],
    hideDemo: () => {},
    showDemo: () => {},
    demoHidden: false,
    refresh: async () => {},
    onLiveTradeSaved: async () => {},
    processScore: 78,
    equity: 0n,
    reconciliationState: {
      derivedEquity: 0n,
      reportedBalance: null,
      difference: null,
      state: "missing_balance" as const,
    },
    missingReviews: DEMO_MISSING_REVIEWS,
    demoLabel: DEMO_WORKSPACE_LABEL,
  };
}

function QueryProbe() {
  const [params] = useSearchParams();
  return <span data-testid="search">{params.toString()}</span>;
}

function renderNewTrade(url: string) {
  workspaceMock.current = demoWorkspace();
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path={`${JOURNAL_BASE}/trades/new`}
          element={
            <>
              <QueryProbe />
              <NewTradePage />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function SecondHandoffHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(`${JOURNAL_BASE}/trades/new?symbol=NVDA`)}>
        send-nvda
      </button>
      <button type="button" onClick={() => navigate(`${JOURNAL_BASE}/trades/new?symbol=AAPL`)}>
        send-aapl-again
      </button>
      <QueryProbe />
      <NewTradePage />
    </>
  );
}

describe("new-trade symbol handoff", () => {
  it("prefills AAPL from the first ?symbol= and consumes the query", async () => {
    renderNewTrade(`${JOURNAL_BASE}/trades/new?symbol=AAPL`);
    await waitFor(() => {
      expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("AAPL");
    });
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("updates the symbol on a second handoff without wiping other draft fields", async () => {
    workspaceMock.current = demoWorkspace();
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades/new?symbol=AAPL`]}>
        <Routes>
          <Route path={`${JOURNAL_BASE}/trades/new`} element={<SecondHandoffHarness />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("AAPL");
    });
    fireEvent.change(screen.getByLabelText("Thesis"), { target: { value: "Keep this thesis" } });
    fireEvent.change(screen.getByLabelText("Planned entry"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "send-nvda" }));
    await waitFor(() => {
      expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("NVDA");
    });
    expect((screen.getByLabelText("Thesis") as HTMLTextAreaElement).value).toBe("Keep this thesis");
    expect((screen.getByLabelText("Planned entry") as HTMLInputElement).value).toBe("100");
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("does not reset unrelated fields when the same symbol is sent again", async () => {
    workspaceMock.current = demoWorkspace();
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades/new?symbol=AAPL`]}>
        <Routes>
          <Route path={`${JOURNAL_BASE}/trades/new`} element={<SecondHandoffHarness />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("AAPL");
    });
    fireEvent.change(screen.getByLabelText("Thesis"), { target: { value: "Unchanged" } });
    fireEvent.click(screen.getByRole("button", { name: "send-aapl-again" }));
    await waitFor(() => {
      expect(screen.getByTestId("search").textContent).toBe("");
    });
    expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("AAPL");
    expect((screen.getByLabelText("Thesis") as HTMLTextAreaElement).value).toBe("Unchanged");
  });

  it("does not populate the draft from an invalid symbol", async () => {
    renderNewTrade(`${JOURNAL_BASE}/trades/new?symbol=${encodeURIComponent("<script>")}`);
    await waitFor(() => {
      expect(screen.getByTestId("search").textContent).toBe("");
    });
    expect((screen.getByLabelText("Symbol") as HTMLInputElement).value).toBe("");
  });

  it("edit mode ignores ?symbol= and keeps the existing trade symbol", () => {
    workspaceMock.current = demoWorkspace();
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades/demo-nvda?symbol=AAPL`]}>
        <Routes>
          <Route path={`${JOURNAL_BASE}/trades/:tradeId`} element={<TradeDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "NVDA" })).toBeTruthy();
    expect(screen.queryByLabelText("Symbol")).toBeNull();
  });
});
