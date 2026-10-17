import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TradeInput } from "../calc/types";
import { HIDE_DEMO_KEY, FILTERS_KEY, writeUserJson } from "../lib/storage";
import { JournalWorkspaceProvider, useJournalWorkspace } from "../workspace/JournalWorkspace";

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

function trade(symbol: string, userSuffix: string): TradeInput {
  return {
    id: `live-${symbol.toLowerCase()}-${userSuffix}`,
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

function Probe() {
  const { allTrades, loading, selectedAccountId } = useJournalWorkspace();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="symbols">{allTrades.map((row) => row.symbol).join(",")}</span>
      <span data-testid="account">{selectedAccountId}</span>
    </div>
  );
}

describe("Batch 18 — rendered Journal user isolation", () => {
  beforeEach(() => {
    window.localStorage.setItem(HIDE_DEMO_KEY, "true");
    loadMock.mockReset();
  });

  it("never shows user A trades on the first render after switching to user B", async () => {
    let resolveA: (value: unknown) => void = () => {};
    const pendingA = new Promise((resolve) => {
      resolveA = resolve;
    });

    let resolveB: (value: unknown) => void = () => {};
    const pendingB = new Promise((resolve) => {
      resolveB = resolve;
    });

    loadMock.mockImplementation(({ userId }: { userId: string }) => {
      if (userId === "user-a") {
        return pendingA.then(() => ({
          ok: true,
          trades: [trade("AAA", "a")],
          accounts: [],
        }));
      }
      return pendingB.then(() => ({
        ok: true,
        trades: [trade("BBB", "b")],
        accounts: [],
      }));
    });

    authMock.current = { user: { id: "user-a" } };
    const view = render(
      <JournalWorkspaceProvider>
        <Probe />
      </JournalWorkspaceProvider>,
    );

    await act(async () => {
      authMock.current = { user: { id: "user-b" } };
      view.rerender(
        <JournalWorkspaceProvider>
          <Probe />
        </JournalWorkspaceProvider>,
      );
    });

    expect(screen.getByTestId("symbols").textContent).toBe("");
    expect(screen.getByTestId("loading").textContent).toBe("true");

    await act(async () => {
      resolveA({
        ok: true,
        trades: [trade("AAA", "a")],
        accounts: [],
      });
      await pendingA;
      await Promise.resolve();
    });

    expect(screen.getByTestId("symbols").textContent).not.toContain("AAA");

    await act(async () => {
      resolveB({
        ok: true,
        trades: [trade("BBB", "b")],
        accounts: [],
      });
      await pendingB;
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("symbols").textContent).toBe("BBB");
    });
  });

  it("preserves saved account filter until user B accounts are loaded", async () => {
    writeUserJson(FILTERS_KEY, "user-b", { accountId: "acct-b", range: "week", asset: "all" });

    loadMock.mockResolvedValue({
      ok: true,
      trades: [],
      accounts: [
        {
          id: "acct-b",
          name: "B",
          type: "personal",
          baseCurrency: "USD",
          beginningBalance: null,
          reportedBalance: null,
          reportedAsOf: null,
        },
      ],
    });

    authMock.current = { user: { id: "user-b" } };
    render(
      <JournalWorkspaceProvider>
        <Probe />
      </JournalWorkspaceProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("account").textContent).toBe("acct-b");
    });
  });
});
