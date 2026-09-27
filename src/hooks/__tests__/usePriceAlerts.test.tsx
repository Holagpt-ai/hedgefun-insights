import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { usePriceAlerts } from "../usePriceAlerts";
import { PRICE_ALERT_CONDITIONS } from "@/lib/price-alerts/types";

const invokeMock = vi.fn();
const selectMock = vi.fn();
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
  useAuth: () => ({ user: { id: "user-1" } }),
}));

function chainSelect(data: unknown[] = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  };
  selectMock.mockReturnValue(chain);
  return chain;
}

describe("usePriceAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({ data: { evaluated: 1, triggered: 0 }, error: null });
    fromMock.mockImplementation(() => chainSelect([]));
  });

  it("resolves initial load and exits loading state", async () => {
    const { result } = renderHook(() => usePriceAlerts());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.alerts).toEqual([]);
  });

  it("does not return to initial loading after background evaluate/refetch", async () => {
    const { result } = renderHook(() => usePriceAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.evaluateNow();
    });

    expect(result.current.loading).toBe(false);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("keeps stable evaluateNow identity across rerenders", async () => {
    const { result, rerender } = renderHook(() => usePriceAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const first = result.current.evaluateNow;
    rerender();
    rerender();
    expect(result.current.evaluateNow).toBe(first);
  });

  it("exposes all four alert condition types unchanged", () => {
    expect(PRICE_ALERT_CONDITIONS.map((c) => c.value)).toEqual([
      "price_above",
      "price_below",
      "percent_move_up",
      "percent_move_down",
    ]);
  });

  it("create, pause/resume, and delete refresh in the background", async () => {
    const chain = chainSelect([]);
    fromMock.mockImplementation(() => chain);

    const { result } = renderHook(() => usePriceAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createAlert({
        symbol: "TSLA",
        condition: "price_above",
        value: 99999,
        enabled: true,
      });
    });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await result.current.setEnabled("alert-1", false);
      await result.current.setEnabled("alert-1", true);
      await result.current.deleteAlert("alert-1");
    });
    expect(result.current.loading).toBe(false);
    expect(chain.insert).toHaveBeenCalled();
  });
});
