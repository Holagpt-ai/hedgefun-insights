// AI read helper: builds the deterministic prompt, calls Anthropic Haiku,
// and validates the strict JSON output. No scores. No confidence. No numbers invented.

import type { Direction, MarketSignal, RecentEvent } from "./contract.ts";
import { sanitize } from "./sanitize.ts";

export interface AiReadInput {
  ticker: string;
  session_type: string;
  session_date: string;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  rvol: number | null;
  rvol_class: string | null;
  key_levels: unknown;
  market_signals: MarketSignal[];
  recent_events: RecentEvent[];
  reason_codes: string[];
}

export interface AiReadResult {
  direction: Direction;
  explanation: string;
  driver_ids: string[];
}

const DIRECTIONS: Direction[] = ["bullish", "bearish", "neutral", "data_unavailable"];

function buildPrompt(input: AiReadInput): string {
  const facts = {
    ticker: input.ticker,
    session_type: input.session_type,
    session_date: input.session_date,
    price: input.price,
    change_pct: input.change_pct,
    volume: input.volume,
    rvol: input.rvol,
    rvol_class: input.rvol_class,
    key_levels: input.key_levels,
    market_signals: input.market_signals.map((s) => ({
      id: s.signal_id, label: s.label, direction: s.direction, facts: s.facts,
    })),
    recent_events: input.recent_events.map((e) => ({
      id: e.event_id, title: e.title, source: e.source_name, event_time: e.event_time,
    })),
    reason_codes: input.reason_codes,
  };

  return `You are Stocksist Watchlist V2. Read the deterministic market facts below and produce a single JSON object. RULES:
- Return JSON only. No markdown, no prose outside JSON.
- NEVER invent numbers. Every claim must reference a signal_id from market_signals or an event_id from recent_events.
- NEVER produce a score, confidence, weight, or ranking. Return only a categorical direction.
- If facts are insufficient to justify a directional read, return direction "neutral" with a short cautious explanation.
- driver_ids MUST be a subset of the provided signal_id and event_id values.
- explanation MUST be one to two short sentences, plain English, no jargon numbers other than those in facts.

FACTS:
${JSON.stringify(facts)}

Return exactly:
{
  "direction": "bullish" | "bearish" | "neutral",
  "explanation": string,
  "driver_ids": string[]
}`;
}

export type AiReadOutcome =
  | { kind: "ok"; value: AiReadResult }
  | { kind: "transport_failure"; code: "RATE_LIMITED" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR" }
  | { kind: "validation_failed"; reason: string };

export interface AiCaller {
  call(prompt: string): Promise<AiReadOutcome>;
}

export function makeAnthropicCaller(apiKey: string): AiCaller {
  return {
    async call(prompt: string): Promise<AiReadOutcome> {
      let res: Response;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        console.warn("[wl-v2] anthropic transport error:", sanitize(e));
        return { kind: "transport_failure", code: "PROVIDER_TIMEOUT" };
      }
      if (res.status === 429) {
        try { await res.body?.cancel(); } catch { /* noop */ }
        return { kind: "transport_failure", code: "RATE_LIMITED" };
      }
      if (!res.ok) {
        try { await res.body?.cancel(); } catch { /* noop */ }
        return { kind: "transport_failure", code: "PROVIDER_ERROR" };
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { kind: "transport_failure", code: "PROVIDER_ERROR" };
      }
      const b = body as { content?: Array<{ text?: unknown }> } | null;
      const rawText = b?.content?.[0]?.text;
      if (typeof rawText !== "string") return { kind: "validation_failed", reason: "no_text" };
      return validateAiOutput(rawText);
    },
  };
}

export function validateAiOutput(rawText: string): AiReadOutcome {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { kind: "validation_failed", reason: "unparseable_json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "validation_failed", reason: "not_object" };
  }
  const p = parsed as Record<string, unknown>;
  if (!DIRECTIONS.includes(p.direction as Direction) || p.direction === "data_unavailable") {
    return { kind: "validation_failed", reason: "bad_direction" };
  }
  if (typeof p.explanation !== "string" || p.explanation.trim().length === 0 || p.explanation.length > 400) {
    return { kind: "validation_failed", reason: "bad_explanation" };
  }
  if (!Array.isArray(p.driver_ids) || !p.driver_ids.every((x) => typeof x === "string")) {
    return { kind: "validation_failed", reason: "bad_driver_ids" };
  }
  return {
    kind: "ok",
    value: {
      direction: p.direction as Direction,
      explanation: p.explanation.trim(),
      driver_ids: p.driver_ids as string[],
    },
  };
}

export function buildAiPrompt(input: AiReadInput): string {
  return buildPrompt(input);
}
