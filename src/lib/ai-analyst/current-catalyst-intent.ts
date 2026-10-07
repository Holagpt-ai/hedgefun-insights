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

function normalizeExtractedTicker(raw: string): string | null {
  return normalizeHandoffSymbol(raw.trim().toUpperCase());
}

/** Best-effort ticker from a catalyst-style question (handoff symbol wins at call site). */
export function extractTickerFromCatalystQuestion(question: string): string | null {
  const t = question.trim();
  if (!t) return null;

  const leading = t.match(/^([A-Za-z]{1,5})\?\s+/);
  if (leading) {
    const sym = normalizeExtractedTicker(leading[1]!);
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
      const sym = normalizeExtractedTicker(match[1]);
      if (sym) return sym;
    }
  }

  const tokens = t.match(/\b[A-Z]{1,5}\b/g) ?? [];
  for (const token of tokens) {
    if (!TICKER_TOKEN.test(token)) continue;
    const sym = normalizeExtractedTicker(token);
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
