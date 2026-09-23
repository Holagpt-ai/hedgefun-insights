import { describe, expect, it } from "vitest";
import { SCREENER_TABS, getScreenerTabById } from "@/config/screener-tabs.config";
import { resolveScreenerCopy } from "@/lib/screeners/screener-copy";

function tab(id: string) {
  const t = getScreenerTabById(id);
  if (!t) throw new Error(`missing tab ${id}`);
  return t;
}

describe("Screener copy — Radar V2 session-aware honesty (D5.1 / D12)", () => {
  it("Radar-backed tabs omit engineering header copy", () => {
    for (const session of ["pre-market", "market", "after-hours"] as const) {
      for (const id of ["day_trade_radar", "volume_spikes", "unusual_volume", "gainers_losers"]) {
        const copy = resolveScreenerCopy(tab(id), "radar-v2", session);
        expect(copy.description).toBe("");
        expect(copy.criteria).toEqual([]);
      }
    }
  });

  it("21–22. Gappers and New Highs/Lows are not Radar-backed → keep static copy", () => {
    for (const id of ["gappers", "new_highs_lows"]) {
      const t = tab(id);
      expect(resolveScreenerCopy(t, "radar-v2", "market")).toEqual({
        description: t.description,
        criteria: t.criteria,
      });
      expect(resolveScreenerCopy(t, "radar-v2", "after-hours")).toEqual({
        description: t.description,
        criteria: t.criteria,
      });
    }
  });

  it("existing fallback descriptions are returned unchanged for the verified path", () => {
    for (const t of SCREENER_TABS) {
      expect(resolveScreenerCopy(t, "screener-results")).toEqual({
        description: t.description,
        criteria: t.criteria,
      });
      expect(resolveScreenerCopy(t, null)).toEqual({
        description: t.description,
        criteria: t.criteria,
      });
    }
  });

  it("static RTH config still describes the regular-session thresholds (fallback copy)", () => {
    expect(tab("day_trade_radar").description).toMatch(/10%/);
    expect(tab("volume_spikes").description).toMatch(/3×/);
    expect(tab("unusual_volume").description).toMatch(/4×/);
  });
});
