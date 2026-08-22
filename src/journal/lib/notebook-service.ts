import { isUuid, newPersistentId } from "../ledger/persist-contract";
import { deleteAttachmentsForNotebookEntry } from "./attachments-service";
import {
  isWriteBlocked,
  queryError,
  rowsOf,
  withWriteLock,
  type JournalLiveClient,
  type LiveWriteOptions,
} from "./live-client";
import { isDemoTradeId } from "./storage";

export const DEFAULT_NOTEBOOK_TITLE = "Notebook";
export const DEFAULT_NOTEBOOK_KIND = "general";

export interface NotebookEntryRecord {
  id: string;
  notebookId: string;
  title: string;
  body: string;
  entryDate: string | null;
  createdAt: string;
  updatedAt: string;
  tradeIds: string[];
}

export interface NotebookWriteResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  entry?: NotebookEntryRecord;
}

export interface NotebookListResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  entries: NotebookEntryRecord[];
}

interface NotebookRow {
  id: string;
  user_id: string;
  title: string;
  kind: string;
}

interface EntryRow {
  id: string;
  user_id: string;
  notebook_id: string;
  title: string | null;
  body: string | null;
  entry_date: string | null;
  created_at: string;
  updated_at: string;
}

interface LinkRow {
  id: string;
  entry_id: string;
  trade_id: string | null;
  playbook_id: string | null;
}

function mapEntry(row: EntryRow, tradeIds: string[]): NotebookEntryRecord {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    title: row.title ?? "",
    body: row.body ?? "",
    entryDate: row.entry_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tradeIds,
  };
}

function ownerVisibleTradeIds(ids: string[], visible: ReadonlySet<string>): string[] {
  return [...new Set(ids.filter((id) => isUuid(id) && !isDemoTradeId(id) && visible.has(id)))];
}

async function loadLinks(
  client: JournalLiveClient,
  entryIds: string[],
): Promise<{ ok: true; rows: LinkRow[] } | { ok: false; error: string }> {
  if (entryIds.length === 0) return { ok: true, rows: [] };
  const result = await client.from("journal_notebook_links").select("*").in("entry_id", entryIds);
  const err = queryError(result);
  if (err) return { ok: false, error: err };
  return { ok: true, rows: rowsOf<LinkRow>(result.data) };
}

async function ensureNotebook(
  options: LiveWriteOptions,
): Promise<{ ok: true; notebookId: string } | { ok: false; error: string }> {
  const existing = await options.client
    .from("journal_notebooks")
    .select("id,user_id,title,kind")
    .eq("user_id", options.userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const existingErr = queryError(existing);
  if (existingErr) return { ok: false, error: existingErr };
  const row = existing.data as NotebookRow | null;
  if (row?.id) return { ok: true, notebookId: row.id };

  const inserted = await options.client
    .from("journal_notebooks")
    .insert({
      user_id: options.userId,
      title: DEFAULT_NOTEBOOK_TITLE,
      kind: DEFAULT_NOTEBOOK_KIND,
    })
    .select("id,user_id,title,kind")
    .single();
  const insertErr = queryError(inserted);
  if (insertErr) return { ok: false, error: insertErr };
  const created = inserted.data as NotebookRow | null;
  if (!created?.id) return { ok: false, error: "the database did not confirm the notebook." };
  return { ok: true, notebookId: created.id };
}

async function syncTradeLinks(
  options: LiveWriteOptions,
  entryId: string,
  nextTradeIds: string[],
): Promise<string | null> {
  const loaded = await loadLinks(options.client, [entryId]);
  if (loaded.ok === false) return loaded.error;
  const current = loaded.rows
    .map((row) => row.trade_id)
    .filter((id): id is string => Boolean(id));
  const currentSet = new Set(current);
  const nextSet = new Set(nextTradeIds);
  const toRemove = loaded.rows.filter((row) => row.trade_id && !nextSet.has(row.trade_id));
  const toAdd = nextTradeIds.filter((id) => !currentSet.has(id));

  for (const row of toRemove) {
    const result = await options.client.from("journal_notebook_links").delete().eq("id", row.id);
    const err = queryError(result);
    if (err) return err;
  }
  if (toAdd.length > 0) {
    const result = await options.client.from("journal_notebook_links").insert(
      toAdd.map((trade_id) => ({ entry_id: entryId, trade_id })),
    );
    const err = queryError(result);
    if (err) return err;
  }
  return null;
}

export async function listNotebookEntries(options: LiveWriteOptions): Promise<NotebookListResult> {
  if (isWriteBlocked(options.mode) || options.mode === "demo") {
    return { ok: true, skipped: "demo", entries: [] };
  }
  if (!options.userId) return { ok: false, error: "an authenticated session is required.", entries: [] };

  const result = await options.client
    .from("journal_notebook_entries")
    .select("*")
    .eq("user_id", options.userId)
    .order("created_at", { ascending: false });
  const err = queryError(result);
  if (err) return { ok: false, error: err, entries: [] };
  const rows = rowsOf<EntryRow>(result.data);
  const links = await loadLinks(options.client, rows.map((row) => row.id));
  if (links.ok === false) return { ok: false, error: links.error, entries: [] };
  const byEntry = new Map<string, string[]>();
  for (const link of links.rows) {
    if (!link.trade_id) continue;
    const list = byEntry.get(link.entry_id) ?? [];
    list.push(link.trade_id);
    byEntry.set(link.entry_id, list);
  }
  return {
    ok: true,
    entries: rows.map((row) => mapEntry(row, byEntry.get(row.id) ?? [])),
  };
}

export async function getNotebookEntry(
  options: LiveWriteOptions,
  entryId: string,
): Promise<NotebookWriteResult> {
  if (options.mode === "demo") return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(entryId)) return { ok: false, error: "not_found" };

  const result = await options.client
    .from("journal_notebook_entries")
    .select("*")
    .eq("id", entryId)
    .eq("user_id", options.userId)
    .maybeSingle();
  const err = queryError(result);
  if (err) return { ok: false, error: err };
  const row = result.data as EntryRow | null;
  if (!row) return { ok: false, error: "not_found" };
  const links = await loadLinks(options.client, [row.id]);
  if (links.ok === false) return { ok: false, error: links.error };
  return {
    ok: true,
    entry: mapEntry(
      row,
      links.rows.map((link) => link.trade_id).filter((id): id is string => Boolean(id)),
    ),
  };
}

export async function saveNotebookEntry(
  options: LiveWriteOptions & { visibleTradeIds: readonly string[] },
  input: { id?: string; title: string; body: string; entryDate?: string | null; tradeIds?: string[] },
): Promise<NotebookWriteResult> {
  if (isWriteBlocked(options.mode)) return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  const title = input.title.trim();
  const body = input.body;
  const visible = new Set(options.visibleTradeIds.filter((id) => isUuid(id) && !isDemoTradeId(id)));
  const tradeIds = ownerVisibleTradeIds(input.tradeIds ?? [], visible);
  const lockKey = `notebook-save:${options.userId}:${input.id ?? "new"}`;

  return withWriteLock(lockKey, async () => {
    if (input.id) {
      if (!isUuid(input.id)) return { ok: false, error: "not_found" };
      const updated = await options.client
        .from("journal_notebook_entries")
        .update({
          title,
          body,
          entry_date: input.entryDate ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("user_id", options.userId)
        .select("*")
        .maybeSingle();
      const err = queryError(updated);
      if (err) return { ok: false, error: err };
      const row = updated.data as EntryRow | null;
      if (!row) return { ok: false, error: "not_found" };
      const linkErr = await syncTradeLinks(options, row.id, tradeIds);
      if (linkErr) return { ok: false, error: linkErr };
      return { ok: true, entry: mapEntry(row, tradeIds) };
    }

    const notebook = await ensureNotebook(options);
    if (notebook.ok === false) return { ok: false, error: notebook.error };
    const inserted = await options.client
      .from("journal_notebook_entries")
      .insert({
        id: newPersistentId(),
        user_id: options.userId,
        notebook_id: notebook.notebookId,
        title,
        body,
        entry_date: input.entryDate ?? new Date().toISOString().slice(0, 10),
      })
      .select("*")
      .single();
    const err = queryError(inserted);
    if (err) return { ok: false, error: err };
    const row = inserted.data as EntryRow | null;
    if (!row?.id) return { ok: false, error: "the database did not confirm the notebook entry." };
    const linkErr = await syncTradeLinks(options, row.id, tradeIds);
    if (linkErr) return { ok: false, error: linkErr };
    return { ok: true, entry: mapEntry(row, tradeIds) };
  });
}

export async function deleteNotebookEntry(
  options: LiveWriteOptions,
  entryId: string,
): Promise<NotebookWriteResult> {
  if (isWriteBlocked(options.mode)) return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(entryId)) return { ok: false, error: "not_found" };

  return withWriteLock(`notebook-delete:${options.userId}:${entryId}`, async () => {
    const existing = await getNotebookEntry(options, entryId);
    if (!existing.ok) return existing;
    const attachments = await deleteAttachmentsForNotebookEntry(options, entryId);
    if (!attachments.ok) return { ok: false, error: attachments.error };
    const deleted = await options.client
      .from("journal_notebook_entries")
      .delete()
      .eq("id", entryId)
      .eq("user_id", options.userId);
    const err = queryError(deleted);
    if (err) return { ok: false, error: err };
    return { ok: true, entry: existing.entry };
  });
}
