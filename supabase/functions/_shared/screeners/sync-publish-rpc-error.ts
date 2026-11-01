/** Map PostgREST / Postgres transport errors from staged publish RPC calls. */

export type PublishRpcTransportError = {
  message?: string;
  code?: string;
  details?: string;
};

const PUBLISH_REASON_TOKEN_RE = /^[a-z0-9_]{1,80}$/;

export function slugifyPublishFailureMessage(message: string): string | null {
  const line = message.trim().split("\n")[0]?.trim() ?? "";
  if (!line || !/^[a-zA-Z0-9 _]+$/.test(line)) return null;
  const slug = line
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug || slug.length > 80 || !PUBLISH_REASON_TOKEN_RE.test(slug)) {
    return null;
  }
  return slug;
}

/**
 * When publish_screener_sync_staged_generation_v1 aborts at the PostgREST layer,
 * preserve a bounded reason token for job diagnostics (no free-form SQL text).
 */
export function formatStagedPublishRpcTransportFailure(
  error: PublishRpcTransportError | null | undefined,
): string {
  if (!error) return "staged_publish_failed";
  const codeRaw = typeof error.code === "string" ? error.code.trim() : "";
  const fromMessage = slugifyPublishFailureMessage(
    error.details ?? error.message ?? "",
  );
  if (fromMessage) return fromMessage;
  if (/^[0-9A-Z]{5}$/i.test(codeRaw)) {
    return codeRaw.toLowerCase();
  }
  const code = codeRaw.toLowerCase();
  if (code && PUBLISH_REASON_TOKEN_RE.test(code.replace(/[^a-z0-9_]/g, "_"))) {
    return code.replace(/[^a-z0-9_]/g, "_").slice(0, 80);
  }
  return "staged_publish_failed";
}
