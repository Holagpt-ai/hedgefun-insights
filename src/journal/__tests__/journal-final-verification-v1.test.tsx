import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { getEffectiveLanguage } from "@/config/locale-v1.policy";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import DashboardJournalRedirect from "@/pages/dashboard/JournalPage";
import { JournalTradeWorkflowLinks } from "../components/JournalTradeWorkflowLinks";
import { JournalShell } from "../components/JournalShell";
import { journalMessage } from "../i18n";
import { JOURNAL_BASE } from "../nav";
import { sessionDateInTimezone } from "../ledger/persist-contract";
import { saveTrade, type JournalDb } from "../ledger/saveTrade";
import type { TradeInput } from "../calc/types";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "es", setLanguage: vi.fn(), t: (k: string) => k }),
}));

const workspaceStub = {
  mode: "demo" as const,
  loading: false,
  error: null,
  allTrades: [],
  trades: [],
  calculations: [],
  metrics: {
    netPnl: 0n,
    sampleSize: 0,
    grossPnl: 0n,
    fees: 0n,
    profitFactor: null,
    expectancyDollars: null,
    averageR: null,
    calculationState: "ok" as const,
  },
  daily: [],
  selectedAccountId: "all",
  range: "augustDemo" as const,
  asset: "all" as const,
  setAccountId: () => {},
  setRange: () => {},
  setAsset: () => {},
  accounts: [],
  dataQualityCount: 0,
  dataQualityIssues: [],
  hideDemo: () => {},
  showDemo: () => {},
  demoHidden: false,
  refresh: async () => {},
  onLiveTradeSaved: async () => {},
  processScore: null,
  equity: 0n,
  reconciliationState: {
    derivedEquity: 0n,
    reportedBalance: null,
    difference: null,
    state: "missing_balance" as const,
  },
  missingReviews: new Set<string>(),
  demoLabel: { en: "Demo", es: "Demo" },
};

vi.mock("../workspace/JournalWorkspace", () => ({
  JournalWorkspaceProvider: ({ children }: { children: ReactNode }) => children,
  useJournalWorkspace: () => workspaceStub,
}));

describe("journal final verification v1", () => {
  it("routes /dashboard/journal?symbol= to new trade with validated symbol", async () => {
    render(
      <MemoryRouter initialEntries={[`${JOURNAL_BASE}?symbol=aapl`]}>
        <Routes>
          <Route path={JOURNAL_BASE} element={<JournalShell />}>
            <Route index element={<div data-testid="journal-index" />} />
            <Route path="trades/new" element={<div data-testid="new-trade" />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("new-trade")).toBeTruthy();
  });

  it("legacy dashboard journal redirect preserves symbol query", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/journal?symbol=NVDA"]}>
        <Routes>
          <Route path="/dashboard/journal" element={<DashboardJournalRedirect />} />
          <Route path="/dashboard/journal/trades/new" element={<div data-testid="journal-new-dest" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("journal-new-dest")).toBeTruthy();
  });

  it("builds symbol-aware outbound workflow links", () => {
    render(
      <MemoryRouter>
        <JournalTradeWorkflowLinks symbol="brk.b" />
      </MemoryRouter>,
    );
    const routes = workflowSymbolRoutes("BRK.B");
    expect(routes).toBeTruthy();
    expect(screen.getByLabelText(`AI Analyst for ${routes!.symbol}`).getAttribute("href")).toBe(routes!.ai);
    expect(screen.getByLabelText(`Catalyst for ${routes!.symbol}`).getAttribute("href")).toBe(routes!.catalyst);
    expect(screen.getByLabelText(`Watchlist for ${routes!.symbol}`).getAttribute("href")).toBe(routes!.watchlist);
    expect(screen.getByLabelText("Screeners").getAttribute("href")).toBe("/dashboard/screeners");
    expect(screen.getByLabelText("Action Center").getAttribute("href")).toBe("/dashboard/action-center");
  });

  it("inbound journal handoff path matches workflow routes", () => {
    const routes = workflowSymbolRoutes("AAA");
    expect(routes?.journal).toBe("/dashboard/journal?symbol=AAA");
  });

  it("forces English journal copy on dashboard when user prefers Spanish", () => {
    const en = journalMessage("en", "nav.trades");
    const forced = journalMessage(getEffectiveLanguage("es", `${JOURNAL_BASE}/trades`), "nav.trades");
    expect(forced).toBe(en);
    expect(forced).toBe("Trades");
  });

  it("uses America/New_York session dates without UTC day shift", () => {
    expect(sessionDateInTimezone("2026-08-15T02:00:00Z")).toBe("2026-08-14");
    expect(sessionDateInTimezone("2026-08-14T13:32:00Z")).toBe("2026-08-14");
  });

  it("saveTrade calls atomic RPC and returns trade id", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, trade_id: "trade-1" }, error: null }));
    const client = { from: vi.fn(), rpc } as unknown as JournalDb;
    const trade = {
      id: "draft-1",
      accountId: "live-default",
      assetClass: "stock",
      instrument: "share",
      symbol: "NVDA",
      direction: "long",
      status: "open",
      executions: [
        {
          id: "e1",
          timestamp: "2026-08-14T13:32:00Z",
          timestampUtc: "2026-08-14T13:32:00Z",
          originalTimezone: "America/New_York",
          action: "buy",
          quantity: 10,
          price: 100,
          commission: 0,
        },
      ],
    } satisfies TradeInput;
    const result = await saveTrade(trade, { mode: "live", userId: "u1", client });
    expect(result.ok).toBe(true);
    expect(result.tradeId).toBe("trade-1");
    expect(rpc).toHaveBeenCalled();
  });

  it("journal table wrapper supports horizontal scroll on small screens", () => {
    const css = readFileSync(path.resolve(__dirname, "../journal.css"), "utf8");
    expect(css).toContain(".journal-table-wrap");
    expect(css).toMatch(/\.journal-table-wrap[\s\S]*overflow:\s*auto/);
  });
});
