import { describe, expect, it } from "vitest";
import type { PmSessionSummaryRow } from "@/lib/inbox/pm-session-summary";
import { dedupePmSessionSummaryRows } from "@/lib/inbox/pm-session-summary-dedupe";

function row(symbol: string, rank: number): PmSessionSummaryRow {
  return {
    symbol,
    rank,
    primaryEvent: "RUNNING_UP",
    primaryEventLabel: "Running Up",
    rvol5m: 2,
    volumeVelocity: null,
    distanceFromHodPct: null,
  };
}

describe("dedupePmSessionSummaryRows", () => {
  it("removes duplicate symbols within the PM summary list only", () => {
    const rows = dedupePmSessionSummaryRows([row("AAA", 1), row("AAA", 2), row("BBB", 3)]);
    expect(rows.map((r) => r.symbol)).toEqual(["AAA", "BBB"]);
    expect(rows[0]?.rank).toBe(1);
  });

  it("keeps a high-volume PM candidate even when also on Carryover Watch elsewhere", () => {
    const input = [row("LIQ", 1), row("RUN", 2)];
    const carryoverSymbols = new Set(["LIQ"]);
    const deduped = dedupePmSessionSummaryRows(input);
    expect(deduped.map((r) => r.symbol)).toEqual(["LIQ", "RUN"]);
    expect(carryoverSymbols.has("LIQ")).toBe(true);
    expect(deduped.some((r) => r.symbol === "LIQ")).toBe(true);
  });
});
