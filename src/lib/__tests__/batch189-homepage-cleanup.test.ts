import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOME_MARKET_CLOCK_EXCHANGES,
} from "@/components/home/GlobalMarketClocks";
import {
  formatHomepageMarketSessionLine,
  formatStockHeaderSessionLine,
} from "@/lib/price-utils";
import { resolveMarketClock } from "@/lib/market-calendar";
import { composeMoversSessionLine } from "@/lib/markets/movers-provenance";

const root = process.cwd();

describe("Batch 189 — homepage AI Trader removal", () => {
  it("Index.tsx does not render AI Trader preview content", () => {
    const index = readFileSync(resolve("src/pages/Index.tsx"), "utf8");
    expect(index).not.toContain("AiTraderLivePreview");
    expect(index).not.toMatch(/Watch AI Trader/i);
    expect(index).toContain("<RecentIpos");
    expect(index).toContain("<UpcomingIpos");
    expect(index).toContain("<Disclaimer");
  });
});

describe("Batch 189 — global market clocks order", () => {
  it("lists exactly seven exchanges in fixed order with New York first", () => {
    expect(HOME_MARKET_CLOCK_EXCHANGES).toHaveLength(7);
    expect(HOME_MARKET_CLOCK_EXCHANGES.map((e) => e.city)).toEqual([
      "New York",
      "London",
      "Frankfurt",
      "Shanghai",
      "Hong Kong",
      "Tokyo",
      "Sydney",
    ]);
  });

  it("renders exchange clocks before the local-time card in source order", () => {
    const clocks = readFileSync(resolve("src/components/home/GlobalMarketClocks.tsx"), "utf8");
    const exchanges = clocks.indexOf("EXCHANGES.map");
    const local = clocks.indexOf('data-testid="market-clock-local-time"');
    expect(exchanges).toBeGreaterThan(-1);
    expect(local).toBeGreaterThan(exchanges);
    expect(clocks).toContain('data-testid="market-clocks-scroll-hint"');
    expect(clocks.indexOf("New York")).toBeLessThan(clocks.indexOf("Local Time"));
  });
});

describe("Batch 189 — homepage session countdown", () => {
  it("separates ET wall clock from countdown duration during pre-market", () => {
    const mondayPremarket = new Date("2026-08-03T12:00:00.000Z"); // Mon 8:00 ET
    const line = formatHomepageMarketSessionLine(mondayPremarket);
    const clock = resolveMarketClock(mondayPremarket);
    expect(line).toContain(clock.etTimeStr);
    expect(line).toMatch(/Pre-market/i);
    expect(line).toContain(`Opens in ${clock.countdown}`);
    expect(line).not.toMatch(/OPENS IN · \d/i);
  });

  it("keeps stock header formatting unchanged for pre-market", () => {
    const mondayPremarket = new Date("2026-08-03T12:00:00.000Z");
    expect(formatStockHeaderSessionLine(mondayPremarket)).toMatch(/PRE-MARKET · OPENS IN/);
  });

  it("labels Labor Day as closed with next-session context", () => {
    const laborDay = new Date("2026-09-07T15:00:00.000Z");
    expect(formatHomepageMarketSessionLine(laborDay)).toMatch(/Labor Day/);
    expect(formatHomepageMarketSessionLine(laborDay)).toMatch(/Market closed/);
  });

  it("labels weekend as closed", () => {
    const saturday = new Date("2026-08-01T16:00:00.000Z");
    expect(formatHomepageMarketSessionLine(saturday)).toMatch(/Weekend/);
  });

  it("includes close countdown during regular session", () => {
    const mondayRegular = new Date("2026-08-03T14:00:00.000Z"); // 10:00 ET
    const line = formatHomepageMarketSessionLine(mondayRegular);
    expect(line).toMatch(/Regular session/i);
    expect(line).toMatch(/Closes in \d{2}:\d{2}:\d{2}/);
  });
});

describe("Batch 189.1 — live homepage session countdown", () => {
  const homogeneousCurrent = {
    sessionDateMode: "homogeneous_current" as const,
    dominantDate: null,
    premarketListContext: false,
  };

  it("advances countdown between ticks without refetching movers", () => {
    const t0 = new Date("2026-08-03T12:00:00.000Z");
    const t1 = new Date("2026-08-03T12:00:05.000Z");
    const line0 = composeMoversSessionLine({ ...homogeneousCurrent, now: t0 });
    const line1 = composeMoversSessionLine({ ...homogeneousCurrent, now: t1 });
    expect(line0).toMatch(/Opens in \d{2}:\d{2}:\d{2}/);
    expect(line1).toMatch(/Opens in \d{2}:\d{2}:\d{2}/);
    expect(line0).not.toBe(line1);
  });

  it("updates session label across the regular-session open boundary", () => {
    const preOpen = new Date("2026-08-03T13:29:50.000Z"); // 9:29:50 ET
    const atOpen = new Date("2026-08-03T13:30:10.000Z"); // 9:30:10 ET
    expect(composeMoversSessionLine({ ...homogeneousCurrent, now: preOpen })).toMatch(/Pre-market/i);
    expect(composeMoversSessionLine({ ...homogeneousCurrent, now: atOpen })).toMatch(/Regular session/i);
  });

  it("MarketPulse ticks session clock independently of movers fetch timestamp", () => {
    const pulse = readFileSync(resolve("src/components/home/MarketPulse.tsx"), "utf8");
    expect(pulse).toContain("setInterval(() => setSessionClockNow(new Date()), 1000)");
    expect(pulse).toContain("now: sessionClockNow");
    expect(pulse).toContain("model.provenance.observationLine");
    expect(pulse).not.toContain("provenance.sessionLine");
  });
});

describe("Batch 189 — Market Pulse disclosure", () => {
  it("uses section-level unexplained copy and compact per-row line", () => {
    const pulse = readFileSync(resolve("src/components/home/MarketPulse.tsx"), "utf8");
    expect(pulse).toContain("MARKET_PULSE_UNEXPLAINED_COPY");
    expect(pulse).toContain("MARKET_PULSE_ROW_NO_CATALYST");
  });
});
