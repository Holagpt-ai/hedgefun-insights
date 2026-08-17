import { describe, expect, it, vi } from "vitest";
import { AUGUST_DEMO_TRADES } from "../demo/august-fixtures";
import { saveTrade, type JournalDb } from "../ledger/saveTrade";
import { isDemoTradeId } from "../lib/storage";

function mockDb() {
  const inserts: { table: string; rows: unknown }[] = [];
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
  };
  return { client, inserts };
}

describe("demo isolation", () => {
  it("never passes demo trade ids to supabase insert in demo mode", async () => {
    const { client, inserts } = mockDb();
    for (const trade of AUGUST_DEMO_TRADES) {
      const result = await saveTrade(trade, { mode: "demo", userId: "user-1", client });
      expect(result.skipped).toBe("demo");
      expect(result.ok).toBe(false);
    }
    expect(inserts).toHaveLength(0);
  });

  it("blocks demo-prefixed ids even if mode is live", async () => {
    const { client, inserts } = mockDb();
    const demoIds = AUGUST_DEMO_TRADES.map((trade) => trade.id);
    expect(demoIds.every(isDemoTradeId)).toBe(true);
    const result = await saveTrade(AUGUST_DEMO_TRADES[0], { mode: "live", userId: "user-1", client });
    expect(result.skipped).toBe("demo");
    expect(inserts).toHaveLength(0);
  });

  it("inserts a live trade id", async () => {
    const { client, inserts } = mockDb();
    const live = {
      ...AUGUST_DEMO_TRADES[0],
      id: "live-nvda-1",
      accountId: "live-default",
    };
    const spy = vi.fn();
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
    };
    const result = await saveTrade(live, { mode: "live", userId: "user-1", client: wrapped });
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalled();
    const payload = JSON.stringify(spy.mock.calls);
    expect(payload).not.toContain("demo-nvda");
    expect(inserts.length).toBeGreaterThan(0);
  });
});
