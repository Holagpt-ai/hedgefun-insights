import { describe, it, expect } from "vitest";
import { attentionDetailLines, groupAttentionBySymbol } from "@/lib/session-intelligence/group-attention";

function item(overrides: Partial<{ id: string; symbol: string | null; label: string; detail: string | null; route: string | null }>) {
  return {
    id: "x",
    symbol: "GRAB" as string | null,
    label: "Bearish market signal",
    detail: "Lost prior close",
    route: "/dashboard/watchlist?symbol=GRAB" as string | null,
    ...overrides,
  };
}

describe("groupAttentionBySymbol", () => {
  it("rolls multiple events for one ticker into a single group", () => {
    const groups = groupAttentionBySymbol([
      item({ id: "1", label: "Bearish market signal", detail: "Lost prior close" }),
      item({ id: "2", label: "Bearish market signal", detail: "Broke premarket low" }),
      item({ id: "3", label: "Watchlist alert", detail: "Direction changed" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].symbol).toBe("GRAB");
    expect(groups[0].items).toHaveLength(3);
  });

  it("keeps symbol-less items standalone", () => {
    const groups = groupAttentionBySymbol([
      item({ id: "g1" }),
      item({
        id: "pending",
        symbol: null,
        label: "Analysis awaiting refresh",
        detail: "12 watchlist symbols have no current pre-market analysis",
        route: "/dashboard/watchlist",
      }),
      item({ id: "g2", detail: "Broke premarket low" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].symbol).toBe("GRAB");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].symbol).toBeNull();
    expect(groups[1].items[0].id).toBe("pending");
  });

  it("does not invent a trading conclusion — lines are supplied labels/details", () => {
    const groups = groupAttentionBySymbol([
      item({ id: "1", detail: "Lost prior close" }),
      item({ id: "2", detail: "Broke premarket low" }),
    ]);
    const lines = attentionDetailLines(groups[0].items);
    expect(lines).toEqual([
      "Bearish market signal — Lost prior close",
      "Bearish market signal — Broke premarket low",
    ]);
    expect(lines.join(" ")).not.toMatch(/deterioration|bearish bias|sell/i);
  });
});
