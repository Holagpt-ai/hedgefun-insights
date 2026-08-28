import {
  AM_INDEX_SYMBOLS,
  type AmEvidenceBundle,
  type AmIndexSymbol,
} from "./am-evidence.ts";

export const AM_MODEL = "claude-haiku-4-5-20251001";
export const PM_MODEL = "claude-haiku-4-5-20251001";
export const AM_MAX_TOKENS = 900;
export const PM_MAX_TOKENS = 350;

const SHARED_GROUNDING = `
STRICT GROUNDING RULES — the ONLY data you have is a snapshot of four broad US equity ETF proxies:
- SPY (large-cap S&P 500)
- QQQ (large-cap Nasdaq 100)
- DIA (Dow 30)
- IWM (small-cap Russell 2000)

You have percent change and current value for each. Nothing else.

You MUST NOT reference or invent any of the following, because they are not in the data:
- Earnings, guidance, or company results
- News headlines, press releases, or announcements
- Catalysts, product events, or corporate actions
- Economic data, Fed events, macro releases, or geopolitical events
- Overnight developments, futures moves, or pre-open/after-hours events beyond the snapshot
- Causal explanations for moves ("because of…", "driven by…", "on the back of…")
- Individual stocks, sectors by name, or single-name commentary
- Predictions stated as facts, price targets, or forecasts
- Watchlist personalization or any user-specific claim

If the four-index snapshot is insufficient to support a conclusion, say so explicitly and stop.
Distinguish observed percent-change facts from interpretation.
Prefer lean labels (Bullish Lean, Bearish Lean, Mixed, Insufficient Data) over strong directional claims.
Do not fabricate. Do not speculate. Stay strictly within the four-ETF percent-change picture.
`.trim();

/** PM V1 prompt — keep identical to the pre-V2 generator. */
export const PM_SYSTEM = `You are a market analyst writing a post-close recap for active traders.
${SHARED_GROUNDING}

Allowed scope for the PM brief:
- Broad session direction implied by the four ETF proxies
- Relative index performance among SPY, QQQ, DIA, IWM
- Large-cap vs small-cap participation (SPY/QQQ/DIA vs IWM)
- Strongest and weakest of the four proxies

Style: professional, concise, 3–4 sentences, no preamble. Reference the tickers by symbol. Never invent facts.`;

export const AM_V2_SYSTEM = `You are a market analyst writing a shared pre-open intelligence brief for active traders.

You may use ONLY the evidence explicitly supplied in the user message. Deterministic code already decided which facts qualify. You summarize and rank those facts. You do not invent new ones.

STRICT RULES:
- Distinguish FACT from INTERPRETATION. Label interpretation as interpretation.
- Do not invent reasons, causality, or "because" explanations that are not in the evidence.
- No price targets. No predictions stated as facts. No "this stock will move".
- No fabricated tickers, headlines, catalysts, or earnings.
- No watchlist personalization. This brief is generic/shared.
- No volume leaders or pre-market movers. Those sources are not in this evidence bundle.
- If a section has no evidence in the user message, OMIT that section entirely. Do not fill empty space with generic commentary.
- Do not mention missing sections.

Suggested structure (omit any section whose evidence is absent):
### Market Bias
1–2 bullets based on SPY / QQQ / DIA / IWM facts.

### Overnight / Macro
Top relevant verified headlines only.

### Catalysts to Watch
Up to 3 genuine ticker-specific catalysts.

### Before-Open Earnings
Important confirmed events if available.

### Into the Open
2–3 evidence-grounded items traders should monitor, using only the supplied facts.

Style: concise, trader-focused, no preamble.`.trim();

function fmtIndexLine(
  sym: AmIndexSymbol,
  row: { current_value: number; change_percent: number },
): string {
  const sign = row.change_percent > 0 ? "+" : "";
  return `${sym} ${row.current_value.toFixed(2)} (${sign}${row.change_percent.toFixed(2)}%)`;
}

export function buildPmUserPrompt(
  symbols: Record<string, { current_value: number; change_percent: number }>,
): string {
  const marketContext = AM_INDEX_SYMBOLS
    .map((s) => {
      const r = symbols[s];
      const sign = r.change_percent > 0 ? "+" : "";
      return `${s} ${r.current_value.toFixed(2)} (${sign}${r.change_percent.toFixed(2)}%)`;
    })
    .join(", ");
  return (
    `Four-ETF snapshot (post-close): ${marketContext}. ` +
    `Write a strictly grounded PM brief using ONLY this data.`
  );
}

export function buildAmUserPrompt(bundle: AmEvidenceBundle): string {
  const parts: string[] = [];
  parts.push("AM Intelligence evidence (use ONLY what is listed; omit empty sections):");
  parts.push("");
  parts.push("INDEXES (required):");
  for (const sym of AM_INDEX_SYMBOLS) {
    const row = bundle.indexes[sym];
    parts.push(`- ${fmtIndexLine(sym, row)} updated_at=${row.updated_at}`);
  }

  if (bundle.headlines.length > 0) {
    parts.push("");
    parts.push("VERIFIED HEADLINES (ranked, bounded):");
    for (const h of bundle.headlines) {
      const src = h.source ? ` source=${h.source}` : "";
      parts.push(`- [${h.id}] ${h.headline}${src} published_at=${h.published_at}`);
    }
  }

  if (bundle.catalysts.length > 0) {
    parts.push("");
    parts.push("DIRECT CATALYSTS (bounded, ticker-specific):");
    for (const c of bundle.catalysts) {
      parts.push(
        `- [${c.id}] ${c.symbol}: ${c.title} event_date=${c.event_date} type=${c.event_type}`,
      );
    }
  }

  if (bundle.earnings.length > 0) {
    parts.push("");
    parts.push("BEFORE-OPEN EARNINGS (confirmed calendar, today ET):");
    for (const e of bundle.earnings) {
      parts.push(`- [${e.id}] ${e.symbol}: ${e.title} event_date=${e.event_date} ${e.time_of_day}`);
    }
  }

  parts.push("");
  parts.push(
    "Write the AM brief. Omit any suggested section that has no evidence above. Do not invent volume leaders or pre-market movers.",
  );
  return parts.join("\n");
}

export function amPromptIncludesSection(prompt: string, heading: string): boolean {
  return prompt.includes(heading);
}
