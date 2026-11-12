import { PENNY_CONTINUATION_HANDOFF_READ_MAX_PAIRS } from "../config/penny-continuation-persistence.config.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type PennyHandoffReadPair = {
  symbol: string;
  source_session_date: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Normalize and validate candidate-scoped read pairs (fail-closed). */
export function normalizePennyHandoffReadPairs(
  input: unknown,
): PennyHandoffReadPair[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  if (input.length > PENNY_CONTINUATION_HANDOFF_READ_MAX_PAIRS) return null;

  const seen = new Set<string>();
  const out: PennyHandoffReadPair[] = [];

  for (const raw of input) {
    if (!isRecord(raw)) return null;
    if (typeof raw.symbol !== "string" || !raw.symbol.trim()) return null;
    if (
      typeof raw.source_session_date !== "string" ||
      !ISO_DATE.test(raw.source_session_date.trim())
    ) {
      return null;
    }
    const symbol = raw.symbol.trim().toUpperCase();
    const source_session_date = raw.source_session_date.trim();
    const key = `${source_session_date}:${symbol}`;
    if (seen.has(key)) return null;
    seen.add(key);
    out.push({ symbol, source_session_date });
  }

  return out.length > 0 ? out : null;
}
