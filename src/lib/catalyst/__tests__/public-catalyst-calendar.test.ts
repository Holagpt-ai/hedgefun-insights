import { describe, expect, it } from "vitest";
import {
  PUBLIC_CATALYST_MAX_RANGE_DAYS,
  assertPublicCatalystRange,
} from "@/lib/catalyst/public-catalyst-calendar";

describe("public catalyst calendar range", () => {
  it("accepts valid bounded window", () => {
    expect(() => assertPublicCatalystRange("2026-11-01", "2026-11-30")).not.toThrow();
  });

  it("rejects inverted range", () => {
    expect(() => assertPublicCatalystRange("2026-11-30", "2026-11-01")).toThrow("inverted_range");
  });

  it("rejects oversized window", () => {
    expect(() => assertPublicCatalystRange("2026-01-01", "2026-04-01")).toThrow("range_too_large");
    expect(PUBLIC_CATALYST_MAX_RANGE_DAYS).toBe(62);
  });

  it("rejects invalid date format", () => {
    expect(() => assertPublicCatalystRange("11-01-2026", "2026-11-30")).toThrow("invalid_date");
  });
});