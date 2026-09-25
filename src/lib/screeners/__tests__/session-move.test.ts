import { describe, expect, it } from "vitest";
import {
  previousCloseFromVerifiedMove,
  pricesImplyCorporateActionScale,
  sessionMovePercent,
  volumeVersusPriorSession,
} from "@/lib/screeners/session-move";

describe("session move integrity", () => {
  it("uses last price versus the previous regular close in every session", () => {
    expect(sessionMovePercent(11.2, 10)).toBeCloseTo(12, 8);
    expect(sessionMovePercent(9, 10)).toBeCloseTo(-10, 8);
    expect(sessionMovePercent(null, 10)).toBeNull();
    expect(sessionMovePercent(10, null)).toBeNull();
    expect(sessionMovePercent(10, 0)).toBeNull();
  });

  it("recovers a previous close only from a verified price and change pair", () => {
    expect(previousCloseFromVerifiedMove(11.84, 18.4)).toBeCloseTo(10, 8);
    expect(previousCloseFromVerifiedMove(null, 18.4)).toBeNull();
    expect(previousCloseFromVerifiedMove(10, null)).toBeNull();
    expect(previousCloseFromVerifiedMove(10, -100)).toBeNull();
  });

  it("treats a near-integer 2× price jump as a corporate-action scale break", () => {
    expect(pricesImplyCorporateActionScale(1, 2)).toBe(true);
    expect(pricesImplyCorporateActionScale(0.68, 6.8)).toBe(true);
    expect(pricesImplyCorporateActionScale(8.07, 10.04)).toBe(false);
    expect(pricesImplyCorporateActionScale(2.01, 1.93)).toBe(false);
  });

  it("leaves VOL/YDAY blank when either side is missing and never substitutes zero", () => {
    expect(volumeVersusPriorSession(300_000, 1_000_000)).toBe(0.3);
    expect(volumeVersusPriorSession(1_200_000, 1_000_000)).toBe(1.2);
    expect(volumeVersusPriorSession(null, 1_000_000)).toBeNull();
    expect(volumeVersusPriorSession(1_000_000, null)).toBeNull();
    expect(volumeVersusPriorSession(0, 1_000_000)).toBe(0);
  });
});
