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
  const { mode, selectedAccountId, demoHidden, hideDemo, refresh, trades, setAccountId } =
    useJournalWorkspace();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="account">{selectedAccountId}</span>
      <span data-testid="demo-hidden">{String(demoHidden)}</span>
      <span data-testid="filtered-trade-count">{trades.length}</span>
      <button type="button" onClick={() => hideDemo()}>
        hide-demo
      </button>
      <button type="button" onClick={() => void refresh()}>
        refresh
      </button>
      <button type="button" onClick={() => setAccountId("demo-account-main")}>
        pick-demo-account
      </button>
    </div>
  );
}

function readPersistedLiveAccountId(): string {
  return JSON.parse(window.localStorage.getItem("stocksist-journal-filters:user-live")!).accountId;
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

  it("shows demo trades while preserving the saved live account for later restoration", async () => {
    render(
      <JournalWorkspaceProvider>
        <Probe />
      </JournalWorkspaceProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mode").textContent).toBe("demo");
      expect(Number(screen.getByTestId("filtered-trade-count").textContent)).toBeGreaterThan(0);
    });

    expect(readPersistedLiveAccountId()).toBe("acct-live-1");

    await act(async () => {
      screen.getByRole("button", { name: "pick-demo-account" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("account").textContent).toBe("demo-account-main");
      expect(Number(screen.getByTestId("filtered-trade-count").textContent)).toBeGreaterThan(0);
    });

    expect(readPersistedLiveAccountId()).toBe("acct-live-1");

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

    expect(readPersistedLiveAccountId()).toBe("acct-live-1");
  });
});
