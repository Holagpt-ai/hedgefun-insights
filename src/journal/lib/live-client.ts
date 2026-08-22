export type JournalMode = "demo" | "live" | "empty";

export interface JournalError {
  message: string;
  code?: string;
}

export interface JournalQueryResult<T = unknown> {
  data: T;
  error: JournalError | null;
  count?: number | null;
}

export interface JournalTableQuery {
  select: (cols?: string) => JournalTableQuery;
  insert: (rows: unknown) => JournalTableQuery;
  update: (rows: unknown) => JournalTableQuery;
  delete: () => JournalTableQuery;
  eq: (col: string, value: string) => JournalTableQuery;
  in: (col: string, values: string[]) => JournalTableQuery;
  is: (col: string, value: null) => JournalTableQuery;
  like: (col: string, pattern: string) => JournalTableQuery;
  order: (col: string, opts?: { ascending?: boolean }) => JournalTableQuery;
  limit: (n: number) => JournalTableQuery;
  single: () => PromiseLike<JournalQueryResult<unknown>>;
  maybeSingle: () => PromiseLike<JournalQueryResult<unknown>>;
  then: PromiseLike<JournalQueryResult<unknown>>["then"];
}

export interface JournalStorageBucket {
  upload: (
    path: string,
    file: Blob | File | ArrayBuffer | Uint8Array | string,
    opts?: { contentType?: string; upsert?: boolean },
  ) => PromiseLike<JournalQueryResult<{ path: string } | null>>;
  remove: (paths: string[]) => PromiseLike<JournalQueryResult<unknown>>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => PromiseLike<JournalQueryResult<{ signedUrl: string } | null>>;
}

export interface JournalLiveClient {
  from: (table: string) => JournalTableQuery;
  storage: {
    from: (bucket: string) => JournalStorageBucket;
  };
}

export interface LiveWriteOptions {
  mode: JournalMode;
  userId: string;
  client: JournalLiveClient;
}

export const JOURNAL_PRIVATE_BUCKET = "journal-private";
export const SIGNED_URL_TTL_SECONDS = 60;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
] as const;

export type AttachmentKind = "notes" | "notebook";

const inFlight = new Set<string>();

export function isWriteBlocked(mode: JournalMode): boolean {
  return mode === "demo";
}

export async function withWriteLock<T extends { ok: boolean; skipped?: "demo"; error?: string }>(
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  if (inFlight.has(key)) {
    return { ok: false, error: "A matching request is already in progress." } as T;
  }
  inFlight.add(key);
  try {
    return await run();
  } finally {
    inFlight.delete(key);
  }
}

export function resetWriteLocksForTests(): void {
  inFlight.clear();
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return cleaned.length > 0 ? cleaned : "file";
}

export function buildAttachmentObjectPath(params: {
  userId: string;
  kind: AttachmentKind;
  parentId: string;
  attachmentId: string;
  filename: string;
}): string {
  return [
    params.userId,
    "attachments",
    params.kind,
    params.parentId,
    `${params.attachmentId}-${sanitizeFilename(params.filename)}`,
  ].join("/");
}

export function notebookAttachmentPrefix(userId: string, entryId: string): string {
  return `${userId}/attachments/notebook/${entryId}/`;
}

export function notesAttachmentPrefix(userId: string, tradeId: string): string {
  return `${userId}/attachments/notes/${tradeId}/`;
}

export function validateAttachmentFile(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0) return "The file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) return `File is too large. Maximum size is ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`;
  const type = (file.type || "").toLowerCase();
  if (!(ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(type)) {
    return "That file type is not allowed.";
  }
  return null;
}

export function queryError(result: JournalQueryResult<unknown>): string | null {
  if (!result.error) return null;
  return result.error.message.endsWith(".") ? result.error.message : `${result.error.message}.`;
}

export function rowsOf<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data == null) return [];
  return [data as T];
}
