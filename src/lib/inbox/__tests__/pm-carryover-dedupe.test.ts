import { describe, expect, it } from "vitest";
import { filterPmSessionSummaryAgainstCarryover } from "@/lib/inbox/pm-carryover-dedupe";

describe("filterPmSessionSummaryAgainstCarryover", () => {
  it("removes symbols already on carryover watch", () => {
    const rows = filterPmSessionSummaryAgainstCarryover(
      [
        {
          symbol: "AAA",
          rank: 1,
          primaryEvent: "RUNNING_UP",
          primaryEventLabel: "Running Up",
          rvol5m: 2,
          volumeVelocity: null,
          distanceFromHodPct: null,
        },
        {
          symbol: "BBB",
          rank: 2,
          primaryEvent: "HOD_BREAK",
          primaryEventLabel: "HOD Break",
          rvol5m: 1.5,
          volumeVelocity: null,
          distanceFromHodPct: null,
        },
      ],
      new Set(["AAA"]),
    );
    expect(rows.map((row) => row.symbol)).toEqual(["BBB"]);
  });
});
