import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

let resolveSlow: (() => void) | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

vi.mock("@/lib/historical-workflow/resolve-workflow-historical-context", () => ({
  resolveWorkflowHistoricalContext: vi.fn(async ({ symbol }: { symbol: string }) => {
    if (symbol === "SLOW") {
      await new Promise<void>((resolve) => {
        resolveSlow = resolve;
      });
    }
  }),
}));

vi.mock("@/lib/historical-workflow/workflow-handoff-storage", () => ({
  readPreloadedRepeatMoverContext: vi.fn(() => null),
}));

import { useCatalystHistoricalContext } from "@/hooks/useCatalystHistoricalContext";

describe("useCatalystHistoricalContext batch 220 cancellation", () => {
  beforeEach(() => {
    resolveSlow = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    resolveSlow = null;
  });

  it("does not leave a symbol stuck loading after the enrichment set changes mid-request", async () => {
    const { result, rerender } = renderHook(
      ({ symbols }: { symbols: string[] }) => useCatalystHistoricalContext(symbols),
      { initialProps: { symbols: ["SLOW"] } },
    );

    await waitFor(() => {
      expect(result.current.loadingSymbols.has("SLOW")).toBe(true);
    });

    rerender({ symbols: ["FAST"] });

    await waitFor(() => {
      expect(result.current.loadingSymbols.has("SLOW")).toBe(false);
    });

    rerender({ symbols: ["SLOW"] });

    await waitFor(() => {
      expect(result.current.loadingSymbols.has("SLOW")).toBe(true);
    });

    await act(async () => {
      resolveSlow?.();
    });

    await waitFor(() => {
      expect(result.current.loadingSymbols.has("SLOW")).toBe(false);
    });
  });
});
