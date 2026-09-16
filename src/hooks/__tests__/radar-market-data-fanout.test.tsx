import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFloatForSymbols = vi.fn();
const getRecentHeadlinesForSymbols = vi.fn();

vi.mock("@/lib/market-data/float", async () => {
  const actual = await vi.importActual<typeof import("@/lib/market-data/float")>("@/lib/market-data/float");
  return {
    ...actual,
    getFloatForSymbols: (...args: unknown[]) => getFloatForSymbols(...args),
  };
});

vi.mock("@/lib/market-data/recent-news", async () => {
  const actual = await vi.importActual<typeof import("@/lib/market-data/recent-news")>(
    "@/lib/market-data/recent-news",
  );
  return {
    ...actual,
    getRecentHeadlinesForSymbols: (...args: unknown[]) => getRecentHeadlinesForSymbols(...args),
  };
});

import { useRadarFloatForSymbols } from "@/hooks/useRadarFloatForSymbols";
import { useRecentProviderNewsForSymbols } from "@/hooks/useRecentProviderNewsForSymbols";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("Radar float/news request fan-out", () => {
  beforeEach(() => {
    getFloatForSymbols.mockReset();
    getRecentHeadlinesForSymbols.mockReset();
    getFloatForSymbols.mockImplementation(async (symbols: string[]) => {
      const map = new Map();
      for (const symbol of symbols) {
        map.set(symbol, { ticker: symbol, float: 1_000_000, asOf: null, source: "massive_float" });
      }
      return map;
    });
    getRecentHeadlinesForSymbols.mockImplementation(async () => new Map());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses one float query for a large normalized symbol set", async () => {
    const symbols = Array.from({ length: 120 }, (_, i) => ` t${i} `);
    const { result } = renderHook(() => useRadarFloatForSymbols(symbols), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.getFloat("T0")).toBe(1_000_000));
    expect(getFloatForSymbols).toHaveBeenCalledTimes(1);
    expect(getFloatForSymbols.mock.calls[0][0]).toHaveLength(120);
  });

  it("uses one recent-news query for a large normalized symbol set", async () => {
    const symbols = Array.from({ length: 120 }, (_, i) => `n${i}`);
    const { result } = renderHook(() => useRecentProviderNewsForSymbols(symbols), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(getRecentHeadlinesForSymbols).toHaveBeenCalledTimes(1);
    expect(getRecentHeadlinesForSymbols.mock.calls[0][0]).toHaveLength(120);
  });
});
