import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFloat = vi.fn();

vi.mock("@/lib/polygon", () => ({
  getFloat: (...args: unknown[]) => getFloat(...args),
}));

import { useRadarFloatForSymbols } from "@/hooks/useRadarFloatForSymbols";
import { peekFloatRecord, resetFloatSymbolCache } from "@/lib/market-data/float";

function createHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe("Radar float React Query cache", () => {
  beforeEach(() => {
    resetFloatSymbolCache();
    getFloat.mockReset();
  });

  afterEach(() => {
    resetFloatSymbolCache();
    vi.clearAllMocks();
  });

  it("does not long-cache a transient Float failure and recovers on the next fetch", async () => {
    getFloat
      .mockResolvedValueOnce({
        ticker: "AAA",
        float: null,
        as_of: null,
        source: "massive_float",
        status: "unavailable",
      })
      .mockResolvedValueOnce({
        ticker: "AAA",
        float: 2_400_000,
        as_of: "2026-09-01",
        source: "massive_float",
        status: "ok",
      });

    const { client, Wrapper } = createHarness();
    const { result } = renderHook(() => useRadarFloatForSymbols(["AAA"]), { wrapper: Wrapper });

    await waitFor(() => expect(getFloat).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.getFloat("AAA")).toBeNull();
    expect(peekFloatRecord("AAA")).toBeNull();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["radar-float"] });
    });

    await waitFor(() => expect(result.current.getFloat("AAA")).toBe(2_400_000));
    expect(peekFloatRecord("AAA")?.float).toBe(2_400_000);
    expect(getFloat).toHaveBeenCalledTimes(2);
  });
});
