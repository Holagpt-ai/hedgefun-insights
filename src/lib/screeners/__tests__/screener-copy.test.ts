import { describe, expect, it } from "vitest";
import { SCREENER_TABS, getScreenerTabById } from "@/config/screener-tabs.config";
import { resolveScreenerCopy } from "@/lib/screeners/screener-copy";

function tab(id: string) {
  const t = getScreenerTabById(id);
  if (!t) throw new Error(`missing tab ${id}`);
  return t;
}

function blob(copy: { description: string; criteria: string[] }) {
  return `${copy.description} ${copy.criteria.join(" ")}`;
}

describe("Screener copy — Radar V2 session-aware honesty (D5.1 / D12)", () => {
  it("Day Trade Radar PM copy names pre-market and does not advertise +10% / 5× gates", () => {
    const copy = resolveScreenerCopy(tab("day_trade_radar"), "radar-v2", "pre-market");
    expect(copy.description).toBe(
      "Radar V2 Sentinel pre-market candidates ranked volume-first from the delayed market feed.",
    );
    expect(blob(copy)).not.toMatch(/\+?10\s*% CONFIRMED/i);
    expect(blob(copy).toLowerCase()).not.toContain("v2.1 snapshot");
    expect(copy.description.toLowerCase()).toContain("pre-market");
    expect(copy.description.toLowerCase()).not.toContain("after-hours");
  });

  it("Day Trade Radar market copy names regular-session and does not say pre-market", () => {
    const copy = resolveScreenerCopy(tab("day_trade_radar"), "radar-v2", "market");
    expect(copy.description).toBe(
      "Radar V2 Sentinel regular-session candidates ranked volume-first from the delayed market feed.",
    );
    expect(copy.description.toLowerCase()).not.toContain("pre-market");
    expect(copy.description.toLowerCase()).not.toContain("after-hours");
    expect(copy.description.toLowerCase()).not.toContain("v2.1 snapshot");
  });

  it("Day Trade Radar after-hours copy names after-hours and does not say pre-market", () => {
    const copy = resolveScreenerCopy(tab("day_trade_radar"), "radar-v2", "after-hours");
    expect(copy.description).toBe(
      "Radar V2 Sentinel after-hours candidates ranked volume-first from the delayed market feed.",
    );
    expect(copy.description.toLowerCase()).toContain("after-hours");
    expect(copy.description.toLowerCase()).not.toContain("pre-market");
    expect(copy.description.toLowerCase()).not.toContain("v2.1 snapshot");
  });

  it("Volume Spikes / Unusual Volume Radar copy does not claim a prior-day volume ratio", () => {
    for (const session of ["pre-market", "market", "after-hours"] as const) {
      for (const id of ["volume_spikes", "unusual_volume"]) {
        const copy = resolveScreenerCopy(tab(id), "radar-v2", session);
        const text = blob(copy);
        expect(text).not.toMatch(/[0-9]\s*×/);
        expect(text).not.toMatch(/\bx\s*prior/i);
        expect(text.toLowerCase()).toContain("rvol");
        expect(text.toLowerCase()).toContain("not persisted by radar v2");
        expect(text.toLowerCase()).toContain("prior-day ratio unavailable");
        expect(copy.description.toLowerCase()).toContain("velocity");
        if (session !== "pre-market") {
          expect(copy.description.toLowerCase()).not.toContain("pre-market");
        }
      }
    }
  });

  it("Gainers/Losers Radar copy flags prior-close % as unavailable in every live session", () => {
    for (const session of ["pre-market", "market", "after-hours"] as const) {
      const copy = resolveScreenerCopy(tab("gainers_losers"), "radar-v2", session);
      const desc = copy.description.toLowerCase();
      expect(desc).toContain("prior-close");
      expect(desc).toContain("short-window");
      expect(desc).toContain("not presented");
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
