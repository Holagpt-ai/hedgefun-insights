/** Model-facing rules for grounded current-catalyst answers (not market data). */

export const CURRENT_CATALYST_RESPONSE_SECTIONS =
  "Use these sections when enough verified evidence exists (omit empty sections):\n"
  + "1. PRIMARY CATALYST — verified company-specific event\n"
  + "2. KEY DETAILS — figures, guidance, contract terms, filing facts from verified catalyst rows only\n"
  + "3. WHY THE MARKET CARES — valuation/sentiment link, no invented numbers\n"
  + "4. SECONDARY CONTEXT — sector/macro/peers only after primary (or when no primary verified)\n"
  + "5. MARKET CONFIRMATION — price change, RVOL, gap, timing from CURRENT_SESSION_EVIDENCE only\n"
  + "6. CONFIDENCE / MISSING EVIDENCE — state what was not verified";

export const CURRENT_CATALYST_NO_SPECULATION =
  "Do not use speculative catalyst phrasing (could be, maybe, possibly, might be) for corporate causes "
  + "when Stocksist catalyst retrieval was attempted. If no verified primary catalyst, say clearly that "
  + "no confirmed company-specific catalyst was found in available fresh sources.";

export const CURRENT_CATALYST_VOLUME_LANGUAGE =
  "Do not infer institutional participation, institutional buying, or smart-money flow from raw share "
  + "volume alone. Acceptable: volume is elevated vs typical, indicating higher market participation or liquidity.";

export const CURRENT_CATALYST_INSTITUTIONAL_LANGUAGE =
  "Never claim or imply institutional participation, institutional buying, institutional rebalancing, "
  + "institutional accumulation, fund buying/selling, or smart-money activity from volume, price moves, "
  + "Investor Day, earnings, guidance, dividends, or ordinary market reaction alone. "
  + "Such claims require explicit verified evidence of institutional activity in the evidence packet "
  + "(e.g. named 13F/flow data, verified block trade attribution). "
  + "Forbidden examples: 'Investor Day often unlocks institutional participation'; "
  + "'classic investor-day-driven institutional rebalancing'. "
  + "Use neutral phrasing instead: market participation, elevated trading activity, investor reaction, "
  + "buying interest, market repricing.";

export const CURRENT_CATALYST_PERSONALIZATION =
  "Answer WHAT MOVED THE STOCK, WHY IT MATTERED, SECONDARY CONTEXT, and MARKET CONFIRMATION only. "
  + "Do not reference the user's sector focus, core sector, trading style, margin account, journal, "
  + "watchlist, or preferences (including ai_user_memory) unless the user explicitly asked for personalized interpretation. "
  + "Forbidden: 'aligned with your core sector focus'.";

export const CURRENT_CATALYST_FORMATTING =
  "Separate numbers from following words with a space or punctuation (e.g. '$20B revenue target', not '$20Brevenue'). "
  + "Use clear sentence breaks after dollar amounts and percentages.";

export const PROHIBITED_SPECULATIVE_CATALYST_PHRASES = [
  "could be an analyst",
  "maybe positive guidance",
  "possibly news",
  "might be",
  "there could be",
] as const;

/** Production regression phrases — must not appear without explicit institutional evidence. */
export const PROHIBITED_INSTITUTIONAL_INFERENCE_PHRASES = [
  /institutional\s+participation/i,
  /institutional\s+rebalancing/i,
  /institutional\s+(?:buying|accumulation)/i,
  /smart[-\s]?money/i,
  /fund\s+(?:buying|selling)/i,
  /unlocks\s+institutional/i,
  /investor-day-driven\s+institutional/i,
] as const;

export const PROHIBITED_CATALYST_PERSONALIZATION_PHRASES = [
  /aligned with your (?:core )?sector/i,
  /your (?:core )?sector focus/i,
  /your margin account/i,
  /your watchlist/i,
  /your trading (?:style|profile)/i,
] as const;

export function findProhibitedInstitutionalPhrases(text: string): string[] {
  return PROHIBITED_INSTITUTIONAL_INFERENCE_PHRASES.filter((p) => p.test(text)).map(String);
}

export function findProhibitedPersonalizationPhrases(text: string): string[] {
  return PROHIBITED_CATALYST_PERSONALIZATION_PHRASES.filter((p) => p.test(text)).map(String);
}
