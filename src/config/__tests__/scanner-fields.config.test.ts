import { describe, expect, it } from "vitest";
import {
  SCANNER_FIELDS,
  getScannerField,
  scannerFieldIds,
  tooltipEnabledScannerFields,
} from "@/config/scanner-fields.config";

describe("scanner field registry", () => {
  it("keeps field ids unique", () => {
    const ids = scannerFieldIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(SCANNER_FIELDS.length);
  });

  it("gives every tooltip-enabled field description and why-it-matters text", () => {
    const enabled = tooltipEnabledScannerFields();
    expect(enabled.length).toBeGreaterThan(8);
    for (const field of enabled) {
      expect(field.description.trim().length).toBeGreaterThan(12);
      expect(field.whyItMatters.trim().length).toBeGreaterThan(12);
    }
  });

  it("documents Day Range as an adaptive session range with a last-price marker", () => {
    const dayRange = getScannerField("day_range");
    expect(dayRange?.tooltipEnabled).toBe(true);
    expect(dayRange?.description).toMatch(/low and high for the current trading session/i);
    expect(dayRange?.description).toMatch(/marker shows where the current price is trading inside that range/i);
    expect(dayRange?.whyItMatters).toMatch(/holding near its high/i);
    expect(dayRange?.example).toMatch(/Low \$2\.00, High \$5\.00, Last \$4\.70/);
  });

  it("labels provider_as_of as Data Time and never as Trigger Time", () => {
    const dataTime = getScannerField("data_time");
    expect(dataTime?.label).toBe("Data Time");
    expect(dataTime?.label.toLowerCase()).not.toContain("trigger");
    expect(dataTime?.description).toMatch(/NOT the time the breakout first occurred/i);
    expect(dataTime?.source).toBe("provider_as_of");

    const trigger = getScannerField("trigger_time");
    expect(trigger?.availability).toBe("unavailable");
    expect(trigger?.source).toMatch(/Do not populate from provider_as_of/);
  });

  it("does not mislabel short-window moves as Day Move", () => {
    expect(getScannerField("move_15s")?.label).toBe("15s Move");
    expect(getScannerField("move_60s")?.label).toBe("60s Move");
    expect(getScannerField("move_15s")?.label.toLowerCase()).not.toContain("day");
    expect(getScannerField("move_60s")?.label.toLowerCase()).not.toContain("day");
    expect(getScannerField("move_15s")?.description.toLowerCase()).toContain("not a day");
    expect(getScannerField("move_60s")?.description.toLowerCase()).toContain("not a day");
    expect(SCANNER_FIELDS.some((field) => field.label === "Day Move")).toBe(false);
  });

  it("registers future rvol / trigger fields as unavailable", () => {
    for (const id of [
      "short_float",
      "rvol_5m",
      "market_cap",
      "trigger_time",
      "latest_trigger",
      "catalyst_time",
    ]) {
      expect(getScannerField(id)?.availability).toBe("unavailable");
      expect(getScannerField(id)?.defaultVisible).toBe(false);
    }
  });

  it("registers RVOL 20D and Dollar Volume with honest trader-intelligence copy", () => {
    const rvol = getScannerField("daily_rvol");
    expect(rvol?.label).toBe("RVOL 20D");
    expect(rvol?.shortLabel).toBe("RVOL 20D");
    expect(rvol?.availability).toBe("source-dependent");
    expect(rvol?.description).toMatch(
      /Current session volume divided by the average full-session volume of the prior 20 completed trading sessions/i,
    );
    expect(rvol?.description).toMatch(/not Vol\/Prior/i);
    expect(rvol?.description).toMatch(/not adjusted for time of day/i);
    expect(rvol?.description).not.toMatch(/5m|intraday normalized|time-adjusted RVOL/i);
    expect(rvol?.sortable).toBe(true);
    expect(rvol?.filterable).toBe(true);

    const dollarVolume = getScannerField("dollar_volume");
    expect(dollarVolume?.label).toBe("Dollar Volume");
    expect(dollarVolume?.description).toMatch(/price × volume/i);
    expect(dollarVolume?.availability).toBe("source-dependent");
    expect(dollarVolume?.example).toMatch(/\$0\.25/);
    expect(dollarVolume?.example).toMatch(/\$12/);
    expect(dollarVolume?.sortable).toBe(true);
    expect(dollarVolume?.filterable).toBe(true);
  });

  it("marks Float and Float Turnover as source-dependent after verified Massive mapping", () => {
    expect(getScannerField("float")?.availability).toBe("source-dependent");
    expect(getScannerField("float_turnover")?.availability).toBe("source-dependent");
    expect(getScannerField("float")?.description).toMatch(/available for the public/i);
    expect(getScannerField("float_turnover")?.description).toMatch(/volume divided by the stock's public float/i);
  });
});
