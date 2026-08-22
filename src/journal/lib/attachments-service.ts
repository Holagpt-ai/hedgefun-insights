import { isUuid, newPersistentId } from "../ledger/persist-contract";
import {
  buildAttachmentObjectPath,
  JOURNAL_PRIVATE_BUCKET,
  notebookAttachmentPrefix,
  notesAttachmentPrefix,
  queryError,
  rowsOf,
  SIGNED_URL_TTL_SECONDS,
  validateAttachmentFile,
  withWriteLock,
  type AttachmentKind,
  type JournalLiveClient,
  type LiveWriteOptions,
} from "./live-client";
import { isDemoTradeId } from "./storage";

export interface AttachmentRecord {
  id: string;
  tradeId: string | null;
  storagePath: string;
  filename: string;
  contentType: string | null;
  byteSize: number | null;
  createdAt: string;
}

export interface AttachmentListResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  attachments: AttachmentRecord[];
}

export interface AttachmentWriteResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  attachment?: AttachmentRecord;
  signedUrl?: string;
}

interface AttachmentRow {
  id: string;
  user_id: string;
  trade_id: string | null;
  storage_path: string;
  filename: string | null;
  content_type: string | null;
  byte_size: number | null;
  created_at: string;
}

function mapAttachment(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    tradeId: row.trade_id,
    storagePath: row.storage_path,
    filename: row.filename ?? "file",
    contentType: row.content_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

function storageMissing(message?: string): boolean {
  const lower = (message ?? "").toLowerCase();
  return lower.includes("not found") || lower.includes("does not exist") || lower.includes("no such file");
}

async function listByPrefix(
  client: JournalLiveClient,
  userId: string,
  prefix: string,
  tradeId?: string | null,
): Promise<AttachmentListResult> {
  let query = client.from("journal_attachments").select("*").eq("user_id", userId).like("storage_path", `${prefix}%`);
  if (tradeId) query = query.eq("trade_id", tradeId);
  const result = await query.order("created_at", { ascending: true });
  const err = queryError(result);
  if (err) return { ok: false, error: err, attachments: [] };
  return { ok: true, attachments: rowsOf<AttachmentRow>(result.data).map(mapAttachment) };
}

export async function listNoteAttachments(
  options: LiveWriteOptions,
  tradeId: string,
): Promise<AttachmentListResult> {
  if (options.mode === "demo") return { ok: true, skipped: "demo", attachments: [] };
  if (!options.userId) return { ok: false, error: "an authenticated session is required.", attachments: [] };
  if (!isUuid(tradeId) || isDemoTradeId(tradeId)) return { ok: true, attachments: [] };
  return listByPrefix(
    options.client,
    options.userId,
    notesAttachmentPrefix(options.userId, tradeId),
    tradeId,
  );
}

export async function listNotebookAttachments(
  options: LiveWriteOptions,
  entryId: string,
): Promise<AttachmentListResult> {
  if (options.mode === "demo") return { ok: true, skipped: "demo", attachments: [] };
  if (!options.userId) return { ok: false, error: "an authenticated session is required.", attachments: [] };
  if (!isUuid(entryId)) return { ok: true, attachments: [] };
  return listByPrefix(
    options.client,
    options.userId,
    notebookAttachmentPrefix(options.userId, entryId),
  );
}

export async function uploadAttachment(
  options: LiveWriteOptions,
  input: {
    kind: AttachmentKind;
    parentId: string;
    tradeId?: string | null;
    file: { name: string; type: string; size: number; body: Blob | File | ArrayBuffer | Uint8Array | string };
  },
): Promise<AttachmentWriteResult> {
  if (options.mode === "demo") return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(input.parentId) || (input.kind === "notes" && isDemoTradeId(input.parentId))) {
    return { ok: false, error: "not_found" };
  }
  const invalid = validateAttachmentFile(input.file);
  if (invalid) return { ok: false, error: invalid };

  const attachmentId = newPersistentId();
  const storagePath = buildAttachmentObjectPath({
    userId: options.userId,
    kind: input.kind,
    parentId: input.parentId,
    attachmentId,
    filename: input.file.name,
  });
  const tradeId = input.kind === "notes" ? input.parentId : (input.tradeId ?? null);

  return withWriteLock(`attach-upload:${options.userId}:${storagePath}`, async () => {
    const uploaded = await options.client.storage.from(JOURNAL_PRIVATE_BUCKET).upload(
      storagePath,
      input.file.body,
      { contentType: input.file.type, upsert: false },
    );
    const uploadErr = queryError(uploaded);
    if (uploadErr) return { ok: false, error: uploadErr };

    const inserted = await options.client
      .from("journal_attachments")
      .insert({
        id: attachmentId,
        user_id: options.userId,
        trade_id: tradeId,
        storage_path: storagePath,
        filename: input.file.name,
        content_type: input.file.type,
        byte_size: input.file.size,
      })
      .select("*")
      .single();
    const insertErr = queryError(inserted);
    if (insertErr) {
      await options.client.storage.from(JOURNAL_PRIVATE_BUCKET).remove([storagePath]);
      return { ok: false, error: insertErr };
    }
    const row = inserted.data as AttachmentRow | null;
    if (!row?.id) {
      await options.client.storage.from(JOURNAL_PRIVATE_BUCKET).remove([storagePath]);
      return { ok: false, error: "the database did not confirm the attachment." };
    }
    return { ok: true, attachment: mapAttachment(row) };
  });
}

export async function createAttachmentSignedUrl(
  options: LiveWriteOptions,
  attachmentId: string,
): Promise<AttachmentWriteResult> {
  if (options.mode === "demo") return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(attachmentId)) return { ok: false, error: "not_found" };

  const existing = await options.client
    .from("journal_attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("user_id", options.userId)
    .maybeSingle();
  const err = queryError(existing);
  if (err) return { ok: false, error: err };
  const row = existing.data as AttachmentRow | null;
  if (!row) return { ok: false, error: "not_found" };

  const signed = await options.client.storage
    .from(JOURNAL_PRIVATE_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  const signedErr = queryError(signed);
  if (signedErr) return { ok: false, error: signedErr };
  const url = (signed.data as { signedUrl?: string } | null)?.signedUrl;
  if (!url) return { ok: false, error: "a signed URL was not issued." };
  return { ok: true, attachment: mapAttachment(row), signedUrl: url };
}

export async function deleteAttachment(
  options: LiveWriteOptions,
  attachmentId: string,
): Promise<AttachmentWriteResult> {
  if (options.mode === "demo") return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(attachmentId)) return { ok: false, error: "not_found" };

  return withWriteLock(`attach-delete:${options.userId}:${attachmentId}`, async () => {
    const existing = await options.client
      .from("journal_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("user_id", options.userId)
      .maybeSingle();
    const lookupErr = queryError(existing);
    if (lookupErr) return { ok: false, error: lookupErr };
    const row = existing.data as AttachmentRow | null;
    if (!row) return { ok: false, error: "not_found" };

    const removed = await options.client.storage.from(JOURNAL_PRIVATE_BUCKET).remove([row.storage_path]);
    const removeErr = queryError(removed);
    if (removeErr && !storageMissing(removeErr)) return { ok: false, error: removeErr };

    const deleted = await options.client
      .from("journal_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("user_id", options.userId);
    const deleteErr = queryError(deleted);
    if (deleteErr) return { ok: false, error: deleteErr };
    return { ok: true, attachment: mapAttachment(row) };
  });
}

export async function deleteAttachmentsForTrade(
  options: LiveWriteOptions,
  tradeId: string,
): Promise<{ ok: boolean; error?: string; removed: number }> {
  const listed = await listNoteAttachments(options, tradeId);
  if (!listed.ok) return { ok: false, error: listed.error, removed: 0 };
  let removed = 0;
  for (const attachment of listed.attachments) {
    const result = await deleteAttachment(options, attachment.id);
    if (!result.ok) return { ok: false, error: result.error, removed };
    removed += 1;
  }
  return { ok: true, removed };
}

export async function deleteAttachmentsForNotebookEntry(
  options: LiveWriteOptions,
  entryId: string,
): Promise<{ ok: boolean; error?: string; removed: number }> {
  const listed = await listNotebookAttachments(options, entryId);
  if (!listed.ok) return { ok: false, error: listed.error, removed: 0 };
  let removed = 0;
  for (const attachment of listed.attachments) {
    const result = await deleteAttachment(options, attachment.id);
    if (!result.ok) return { ok: false, error: result.error, removed };
    removed += 1;
  }
  return { ok: true, removed };
}
