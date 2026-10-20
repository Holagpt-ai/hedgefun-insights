import { beforeEach, describe, expect, it, vi } from "vitest";

const getTopGainers = vi.fn();
const getTopLosers = vi.fn();

vi.mock("@/lib/polygon", () => ({
  getTopGainers: () => getTopGainers(),
  getTopLosers: () => getTopLosers(),
}));

import { fetchHomepagePublicMoversBundle } from "@/lib/markets/movers-page-fetch";

const NOW = Date.parse("2026-08-10T21:00:00.000Z"); // 17:00 ET after-hours

function snapshot(ticker: string, changePct: number) {
  return {
    ticker,
    name: ticker,
    todaysChangePerc: changePct,
    todaysChange: 1,
    day: { c: 21, v: 1_000_000 },
    prevDay: { c: 20 },
    lastTrade: { p: 21, t: NOW },
    min: { c: 20.9 },
    updated: NOW,
  };
}

describe("after-hours homepage movers bundle", () => {
  beforeEach(() => {
    getTopGainers.mockReset();
    getTopLosers.mockReset();
    getTopGainers.mockResolvedValue({ tickers: [snapshot("G1", 8)] });
    getTopLosers.mockResolvedValue({ tickers: [snapshot("L1", -6)] });
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("fetches gainers and losers once for the shared after-hours bundle", async () => {
    const bundle = await fetchHomepagePublicMoversBundle("after-hours");
    expect(getTopGainers).toHaveBeenCalledTimes(1);
    expect(getTopLosers).toHaveBeenCalledTimes(1);
    expect(bundle.gainers).toBeDefined();
    expect(bundle.losers).toBeDefined();
  });
});
