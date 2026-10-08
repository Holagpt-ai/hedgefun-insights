import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import { isMovementCatalystQuestion } from "@/lib/ai-analyst/movement-question";

export type CurrentCatalystIntent = {
  isCurrentCatalyst: boolean;
  /** Alias for downstream catalyst-first packet wiring. */
  movementQuestion: boolean;
};

export function classifyCurrentCatalystIntent(question: string | null | undefined): CurrentCatalystIntent {
  const movementQuestion = isMovementCatalystQuestion(question ?? "");
  return {
    isCurrentCatalyst: movementQuestion,
    movementQuestion,
  };
}

const TICKER_TOKEN = /[A-Z]{1,5}/;

/** Ordinary words that can look like symbols. Explicit $SYM or SYM? syntax still resolves. */
const ORDINARY_MARKET_WORDS = new Set([
  "A", "AN", "THE", "IT", "IS", "ARE", "WAS", "WERE", "DID", "HAS", "HAVE", "HAD",
  "FOR", "ON", "IN", "TO", "OF", "AND", "OR", "UP", "DOWN", "WHY", "WHAT", "WHO", "HOW",
  "THIS", "THAT", "MARKET", "TODAY", "STOCK", "STOCKS", "SELL", "OFF", "CAUSE", "CAUSED",
  "MOVING", "MOVE", "ITS", "OUR", "YOUR", "FROM", "WITH", "WHEN", "WHERE", "WHICH",
]);

function normalizeExtractedTicker(raw: string): string | null {
  return normalizeHandoffSymbol(raw.trim().toUpperCase());
}

function acceptExtractedTicker(raw: string, explicit: boolean): string | null {
  const sym = normalizeExtractedTicker(raw);
  if (!sym) return null;
  if (!explicit && ORDINARY_MARKET_WORDS.has(sym)) return null;
  return sym;
}

/** Best-effort ticker from a catalyst-style question (handoff symbol wins at call site). */
export function extractTickerFromCatalystQuestion(question: string): string | null {
  const t = question.trim();
  if (!t) return null;

  const leading = t.match(/^([A-Za-z]{1,5})\?\s+/);
  if (leading) {
    const sym = acceptExtractedTicker(leading[1]!, true);
    if (sym) return sym;
  }

  const cashtag = t.match(/\$([A-Za-z]{1,5})\b/);
  if (cashtag) {
    const sym = acceptExtractedTicker(cashtag[1]!, true);
    if (sym) return sym;
  }

  const patterns: RegExp[] = [
    /\bwhy\s+(?:is|are|was|were|did|has|have)\s+([A-Za-z]{1,5})\b/i,
    /\bwhat(?:'s| is)\s+(?:the\s+)?catalyst\s+(?:for\s+)?([A-Za-z]{1,5})\b/i,
    /\bwhat(?:'s| is)\s+([A-Za-z]{1,5})\s+moving\b/i,
    /\bwhat\s+(?:is|are)\s+([A-Za-z]{1,5})\s+moving\b/i,
    /\bwhat\s+happened\s+to\s+([A-Za-z]{1,5})\b/i,
    /\b(?:moving|happening\s+with)\s+([A-Za-z]{1,5})\b/i,
    /\b([A-Za-z]{1,5})\s+(?:up|down|rally|spike|selloff|sell-off)\b/i,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match?.[1]) {
      const sym = acceptExtractedTicker(match[1], false);
      if (sym) return sym;
    }
  }

  const tokens = t.match(/\b[A-Z]{1,5}\b/g) ?? [];
  for (const token of tokens) {
    if (!TICKER_TOKEN.test(token)) continue;
    const sym = acceptExtractedTicker(token, false);
    if (sym) return sym;
  }

  return null;
}

export function resolveAnalystSymbolForQuestion(input: {
  activeSymbol: string | null | undefined;
  userQuestion: string;
}): string | null {
  const fromContext = normalizeHandoffSymbol(input.activeSymbol ?? "");
  if (fromContext) return fromContext;
  return extractTickerFromCatalystQuestion(input.userQuestion);
}
