import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  aggregateTrades,
  buildTradeAuditRecord,
  buildTradeRiskEvidence,
  calculateProcessScore,
  calculateTrade,
  dailyMetrics,
  microsToNumber,
} from "../calc";
import { JournalContextBar } from "../components/JournalContextBar";
import { JournalPanel } from "../components/JournalPanel";
import { AUGUST_14_TRADES, AUGUST_DEMO_TRADES, DEMO_ACCOUNTS, DEMO_MISSING_REVIEWS, DEMO_WORKSPACE_LABEL } from "../demo/august-fixtures";
import { canCloseTrade } from "../lib/trade-actions";
import { JOURNAL_BASE } from "../nav";
import { TradeAuditPanel, TradeDetailPage, TradeRiskPanel } from "./TradeDetailPage";
import { TradesPage } from "./TradesPage";

const { workspaceMock } = vi.hoisted(() => ({
  workspaceMock: { current: {} as Record<string, unknown> },
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null }),
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
    equity: 54150n * 1_000_000n,
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

function renderTrades() {
  workspaceMock.current = demoWorkspace();
  return render(
    <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades`]}>
      <TradesPage />
    </MemoryRouter>,
  );
}

describe("closed-trade action state", () => {
  it("does not expose Close on closed trades and keeps it for open or partial", () => {
    expect(canCloseTrade("closed")).toBe(false);
    expect(canCloseTrade("closed_before_expiration")).toBe(false);
    expect(canCloseTrade("open")).toBe(true);
    expect(canCloseTrade("partially_closed")).toBe(true);

    renderTrades();
    const closeLinks = screen.getAllByRole("link", { name: "Close" });
    expect(closeLinks.length).toBe(3);
    const hrefs = closeLinks.map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.every((href) => href.includes("demo-open-"))).toBe(true);
    expect(hrefs.some((href) => href.endsWith("/demo-nvda"))).toBe(false);
    expect(screen.getAllByRole("link", { name: "Open" }).length).toBeGreaterThan(3);
    expect(screen.getAllByRole("link", { name: "Review" }).length).toBeGreaterThan(3);
  });
});

describe("duplicate Add Trade control", () => {
  it("keeps Add Trade on the journal action bar", () => {
    workspaceMock.current = demoWorkspace();
    render(
      <MemoryRouter>
        <JournalContextBar />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link", { name: "Add Trade" })).toHaveLength(1);
  });

  it("does not render a second Add Trade on the Trades page", () => {
    renderTrades();
    expect(screen.queryByRole("link", { name: "Add Trade" })).toBeNull();
  });
});

describe("trade detail risk and audit", () => {
  it("renders authoritative NVDA risk inputs and R from the calc engine", () => {
    const trade = AUGUST_14_TRADES.find((item) => item.id === "demo-nvda")!;
    const calc = calculateTrade(trade);
    const process = calculateProcessScore(trade);
    const risk = buildTradeRiskEvidence(trade, calc);
    expect(microsToNumber(risk.plannedRisk!)).toBe(210);
    expect(risk.rMultiple).toBeCloseTo(440 / 210, 10);

    render(<TradeRiskPanel calc={calc} process={process} risk={risk} lang="en" />);
    const panel = screen.getByTestId("journal-risk-record");
    expect(within(panel).getByText("Planned entry").parentElement).toHaveTextContent("$118.40");
    expect(within(panel).getByText("Planned stop").parentElement).toHaveTextContent("$116.30");
    expect(within(panel).getByText("Planned size").parentElement).toHaveTextContent("100");
    expect(within(panel).getByText("Risk per share").parentElement).toHaveTextContent("$2.10");
    expect(within(panel).getByText("Planned risk").parentElement).toHaveTextContent("$210.00");
    expect(within(panel).getByText("Net P&L used for R").parentElement).toHaveTextContent("+$440.00");
    expect(within(panel).getByText("R result").parentElement).toHaveTextContent("2.10R");
    expect(within(panel).getByText("journal-calc.v1")).toBeInTheDocument();
    expect(within(panel).getByText("journal-input.v1")).toBeInTheDocument();
    expect(within(panel).getByText("Plan inputs (entry, stop, quantity)")).toBeInTheDocument();
  });

  it("renders versioned demo calculation audit evidence", () => {
    const trade = AUGUST_14_TRADES.find((item) => item.id === "demo-nvda")!;
    const calc = calculateTrade(trade);
    const audit = buildTradeAuditRecord(trade, calc, {
      demo: true,
      demoLabel: DEMO_WORKSPACE_LABEL.en,
    });
    expect(audit.eventType).toBe("closed_position");
    expect(audit.demoLabel).toContain("DEMO WORKSPACE");

    render(<TradeAuditPanel audit={audit} mode="demo" lang="en" />);
    const panel = screen.getByTestId("journal-audit-record");
    expect(panel).toHaveTextContent("journal-calc.v1");
    expect(panel).toHaveTextContent("journal-input.v1");
    expect(panel).toHaveTextContent("Closed position P&L");
    expect(panel).toHaveTextContent("118.4");
    expect(panel).toHaveTextContent("116.3");
    expect(panel).toHaveTextContent("Plan inputs (entry, stop, quantity)");
    expect(panel).toHaveTextContent("+$448.00");
    expect(panel).toHaveTextContent("$8.00");
    expect(panel).toHaveTextContent("+$440.00");
    expect(panel).toHaveTextContent("2.10R");
    expect(panel).toHaveTextContent("2026-08-14T17:40:00Z");
    expect(panel).toHaveTextContent("DEMO WORKSPACE");
    expect(panel).toHaveTextContent("illustrative");
  });

  it("exposes Risk and Audit tabs on the trade detail page", () => {
    workspaceMock.current = demoWorkspace();
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}/trades/demo-nvda`]}>
        <Routes>
          <Route path={`${JOURNAL_BASE}/trades/:tradeId`} element={<TradeDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("tab", { name: "Risk" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Audit" })).toBeInTheDocument();
  });
});

describe("empty trade-detail container", () => {
  it("does not render journal-card chrome without content", () => {
    const { container } = render(<JournalPanel />);
    expect(container.querySelector(".journal-card")).toBeNull();
    const filled = render(
      <JournalPanel>
        <span>evidence</span>
      </JournalPanel>,
    );
    expect(filled.container.querySelector(".journal-card")).not.toBeNull();
    expect(filled.container.querySelector(".journal-card")).toHaveTextContent("evidence");
  });
});
