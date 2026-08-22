import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAttachmentSignedUrl,
  deleteAttachment,
  listNoteAttachments,
  listNotebookAttachments,
  uploadAttachment,
} from "./attachments-service";
import { deleteOwnedAccount, deleteOwnedTrade } from "./delete-owned";
import {
  JOURNAL_PRIVATE_BUCKET,
  resetWriteLocksForTests,
  type JournalLiveClient,
  type JournalQueryResult,
  type JournalTableQuery,
} from "./live-client";
import { NOTEBOOK_KEY, writeJson } from "./storage";
import {
  deleteNotebookEntry,
  getNotebookEntry,
  listNotebookEntries,
  saveNotebookEntry,
} from "./notebook-service";
import { deleteTradeNote, listTradeNotes, saveTradeNote } from "./notes-service";

const USER_A = "11111111-1111-4111-8111-0000000000aa";
const USER_B = "22222222-2222-4222-8222-0000000000bb";
const TRADE_A = "048ab0ed-0b50-4814-8c5f-36e3068520e3";
const TRADE_B = "33333333-3333-4333-8333-0000000000cc";
const ACCOUNT_A = "44444444-4444-4444-8444-0000000000dd";
const OTHER_TRADE = "55555555-5555-4555-8555-0000000000ee";

type Row = Record<string, unknown>;

interface MemoryDb {
  tables: Map<string, Row[]>;
  objects: Map<string, { bucket: string }>;
  fromCalls: string[];
  storageCalls: string[];
}

function likeMatch(value: unknown, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`).test(String(value ?? ""));
}

function createMemoryClient(seed?: Partial<Record<string, Row[]>>): { client: JournalLiveClient; db: MemoryDb } {
  const db: MemoryDb = {
    tables: new Map(Object.entries(seed ?? {}).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))])),
    objects: new Map(),
    fromCalls: [],
    storageCalls: [],
  };

  const ensure = (table: string) => {
    if (!db.tables.has(table)) db.tables.set(table, []);
    return db.tables.get(table)!;
  };

  const client: JournalLiveClient = {
    from(table: string) {
      db.fromCalls.push(table);
      const state: {
        action: "select" | "insert" | "update" | "delete";
        filters: Array<{ type: "eq" | "in" | "is" | "like"; col: string; value: unknown }>;
        payload: unknown;
        orderCol?: string;
        ascending: boolean;
        limitN?: number;
      } = { action: "select", filters: [], payload: null, ascending: true };

      const matched = () => {
        return ensure(table).filter((row) =>
          state.filters.every((filter) => {
            if (filter.type === "eq") return row[filter.col] === filter.value;
            if (filter.type === "in") return (filter.value as string[]).includes(row[filter.col] as string);
            if (filter.type === "is") return row[filter.col] == null;
            return likeMatch(row[filter.col], String(filter.value));
          }),
        );
      };

      const finish = (): JournalQueryResult<unknown> => {
        let rows = matched();
        if (state.orderCol) {
          const col = state.orderCol;
          rows = [...rows].sort((a, b) => {
            const av = String(a[col] ?? "");
            const bv = String(b[col] ?? "");
            return state.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        if (state.action === "insert") {
          const incoming = Array.isArray(state.payload) ? state.payload as Row[] : [state.payload as Row];
          const created = incoming.map((row) => ({
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...row,
            id: (row.id as string | undefined) ?? globalThis.crypto.randomUUID(),
          }));
          ensure(table).push(...created);
          rows = created;
        } else if (state.action === "update") {
          const patch = state.payload as Row;
          for (const row of rows) Object.assign(row, patch);
        } else if (state.action === "delete") {
          const ids = new Set(rows);
          db.tables.set(table, ensure(table).filter((row) => !ids.has(row)));
        }
        if (state.limitN != null) rows = rows.slice(0, state.limitN);
        return { data: rows, error: null };
      };

      const query: JournalTableQuery = {
        select() { return query; },
        insert(rows) { state.action = "insert"; state.payload = rows; return query; },
        update(rows) { state.action = "update"; state.payload = rows; return query; },
        delete() { state.action = "delete"; return query; },
        eq(col, value) { state.filters.push({ type: "eq", col, value }); return query; },
        in(col, values) { state.filters.push({ type: "in", col, value: values }); return query; },
        is(col, value) { state.filters.push({ type: "is", col, value }); return query; },
        like(col, pattern) { state.filters.push({ type: "like", col, value: pattern }); return query; },
        order(col, opts) { state.orderCol = col; state.ascending = opts?.ascending !== false; return query; },
        limit(n) { state.limitN = n; return query; },
        async single() {
          const result = finish();
          const rows = Array.isArray(result.data) ? result.data : [];
          if (rows.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
          return { data: rows[0], error: null };
        },
        async maybeSingle() {
          const result = finish();
          const rows = Array.isArray(result.data) ? result.data : [];
          if (rows.length > 1) return { data: null, error: { message: "JSON object requested, multiple rows returned" } };
          return { data: rows[0] ?? null, error: null };
        },
        then(onfulfilled, onrejected) {
          return Promise.resolve(finish()).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string) {
            db.storageCalls.push(`upload:${bucket}:${path}`);
            if (bucket !== JOURNAL_PRIVATE_BUCKET) return { data: null, error: { message: "unknown bucket" } };
            if (db.objects.has(path)) return { data: null, error: { message: "already exists" } };
            db.objects.set(path, { bucket });
            return { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            db.storageCalls.push(`remove:${bucket}:${paths.join(",")}`);
            for (const path of paths) db.objects.delete(path);
            return { data: paths, error: null };
          },
          async createSignedUrl(path: string) {
            db.storageCalls.push(`sign:${bucket}:${path}`);
            if (!db.objects.has(path)) return { data: null, error: { message: "not found" } };
            return { data: { signedUrl: `https://signed.local/${path}` }, error: null };
          },
        };
      },
    },
  };

  return { client, db };
}

function live(userId: string, client: JournalLiveClient) {
  return { mode: "live" as const, userId, client };
}

afterEach(() => {
  resetWriteLocksForTests();
});

describe("notebook persistence", () => {
  it("does not create a notebook entry until Save", async () => {
    const { client, db } = createMemoryClient();
    const listed = await listNotebookEntries(live(USER_A, client));
    expect(listed.ok).toBe(true);
    expect(listed.entries).toEqual([]);
    expect(db.tables.get("journal_notebook_entries") ?? []).toHaveLength(0);
  });

  it("creates, lists, edits, deletes, and links owner-visible trades", async () => {
    const { client, db } = createMemoryClient({
      journal_trades: [
        { id: TRADE_A, user_id: USER_A, symbol: "NVDA" },
        { id: OTHER_TRADE, user_id: USER_B, symbol: "AAPL" },
      ],
    });
    const created = await saveNotebookEntry(
      { ...live(USER_A, client), visibleTradeIds: [TRADE_A] },
      { title: "Process", body: "Stick to the watchlist", tradeIds: [TRADE_A, OTHER_TRADE] },
    );
    expect(created.ok).toBe(true);
    expect(created.entry?.tradeIds).toEqual([TRADE_A]);
    expect(db.tables.get("journal_notebook_entries")).toHaveLength(1);

    const listed = await listNotebookEntries(live(USER_A, client));
    expect(listed.entries).toHaveLength(1);
    expect(listed.entries[0].title).toBe("Process");
    expect(listed.entries[0].tradeIds).toEqual([TRADE_A]);

    const edited = await saveNotebookEntry(
      { ...live(USER_A, client), visibleTradeIds: [TRADE_A] },
      { id: created.entry!.id, title: "Updated", body: "Revised", tradeIds: [] },
    );
    expect(edited.ok).toBe(true);
    expect(edited.entry?.title).toBe("Updated");
    expect(edited.entry?.tradeIds).toEqual([]);

    const deleted = await deleteNotebookEntry(live(USER_A, client), created.entry!.id);
    expect(deleted.ok).toBe(true);
    expect((await listNotebookEntries(live(USER_A, client))).entries).toHaveLength(0);
  });

  it("protects double submission", async () => {
    const { withWriteLock, resetWriteLocksForTests: reset } = await import("./live-client");
    reset();
    let proceed!: () => void;
    const hold = new Promise<void>((resolve) => {
      proceed = resolve;
    });
    const first = withWriteLock("notebook-save:lock-test", async () => {
      await hold;
      return { ok: true };
    });
    const second = await withWriteLock("notebook-save:lock-test", async () => ({ ok: true as const, error: undefined as string | undefined }));
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already in progress/i);
    proceed();
    expect((await first).ok).toBe(true);
  });

  it("returns not_found for another user's entry", async () => {
    const { client } = createMemoryClient();
    const created = await saveNotebookEntry(
      { ...live(USER_A, client), visibleTradeIds: [] },
      { title: "Private", body: "A only" },
    );
    const listed = await listNotebookEntries(live(USER_B, client));
    expect(listed.entries).toEqual([]);
    const fetched = await getNotebookEntry(live(USER_B, client), created.entry!.id);
    expect(fetched.ok).toBe(false);
    expect(fetched.error).toBe("not_found");
  });

  it("never reads localStorage prototype entries as production data", async () => {
    writeJson(NOTEBOOK_KEY, [{ id: "local-1", title: "Prototype", body: "no", tradeIds: [], date: "2026-08-22" }]);
    const { client } = createMemoryClient();
    const listed = await listNotebookEntries(live(USER_A, client));
    expect(listed.entries.map((entry) => entry.id)).not.toContain("local-1");
    expect(listed.entries).toHaveLength(0);
  });
});

describe("trade notes", () => {
  it("creates, edits, and deletes owner notes without exposing them cross-user", async () => {
    const { client } = createMemoryClient({
      journal_trades: [{ id: TRADE_A, user_id: USER_A, symbol: "NVDA" }],
    });
    const created = await saveTradeNote(live(USER_A, client), { tradeId: TRADE_A, body: "Held through VWAP." });
    expect(created.ok).toBe(true);
    const listed = await listTradeNotes(live(USER_A, client), TRADE_A);
    expect(listed.notes).toHaveLength(1);
    const edited = await saveTradeNote(live(USER_A, client), { id: created.note!.id, tradeId: TRADE_A, body: "Edited note" });
    expect(edited.note?.body).toBe("Edited note");
    const otherList = await listTradeNotes(live(USER_B, client), TRADE_A);
    expect(otherList.notes).toEqual([]);
    const denied = await deleteTradeNote(live(USER_B, client), { id: created.note!.id, tradeId: TRADE_A });
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe("not_found");
    const deleted = await deleteTradeNote(live(USER_A, client), { id: created.note!.id, tradeId: TRADE_A });
    expect(deleted.ok).toBe(true);
    expect((await listTradeNotes(live(USER_A, client), TRADE_A)).notes).toHaveLength(0);
  });
});

describe("private attachments", () => {
  it("uploads under the policy path, signs privately, and cleans up objects plus metadata", async () => {
    const { client, db } = createMemoryClient();
    const file = { name: "chart.png", type: "image/png", size: 12, body: new Uint8Array([1, 2, 3]) };
    const uploaded = await uploadAttachment(live(USER_A, client), { kind: "notes", parentId: TRADE_A, file });
    expect(uploaded.ok).toBe(true);
    expect(uploaded.attachment?.storagePath.startsWith(`${USER_A}/attachments/notes/${TRADE_A}/`)).toBe(true);
    expect(db.objects.has(uploaded.attachment!.storagePath)).toBe(true);
    const listed = await listNoteAttachments(live(USER_A, client), TRADE_A);
    expect(listed.attachments).toHaveLength(1);
    const signed = await createAttachmentSignedUrl(live(USER_A, client), uploaded.attachment!.id);
    expect(signed.signedUrl).toContain(uploaded.attachment!.storagePath);
    const otherList = await listNoteAttachments(live(USER_B, client), TRADE_A);
    expect(otherList.attachments).toEqual([]);
    const denied = await createAttachmentSignedUrl(live(USER_B, client), uploaded.attachment!.id);
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe("not_found");
    const deleted = await deleteAttachment(live(USER_A, client), uploaded.attachment!.id);
    expect(deleted.ok).toBe(true);
    expect(db.objects.size).toBe(0);
    expect((await listNoteAttachments(live(USER_A, client), TRADE_A)).attachments).toHaveLength(0);
  });

  it("rolls back the private object when metadata insert fails", async () => {
    const { client, db } = createMemoryClient();
    const original = client.from;
    client.from = ((table: string) => {
      const query = original.call(client, table);
      if (table === "journal_attachments") {
        return {
          ...query,
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { message: "insert failed" } }),
            }),
          }),
        } as never;
      }
      return query;
    }) as JournalLiveClient["from"];
    const result = await uploadAttachment(live(USER_A, client), {
      kind: "notebook",
      parentId: TRADE_A,
      file: { name: "note.txt", type: "text/plain", size: 4, body: "hi" },
    });
    expect(result.ok).toBe(false);
    expect(db.objects.size).toBe(0);
  });

  it("rejects disallowed types and oversized files without writing", async () => {
    const { client, db } = createMemoryClient();
    const badType = await uploadAttachment(live(USER_A, client), {
      kind: "notes",
      parentId: TRADE_A,
      file: { name: "x.exe", type: "application/x-msdownload", size: 10, body: "x" },
    });
    expect(badType.ok).toBe(false);
    const huge = await uploadAttachment(live(USER_A, client), {
      kind: "notes",
      parentId: TRADE_A,
      file: { name: "x.png", type: "image/png", size: 6 * 1024 * 1024, body: "x" },
    });
    expect(huge.ok).toBe(false);
    expect(db.fromCalls).toHaveLength(0);
    expect(db.objects.size).toBe(0);
  });
});

describe("owned deletion", () => {
  it("deletes only the owner's intended trade and attachment dependencies", async () => {
    const { client, db } = createMemoryClient({
      journal_trades: [
        { id: TRADE_A, user_id: USER_A, symbol: "NVDA" },
        { id: TRADE_B, user_id: USER_A, symbol: "AAPL" },
        { id: OTHER_TRADE, user_id: USER_B, symbol: "NVDA" },
      ],
      journal_executions: [
        { id: "66666666-6666-4666-8666-000000000001", trade_id: TRADE_A },
      ],
    });
    await uploadAttachment(live(USER_A, client), {
      kind: "notes",
      parentId: TRADE_A,
      file: { name: "fill.png", type: "image/png", size: 8, body: "img" },
    });
    const denied = await deleteOwnedTrade(live(USER_B, client), {
      tradeId: TRADE_A,
      symbol: "NVDA",
      confirmSymbol: "NVDA",
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("not_found");
    const mismatch = await deleteOwnedTrade(live(USER_A, client), {
      tradeId: TRADE_A,
      symbol: "NVDA",
      confirmSymbol: "AAPL",
    });
    expect(mismatch.code).toBe("symbol_mismatch");
    const deleted = await deleteOwnedTrade(live(USER_A, client), {
      tradeId: TRADE_A,
      symbol: "NVDA",
      confirmSymbol: "nvda",
    });
    expect(deleted.ok).toBe(true);
    const remaining = db.tables.get("journal_trades")!.map((row) => row.id);
    expect(remaining).toEqual([TRADE_B, OTHER_TRADE]);
    expect(db.tables.get("journal_attachments")).toHaveLength(0);
    expect(db.objects.size).toBe(0);
  });

  it("refuses to delete a non-empty account", async () => {
    const { client, db } = createMemoryClient({
      journal_accounts: [{ id: ACCOUNT_A, user_id: USER_A, name: "Schwab" }],
      journal_trades: [{ id: TRADE_A, user_id: USER_A, account_id: ACCOUNT_A, symbol: "NVDA" }],
    });
    const refused = await deleteOwnedAccount(live(USER_A, client), {
      accountId: ACCOUNT_A,
      name: "Schwab",
      confirmName: "Schwab",
    });
    expect(refused.ok).toBe(false);
    expect(refused.code).toBe("not_empty");
    expect(db.tables.get("journal_accounts")).toHaveLength(1);

    db.tables.set("journal_trades", []);
    const emptyOk = await deleteOwnedAccount(live(USER_A, client), {
      accountId: ACCOUNT_A,
      name: "Schwab",
      confirmName: "Schwab",
    });
    expect(emptyOk.ok).toBe(true);
    expect(db.tables.get("journal_accounts")).toHaveLength(0);
  });

  it("denies account deletion across users", async () => {
    const { client } = createMemoryClient({
      journal_accounts: [{ id: ACCOUNT_A, user_id: USER_A, name: "Schwab" }],
    });
    const denied = await deleteOwnedAccount(live(USER_B, client), {
      accountId: ACCOUNT_A,
      name: "Schwab",
      confirmName: "Schwab",
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("not_found");
  });
});

describe("demo mode writes", () => {
  it("performs zero writes across notebook, notes, attachments, and deletes", async () => {
    const { client, db } = createMemoryClient();
    const demo = { mode: "demo" as const, userId: USER_A, client };
    expect((await saveNotebookEntry({ ...demo, visibleTradeIds: [TRADE_A] }, { title: "x", body: "y" })).skipped).toBe("demo");
    expect((await deleteNotebookEntry(demo, TRADE_A)).skipped).toBe("demo");
    expect((await saveTradeNote(demo, { tradeId: TRADE_A, body: "n" })).skipped).toBe("demo");
    expect((await deleteTradeNote(demo, { id: TRADE_A, tradeId: TRADE_A })).skipped).toBe("demo");
    expect((await uploadAttachment(demo, {
      kind: "notes",
      parentId: TRADE_A,
      file: { name: "a.png", type: "image/png", size: 1, body: "a" },
    })).skipped).toBe("demo");
    expect((await deleteOwnedTrade(demo, { tradeId: TRADE_A, symbol: "NVDA", confirmSymbol: "NVDA" })).skipped).toBe("demo");
    expect((await deleteOwnedAccount(demo, { accountId: ACCOUNT_A, name: "A", confirmName: "A" })).skipped).toBe("demo");
    expect(db.fromCalls).toHaveLength(0);
    expect(db.storageCalls).toHaveLength(0);
    expect(db.objects.size).toBe(0);
  });
});

describe("notebook attachments listing", () => {
  it("scopes notebook files by user-prefixed private path", async () => {
    const { client } = createMemoryClient();
    const uploaded = await uploadAttachment(live(USER_A, client), {
      kind: "notebook",
      parentId: TRADE_A,
      file: { name: "lesson.pdf", type: "application/pdf", size: 20, body: "pdf" },
    });
    expect(uploaded.ok).toBe(true);
    const listed = await listNotebookAttachments(live(USER_A, client), TRADE_A);
    expect(listed.attachments).toHaveLength(1);
    expect(listed.attachments[0].tradeId).toBeNull();
    const other = await listNotebookAttachments(live(USER_B, client), TRADE_A);
    expect(other.attachments).toEqual([]);
  });
});
