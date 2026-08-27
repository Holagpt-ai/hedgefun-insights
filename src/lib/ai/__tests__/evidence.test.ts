import { describe, it, expect } from "vitest";
import {
  AI_EVIDENCE_RULES,
  buildAiEvidence,
  evidenceForPrompt,
  hasRawMarkdownHeading,
  isInsufficientEvidence,
  leanLabel,
  stripMarkdownMarkers,
  summarizeBrief,
} from "@/lib/ai/evidence";
import { NO_VERIFIED_CATALYST } from "@/lib/catalyst/attribution";
import { USER_SNAPSHOT_UNAVAILABLE, validateQuote } from "@/lib/quotes/integrity";

const CUTOFF = "2026-08-27T08:00:00.000Z";

const validQuote = validateQuote({
  symbol: "AAPL",
  price: 189.4,
  lastTradePrice: 189.4,
  dayClose: 189.2,
  changePct: 1.1,
  volume: 8_000_000,
  quoteTimestamp: CUTOFF,
});

describe("evidence-bound AI", () => {
  it("never puts an invalid snapshot into the prompt payload", () => {
    const bad = validateQuote({
      symbol: "MU",
      price: 977,
      lastTradePrice: 97.7,
      dayClose: 977,
      quoteTimestamp: CUTOFF,
    });
    const evidence = buildAiEvidence({ symbol: "MU", quote: bad, evidenceCutoff: CUTOFF });
    const prompt = evidenceForPrompt(evidence);
    expect(evidence.quote_valid).toBe(false);
    expect(prompt.price).toBe("unavailable");
    expect(prompt.volume).toBe("unavailable");
    expect(JSON.stringify(prompt)).not.toContain("977");
  });

  it("represents missing RVOL as unavailable, never zero", () => {
    const evidence = buildAiEvidence({
      symbol: "AAPL",
      quote: validQuote,
      rvol: null,
      rvolAvailable: false,
      evidenceCutoff: CUTOFF,
    });
    expect(evidence.rvol_available).toBe(false);
    expect(evidence.rvol).toBeNull();
    expect(evidenceForPrompt(evidence).rvol).toBe("unavailable");
    expect(evidenceForPrompt(evidence).rvol).not.toBe(0);
  });

  it("discloses when no verified ticker-specific catalyst exists", () => {
    const evidence = buildAiEvidence({
      symbol: "TSLA",
      quote: validQuote,
      catalysts: [
        {
          title: "Nvidia unveils new chip",
          attribution: "unverified",
          ticker_specific: false,
          source_url: "https://example.com/n",
          provider: "polygon",
          published_at: CUTOFF,
          reason: "mentioned_among_other_provider_tickers",
        },
      ],
      evidenceCutoff: CUTOFF,
    });
    expect(evidence.no_verified_catalyst).toBe(true);
    expect(evidence.catalysts).toHaveLength(0);
    expect(evidenceForPrompt(evidence).catalyst_disclosure).toBe(NO_VERIFIED_CATALYST);
  });

  it("does not let a single VWAP signal create a high-confidence conclusion", () => {
    const evidence = buildAiEvidence({
      symbol: "AAPL",
      quote: validQuote,
      signals: [{ signal_id: "price_below_vwap", label: "Price below VWAP", direction: "bearish" }],
      evidenceCutoff: CUTOFF,
    });
    expect(isInsufficientEvidence(evidence)).toBe(true);
    expect(leanLabel("bullish")).toBe("Bullish Lean");
    expect(leanLabel("bearish")).toBe("Bearish Lean");
    expect(leanLabel("neutral")).toBe("Mixed");
    expect(leanLabel("data_unavailable")).toBe("Insufficient Data");
    expect(AI_EVIDENCE_RULES).toMatch(/single VWAP signal/i);
  });

  it("strips raw markdown headings and emphasis so they are not displayed", () => {
    const raw = "**PRE-OPEN BRIEF**\n## Bias\nMarkets were mixed.";
    expect(hasRawMarkdownHeading(raw)).toBe(true);
    const cleaned = stripMarkdownMarkers(raw);
    expect(cleaned).not.toContain("**");
    expect(cleaned).not.toContain("##");
    expect(cleaned).toContain("PRE-OPEN BRIEF");
    expect(cleaned).toContain("Bias");
  });

  it("keeps the original brief while exposing a concise summary", () => {
    const full = "SPY slipped 0.3%. QQQ lagged. IWM held up. DIA was mixed into the bell.";
    const summary = summarizeBrief(full, 2, 320);
    expect(summary).toContain("SPY slipped 0.3%.");
    expect(summary.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
    expect(full).toContain("IWM held up");
  });

  it("carries the exact evidence cutoff", () => {
    const evidence = buildAiEvidence({
      symbol: "AAPL",
      quote: validQuote,
      evidenceCutoff: CUTOFF,
    });
    expect(evidence.evidence_cutoff).toBe(CUTOFF);
    expect(evidenceForPrompt(evidence).evidence_cutoff).toBe(CUTOFF);
  });

  it("maps invalid quotes to the user-facing snapshot copy", () => {
    expect(USER_SNAPSHOT_UNAVAILABLE).toBe("Current market snapshot unavailable");
  });
});
