/**
 * Market-attention / commentary headline detection.
 * Shared by attribution (recent-news gate) and catalyst precedence — no attribution or relevance imports.
 */

export const MARKET_ATTENTION_TITLE: RegExp[] = [
  /\bbull\s+of\s+the\s+day\b/i,
  /\bbear\s+of\s+the\s+day\b/i,
  /\bfeatured\s+highlights\b/i,
  /\b(?:top|best)\s+stocks?\s+to\s+(?:buy|watch|own)\b/i,
  /\bstock\s+picks?\b/i,
  /\btop\s+picks?\b/i,
  /\bwhich\s+(?:stock|is)\b/i,
  /\bvs\.?\b/i,
  /\broundup\b/i,
  /\blisticle\b/i,
  /\bstocks?\s+to\s+(?:watch|buy|avoid)\b/i,
  /\banalyst\s+commentary\b/i,
  /\b(?:buy|sell|hold)\s+recommendation\b/i,
  /\b(?:is|are)\s+.{0,80}\bstill\s+a\s+buy\b/i,
  /\bstill\s+a\s+buy\s*\??\s*$/i,
  /\bworth\s+(?:buying|a\s+buy)\b/i,
  /\bshould\s+you\s+(?:buy|sell|hold)\b/i,
  /\bbuy[, ]\s*hold[, ]\s*(?:or\s+)?sell\b/i,
  /\b(?:better|worse)\s+(?:stock|pick|buy)\b/i,
  /\b(?:momentum|value|growth)\s+stock\s+pick\b/i,
  /\b(?:wall\s+street|analyst)\s+(?:says|sees|expects)\b/i,
  /\bwhy\s+.{0,60}\b(?:jumped|rose|rallied|fell|sold\s+off|moving|volatile)\b/i,
  /\bearnings\s+beat\s+hopes\b/i,
  /\bstock\s+is\s+moving\b/i,
];

export const EVENT_TYPE_SECONDARY = new Set(["analyst_action", "legal", "market_attention"]);

export const EXPLICIT_ANALYST_HEADLINE =
  /\b(?:upgrade[sd]?|downgrade[sd]?|initiat(?:es|ed)|raise[sd]?|lower[sd]?|cut[s]?)\b.{0,40}\b(?:price\s+target|pt|rating|to\s+(?:buy|sell|hold|overweight|underweight|neutral))\b/i;

export function looksLikeMarketAttention(title: string, eventType?: string): boolean {
  if (eventType === "analyst_action" && EXPLICIT_ANALYST_HEADLINE.test(title)) return false;
  if (eventType && EVENT_TYPE_SECONDARY.has(eventType)) return true;
  return MARKET_ATTENTION_TITLE.some((p) => p.test(title));
}
