import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRadarNews = vi.fn();

vi.mock("@/lib/polygon", () => ({
  getRadarNews: (...args: unknown[]) => getRadarNews(...args),
}));

import { useRecentProviderNewsForSymbols } from "@/hooks/useRecentProviderNewsForSymbols";
import { resetRecentNewsSymbolCache } from "@/lib/market-data/recent-news";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("Radar news per-symbol status", () => {
  beforeEach(() => {
    resetRecentNewsSymbolCache();
    getRadarNews.mockReset();
  });

  afterEach(() => {
    resetRecentNewsSymbolCache();
    vi.clearAllMocks();
  });

  it("does not mark a successful empty symbol unavailable when a sibling fails", async () => {
    getRadarNews.mockImplementation(async (ticker: string) => {
      if (ticker === "AAA") return { ticker: "AAA", status: "empty", articles: [] };
      return { ticker, status: "unavailable", articles: [] };
    });

    const { result } = renderHook(() => useRecentProviderNewsForSymbols(["AAA", "BBB"]), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.getStatus("AAA")).toBe("empty"));
    expect(result.current.getStatus("BBB")).toBe("unavailable");
    expect(result.current.getHeadline("AAA")).toBeUndefined();
    expect(result.current.getHeadline("BBB")).toBeUndefined();
  });
});
