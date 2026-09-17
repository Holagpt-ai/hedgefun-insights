import { describe, expect, it } from "vitest";
import {
  isExcludedHomepageMoverInstrument,
  shouldExcludeHomepageMover,
} from "@/lib/markets/mover-universe";

describe("homepage mover universe policy", () => {
  it("includes common stock and ADR metadata", () => {
    expect(isExcludedHomepageMoverInstrument("CS")).toBe(false);
    expect(isExcludedHomepageMoverInstrument("ADRC")).toBe(false);
  });

  it("excludes warrants, rights, and units when metadata identifies them", () => {
    expect(isExcludedHomepageMoverInstrument("WARRANT")).toBe(true);
    expect(isExcludedHomepageMoverInstrument("RIGHT")).toBe(true);
    expect(isExcludedHomepageMoverInstrument("UNIT")).toBe(true);
    expect(
      shouldExcludeHomepageMover({
        symbol: "DAICW",
        price: 1.2,
        instrumentType: "WARRANT",
      }),
    ).toBe("excluded_instrument_type");
    expect(
      shouldExcludeHomepageMover({
        symbol: "NEXR",
        price: 0.45,
        instrumentType: "RIGHT",
      }),
    ).toBe("excluded_instrument_type");
    expect(
      shouldExcludeHomepageMover({
        symbol: "SPACU",
        price: 10.5,
        instrumentType: "UNIT",
      }),
    ).toBe("excluded_instrument_type");
  });

  it("does not globally exclude ETFs when metadata is present", () => {
    expect(isExcludedHomepageMoverInstrument("ETF")).toBe(false);
  });

  it("excludes invalid and zero last prices", () => {
    expect(
      shouldExcludeHomepageMover({ symbol: "RIVR", price: 0 }),
    ).toBe("invalid_last_price");
    expect(
      shouldExcludeHomepageMover({ symbol: "RIVR", price: Number.NaN }),
    ).toBe("invalid_last_price");
  });

  it("fails open on missing instrument type when price is valid", () => {
    expect(
      shouldExcludeHomepageMover({ symbol: "AAPL", price: 190.12 }),
    ).toBeNull();
    expect(
      shouldExcludeHomepageMover({ symbol: "NEXRW", price: 0.45 }),
    ).toBeNull();
    expect(
      shouldExcludeHomepageMover({ symbol: "DAICW", price: 1.2 }),
    ).toBeNull();
  });
});
