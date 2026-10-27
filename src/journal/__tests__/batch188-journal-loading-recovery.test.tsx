import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { TradeInput } from "../calc/types";
import { FILTERS_KEY, HIDE_DEMO_KEY, writeUserJson } from "../lib/storage";
import { OverviewPage } from "../pages/OverviewPage";
import { TradesPage } from "../pages/TradesPage";
import { CalendarPage } from "../pages/CalendarPage";
import { JournalWorkspaceProvider, useJournalWorkspace } from "../workspace/JournalWorkspace";
import { AsyncTimeoutError } from "@/lib/async/with-timeout";
import { TooltipProvider } from "@/components/ui/tooltip";

const { authMock, loadMock } = vi.hoisted(() => ({
  authMock: { current: { user: { id: "user-a" } as { id: string } | null } },
  loadMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authMock.current,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("../ledger/loadTrades", () => ({
  loadJournalGraph: (...args: unknown[]) => loadMock(...args),
}));

vi.mock("@/hooks/useEffectiveLanguage", () => ({
  useEffectiveLanguage: () => "en",
}));

function trade(symbol: string): TradeInput {
  return {
    id: `live-${symbol}`,
    accountId: "acct-1",
    assetClass: "stock",
    instrument: "share",
    symbol,
    direction: "long",
    status: "closed",
    executions: [
      {
        id: "e1",
        timestamp: "2026-03-16T14:00:00.000Z",
        timestampUtc: "2026-03-16T14:00:00.000Z",
        originalTimezone: "America/New_York",
        action: "buy",
        quantity: 1,
        price: 10,
      },
    ],
    sessionDate: "2026-03-16",
  };
}

function shell(page: "overview" | "trades" | "calendar") {
  const Page =
    page === "overview" ? OverviewPage : page === "trades" ? TradesPage : CalendarPage;
  return (
    <TooltipProvider>
      <MemoryRouter initialEntries={["/"]}>
        <JournalWorkspaceProvider>
          <Routes>
            <Route path="/" element={<Page />} />
          </Routes>
        </JournalWorkspaceProvider>
      </MemoryRouter>
    </TooltipProvider>
  );
}

describe("Batch 188 — Journal loading and error recovery", () => {
  beforeEach(() => {
    window.localStorage.setItem(HIDE_DEMO_KEY, "true");
    writeUserJson(FILTERS_KEY, "user-a", { accountId: "all", range: "all", asset: "all" });
    authMock.current = { user: { id: "user-a" } };
    loadMock.mockReset();
  });

  it("Overview exits loading and renders after a successful initial load", async () => {
    loadMock.mockResolvedValue({
      ok: true,
      trades: [trade("AAA")],
      accounts: [],
    });
    render(shell("overview"));
    await waitFor(() => {
      expect(screen.queryByText(/Loading journal data/i)).toBeNull();
    });
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("Overview shows terminal error with Retry on { ok: false }", async () => {
    loadMock.mockResolvedValue({ ok: false, error: "permission denied" });
    render(shell("overview"));
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    expect(screen.queryByText(/Loading journal data/i)).toBeNull();
  });

  it("Overview shows terminal error when the load promise rejects", async () => {
    loadMock.mockRejectedValue(new Error("network down"));
    render(shell("overview"));
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
  });

  it("does not fall back to demo trades when live load fails", async () => {
    loadMock.mockResolvedValue({ ok: false, error: "denied" });
    window.localStorage.setItem(HIDE_DEMO_KEY, "false");
    render(shell("overview"));
    await waitFor(() => expect(screen.getByText("Retry")).toBeInTheDocument());
    expect(screen.queryByText(/Demo Workspace/i)).toBeNull();
  });

  it("Overview shows terminal error on bounded timeout", async () => {
    loadMock.mockRejectedValue(new AsyncTimeoutError("journal_graph_load", 25_000));
    render(shell("overview"));
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
    expect(screen.getByText(/too long to load/i)).toBeInTheDocument();
  });

  it("Trades and Calendar expose the same terminal-error recovery", async () => {
    loadMock.mockResolvedValue({ ok: false, error: "load failed" });
    const trades = render(shell("trades"));
    await waitFor(() => expect(screen.getByText("Retry")).toBeInTheDocument());
    trades.unmount();

    loadMock.mockResolvedValue({ ok: false, error: "load failed" });
    render(shell("calendar"));
    await waitFor(() => expect(screen.getByText("Retry")).toBeInTheDocument());
  });

  it("Retry after failure clears the error and restores live trades", async () => {
    loadMock.mockResolvedValueOnce({ ok: false, error: "first fail" });
    render(shell("trades"));
    await waitFor(() => expect(screen.getByText(/first fail/i)).toBeInTheDocument());

    loadMock.mockResolvedValueOnce({
      ok: true,
      trades: [trade("ZZZ")],
      accounts: [],
    });
    await act(async () => {
      screen.getByText("Retry").click();
    });
    await waitFor(() => {
      expect(screen.getByText("ZZZ")).toBeInTheDocument();
    });
    expect(screen.queryByText(/first fail/i)).toBeNull();
  });

  it("refresh failure retains prior trades with a stale banner", async () => {
    let calls = 0;
    loadMock.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: true, trades: [trade("KEEP")], accounts: [] };
      }
      return { ok: false, error: "refresh blew up" };
    });

    function RefreshProbe() {
      const { refresh } = useJournalWorkspace();
      return (
        <>
          <button type="button" onClick={() => void refresh()}>
            Force refresh
          </button>
          <TradesPage />
        </>
      );
    }

    render(
      <TooltipProvider>
        <MemoryRouter>
          <JournalWorkspaceProvider>
            <RefreshProbe />
          </JournalWorkspaceProvider>
        </MemoryRouter>
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText("KEEP")).toBeInTheDocument());
    await act(async () => {
      screen.getByText("Force refresh").click();
    });
    await waitFor(() => {
      expect(screen.getByText(/Could not refresh journal data/i)).toBeInTheDocument();
    });
    expect(screen.getByText("KEEP")).toBeInTheDocument();
    expect(screen.getByText(/last successful journal load/i)).toBeInTheDocument();
  });

  it("never applies user A trades after switching to user B mid-request", async () => {
    let resolveA: (value: unknown) => void = () => {};
    const pendingA = new Promise((resolve) => {
      resolveA = resolve;
    });

    loadMock.mockImplementation(({ userId }: { userId: string }) => {
      if (userId === "user-a") {
        return pendingA.then(() => ({
          ok: true,
          trades: [trade("AAA")],
          accounts: [],
        }));
      }
      return Promise.resolve({
        ok: true,
        trades: [trade("BBB")],
        accounts: [],
      });
    });

    function SymbolProbe() {
      const { allTrades, loading } = useJournalWorkspace();
      return (
        <div>
          <span data-testid="loading">{String(loading)}</span>
          <span data-testid="symbols">{allTrades.map((row) => row.symbol).join(",")}</span>
        </div>
      );
    }

    authMock.current = { user: { id: "user-a" } };
    const view = render(
      <TooltipProvider>
        <JournalWorkspaceProvider>
          <SymbolProbe />
        </JournalWorkspaceProvider>
      </TooltipProvider>,
    );

    writeUserJson(FILTERS_KEY, "user-b", { accountId: "all", range: "all", asset: "all" });

    await act(async () => {
      authMock.current = { user: { id: "user-b" } };
      view.rerender(
        <TooltipProvider>
          <JournalWorkspaceProvider>
            <SymbolProbe />
          </JournalWorkspaceProvider>
        </TooltipProvider>,
      );
    });

    await waitFor(() => expect(screen.getByTestId("symbols").textContent).toBe("BBB"));
    expect(screen.getByTestId("symbols").textContent).not.toContain("AAA");

    await act(async () => {
      resolveA({
        ok: true,
        trades: [trade("AAA")],
        accounts: [],
      });
      await pendingA;
      await Promise.resolve();
    });
    expect(screen.getByTestId("symbols").textContent).not.toContain("AAA");
  });
});
