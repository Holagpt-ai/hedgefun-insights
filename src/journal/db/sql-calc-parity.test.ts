import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aggregateTrades, calculatePosition, calculateTrade, microsToNumber } from "../calc";
import { dailyMetrics } from "../calc/engine";
import { formatR } from "../lib/format";
import { AUGUST_14_TRADES } from "../demo/august-fixtures";
import { buildJournalSavePayload } from "../ledger/persist-contract";
import type { TradeInput } from "../calc/types";

/**
 * These tests prove SQL-text contracts and TypeScript-engine expected results.
 * They are NOT executed PostgreSQL. Database runtime validation is outstanding
 * until a disposable Postgres can apply the unapplied Journal migrations.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FN_SQL = readFileSync(
  resolve(ROOT, "supabase/migrations/20260816190200_journal_functions_backfill.sql"),
  "utf8",
);
const SCHEMA_SQL = readFileSync(
  resolve(ROOT, "supabase/migrations/20260816190000_journal_foundation_schema.sql"),
  "utf8",
);

function dollars(value: bigint): number {
  return Number(microsToNumber(value).toFixed(2));
}

function taggedBody(sql: string, tag: string): string {
  const open = sql.indexOf(`AS $${tag}$`);
  const close = sql.indexOf(`$${tag}$;`, open + 1);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return sql.slice(open, close);
}

const CALC = taggedBody(FN_SQL, "calc");
const REFRESH = taggedBody(FN_SQL, "refresh");
const SAVE = taggedBody(FN_SQL, "save");

const nvda = AUGUST_14_TRADES[0];
const spy = AUGUST_14_TRADES[1];
const aapl = AUGUST_14_TRADES[2];
const pltr = AUGUST_14_TRADES[4];

const shortStock: TradeInput = {
  ...pltr,
  id: "short-stock",
  plannedRisk: null,
  plannedEntry: 38.9,
  plannedStop: 40.1,
  plannedSize: 100,
};

const partial: TradeInput = {
  ...aapl,
  id: "partial-aapl",
  status: "partially_closed",
  executions: [
    aapl.executions[0],
    { ...aapl.executions[1], id: "aapl-partial", quantity: 40 },
  ],
};

const execMult: TradeInput = {
  id: "mult-mix",
  accountId: "live-default",
  assetClass: "stock",
  instrument: "share",
  symbol: "MSFT",
  direction: "long",
  status: "closed",
  sessionDate: "2026-08-14",
  plannedEntry: 400,
  plannedStop: 395,
  plannedSize: 10,
  executions: [
    {
      id: "m-in",
      timestamp: "2026-08-14T14:00:00Z",
      timestampUtc: "2026-08-14T14:00:00Z",
      originalTimezone: "America/New_York",
      action: "buy",
      quantity: 10,
      price: 400,
      multiplier: 1,
      commission: 1,
    },
    {
      id: "m-out",
      timestamp: "2026-08-14T18:00:00Z",
      timestampUtc: "2026-08-14T18:00:00Z",
      originalTimezone: "America/New_York",
      action: "sell",
      quantity: 10,
      price: 410,
      multiplier: 2,
      commission: 1,
    },
  ],
};

const cryptoSpot: TradeInput = {
  id: "btc",
  accountId: "live-default",
  assetClass: "crypto_spot",
  instrument: "spot",
  symbol: "BTC-USD",
  direction: "long",
  status: "closed",
  sessionDate: "2026-08-14",
  plannedEntry: 64000,
  plannedStop: 63500,
  plannedSize: 0.25,
  executions: [
    {
      id: "btc-in",
      timestamp: "2026-08-14T12:00:00Z",
      timestampUtc: "2026-08-14T12:00:00Z",
      originalTimezone: "America/New_York",
      action: "buy",
      quantity: 0.25,
      price: 64000,
      commission: 8,
    },
    {
      id: "btc-out",
      timestamp: "2026-08-14T19:00:00Z",
      timestampUtc: "2026-08-14T19:00:00Z",
      originalTimezone: "America/New_York",
      action: "sell",
      quantity: 0.25,
      price: 64640,
      commission: 8,
    },
  ],
};

const incompleteConversion: TradeInput = {
  id: "btc-incomplete",
  accountId: "live-default",
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

const overExit: TradeInput = {
  ...aapl,
  executions: [
    ...aapl.executions,
    {
      id: "over",
      timestamp: "2026-08-14T20:00:00Z",
      timestampUtc: "2026-08-14T20:00:00Z",
      originalTimezone: "America/New_York",
      action: "sell",
      quantity: 50,
      price: 218,
      commission: 0,
    },
  ],
};

const noExec: TradeInput = {
  ...nvda,
  id: "nvda-no-exec",
  executions: [],
  excludedFromAnalytics: true,
  exclusionReason: "missing_executions",
};

describe("SQL calculation parity — TypeScript engine authority", () => {
  it("1. NVDA multi-fill: gross $448, fees $8, net $440, risk $210, 2.10R", () => {
    const calc = calculateTrade(nvda);
    expect(dollars(calc.grossRealizedPnl)).toBe(448);
    expect(dollars(calc.totalFees)).toBe(8);
    expect(dollars(calc.netRealizedPnl)).toBe(440);
    expect(dollars(calc.initialRisk!)).toBe(210);
    expect(calc.plannedRiskSource).toBe("plan_inputs");
    expect(calc.rMultiple).toBeCloseTo(440 / 210, 10);
    expect(formatR(calc.rMultiple)).toBe("2.10R");
  });

  it("2. long stock FIFO P&L", () => {
    const calc = calculateTrade(aapl);
    expect(dollars(calc.netRealizedPnl)).toBe(120);
    expect(calc.direction).toBe("long");
    expect(microsToNumber(calc.remainingQuantity)).toBe(0);
  });

  it("3. short stock uses short opens and cover closes", () => {
    const calc = calculateTrade(shortStock);
    expect(calc.direction).toBe("short");
    expect(calc.plannedRiskSource).toBe("plan_inputs");
    expect(dollars(calc.netRealizedPnl)).toBe(-130);
  });

  it("4. partial close keeps remaining quantity", () => {
    const calc = calculateTrade(partial);
    expect(calc.status).toBe("partially_closed");
    expect(microsToNumber(calc.remainingQuantity)).toBe(60);
    expect(microsToNumber(calc.closedQuantity)).toBe(40);
  });

  it("5. option multiplier 100", () => {
    const calc = calculateTrade(spy);
    expect(dollars(calc.grossRealizedPnl)).toBe(660);
    expect(dollars(calc.totalFees)).toBe(10);
    expect(dollars(calc.netRealizedPnl)).toBe(650);
    expect(dollars(calc.initialRisk!)).toBe(210);
  });

  it("6. execution-specific multipliers are not the last loop value", () => {
    const calc = calculateTrade(execMult);
    expect(dollars(calc.grossRealizedPnl)).toBe(200);
    expect(dollars(calc.exitNotional)).toBe(8200);
  });

  it("7. crypto fractional quantity", () => {
    const calc = calculateTrade(cryptoSpot);
    expect(microsToNumber(calc.openQuantity)).toBe(0.25);
    expect(dollars(calc.grossRealizedPnl)).toBe(160);
  });

  it("8. canonical fee rows without scalar double-counting stay at NVDA $8", () => {
    const payload = buildJournalSavePayload({ ...nvda, id: crypto.randomUUID(), accountId: crypto.randomUUID() });
    const feeSum = payload.executions.reduce(
      (sum, execution) => sum + execution.fees.reduce((inner, fee) => inner + Number(fee.account_currency_amount ?? fee.amount), 0),
      0,
    );
    expect(feeSum).toBe(8);
    expect(dollars(calculateTrade(nvda).totalFees)).toBe(8);
  });

  it("9. legacy scalar-only fees still sum commission/regulatory/other", () => {
    const calc = calculateTrade(aapl);
    expect(dollars(calc.totalFees)).toBe(8);
    expect(CALC).toMatch(/coalesce\(v_exec\.commission, 0\)/);
    expect(CALC).toMatch(/v_fee_n > 0/);
  });

  it("10. missing fee conversion is incomplete, not an authoritative zero", () => {
    const calc = calculateTrade(incompleteConversion);
    expect(calc.calculationState).toBe("incomplete");
    expect(calc.exclusions).toContain("missing_fee_conversion");
    expect(CALC).toMatch(/v_fees_incomplete := true/);
    expect(CALC).toMatch(/missing_fee_conversion/);
  });

  it("11. complete plan inputs override stored plannedRisk", () => {
    const calc = calculateTrade({ ...nvda, plannedRisk: 999 });
    expect(calc.plannedRiskSource).toBe("plan_inputs");
    expect(dollars(calc.initialRisk!)).toBe(210);
    expect(CALC).toMatch(/v_risk_source := 'plan_inputs'/);
  });

  it("12. stored plannedRisk fallback", () => {
    const calc = calculateTrade(pltr);
    expect(calc.plannedRiskSource).toBe("stored_planned_risk");
    expect(CALC).toMatch(/v_risk_source := 'stored_planned_risk'/);
  });

  it("13. unavailable planned risk", () => {
    const calc = calculateTrade({
      ...aapl,
      plannedEntry: null,
      plannedStop: null,
      plannedSize: null,
      plannedRisk: null,
    });
    expect(calc.plannedRiskSource).toBe("unavailable");
    expect(calc.rMultiple).toBeNull();
    expect(CALC).toMatch(/v_risk_source := 'unavailable'/);
  });

  it("14. over-exit is blocked in the frontend preview and rejected in SQL before writes", () => {
    expect(calculatePosition(overExit).overExitBlocked).toBe(true);
    const raiseAt = CALC.indexOf("RAISE EXCEPTION 'over_exit_blocked'");
    const writesAt = CALC.indexOf("writes begin after successful compute");
    const updateAt = CALC.indexOf("UPDATE public.journal_trades");
    const insertAt = CALC.indexOf("INSERT INTO public.journal_calculation_runs");
    expect(raiseAt).toBeGreaterThan(-1);
    expect(raiseAt).toBeLessThan(writesAt);
    expect(writesAt).toBeLessThan(updateAt);
    expect(updateAt).toBeLessThan(insertAt);
    expect(CALC).not.toMatch(/v_remaining := 0;\s*END IF;/);
  });

  it("15. no-execution canonical trade remains unavailable", () => {
    const calc = calculateTrade(noExec);
    expect(calc.calculationState).toBe("unavailable");
    expect(noExec.executions).toHaveLength(0);
    expect(CALC).toMatch(/v_exec_count = 0/);
    expect(CALC).toMatch(/v_state := 'unavailable'/);
    expect(CALC).not.toMatch(/v_trade\.qty/);
  });

  it("16. daily average-R uses included closed trades, not journal_trades.planned_risk", () => {
    const daily = dailyMetrics(AUGUST_14_TRADES);
    const session = daily.find((row) => row.date === "2026-08-14")!;
    const agg = aggregateTrades(AUGUST_14_TRADES);
    expect(session.averageR).toBe(agg.averageR);
    expect(Number(session.averageR!.toFixed(2))).toBe(1.24);
    expect(REFRESH).toMatch(/AVG\(cr\.r_multiple\)/);
    expect(REFRESH).not.toMatch(/t\.planned_risk/);
    expect(REFRESH).toMatch(/cr\.state IS DISTINCT FROM 'unavailable'/);
    expect(REFRESH).toMatch(/remaining_qty/);
  });

  it("17. two-user calculation isolation returns a neutral not-found", () => {
    expect(CALC).toMatch(/v_trade\.user_id IS DISTINCT FROM v_uid/);
    expect(CALC).toMatch(/RAISE EXCEPTION 'trade not found' USING ERRCODE = '42501'/);
    expect(CALC).toMatch(/service_role/);
    expect(REFRESH).toMatch(/p_user_id IS DISTINCT FROM v_uid/);
    expect(REFRESH).toMatch(/RAISE EXCEPTION 'not found' USING ERRCODE = '42501'/);
    expect(REFRESH).toMatch(/v_target := v_uid/);
  });
});

describe("SQL calculation function contracts", () => {
  it("adds sequence_index for deterministic ties and first-leg plan multiplier", () => {
    expect(SCHEMA_SQL).toMatch(/journal_trade_legs[\s\S]*sequence_index integer NOT NULL DEFAULT 0/);
    expect(SCHEMA_SQL).toMatch(/journal_executions[\s\S]*sequence_index integer NOT NULL DEFAULT 0/);
    expect(SCHEMA_SQL).toMatch(/ALTER TABLE public\.journal_trade_legs ADD COLUMN IF NOT EXISTS sequence_index/);
    expect(SCHEMA_SQL).toMatch(/ALTER TABLE public\.journal_executions ADD COLUMN IF NOT EXISTS sequence_index/);
    expect(CALC).toMatch(/ORDER BY sequence_index, created_at, id/);
    expect(CALC).toMatch(/sequence_index/);
    expect(SAVE).toMatch(/sequence_index/);
    const payload = buildJournalSavePayload({ ...spy, id: crypto.randomUUID(), accountId: crypto.randomUUID() });
    expect(payload.legs[0].sequence_index).toBe(0);
  });

  it("persists R evidence on calculation runs without dropping history uniqueness", () => {
    expect(SCHEMA_SQL).toMatch(/ALTER TABLE public\.journal_calculation_runs ADD COLUMN IF NOT EXISTS initial_risk numeric/);
    expect(SCHEMA_SQL).toMatch(/ADD COLUMN IF NOT EXISTS planned_risk_source text/);
    expect(SCHEMA_SQL).toMatch(/ADD COLUMN IF NOT EXISTS r_multiple numeric/);
    expect(SCHEMA_SQL).toMatch(/ADD COLUMN IF NOT EXISTS over_exit_blocked boolean NOT NULL DEFAULT false/);
    expect(SCHEMA_SQL).toMatch(/UNIQUE \(trade_id, calculation_version\)/);
    expect(CALC).toMatch(/planned_risk_source/);
    expect(CALC).toMatch(/over_exit_blocked/);
  });

  it("save RPC uses SQL calculate as the write path and rolls back on over-exit", () => {
    expect(SAVE).toMatch(/v_sql_calc := public\.journal_calculate_trade_v1\(v_trade_id\)/);
    expect(SAVE).toMatch(/Over-exit raises and rolls back this transaction/);
    expect(FN_SQL).toMatch(/REVOKE ALL ON FUNCTION public\.journal_calculate_trade_v1\(uuid\) FROM PUBLIC/);
    expect(FN_SQL).toMatch(/REVOKE ALL ON FUNCTION public\.journal_refresh_derived\(uuid\) FROM PUBLIC/);
  });

  it("does not claim these SQL-text checks as executed PostgreSQL", () => {
    expect(FN_SQL.includes("journal_calculate_trade_v1")).toBe(true);
  });
});
