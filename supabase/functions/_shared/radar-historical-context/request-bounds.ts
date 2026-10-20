export const RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS = 20;

export type ParsedHistoricalContextBody =
  | { ok: true; requests: unknown[] }
  | { ok: false; error: "invalid_body" | "batch_too_large" };

export function parseHistoricalContextRequestBody(body: unknown): ParsedHistoricalContextBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const requestsRaw = (body as Record<string, unknown>).requests;
  if (!Array.isArray(requestsRaw)) {
    return { ok: false, error: "invalid_body" };
  }
  if (requestsRaw.length > RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS) {
    return { ok: false, error: "batch_too_large" };
  }
  return { ok: true, requests: requestsRaw };
}
