import { describe, expect, it, vi } from "vitest";
import { AUGUST_DEMO_TRADES } from "../demo/august-fixtures";
import { loadJournalGraph } from "../ledger/loadTrades";
import { saveTrade, type JournalDb } from "../ledger/saveTrade";
import { isDemoTradeId } from "../lib/storage";

function mockDb() {
  const inserts: { table: string; rows: unknown }[] = [];
  const rpc = vi.fn(async () => ({ data: { ok: true, trade_id: "11111111-1111-4111-8111-000000000099" }, error: null }));
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
        order: () => query,
        limit: () => query,
      };
      return query;
    },
    rpc,
  };
  return { client, inserts, rpc };
}

describe("demo isolation", () => {
  it("never passes demo trade ids to supabase insert in demo mode", async () => {
    const { client, inserts, rpc } = mockDb();
    for (const trade of AUGUST_DEMO_TRADES) {
      const result = await saveTrade(trade, { mode: "demo", userId: "user-1", client });
      expect(result.skipped).toBe("demo");
      expect(result.ok).toBe(false);
    }
    expect(inserts).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("blocks demo-prefixed ids even if mode is live", async () => {
    const { client, inserts, rpc } = mockDb();
    const demoIds = AUGUST_DEMO_TRADES.map((trade) => trade.id);
    expect(demoIds.every(isDemoTradeId)).toBe(true);
    const result = await saveTrade(AUGUST_DEMO_TRADES[0], { mode: "live", userId: "user-1", client });
    expect(result.skipped).toBe("demo");
    expect(inserts).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("inserts a live trade id", async () => {
    const { client, inserts } = mockDb();
    const live = {
      ...AUGUST_DEMO_TRADES[0],
      id: "live-nvda-1",
      accountId: "live-default",
    };
    const spy = vi.fn();
    const rpc = vi.fn(async () => ({ data: { ok: true, trade_id: "11111111-1111-4111-8111-000000000099" }, error: null }));
    const wrapped: JournalDb = {
      from: (table) => {
        const inner = client.from(table);
        return {
          ...inner,
          insert: (rows: unknown) => {
            spy(table, rows);
            return inner.insert(rows);
          },
        };
      },
      rpc,
    };
    const result = await saveTrade(live, { mode: "live", userId: "user-1", client: wrapped });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
    const payload = JSON.stringify(rpc.mock.calls);
    expect(payload).not.toContain("demo-nvda");
  });

  it("never reads journal tables while Demo Workspace mode is selected", async () => {
    const { client, rpc } = mockDb();
    const from = vi.spyOn(client, "from");
    const result = await loadJournalGraph({ mode: "demo", userId: "user-1", client: client as never });
    expect(result.skipped).toBe("demo");
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
