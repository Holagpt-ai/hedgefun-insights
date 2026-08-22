import { describe, expect, it, vi } from "vitest";
import { calculateTrade, microsToNumber } from "../calc";
import { AUGUST_14_TRADES, AUGUST_DEMO_TRADES } from "../demo/august-fixtures";
import type { TradeInput } from "../calc/types";
import { assembleTradeGraphs, hydrateTradeGraph, type CanonicalTradeRow } from "./hydrateTrade";
import { graphRowsFromPayload, loadJournalGraph, type JournalReadDb, type JournalReadQuery } from "./loadTrades";
import { buildJournalSavePayload } from "./persist-contract";

const USER_ID = "11111111-1111-4111-8111-000000000001";
const ACCOUNT_ID = "22222222-2222-4222-8222-000000000002";
const PLAYBOOK_ID = "33333333-3333-4333-8333-000000000003";

function dollars(value: bigint): number {
  return Number(microsToNumber(value).toFixed(2));
}

function liveTrade(trade: TradeInput, extras: Partial<TradeInput> = {}): TradeInput {
  return {
    ...trade,
    id: extras.id ?? crypto.randomUUID(),
    accountId: extras.accountId ?? ACCOUNT_ID,
    playbookId: extras.playbookId ?? PLAYBOOK_ID,
    playbookName: extras.playbookName ?? trade.playbookName,
    ...extras,
  };
}

function feeKinds(execution: TradeInput["executions"][number]): string[] {
  const fromRows = (execution.fees ?? []).map((fee) => fee.kind);
  if (fromRows.length > 0) return [...new Set(fromRows)].sort();
  const kinds: string[] = [];
  if (Number(execution.commission ?? 0)) kinds.push("commission");
  if (Number(execution.regulatoryFee ?? 0)) kinds.push("regulatory");
  if (Number(execution.otherFee ?? 0)) kinds.push("other");
  return kinds.sort();
}

function material(trade: TradeInput) {
  return {
    symbol: trade.symbol,
    direction: trade.direction,
    assetClass: trade.assetClass,
    instrument: trade.instrument,
    status: trade.status,
    accountId: trade.accountId,
    playbookName: trade.playbookName ?? null,
    plannedEntry: trade.plannedEntry == null ? null : Number(trade.plannedEntry),
    plannedStop: trade.plannedStop == null ? null : Number(trade.plannedStop),
    plannedTarget: trade.plannedTarget == null ? null : Number(trade.plannedTarget),
    plannedSize: trade.plannedSize == null ? null : Number(trade.plannedSize),
    thesis: trade.thesis ?? null,
    executions: trade.executions.map((execution) => ({
      action: execution.action,
      quantity: Number(execution.quantity),
      price: Number(execution.price),
      multiplier: Number(execution.multiplier ?? 1),
      timestampUtc: new Date(execution.timestampUtc).toISOString(),
      commission: Number(execution.commission ?? 0),
      regulatoryFee: Number(execution.regulatoryFee ?? 0),
      otherFee: Number(execution.otherFee ?? 0),
      feeKinds: feeKinds(execution),
    })),
    legs: (trade.legs ?? []).map((leg) => ({
      action: leg.action,
      right: leg.right,
      strike: Number(leg.strike),
      expiration: leg.expiration,
      contracts: Number(leg.contracts),
      multiplier: Number(leg.multiplier),
    })),
  };
}

function roundTrip(trade: TradeInput) {
  const payload = buildJournalSavePayload(trade);
  const rows = graphRowsFromPayload(payload, USER_ID, {
    accountId: trade.accountId,
    playbookId: trade.playbookId ?? undefined,
  });
  if (rows.playbook && trade.playbookId) rows.playbook.id = trade.playbookId;
  if (rows.playbook) rows.trade.playbook_id = rows.playbook.id;
  const graphs = assembleTradeGraphs({
    trades: [rows.trade],
    plans: [rows.plan],
    accounts: [rows.account],
    playbooks: rows.playbook ? [rows.playbook] : [],
    legs: rows.legs,
    executions: rows.executions,
    fees: rows.fees,
    calculations: [rows.calculation],
  });
  const hydrated = hydrateTradeGraph(graphs[0]);
  return {
    payload,
    hydrated,
    calcIn: calculateTrade(trade),
    calcOut: calculateTrade(hydrated.trade),
  };
}

function mockReadDb(tables: Record<string, unknown[] | { error: { message: string; code?: string } }>) {
  const reads: string[] = [];
  const client: JournalReadDb = {
    from: (table: string) => {
      reads.push(table);
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const query = {
        select: () => query,
        eq: (col: string, value: string) => {
          filters.push((row) => row[col] === value);
          return query;
        },
        in: (col: string, values: string[]) => {
          filters.push((row) => values.includes(String(row[col] ?? "")));
          return query;
        },
        order: () => query,
        then: (
          resolve?: (value: { data: unknown; error: { message: string; code?: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => {
          const spec = tables[table];
          if (spec && typeof spec === "object" && "error" in spec) {
            return Promise.resolve({ data: null, error: spec.error }).then(resolve, reject);
          }
          const rows = (Array.isArray(spec) ? spec : []).filter((row) => {
            const record = row as Record<string, unknown>;
            return filters.every((filter) => filter(record));
          });
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      } as JournalReadQuery;
      return query;
    },
  };
  return { client, reads };
}

const stockSingle: TradeInput = liveTrade({
  id: "draft",
  accountId: ACCOUNT_ID,
  assetClass: "stock",
  instrument: "share",
  symbol: "AAPL",
  direction: "long",
  status: "closed",
  playbookId: PLAYBOOK_ID,
  playbookName: "VWAP Reclaim",
  plannedEntry: 215.8,
  plannedStop: 214.88,
  plannedTarget: 217.2,
  plannedSize: 100,
  thesis: "Reclaim",
  sessionDate: "2026-08-14",
  executions: [
    {
      id: "aapl-in",
      timestamp: "2026-08-14T14:12:00Z",
      timestampUtc: "2026-08-14T14:12:00Z",
      originalTimezone: "America/New_York",
      action: "buy",
      quantity: 100,
      price: 215.8,
      commission: 4,
    },
    {
      id: "aapl-out",
      timestamp: "2026-08-14T18:01:00Z",
      timestampUtc: "2026-08-14T18:01:00Z",
      originalTimezone: "America/New_York",
      action: "sell",
      quantity: 100,
      price: 217.08,
      commission: 4,
    },
  ],
});

const cryptoSpot: TradeInput = liveTrade({
  id: "draft",
  accountId: ACCOUNT_ID,
  assetClass: "crypto_spot",
  instrument: "spot",
  symbol: "BTC-USD",
  direction: "long",
  status: "closed",
  playbookName: "Momentum Breakout",
  playbookId: PLAYBOOK_ID,
  plannedEntry: 64000,
  plannedStop: 63500,
  plannedSize: 0.25,
  sessionDate: "2026-08-14",
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
});

describe("canonical journal hydration round-trip", () => {
  it("hydrates a stock with one entry and one exit", () => {
    const { hydrated, calcIn, calcOut } = roundTrip(stockSingle);
    expect(hydrated.source).toBe("canonical");
    expect(material(hydrated.trade)).toMatchObject(material(stockSingle));
    expect(dollars(calcOut.netRealizedPnl)).toBe(dollars(calcIn.netRealizedPnl));
    expect(hydrated.trade.executions).toHaveLength(2);
  });

  it("hydrates a stock with multiple fills", () => {
    const nvda = liveTrade(AUGUST_14_TRADES[0], { playbookName: "Momentum Breakout" });
    const { hydrated, calcIn, calcOut } = roundTrip(nvda);
    expect(hydrated.trade.executions).toHaveLength(3);
    expect(dollars(calcOut.grossRealizedPnl)).toBe(448);
    expect(dollars(calcOut.totalFees)).toBe(8);
    expect(dollars(calcOut.netRealizedPnl)).toBe(440);
    expect(dollars(calcOut.initialRisk!)).toBe(dollars(calcIn.initialRisk!));
    expect(calcOut.rMultiple).toBeCloseTo(calcIn.rMultiple!, 10);
  });

  it("hydrates a partially closed position", () => {
    const partial: TradeInput = liveTrade({
      ...stockSingle,
      status: "partially_closed",
      executions: [
        stockSingle.executions[0],
        { ...stockSingle.executions[1], quantity: 40, id: "aapl-partial" },
      ],
    });
    const { hydrated, calcOut } = roundTrip(partial);
    expect(hydrated.trade.executions).toHaveLength(2);
    expect(calcOut.status).toBe("partially_closed");
    expect(microsToNumber(calcOut.remainingQuantity)).toBe(60);
  });

  it("hydrates an option with legs and contract multipliers", () => {
    const spy = liveTrade(AUGUST_14_TRADES[1], { playbookName: "Opening Range Breakout" });
    const twoLeg: TradeInput = {
      ...spy,
      legs: [
        spy.legs![0],
        {
          id: "spy-leg-2",
          action: "sell",
          right: "call",
          strike: 455,
          expiration: "2026-08-14",
          contracts: 5,
          multiplier: 100,
          occSymbol: "SPY260814C00455000",
          status: "closed_before_expiration",
        },
      ],
    };
    const { hydrated, calcOut } = roundTrip(twoLeg);
    expect(hydrated.trade.assetClass).toBe("equity_option");
    expect(hydrated.trade.legs).toHaveLength(2);
    expect(hydrated.trade.legs![0].multiplier).toBe(100);
    expect(hydrated.trade.legs![1].strike).toBe(455);
    expect(hydrated.trade.legs![1].multiplier).toBe(100);
    expect(hydrated.trade.executions.every((execution) => Number(execution.multiplier) === 100)).toBe(true);
    expect(hydrated.trade.status).toBe("closed_before_expiration");
    expect(dollars(calcOut.netRealizedPnl)).toBe(650);
  });

  it("hydrates crypto quantity and identity", () => {
    const { hydrated } = roundTrip(cryptoSpot);
    expect(hydrated.trade.assetClass).toBe("crypto_spot");
    expect(hydrated.trade.instrument).toBe("spot");
    expect(Number(hydrated.trade.executions[0].quantity)).toBe(0.25);
    expect(hydrated.trade.symbol).toBe("BTC-USD");
  });

  it("hydrates execution commissions and regulatory/other fees", () => {
    const withFees: TradeInput = {
      ...stockSingle,
      executions: stockSingle.executions.map((execution, index) => ({
        ...execution,
        commission: 4,
        regulatoryFee: 1.25,
        otherFee: index === 0 ? 0.4 : 0,
        fees: [
          { kind: "network", amount: 0.15, currency: "USD" },
        ],
      })),
    };
    const { hydrated } = roundTrip(withFees);
    expect(hydrated.trade.executions[0].commission).toBe(4);
    expect(hydrated.trade.executions[0].regulatoryFee).toBe(1.25);
    expect(hydrated.trade.executions[0].otherFee).toBe(0.4);
    expect(hydrated.trade.executions[0].fees?.some((fee) => fee.kind === "network")).toBe(true);
    expect(dollars(calculateTrade(hydrated.trade).totalFees)).toBe(dollars(calculateTrade(withFees).totalFees));
  });

  it("hydrates account and playbook identity", () => {
    const { hydrated } = roundTrip(stockSingle);
    expect(hydrated.trade.accountId).toBe(ACCOUNT_ID);
    expect(hydrated.trade.playbookId).toBe(PLAYBOOK_ID);
    expect(hydrated.trade.playbookName).toBe("VWAP Reclaim");
  });

  it("hydrates complete plan inputs including plannedSize", () => {
    const { hydrated, calcOut } = roundTrip(stockSingle);
    expect(hydrated.trade.plannedEntry).toBe(215.8);
    expect(hydrated.trade.plannedStop).toBe(214.88);
    expect(hydrated.trade.plannedSize).toBe(100);
    expect(hydrated.trade.plannedTarget).toBe(217.2);
    expect(calcOut.plannedRiskSource).toBe("plan_inputs");
  });

  it("preserves rich lifecycle status", () => {
    const spy = liveTrade(AUGUST_14_TRADES[1], { playbookName: "Opening Range Breakout" });
    const { hydrated, payload } = roundTrip(spy);
    expect(payload.trade.status).toBe("closed");
    expect(payload.trade.lifecycle_status).toBe("closed_before_expiration");
    expect(hydrated.trade.status).toBe("closed_before_expiration");
  });

  it("uses explicit legacy fallback when a row has no canonical children", () => {
    const row: CanonicalTradeRow = {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      symbol: "MSFT",
      side: "long",
      qty: 10,
      entry_price: 400,
      exit_price: 410,
      entry_date: "2026-08-14T14:00:00.000Z",
      exit_date: "2026-08-14T18:00:00.000Z",
      status: "closed",
      stop_price: 395,
      target_price: 412,
      setup_tag: "flat_top_breakout",
    };
    const hydrated = hydrateTradeGraph({
      trade: row,
      plan: null,
      account: null,
      playbook: null,
      legs: [],
      executions: [],
      fees: [],
      calculation: null,
    });
    expect(hydrated.source).toBe("legacy_fallback");
    expect(hydrated.trade.executions).toHaveLength(2);
    expect(hydrated.trade.executions[0].id).toBe(`${row.id}-in`);
    expect(Number(hydrated.trade.executions[0].price)).toBe(400);
  });

  it("does not fabricate executions for a canonical incomplete row", () => {
    const hydrated = hydrateTradeGraph({
      trade: {
        id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
        symbol: "NVDA",
        side: "long",
        qty: 999,
        entry_price: 1,
        exit_price: 2,
        entry_date: "2026-08-14T13:32:00.000Z",
        exit_date: "2026-08-14T17:40:00.000Z",
        status: "closed",
        lifecycle_status: "closed",
        asset_class: "stock",
        instrument: "share",
        planned_size: 100,
        planned_entry: 118.4,
        planned_stop: 116.3,
      },
      plan: {
        trade_id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
        planned_entry: 118.4,
        planned_stop: 116.3,
        planned_size: 100,
      },
      account: null,
      playbook: null,
      legs: [],
      executions: [],
      fees: [],
      calculation: null,
    });
    expect(hydrated.source).toBe("canonical_incomplete");
    expect(hydrated.trade.executions).toHaveLength(0);
    expect(hydrated.trade.executions.find((execution) => Number(execution.price) === 1)).toBeUndefined();
    expect(hydrated.trade.exclusionReason).toBe("missing_executions");
    expect(calculateTrade(hydrated.trade).calculationState).toBe("unavailable");
    expect(hydrated.trade.plannedSize).toBe(100);
  });
});

describe("journal graph loader paths", () => {
  it("never reads or writes when Demo Workspace mode is selected", async () => {
    const { client, reads } = mockReadDb({ journal_trades: [{ id: "should-not-load" }] });
    const rpc = vi.fn();
    const result = await loadJournalGraph({ mode: "demo", userId: USER_ID, client });
    expect(result.skipped).toBe("demo");
    expect(result.trades).toHaveLength(0);
    expect(reads).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(AUGUST_DEMO_TRADES[0].id.startsWith("demo-")).toBe(true);
  });

  it("uses legacy loading only for the known missing-executions-table condition", async () => {
    const { client } = mockReadDb({
      journal_trades: [{
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        user_id: USER_ID,
        symbol: "MSFT",
        side: "long",
        qty: 10,
        entry_price: 400,
        exit_price: 410,
        entry_date: "2026-08-14T14:00:00.000Z",
        exit_date: "2026-08-14T18:00:00.000Z",
        status: "closed",
        stop_price: null,
        target_price: null,
        setup_tag: null,
      }],
      journal_executions: { error: { message: "relation \"journal_executions\" does not exist", code: "42P01" } },
      journal_trade_plans: { error: { message: "does not exist", code: "42P01" } },
      journal_accounts: { error: { message: "does not exist", code: "42P01" } },
      journal_playbooks: { error: { message: "does not exist", code: "42P01" } },
      journal_trade_legs: { error: { message: "does not exist", code: "42P01" } },
      journal_execution_fees: { error: { message: "does not exist", code: "42P01" } },
      journal_calculation_runs: { error: { message: "does not exist", code: "42P01" } },
    });
    const result = await loadJournalGraph({ mode: "live", userId: USER_ID, client });
    expect(result.ok).toBe(true);
    expect(result.path).toBe("legacy_fallback");
    expect(result.trades[0].executions).toHaveLength(2);
  });

  it("does not swallow permission or unexpected database errors", async () => {
    const { client } = mockReadDb({
      journal_trades: { error: { message: "permission denied for table journal_trades", code: "42501" } },
    });
    const result = await loadJournalGraph({ mode: "live", userId: USER_ID, client });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/permission denied/i);
    expect(result.trades).toHaveLength(0);
  });

  it("loads a canonical graph when child tables exist", async () => {
    const payload = buildJournalSavePayload(stockSingle);
    const rows = graphRowsFromPayload(payload, USER_ID, { accountId: ACCOUNT_ID, playbookId: PLAYBOOK_ID });
    const { client } = mockReadDb({
      journal_trades: [rows.trade],
      journal_trade_plans: [rows.plan],
      journal_accounts: [rows.account],
      journal_playbooks: rows.playbook ? [rows.playbook] : [],
      journal_trade_legs: rows.legs,
      journal_executions: rows.executions,
      journal_execution_fees: rows.fees,
      journal_calculation_runs: [rows.calculation],
    });
    const result = await loadJournalGraph({ mode: "live", userId: USER_ID, client });
    expect(result.ok).toBe(true);
    expect(result.path).toBe("canonical");
    expect(result.trades[0].symbol).toBe("AAPL");
    expect(result.trades[0].executions).toHaveLength(2);
    expect(result.accounts[0].id).toBe(ACCOUNT_ID);
  });

  it("loads execution fees by execution_id, not fabricated from trade summary columns", async () => {
    const payload = buildJournalSavePayload(stockSingle);
    const rows = graphRowsFromPayload(payload, USER_ID, { accountId: ACCOUNT_ID, playbookId: PLAYBOOK_ID });
    const executionId = rows.executions[0].id;
    rows.executions[0] = { ...rows.executions[0], commission: 0, regulatory_fee: 0, other_fee: 0 };
    const feeOnlyRows = [
      { id: "fee-reg-1", execution_id: executionId, kind: "regulatory", amount: 1.25, currency: "USD" },
      { id: "fee-other-1", execution_id: executionId, kind: "other", amount: 0.4, currency: "USD" },
    ];
    const { client } = mockReadDb({
      journal_trades: [rows.trade],
      journal_trade_plans: [rows.plan],
      journal_accounts: [rows.account],
      journal_playbooks: rows.playbook ? [rows.playbook] : [],
      journal_trade_legs: rows.legs,
      journal_executions: rows.executions,
      journal_execution_fees: feeOnlyRows,
      journal_calculation_runs: [rows.calculation],
      journal_calculation_lineage: [],
    });
    const result = await loadJournalGraph({ mode: "live", userId: USER_ID, client });
    expect(result.ok).toBe(true);
    expect(result.trades[0].executions[0].regulatoryFee).toBe(1.25);
    expect(result.trades[0].executions[0].otherFee).toBe(0.4);
    expect(result.trades[0].executions.find((execution) => execution.id.endsWith("-in"))).toBeUndefined();
  });
});
