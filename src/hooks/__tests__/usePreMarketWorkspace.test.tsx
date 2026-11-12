import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncTimeoutError } from "@/lib/async/with-timeout";

const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

import {
  fetchPreMarketWorkspace,
  PRE_MARKET_WORKSPACE_FETCH_TIMEOUT_MS,
  usePreMarketWorkspace,
} from "@/hooks/usePreMarketWorkspace";

function wrapper(client: QueryClient) {
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("fetchPreMarketWorkspace", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects with AsyncTimeoutError when Edge invoke never settles", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    const client = new QueryClient();
    const key = ["pre-market-workspace", "user-1"] as const;
    vi.useFakeTimers();
    try {
      const pending = fetchPreMarketWorkspace(client, key);
      const assertion = expect(pending).rejects.toBeInstanceOf(AsyncTimeoutError);
      await vi.advanceTimersByTimeAsync(PRE_MARKET_WORKSPACE_FETCH_TIMEOUT_MS + 50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("usePreMarketWorkspace", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("terminates initial loading with isUnavailable after workspace failure", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "fail" } });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result } = renderHook(() => usePreMarketWorkspace(), {
      wrapper: wrapper(client),
    });
    await waitFor(
      () => {
        expect(result.current.isUnavailable).toBe(true);
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 8_000 },
    );
  });
});
