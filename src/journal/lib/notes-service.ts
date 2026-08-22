import { isUuid, newPersistentId } from "../ledger/persist-contract";
import {
  isWriteBlocked,
  queryError,
  rowsOf,
  withWriteLock,
  type LiveWriteOptions,
} from "./live-client";
import { isDemoTradeId } from "./storage";

export interface TradeNoteRecord {
  id: string;
  tradeId: string;
  body: string;
  noteType: string;
  createdAt: string;
}

export interface NotesListResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  notes: TradeNoteRecord[];
}

export interface NoteWriteResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  note?: TradeNoteRecord;
}

interface NoteRow {
  id: string;
  user_id: string;
  trade_id: string;
  body: string;
  note_type: string;
  created_at: string;
}

function mapNote(row: NoteRow): TradeNoteRecord {
  return {
    id: row.id,
    tradeId: row.trade_id,
    body: row.body,
    noteType: row.note_type,
    createdAt: row.created_at,
  };
}

export async function listTradeNotes(
  options: LiveWriteOptions,
  tradeId: string,
): Promise<NotesListResult> {
  if (options.mode === "demo") return { ok: true, skipped: "demo", notes: [] };
  if (!options.userId) return { ok: false, error: "an authenticated session is required.", notes: [] };
  if (!isUuid(tradeId) || isDemoTradeId(tradeId)) return { ok: true, notes: [] };

  const result = await options.client
    .from("journal_notes")
    .select("*")
    .eq("user_id", options.userId)
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: true });
  const err = queryError(result);
  if (err) return { ok: false, error: err, notes: [] };
  return { ok: true, notes: rowsOf<NoteRow>(result.data).map(mapNote) };
}

export async function saveTradeNote(
  options: LiveWriteOptions,
  input: { id?: string; tradeId: string; body: string },
): Promise<NoteWriteResult> {
  if (isWriteBlocked(options.mode)) return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(input.tradeId) || isDemoTradeId(input.tradeId)) {
    return { ok: false, error: "not_found" };
  }
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note body is required." };
  const lockKey = `note-save:${options.userId}:${input.id ?? input.tradeId}`;

  return withWriteLock(lockKey, async () => {
    if (input.id) {
      if (!isUuid(input.id)) return { ok: false, error: "not_found" };
      const updated = await options.client
        .from("journal_notes")
        .update({ body })
        .eq("id", input.id)
        .eq("user_id", options.userId)
        .eq("trade_id", input.tradeId)
        .select("*")
        .maybeSingle();
      const err = queryError(updated);
      if (err) return { ok: false, error: err };
      const row = updated.data as NoteRow | null;
      if (!row) return { ok: false, error: "not_found" };
      return { ok: true, note: mapNote(row) };
    }

    const inserted = await options.client
      .from("journal_notes")
      .insert({
        id: newPersistentId(),
        user_id: options.userId,
        trade_id: input.tradeId,
        body,
        note_type: "general",
      })
      .select("*")
      .single();
    const err = queryError(inserted);
    if (err) return { ok: false, error: err };
    const row = inserted.data as NoteRow | null;
    if (!row?.id) return { ok: false, error: "the database did not confirm the note." };
    return { ok: true, note: mapNote(row) };
  });
}

export async function deleteTradeNote(
  options: LiveWriteOptions,
  input: { id: string; tradeId: string },
): Promise<NoteWriteResult> {
  if (isWriteBlocked(options.mode)) return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(input.id) || !isUuid(input.tradeId)) return { ok: false, error: "not_found" };

  return withWriteLock(`note-delete:${options.userId}:${input.id}`, async () => {
    const existing = await options.client
      .from("journal_notes")
      .select("*")
      .eq("id", input.id)
      .eq("user_id", options.userId)
      .eq("trade_id", input.tradeId)
      .maybeSingle();
    const lookupErr = queryError(existing);
    if (lookupErr) return { ok: false, error: lookupErr };
    const row = existing.data as NoteRow | null;
    if (!row) return { ok: false, error: "not_found" };

    const deleted = await options.client
      .from("journal_notes")
      .delete()
      .eq("id", input.id)
      .eq("user_id", options.userId)
      .eq("trade_id", input.tradeId);
    const err = queryError(deleted);
    if (err) return { ok: false, error: err };
    return { ok: true, note: mapNote(row) };
  });
}
