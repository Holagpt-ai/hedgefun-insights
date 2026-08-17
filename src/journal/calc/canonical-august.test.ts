import { describe, expect, it } from "vitest";
import { microsToNumber, parseDecimal } from "./decimal";
import { aggregateTrades, calculateTrade, dailyMetrics, validateSymbol } from "./engine";
import { derivedJournalEquity, reconcileBalances } from "./reconciliation";
import { AUGUST_14_TRADES, AUGUST_CLOSED_TRADES, AUGUST_DEMO_TRADES } from "../demo/august-fixtures";

function dollars(value: bigint): number {
  return Number(microsToNumber(value).toFixed(2));
}

describe("symbol validation", () => {
  it("uppercases and accepts whole symbols", () => {
    expect(validateSymbol("nvda")).toBe("NVDA");
    expect(validateSymbol("BRK.B")).toBe("BRK.B");
    expect(validateSymbol("")).toBeNull();
    expect(validateSymbol("bad symbol")).toBeNull();
  });
});

describe("canonical August 14 session", () => {
  it("matches the locked execution contract", () => {
    const byId = Object.fromEntries(AUGUST_14_TRADES.map((trade) => [trade.id, calculateTrade(trade)]));

    expect(dollars(byId["demo-nvda"].grossRealizedPnl)).toBe(448);
    expect(dollars(byId["demo-nvda"].totalFees)).toBe(8);
    expect(dollars(byId["demo-nvda"].netRealizedPnl)).toBe(440);
    expect(byId["demo-nvda"].weightedAverageExit && dollars(byId["demo-nvda"].weightedAverageExit)).toBe(122.88);
    expect(byId["demo-nvda"].rMultiple).toBeCloseTo(2.1, 5);
    expect(byId["demo-nvda"].outcome).toBe("win");

    expect(dollars(byId["demo-spy-450c"].grossRealizedPnl)).toBe(660);
    expect(dollars(byId["demo-spy-450c"].totalFees)).toBe(10);
    expect(dollars(byId["demo-spy-450c"].netRealizedPnl)).toBe(650);
    expect(byId["demo-spy-450c"].rMultiple).toBeCloseTo(3.1, 5);
    expect(byId["demo-spy-450c"].status).toBe("closed_before_expiration");

    expect(dollars(byId["demo-aapl"].netRealizedPnl)).toBe(120);
    expect(byId["demo-aapl"].rMultiple).toBeCloseTo(1.3, 5);

    expect(dollars(byId["demo-tsla"].netRealizedPnl)).toBe(40);
    expect(byId["demo-tsla"].rMultiple).toBeCloseTo(0.3, 5);

    expect(dollars(byId["demo-pltr"].grossRealizedPnl)).toBe(-124);
    expect(dollars(byId["demo-pltr"].totalFees)).toBe(6);
    expect(dollars(byId["demo-pltr"].netRealizedPnl)).toBe(-130);
    expect(byId["demo-pltr"].rMultiple).toBeCloseTo(-0.6, 5);
    expect(byId["demo-pltr"].outcome).toBe("loss");
  });

  it("reconciles session totals", () => {
    const metrics = aggregateTrades(AUGUST_14_TRADES);
    expect(dollars(metrics.grossPnl)).toBe(1158);
    expect(dollars(metrics.fees)).toBe(38);
    expect(dollars(metrics.netPnl)).toBe(1120);
    expect(metrics.includedCount).toBe(5);
    expect(metrics.wins).toBe(4);
    expect(metrics.losses).toBe(1);
    expect(metrics.breakevens).toBe(0);
    expect(metrics.winRate).toBe(0.8);
    // Mean of locked trade R values (2.1 + 3.1 + 1.3 + 0.3 + -0.6) / 5.
    // The HTML mock printed +2.4R; the ledger is authoritative.
    expect(metrics.averageR).toBeCloseTo(1.24, 5);
    expect(metrics.largestWin?.symbol).toBe("SPY");
    expect(dollars(metrics.largestWin!.net)).toBe(650);
    expect(metrics.largestLoss?.symbol).toBe("PLTR");
    expect(dollars(metrics.largestLoss!.net)).toBe(-130);
    expect(dollars(metrics.grossPnl) - dollars(metrics.fees)).toBe(dollars(metrics.netPnl));
  });
});

describe("canonical August calendar", () => {
  it("derives locked daily and period totals from the ledger", () => {
    const daily = dailyMetrics(AUGUST_CLOSED_TRADES);
    const byDate = Object.fromEntries(daily.map((row) => [row.date, dollars(row.netPnl)]));
    expect(byDate["2026-08-03"]).toBe(420);
    expect(byDate["2026-08-04"]).toBe(850);
    expect(byDate["2026-08-05"]).toBe(-390);
    expect(byDate["2026-08-06"]).toBe(1050);
    expect(byDate["2026-08-07"]).toBe(620);
    expect(byDate["2026-08-10"]).toBe(-780);
    expect(byDate["2026-08-11"]).toBe(530);
    expect(byDate["2026-08-12"]).toBe(-210);
    expect(byDate["2026-08-13"]).toBe(940);
    expect(byDate["2026-08-14"]).toBe(1120);

    const metrics = aggregateTrades(AUGUST_CLOSED_TRADES);
    expect(dollars(metrics.netPnl)).toBe(4150);
    expect(dollars(metrics.grossPnl)).toBe(4350);
    expect(dollars(metrics.fees)).toBe(200);
    expect(daily.filter((row) => row.netPnl > 0n).length).toBe(7);
    expect(daily.filter((row) => row.netPnl < 0n).length).toBe(3);
    expect(daily.length).toBe(10);
    const week1 = daily.filter((row) => row.date >= "2026-08-03" && row.date <= "2026-08-07");
    const week2 = daily.filter((row) => row.date >= "2026-08-10" && row.date <= "2026-08-14");
    expect(week1.reduce((sum, row) => sum + dollars(row.netPnl), 0)).toBe(2550);
    expect(week2.reduce((sum, row) => sum + dollars(row.netPnl), 0)).toBe(1600);
    expect(Number((dollars(metrics.netPnl) / daily.length).toFixed(0))).toBe(415);
  });

  it("keeps open exposure out of realized aggregates", () => {
    const closed = aggregateTrades(AUGUST_CLOSED_TRADES);
    const all = aggregateTrades(AUGUST_DEMO_TRADES);
    expect(dollars(all.netPnl)).toBe(dollars(closed.netPnl));
    const open = AUGUST_DEMO_TRADES.filter((trade) =>
      ["demo-open-nvda", "demo-open-qqq-380p", "demo-open-amd"].includes(trade.id),
    );
    expect(open).toHaveLength(3);
    expect(calculateTrade(open[2]).remainingQuantity > 0n).toBe(true);
  });
});

describe("ledger invariants", () => {
  it("blocks over-exit unless reversal is explicit", () => {
    const trade = {
      ...AUGUST_14_TRADES[2],
      executions: [
        ...AUGUST_14_TRADES[2].executions,
        {
          id: "over",
          timestamp: "2026-08-14T20:00:00Z",
          timestampUtc: "2026-08-14T20:00:00Z",
          originalTimezone: "America/New_York",
          action: "sell" as const,
          quantity: 50,
          price: 218,
          commission: 0,
        },
      ],
    };
    const result = calculateTrade(trade);
    expect(result.overExitBlocked).toBe(true);
  });

  it("does not treat missing crypto conversion as zero", () => {
    const trade: (typeof AUGUST_14_TRADES)[number] = {
      id: "crypto-fee",
      accountId: "demo-account-crypto",
      assetClass: "crypto_spot",
      instrument: "spot",
      symbol: "BTC-USD",
      direction: "long",
      status: "closed",
      sessionDate: "2026-08-14",
      executions: [
        {
          id: "c1",
          timestamp: "2026-08-14T12:00:00Z",
          timestampUtc: "2026-08-14T12:00:00Z",
          originalTimezone: "America/New_York",
          action: "buy",
          quantity: "0.1",
          price: "60000",
          fees: [{ kind: "network", amount: "0.0001", currency: "USD", nativeAmount: "0.0001", nativeCurrency: "BTC" }],
        },
        {
          id: "c2",
          timestamp: "2026-08-14T16:00:00Z",
          timestampUtc: "2026-08-14T16:00:00Z",
          originalTimezone: "America/New_York",
          action: "sell",
          quantity: "0.1",
          price: "61000",
        },
      ],
    };
    const calc = calculateTrade(trade);
    expect(calc.calculationState).toBe("incomplete");
    expect(calc.exclusions).toContain("missing_fee_conversion");
  });

  it("reconciles derived equity against a reported balance", () => {
    const realized = aggregateTrades(AUGUST_CLOSED_TRADES).netPnl;
    const derived = derivedJournalEquity({
      beginningBalance: 50000,
      cashFlows: [],
      realizedPnl: realized,
    });
    expect(dollars(derived)).toBe(54150);
    const result = reconcileBalances({
      derivedEquity: derived,
      reportedBalance: 54150,
      reportedAsOf: "2026-08-14T20:00:00Z",
    });
    expect(result.state).toBe("reconciled");
  });
});
