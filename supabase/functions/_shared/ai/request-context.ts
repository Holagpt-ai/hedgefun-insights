const REQUEST_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export function createAiRequestId(): string {
  return crypto.randomUUID();
}

/** Optional client-supplied correlation id (bounded, no secrets). */
export function readClientRequestId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>).request_id
    ?? (body as Record<string, unknown>).requestId;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!REQUEST_ID_RE.test(trimmed)) return null;
  return trimmed;
}

export function resolveAiRequestId(body: unknown): string {
  return readClientRequestId(body) ?? createAiRequestId();
}
