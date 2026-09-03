import { describe, expect, it } from "vitest";
import { SCREENER_TABS, getScreenerTabById } from "@/config/screener-tabs.config";
import { resolveScreenerCopy } from "@/lib/screeners/screener-copy";

function tab(id: string) {
  const t = getScreenerTabById(id);
  if (!t) throw new Error(`missing tab ${id}`);
  return t;
}

describe("Screener copy — Radar V2 pre-market semantic honesty (D5.1)", () => {
  it("Day Trade Radar PM copy does not advertise +10% / 5× RTH criteria as applied", () => {
    const copy = resolveScreenerCopy(tab("day_trade_radar"), "radar-v2");
    const blob = `${copy.description} ${copy.criteria.join(" ")}`;
    expect(blob).not.toMatch(/\+?10\s*%/);
    expect(blob).not.toMatch(/5\s*×/);
    expect(blob).not.toMatch(/5x prior/i);
    // Must state the RTH gates are not applied pre-market.
    expect(copy.description.toLowerCase()).toContain("does not apply pre-market");
  });

  it("Volume Spikes / Unusual Volume PM copy does not claim a prior-day volume ratio", () => {
    for (const id of ["volume_spikes", "unusual_volume"]) {
      const copy = resolveScreenerCopy(tab(id), "radar-v2");
      const blob = `${copy.description} ${copy.criteria.join(" ")}`;
      // No 3× / 4× (or any ×) prior-day multiplier is claimed pre-market.
      expect(blob).not.toMatch(/[0-9]\s*×/);
      expect(blob).not.toMatch(/\bx\s*prior/i);
      // No fabricated RVOL.
      expect(blob).not.toMatch(/rvol/i);
      // Describes real Radar volume/velocity evidence, and flags the missing ratio.
      expect(blob.toLowerCase()).toContain("velocity");
      expect(copy.description.toLowerCase()).toContain("not available pre-market");
    }
  });

  it("Gainers/Losers PM copy flags that prior-close % change is unavailable pre-market", () => {
    const copy = resolveScreenerCopy(tab("gainers_losers"), "radar-v2");
    const desc = copy.description.toLowerCase();
    expect(desc).toContain("prior-close");
    expect(desc).toContain("not available pre-market");
    // Explicitly states short-window movement is not presented as a day change.
    expect(desc).toContain("short-window");
    expect(desc).toContain("not presented");
  });

  it("Gappers and New Highs/Lows are not Radar-backed → keep their static RTH copy", () => {
    for (const id of ["gappers", "new_highs_lows"]) {
      const t = tab(id);
      // Even if a radar-v2 source were passed, these tabs are not overridden.
      expect(resolveScreenerCopy(t, "radar-v2")).toEqual({
        description: t.description,
        criteria: t.criteria,
      });
    }
  });

  it("existing RTH / fallback descriptions are returned unchanged for the verified path", () => {
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

  it("static RTH config still describes the regular-session thresholds (not weakened)", () => {
    // The fallback/RTH copy is preserved verbatim; the honesty pass only changes
    // what is shown during Radar V2 pre-market mode.
    expect(tab("day_trade_radar").description).toMatch(/10%/);
    expect(tab("volume_spikes").description).toMatch(/3×/);
    expect(tab("unusual_volume").description).toMatch(/4×/);
  });
});
