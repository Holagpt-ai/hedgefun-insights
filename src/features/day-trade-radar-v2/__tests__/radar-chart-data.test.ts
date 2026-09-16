import { describe, expect, it } from "vitest";
import {
  mapAggregates,
  radarChartEmptyCopy,
  radarChartIntervalLabel,
  radarChartSessionDate,
  unwrapAggregateResults,
} from "../radar-chart-data";

const BAR = { o: 1, h: 2, l: 0.5, c: 1.5, v: 1000, t: Date.parse("2026-09-16T14:31:00.000Z") };

describe("radar aggregate mapping", () => {
  it("maps the Edge Function unwrapped array payload", () => {
    const mapped = mapAggregates([BAR]);
    expect(mapped.bars).toHaveLength(1);
    expect(mapped.bars[0].close).toBe(1.5);
    expect(unwrapAggregateResults([BAR])).toHaveLength(1);
  });

  it("still maps a wrapped results object", () => {
    expect(mapAggregates({ results: [BAR] }).bars).toHaveLength(1);
  });

  it("treats an empty successful payload as empty, not an API error", () => {
    expect(mapAggregates([]).bars).toEqual([]);
    expect(radarChartEmptyCopy("empty")).toBe("No intraday bars available for this session.");
    expect(radarChartEmptyCopy("error")).toBe("Intraday chart temporarily unavailable.");
  });

  it("uses America/New_York session date from provider_as_of", () => {
    expect(radarChartSessionDate("2026-09-16T03:00:00.000Z")).toBe("2026-09-15");
    expect(radarChartSessionDate("2026-09-16T15:00:00.000Z")).toBe("2026-09-16");
  });

  it("labels fallback interval truthfully", () => {
    expect(radarChartIntervalLabel("1m")).toContain("1-MIN BARS");
    expect(radarChartIntervalLabel("5m")).toContain("5-MIN BARS");
    expect(radarChartIntervalLabel("5m")).not.toContain("1-MIN");
  });
});
