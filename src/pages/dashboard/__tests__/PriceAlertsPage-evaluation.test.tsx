import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PriceAlertsPage from "../PriceAlertsPage";

const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: { plan: "pro" },
  }),
}));

vi.mock("@/lib/entitlement", () => ({
  hasProAccess: () => true,
}));

function chainSelect(data: unknown[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  };
}

describe("PriceAlertsPage evaluation cadence", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({ data: { evaluated: 0, triggered: 0 }, error: null });
    fromMock.mockImplementation(() => chainSelect([]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("evaluates once on mount and on the 90s interval, not on rerenders", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/alerts"]}>
        <PriceAlertsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText("Loading alerts…")).not.toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(75_000);
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(invokeMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the list visible during background evaluation when alerts exist", async () => {
    fromMock.mockImplementation(() =>
      chainSelect([
        {
          id: "a1",
          user_id: "user-1",
          symbol: "TSLA",
          condition_type: "price_above",
          threshold: 100,
          reference_price: null,
          note: null,
          status: "active",
          recurrence: "recurring",
          cooldown_minutes: 60,
          armed: true,
          last_observed_price: null,
          last_triggered_at: null,
          last_evaluated_at: null,
          last_quote_price: null,
          last_quote_at: null,
          data_latency: "live_delayed",
          market_context: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    );

    render(
      <MemoryRouter initialEntries={["/dashboard/alerts"]}>
        <PriceAlertsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getAllByText("TSLA").length).toBeGreaterThan(0));
    expect(screen.queryByText("Loading alerts…")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getAllByText("TSLA").length).toBeGreaterThan(0);
    expect(screen.queryByText("Loading alerts…")).not.toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
