// Sanitization + logging prefix for Watchlist V2. Never emits secrets, user IDs,
// raw provider bodies, prompts, model output or database error text.

export const LOG_PREFIX = "[wl-v2]";

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const APIKEY_RE = /apiKey=[^&\s"'`]+/gi;
const TOKEN_RE = /token=[^&\s"'`]+/gi;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const XAPIKEY_HDR_RE = /x-api-key[^\n]*/gi;
const POLYGON_URL_RE = /https?:\/\/api\.polygon\.io[^\s"'`]*/gi;
const FINNHUB_URL_RE = /https?:\/\/finnhub\.io[^\s"'`]*/gi;
const ANTHROPIC_URL_RE = /https?:\/\/api\.anthropic\.com[^\s"'`]*/gi;

const MAX = 200;

export function sanitize(input: unknown): string {
  let s: string;
  if (input == null) s = "";
  else if (typeof input === "string") s = input;
  else if (input instanceof Error) s = input.message ?? String(input);
  else {
    try {
      s = JSON.stringify(input);
    } catch {
      s = String(input);
    }
  }
  s = s
    .replace(APIKEY_RE, "apiKey=***")
    .replace(TOKEN_RE, "token=***")
    .replace(BEARER_RE, "Bearer ***")
    .replace(XAPIKEY_HDR_RE, "x-api-key: ***")
    .replace(POLYGON_URL_RE, "https://api.polygon.io/***")
    .replace(FINNHUB_URL_RE, "https://finnhub.io/***")
    .replace(ANTHROPIC_URL_RE, "https://api.anthropic.com/***")
    .replace(UUID_RE, "***-uuid-***");
  if (s.length > MAX) s = s.slice(0, MAX);
  return s;
}
