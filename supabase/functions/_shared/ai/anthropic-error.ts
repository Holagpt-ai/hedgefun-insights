/**
 * Sanitized Anthropic HTTP error helpers.
 * Never log API keys, prompts, or raw provider bodies.
 */

const MAX_TYPE_LEN = 80;

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

function sanitizeErrorType(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > MAX_TYPE_LEN) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(t)) return null;
  return t;
}

/** Read a non-2xx Anthropic body only to extract a safe error type, then drop it. */
export async function readAnthropicErrorType(res: Response): Promise<string | null> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return parseAnthropicErrorType(JSON.parse(text));
  } catch {
    return null;
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
