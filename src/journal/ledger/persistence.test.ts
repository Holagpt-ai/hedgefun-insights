import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { calculateTrade, microsToNumber } from "../calc";
import { AUGUST_14_TRADES, AUGUST_DEMO_TRADES } from "../demo/august-fixtures";
import { mapLegacyTrade, tradeToLegacyInsert, type LegacyJournalTradeRow } from "../lib/storage";
import {
  assignPersistentIds,
  buildJournalSavePayload,
  isUuid,
  JOURNAL_SAVE_RPC,
  normalizeLegacyStatus,
  normalizeSetupTag,
  sessionDateInTimezone,
} from "./persist-contract";
import { saveTrade, type JournalDb } from "./saveTrade";
import type { TradeInput } from "../calc/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SAVE_SQL = readFileSync(
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

function manualDraft(overrides: Partial<TradeInput> = {}): TradeInput {
  return {
    id: "draft",
    accountId: "live-default",
    assetClass: "stock",
    instrument: "share",
    symbol: "NVDA",
    direction: "long",
    status: "open",
    playbookName: "Momentum Breakout",
    plannedEntry: 118.4,
    plannedStop: 116.3,
    plannedSize: 100,
    executions: [
      {
        id: "draft-0",
        timestamp: "2026-08-14T13:32:00Z",
        timestampUtc: "2026-08-14T13:32:00Z",
        originalTimezone: "America/New_York",
        action: "buy",
        quantity: 100,
        price: 118.4,
        commission: 4,
      },
      {
        id: "draft-1",
        timestamp: "2026-08-14T17:40:00Z",
        timestampUtc: "2026-08-14T17:40:00Z",
        originalTimezone: "America/New_York",
        action: "sell",
        quantity: 100,
        price: 124.56,
        commission: 4,
      },
    ],
    ...overrides,
  };
}

function mockClient(rpcImpl?: JournalDb["rpc"]) {
  const inserts: { table: string; rows: unknown }[] = [];
  const rpc = vi.fn(
    rpcImpl
      ?? (async (_fn: string, args: Record<string, unknown>) => ({
        data: { ok: true, trade_id: (args.p_payload as { trade: { id: string } }).trade.id },
        error: null,
      })),
  );
  const client: JournalDb = {
    from: (table: string) => {
      const query = {
        insert: (rows: unknown) => {
          inserts.push({ table, rows });
          const result = Promise.resolve({ data: rows, error: null });
          return Object.assign(result, query);
        },
        select: () => query,
        delete: () => query,
        eq: () => query,
        in: () => query,
      };
      return query;
    },
    rpc,
  };
  return { client, inserts, rpc };
}

describe("journal persistence contract", () => {
  it("builds a payload with canonical trade, plan, execution, fee, account, asset, lifecycle, and audit fields", () => {
    const spy = AUGUST_14_TRADES.find((trade) => trade.id === "demo-spy-450c")!;
    const live: TradeInput = { ...spy, id: "draft", accountId: "live-default" };
    const payload = buildJournalSavePayload(live);

    expect(payload.trade.symbol).toBe("SPY");
    expect(payload.trade.asset_class).toBe("equity_option");
    expect(payload.trade.instrument).toBe("option");
    expect(payload.trade.account_id).toBeNull();
    expect(payload.account.name).toBe("Primary Account");
    expect(payload.plan.planned_entry).toBe(3.2);
    expect(payload.plan.planned_stop).toBe(2.78);
    expect(payload.plan.planned_size).toBe(5);
    expect(payload.legs).toHaveLength(1);
    expect(isUuid(payload.legs[0].id)).toBe(true);
    expect(payload.executions).toHaveLength(2);
    expect(payload.executions[0].occurred_at).toBe("2026-08-14T13:45:00Z");
    expect(payload.executions[0].occurred_at_utc).toBe("2026-08-14T13:45:00Z");
    expect(payload.executions[0].fees.some((fee) => fee.kind === "commission")).toBe(true);
    expect(payload.lifecycle.status).toBe("closed_before_expiration");
    expect(payload.trade.status).toBe("closed");
    expect(payload.trade.lifecycle_status).toBe("closed_before_expiration");
    expect(payload.calculation.calculation_version).toBe("journal-calc.v1");
    expect(payload.calculation.net_pnl).toBe(650);
    expect(payload.audit.event_type).toBe("closed_position");
    expect(JSON.stringify(payload)).not.toContain("timestamp_utc");
    expect(JSON.stringify(payload.executions)).not.toContain("user_id");
  });

  it("does not collide on execution or leg ids across consecutive manual saves", () => {
    const first = buildJournalSavePayload(manualDraft());
    const second = buildJournalSavePayload(manualDraft());
    expect(isUuid(first.trade.id)).toBe(true);
    expect(isUuid(second.trade.id)).toBe(true);
    expect(first.trade.id).not.toBe(second.trade.id);
    expect(first.executions.map((row) => row.id).every(isUuid)).toBe(true);
    expect(second.executions.map((row) => row.id).every(isUuid)).toBe(true);
    expect(new Set([...first.executions, ...second.executions].map((row) => row.id)).size).toBe(4);

    const option = manualDraft({
      assetClass: "equity_option",
      instrument: "option",
      legs: [
        {
          id: "leg-1",
          action: "buy",
          right: "call",
          strike: 450,
          expiration: "2026-08-14",
          contracts: 5,
          multiplier: 100,
          status: "open",
        },
      ],
    });
    const legA = assignPersistentIds(option);
    const legB = assignPersistentIds(option);
    expect(isUuid(legA.legs![0].id)).toBe(true);
    expect(legA.legs![0].id).not.toBe(legB.legs![0].id);
    expect(legA.executions[0].id).not.toBe("draft-0");
  });

  it("does not report a successful save when a child write fails", async () => {
    const { client, inserts, rpc } = mockClient(async () => ({
      data: null,
      error: { message: "insert or update on table \"journal_execution_fees\" violates foreign key constraint" },
    }));
    const result = await saveTrade(manualDraft({ id: crypto.randomUUID() }), {
      mode: "live",
      userId: "11111111-1111-4111-8111-000000000001",
      client,
    });
    expect(result.ok).toBe(false);
    expect(result.tradeId).toBeUndefined();
    expect(result.error).toMatch(/not saved/i);
    expect(result.error).toMatch(/No journal records were written/);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe(JOURNAL_SAVE_RPC);
    expect(inserts).toHaveLength(0);
  });

  it("never invokes the persistence RPC from Demo Workspace", async () => {
    const { client, rpc } = mockClient();
    const result = await saveTrade(AUGUST_DEMO_TRADES[0], { mode: "demo", userId: "user-1", client });
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe("demo");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("normalizes rich statuses and arbitrary playbook names without writing prohibited legacy values", () => {
    expect(normalizeLegacyStatus("partially_closed", false)).toBe("open");
    expect(normalizeLegacyStatus("closed_before_expiration", true)).toBe("closed");
    expect(normalizeLegacyStatus("expired_worthless", true)).toBe("closed");
    expect(normalizeLegacyStatus("assigned", true)).toBe("closed");
    expect(normalizeSetupTag("Momentum Breakout")).toBeNull();
    expect(normalizeSetupTag("flat_top_breakout")).toBe("flat_top_breakout");

    const payload = buildJournalSavePayload(
      manualDraft({
        status: "closed_before_expiration",
        playbookName: "Opening Range Breakout",
      }),
    );
    expect(payload.trade.status).toBe("closed");
    expect(payload.trade.setup_tag).toBeNull();
    expect(payload.trade.playbook_name).toBe("Opening Range Breakout");
    expect(payload.trade.lifecycle_status).toBe("closed_before_expiration");

    const legacy = tradeToLegacyInsert(
      manualDraft({ status: "closed_before_expiration", playbookName: "VWAP Reclaim" }),
      "user-1",
    );
    expect(legacy.status).toBe("closed");
    expect(legacy.setup_tag).toBeNull();
  });

  it("keeps existing live journal_trades rows loadable", () => {
    const row: LegacyJournalTradeRow = {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      user_id: "user-1",
      symbol: "AAPL",
      side: "long",
      qty: 100,
      entry_price: 215.8,
      exit_price: 217.08,
      entry_date: "2026-08-14T14:12:00.000Z",
      exit_date: "2026-08-14T18:01:00.000Z",
      status: "closed",
      stop_price: 214.88,
      target_price: 217.2,
      setup_tag: "flat_top_breakout",
    };
    const trade = mapLegacyTrade(row);
    expect(trade.symbol).toBe("AAPL");
    expect(trade.status).toBe("closed");
    expect(trade.playbookName).toBe("flat_top_breakout");
    expect(trade.executions).toHaveLength(2);
    expect(calculateTrade(trade).outcome).toBe("win");
  });

  it("leaves locked NVDA and August metrics unchanged", () => {
    const nvda = AUGUST_14_TRADES.find((trade) => trade.id === "demo-nvda")!;
    const calc = calculateTrade(nvda);
    expect(dollars(calc.grossRealizedPnl)).toBe(448);
    expect(dollars(calc.totalFees)).toBe(8);
    expect(dollars(calc.netRealizedPnl)).toBe(440);
    expect(dollars(calc.initialRisk!)).toBe(210);
    expect(calc.rMultiple).toBeCloseTo(440 / 210, 10);
  });
});

describe("session date timezone contract", () => {
  it("uses America/New_York calendar dates without converting stored timestamptz", () => {
    expect(sessionDateInTimezone("2026-08-15T02:00:00Z")).toBe("2026-08-14");
    expect(sessionDateInTimezone("2026-08-14T13:32:00Z")).toBe("2026-08-14");
    const create = SCHEMA_SQL.match(/CREATE TABLE IF NOT EXISTS public\.journal_trades \([\s\S]*?\);/)?.[0] ?? "";
    expect(create).toMatch(/entry_date timestamptz NOT NULL/);
    expect(create).toMatch(/exit_date timestamptz/);
    expect(create).toMatch(/session_date date/);
    expect(SCHEMA_SQL).toMatch(/ADD COLUMN IF NOT EXISTS session_date date/);
    expect(SCHEMA_SQL).not.toMatch(/ALTER .*entry_date TYPE/);
  });
});

describe("journal_save_trade_v1 SQL contract", () => {
  it("defines an authenticated RPC that writes the full trade graph", () => {
    expect(SAVE_SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.journal_save_trade_v1\(p_payload jsonb\)/);
    expect(SAVE_SQL).toMatch(/v_uid := auth\.uid\(\)/);
    expect(SAVE_SQL).toMatch(/Never trust a client-supplied user_id/);
    expect(SAVE_SQL).toMatch(/INSERT INTO public\.journal_trades/);
    expect(SAVE_SQL).toMatch(/INSERT INTO public\.journal_trade_plans/);
    expect(SAVE_SQL).toMatch(/INSERT INTO public\.journal_trade_legs/);
    expect(SAVE_SQL).toMatch(/INSERT INTO public\.journal_executions/);
    expect(SAVE_SQL).toMatch(/INSERT INTO public\.journal_execution_fees/);
    expect(SAVE_SQL).toMatch(/INSERT INTO public\.journal_calculation_runs/);
    expect(SAVE_SQL).toMatch(/INSERT INTO public\.journal_calculation_lineage/);
    expect(SAVE_SQL).toMatch(/INSERT INTO public\.journal_audit_log/);
    expect(SAVE_SQL).toMatch(/occurred_at_utc/);
    const execInsert = SAVE_SQL.match(/INSERT INTO public\.journal_executions \([\s\S]*?\) VALUES/)?.[0] ?? "";
    expect(execInsert).toMatch(/occurred_at/);
    expect(execInsert).toMatch(/occurred_at_utc/);
    expect(execInsert).not.toMatch(/\buser_id\b/);
    expect(execInsert).not.toMatch(/timestamp_utc/);
    expect(SAVE_SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.journal_save_trade_v1\(jsonb\) TO authenticated, service_role/);
  });

  it("does not claim database-level rollback from this SQL-text check", () => {
    expect(SAVE_SQL.includes("journal_save_trade_v1")).toBe(true);
  });
});
