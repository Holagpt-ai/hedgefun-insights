import { describe, expect, it } from "vitest";
import { buildPmSessionSummaryRows } from "@/lib/inbox/pm-session-summary";

describe("buildPmSessionSummaryRows", () => {
  it("keeps late-session scanner events in rank order up to the limit", () => {
    const rows = buildPmSessionSummaryRows(
      [
        { symbol: "AAA", rank: 1, primary_scanner_event: "RUNNING_UP", rvol_5m: 2.1 },
        { symbol: "BBB", rank: 2, primary_scanner_event: "HOD_BREAK", rvol_5m: 3 },
        { symbol: "CCC", rank: 3, primary_scanner_event: "LATE_DAY_ACCELERATION" },
        { symbol: "DDD", rank: 4, primary_scanner_event: null },
        { symbol: "EEE", rank: 5, primary_scanner_event: "OTHER_EVENT" },
      ],
      2,
    );
    expect(rows.map((r) => r.symbol)).toEqual(["AAA", "BBB"]);
    expect(rows[0].primaryEvent).toBe("RUNNING_UP");
    expect(rows[1].primaryEventLabel).toContain("HOD");
  });

  it("returns empty when no qualifying scanner events exist", () => {
    expect(
      buildPmSessionSummaryRows([{ symbol: "ZZZ", rank: 1, primary_scanner_event: "VOLUME_SPIKE" }]),
    ).toEqual([]);
  });
});
