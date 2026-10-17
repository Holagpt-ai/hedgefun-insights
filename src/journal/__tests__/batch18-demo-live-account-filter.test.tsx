import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FILTERS_KEY, HIDE_DEMO_KEY, writeUserJson } from "../lib/storage";
import { JournalWorkspaceProvider, useJournalWorkspace } from "../workspace/JournalWorkspace";

const { authMock, loadMock } = vi.hoisted(() => ({
  authMock: { current: { user: { id: "user-live" } as { id: string } | null } },
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

function Probe() {
  const { mode, selectedAccountId, demoHidden, hideDemo, refresh, allTrades, trades } =
    useJournalWorkspace();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="account">{selectedAccountId}</span>
      <span data-testid="demo-hidden">{String(demoHidden)}</span>
      <span data-testid="demo-trade-count">{allTrades.length}</span>
      <span data-testid="filtered-trade-count">{trades.length}</span>
      <button type="button" onClick={() => hideDemo()}>
        hide-demo
      </button>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
    </div>
  );
}

describe("Batch 18 — live account filter across demo workspace", () => {
  beforeEach(() => {
    window.localStorage.removeItem(HIDE_DEMO_KEY);
    loadMock.mockReset();
    writeUserJson(FILTERS_KEY, "user-live", {
      accountId: "acct-live-1",
      range: "mtd",
      asset: "all",
    });
    loadMock.mockResolvedValue({
      ok: true,
      trades: [],
      accounts: [
        {
          id: "acct-live-1",
          name: "Live primary",
          type: "personal",
          baseCurrency: "USD",
          beginningBalance: null,
          reportedBalance: null,
          reportedAsOf: null,
        },
      ],
    });
    authMock.current = { user: { id: "user-live" } };
  });

  it("preserves a valid saved live account while demo data is visible with zero live trades", async () => {
    render(
      <JournalWorkspaceProvider>
        <Probe />
      </JournalWorkspaceProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mode").textContent).toBe("demo");
      expect(screen.getByTestId("account").textContent).toBe("acct-live-1");
    });

    expect(Number(screen.getByTestId("demo-trade-count").textContent)).toBeGreaterThan(0);
    expect(Number(screen.getByTestId("filtered-trade-count").textContent)).toBe(0);

    await act(async () => {
      screen.getByRole("button", { name: "hide-demo" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("mode").textContent).toBe("empty");
      expect(screen.getByTestId("account").textContent).toBe("acct-live-1");
    });

    await act(async () => {
      screen.getByRole("button", { name: "refresh" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("account").textContent).toBe("acct-live-1");
    });

    expect(JSON.parse(window.localStorage.getItem("stocksist-journal-filters:user-live")!).accountId).toBe(
      "acct-live-1",
    );
  });
});
