import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncTimeoutError } from "@/lib/async/with-timeout";
import { buildBatch186ProductionScaleRows } from "@/lib/am-inbox/__tests__/batch186-production-scale-fixture";

const fetchActiveLateSessionHandoffs = vi.fn();

vi.mock("@/lib/am-inbox/late-session-handoff-client", () => ({
  fetchActiveLateSessionHandoffs: (...args: unknown[]) => fetchActiveLateSessionHandoffs(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

import {
  loadAmInboxLateSessionViewForDate,
  useAmInboxLateSessionHandoffs,
} from "@/hooks/useAmInboxLateSessionHandoffs";

function wrapper(client: QueryClient) {
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useAmInboxLateSessionHandoffs", () => {
  beforeEach(() => {
    fetchActiveLateSessionHandoffs.mockReset();
  });

  it("loadAmInboxLateSessionViewForDate maps RPC rows to a view", async () => {
    fetchActiveLateSessionHandoffs.mockResolvedValue(buildBatch186ProductionScaleRows().slice(0, 10));
    const view = await loadAmInboxLateSessionViewForDate("2026-10-27");
    expect(view.asOfSessionDate).toBe("2026-10-27");
    expect(view.funnel.detectedCount).toBeGreaterThan(0);
  });

  it("terminates initial loading after success", async () => {
    fetchActiveLateSessionHandoffs.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAmInboxLateSessionHandoffs("2026-10-27"), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data?.candidates).toEqual([]);
  });

  it("refetch keeps prior cards visible while a slow request is in flight", async () => {
    fetchActiveLateSessionHandoffs
      .mockResolvedValueOnce(buildBatch186ProductionScaleRows().slice(0, 30))
      .mockImplementationOnce(() => new Promise(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAmInboxLateSessionHandoffs("2026-10-27"), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const priorCount = result.current.data?.candidates.length ?? 0;
    expect(priorCount).toBeGreaterThan(0);
    void result.current.refetch();
    await waitFor(() => expect(fetchActiveLateSessionHandoffs).toHaveBeenCalledTimes(2));
    expect(result.current.data?.candidates.length).toBe(priorCount);
    expect(result.current.isLoading).toBe(false);
  });

  it("loadAmInboxLateSessionViewForDate propagates bounded RPC timeout errors", async () => {
    fetchActiveLateSessionHandoffs.mockRejectedValue(
      new AsyncTimeoutError("late_session_handoff_list_active_v1", 25_000),
    );
    await expect(loadAmInboxLateSessionViewForDate("2026-10-27")).rejects.toBeInstanceOf(
      AsyncTimeoutError,
    );
  });
});
