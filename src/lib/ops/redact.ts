/**
 * Secret redaction for any operator-visible text (errors, abort evidence,
 * remote API messages). Applied before render — never display raw strings.
 */

const REDACTED = "[redacted]";

const PATTERNS: Array<[RegExp, string]> = [
  // JWTs (Supabase anon/service-role keys, session tokens).
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  // Authorization headers.
  [/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  // GitHub tokens.
  [/\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, REDACTED],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, REDACTED],
  // Stripe-style and Supabase secret keys.
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}\b/g, REDACTED],
  [/\bsb_secret_[A-Za-z0-9_-]{8,}\b/g, REDACTED],
  // Credential-bearing query params / assignments (Polygon apiKey, etc.).
  [
    /\b(api[_-]?key|apikey|access[_-]?token|token|secret|password|service[_-]?role[_-]?key|sync[_-]?secret|radar[_-]?worker[_-]?secret)(["']?\s*[=:]\s*["']?)[^\s&"',;]+/gi,
    `$1$2${REDACTED}`,
  ],
  // Postgres connection strings.
  [/postgres(ql)?:\/\/[^\s]+/gi, `postgres://${REDACTED}`],
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const [re, replacement] of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Redact and bound a free-text value for display. */
export function safeDisplayText(value: unknown, maxLength = 400): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  const redacted = redactSecrets(text);
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
}
