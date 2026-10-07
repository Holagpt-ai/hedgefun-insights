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
  + "volume alone. Acceptable: volume is elevated vs typical, indicating higher participation/liquidity. "
  + "Only mention institutional activity if explicit verified evidence supports it.";

export const CURRENT_CATALYST_PERSONALIZATION =
  "Answer the catalyst question first. Do not discuss the user's margin account, journal trades, "
  + "watchlist preferences, or entry recommendations unless the user explicitly asked.";

export const PROHIBITED_SPECULATIVE_CATALYST_PHRASES = [
  "could be an analyst",
  "maybe positive guidance",
  "possibly news",
  "might be",
  "there could be",
] as const;
