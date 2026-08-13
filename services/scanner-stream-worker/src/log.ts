export type LogLevel = "info" | "warn" | "error";

const REDACT_SUBSTR = /apiKey|Bearer|service_role|POLYGON|SUPABASE_SERVICE/i;
const APIKEY_QUERY_RE = /apiKey=[^&\s"'`]+/gi;
const BEARER_RE = /Bearer\s+\S+/gi;

function sanitizeString(value: string): string {
  const stripped = value
    .replace(APIKEY_QUERY_RE, "apiKey=***")
    .replace(BEARER_RE, "Bearer ***");
  if (REDACT_SUBSTR.test(stripped)) return "[redacted]";
  return stripped;
}

export function sanitizeLogValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (
    typeof value === "number" || typeof value === "boolean" || value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizeLogValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (REDACT_SUBSTR.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeLogValue(nested);
      }
    }
    return out;
  }
  return undefined;
}

export function log(
  level: LogLevel,
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: sanitizeString(msg),
    ...(sanitizeLogValue(fields) as Record<string, unknown>),
  };
  console.log(JSON.stringify(line));
}
