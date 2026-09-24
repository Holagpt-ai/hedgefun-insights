/**
 * Sanitized Anthropic HTTP error helpers.
 * Never log API keys, prompts, or raw provider bodies.
 */

const MAX_TYPE_LEN = 80;
const MAX_MESSAGE_LEN = 160;

export function parseAnthropicErrorType(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const rec = body as Record<string, unknown>;
  const nested = rec.error;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const t = (nested as Record<string, unknown>).type;
    if (typeof t === "string") return sanitizeErrorType(t);
  }
  const top = rec.type;
  if (typeof top === "string" && top !== "error") return sanitizeErrorType(top);
  return null;
}

export function sanitizeAnthropicErrorType(raw: unknown): string | null {
  return typeof raw === "string" ? sanitizeErrorType(raw) : null;
}

function sanitizeErrorType(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > MAX_TYPE_LEN) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(t)) return null;
  return t;
}

export interface AnthropicErrorDetail {
  type: string | null;
  message: string | null;
}

function nestedErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const nested = (body as Record<string, unknown>).error;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return null;
  const message = (nested as Record<string, unknown>).message;
  return typeof message === "string" ? message : null;
}

/** Keep a short printable message. Drop keys, URLs, and non-ASCII so logs stay safe. */
export function sanitizeAnthropicErrorMessage(raw: string): string | null {
  let s = raw
    .replace(/sk-ant-[A-Za-z0-9_-]+/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  if (s.length > MAX_MESSAGE_LEN) s = s.slice(0, MAX_MESSAGE_LEN).trim();
  if (!s || /sk-ant/i.test(s)) return null;
  return s;
}

export function parseAnthropicErrorDetail(body: unknown): AnthropicErrorDetail {
  return {
    type: parseAnthropicErrorType(body),
    message: sanitizeAnthropicErrorMessage(nestedErrorMessage(body) ?? ""),
  };
}

/** Read a non-2xx Anthropic body only to extract a safe error type, then drop it. */
export async function readAnthropicErrorType(res: Response): Promise<string | null> {
  const detail = await readAnthropicErrorDetail(res);
  return detail.type;
}

/** Read a non-2xx body for type plus a sanitized message. The raw body is not returned. */
export async function readAnthropicErrorDetail(res: Response): Promise<AnthropicErrorDetail> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return { type: null, message: null };
  }
  if (!text) return { type: null, message: null };
  try {
    return parseAnthropicErrorDetail(JSON.parse(text));
  } catch {
    return { type: null, message: null };
  }
}

export function formatAnthropicHttpErrorLog(fields: {
  http_status: number;
  anthropic_error_type: string | null;
  elapsed_ms: number;
  stage?: string;
}): string {
  return JSON.stringify({
    event: "anthropic_http_error",
    stage: fields.stage ?? "chat",
    http_status: fields.http_status,
    anthropic_error_type: fields.anthropic_error_type,
    elapsed_ms: fields.elapsed_ms,
  });
}
