import { describe, expect, it } from "vitest";
import {
  RVOL_20D_SESSION_COUNT,
  averageFullDayVolume20d,
  averageVolume20dFromSessions,
  computeDailyRvol20d,
  formatDailyRvol20d,
  isValidHistoricalSessionVolume,
} from "@/lib/screeners/daily-rvol";

function twentySessions(base = 2_000_000): number[] {
  return Array.from({ length: RVOL_20D_SESSION_COUNT }, () => base);
}

describe("Daily RVOL 20D", () => {
  it("computes average from exactly 20 valid historical sessions", () => {
    expect(averageFullDayVolume20d(twentySessions(2_000_000))).toBe(2_000_000);
  });

  it("excludes current session from the historical average window", () => {
    const sessions = [
      ...Array.from({ length: 21 }, (_, index) => ({
        sessionDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
        volume: 2_000_000,
      })),
    ];
    expect(averageVolume20dFromSessions(sessions, "2026-08-21")).toBe(2_000_000);
    expect(
      sessions.filter((entry) => entry.sessionDate < "2026-08-21").length,
    ).toBe(20);
  });

  it("returns 5.0× when current volume is 10M and avg is 2M", () => {
    expect(computeDailyRvol20d(10_000_000, 2_000_000)).toBe(5);
    expect(formatDailyRvol20d(5)).toBe("5.0×");
  });

  it("rejects zero, negative, NaN, and non-finite historical volumes", () => {
    expect(isValidHistoricalSessionVolume(0)).toBe(false);
    expect(isValidHistoricalSessionVolume(-1)).toBe(false);
    expect(isValidHistoricalSessionVolume(Number.NaN)).toBe(false);
    expect(averageFullDayVolume20d([...twentySessions(), 0])).toBe(null);
    expect(averageFullDayVolume20d([...twentySessions(), -100])).toBe(null);
    expect(averageFullDayVolume20d([...twentySessions(), Number.NaN])).toBe(null);
  });

  it("returns unavailable with 19 valid sessions", () => {
    expect(averageFullDayVolume20d(twentySessions().slice(0, 19))).toBe(null);
    expect(
      averageVolume20dFromSessions(
        twentySessions().map((volume, index) => ({
          sessionDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
          volume,
        })),
        "2026-08-20",
      ),
    ).toBe(null);
  });

  it("returns available with 20 valid prior sessions", () => {
    const avg = averageVolume20dFromSessions(
      twentySessions().map((volume, index) => ({
        sessionDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
        volume,
      })),
      "2026-08-21",
    );
    expect(avg).toBe(2_000_000);
    expect(computeDailyRvol20d(10_000_000, avg)).toBe(5);
  });

  it("does not substitute prior-day ratio for RVOL 20D", () => {
    expect(computeDailyRvol20d(10_000_000, null)).toBe(null);
    expect(computeDailyRvol20d(null, 2_000_000)).toBe(null);
  });

  it("incremental generation B: copy-forward V1-V20, apply V21 only, rolls to V2-V21", () => {
    const generationA = Array.from({ length: 20 }, (_, index) => ({
      sessionDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
      volume: 2_000_000,
    }));
    const generationBAfterCopy = [...generationA];
    const generationBAfterV21 = [
      ...generationBAfterCopy.slice(1),
      { sessionDate: "2026-08-21", volume: 2_000_000 },
    ];
    expect(generationBAfterCopy).toHaveLength(20);
    expect(generationBAfterV21).toHaveLength(20);
    expect(generationBAfterV21[0]?.sessionDate).toBe("2026-08-02");
    expect(generationBAfterV21[19]?.sessionDate).toBe("2026-08-21");
    expect(generationBAfterV21.some((entry) => entry.sessionDate === "2026-08-01")).toBe(false);
    expect(averageVolume20dFromSessions(generationBAfterV21, "2026-08-22")).toBe(2_000_000);
  });

  it("rolls off the oldest session when a 21st session arrives", () => {
    const sessions = Array.from({ length: 21 }, (_, index) => ({
      sessionDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
      volume: index === 0 ? 1_000_000 : 2_000_000,
    }));
    const avgWithOldest = averageVolume20dFromSessions(sessions.slice(0, 20), "2026-08-21");
    const avgAfterRoll = averageVolume20dFromSessions(sessions, "2026-08-22");
    expect(avgWithOldest).toBe(1_950_000);
    expect(avgAfterRoll).toBe(2_000_000);
    expect(
      sessions
        .filter((entry) => entry.sessionDate < "2026-08-22")
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
        .slice(0, 20)
        .some((entry) => entry.sessionDate === "2026-08-01"),
    ).toBe(false);
  });
});
