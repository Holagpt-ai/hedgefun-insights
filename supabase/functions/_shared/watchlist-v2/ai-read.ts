// AI read helper. Deterministic prompt, Claude Haiku call, strict output
// validation against a supplied evidence catalog. Never accepts extra keys,
// never silently repairs invalid output, never filters unknown IDs.

import type { Direction, KeyLevels, MarketSignal, RecentEvent } from "./contract.ts";
import { containsForbiddenKey } from "./contract.ts";
import { sanitize } from "./sanitize.ts";

export interface EvidenceCatalog {
  /** Full set of allowed driver_ids, each carrying its stable prefix. */
  ids: Set<string>;
}

export interface AiReadInput {
  ticker: string;
  session_type: string;
  session_date: string;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  rvol: number | null;
  rvol_class: string | null;
  key_levels: KeyLevels | Record<string, unknown>;
  market_signals: MarketSignal[];
  recent_events: RecentEvent[];
  reason_codes: string[];
}

export interface AiReadResult {
  direction: Direction;
  explanation: string;
  driver_ids: string[];
}

export type AiReadOutcome =
  | { kind: "ok"; value: AiReadResult }
  | { kind: "transport_failure"; code: "RATE_LIMITED" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR" }
  | { kind: "validation_failed"; reason: string };

export interface AiCaller {
  call(prompt: string, catalog: EvidenceCatalog): Promise<AiReadOutcome>;
}

const DIRECTIONS: Direction[] = ["bullish", "bearish", "neutral"];
const MAX_EXPLANATION = 240;
const MIN_DRIVERS = 1;
const MAX_DRIVERS = 6;
const ALLOWED_TOP_KEYS = new Set(["direction", "explanation", "driver_ids"]);

/** Stable evidence prefixes. */
export const EVIDENCE_PREFIXES = {
  signal: "signal:",
  event: "event:",
  level: "level:",
  metric: "metric:",
} as const;

/** Build the complete catalog of allowed driver IDs. */
export function buildEvidenceCatalog(input: {
  market_signals: MarketSignal[];
  recent_events: RecentEvent[];
  key_levels: KeyLevels | Record<string, unknown> | null;
  metrics: string[];
}): EvidenceCatalog {
  const ids = new Set<string>();
  for (const s of input.market_signals) ids.add(`${EVIDENCE_PREFIXES.signal}${s.signal_id}`);
  for (const e of input.recent_events) ids.add(`${EVIDENCE_PREFIXES.event}${e.event_id}`);
  if (input.key_levels && typeof input.key_levels === "object") {
    for (const [k, v] of Object.entries(input.key_levels as Record<string, unknown>)) {
      if (k === "basis") continue;
      if (v !== null && v !== undefined) ids.add(`${EVIDENCE_PREFIXES.level}${k}`);
    }
  }
  for (const m of input.metrics) ids.add(`${EVIDENCE_PREFIXES.metric}${m}`);
  return { ids };
}

/** Build the prompt. Catalog IDs are embedded so the model may use only these. */
export function buildAiPrompt(input: AiReadInput, catalog: EvidenceCatalog): string {
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
      id: `${EVIDENCE_PREFIXES.signal}${s.signal_id}`, label: s.label,
      direction: s.direction, facts: s.facts,
    })),
    recent_events: input.recent_events.map((e) => ({
      id: `${EVIDENCE_PREFIXES.event}${e.event_id}`, title: e.title,
      source: e.source_name, event_time: e.event_time,
    })),
    reason_codes: input.reason_codes,
    allowed_driver_ids: [...catalog.ids],
  };

  return `You are Stocksist Watchlist V2. Read the deterministic market facts below and produce a single JSON object.
RULES:
- Return JSON only. No markdown, no prose outside JSON.
- NEVER invent numbers.
- NEVER produce a score, confidence, weight, ranking, tier, or band. Any output containing such keys anywhere is invalid.
- Return ONLY these top-level keys: "direction", "explanation", "driver_ids". Any extra key invalidates the output.
- direction must be exactly one of: "bullish", "bearish", "neutral". "data_unavailable" is not permitted.
- explanation is 1-2 short sentences, at most ${MAX_EXPLANATION} characters, plain English.
- driver_ids MUST contain between ${MIN_DRIVERS} and ${MAX_DRIVERS} unique IDs, each taken verbatim from allowed_driver_ids. Do not invent IDs.

FACTS:
${JSON.stringify(facts)}

Return exactly:
{"direction": "bullish"|"bearish"|"neutral", "explanation": "...", "driver_ids": ["...", "..."]}`;
}

export function validateAiOutput(rawText: string, catalog: EvidenceCatalog): AiReadOutcome {
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
  // Reject extra top-level keys
  for (const k of Object.keys(p)) {
    if (!ALLOWED_TOP_KEYS.has(k)) return { kind: "validation_failed", reason: "extra_key" };
  }
  if (!DIRECTIONS.includes(p.direction as Direction)) {
    return { kind: "validation_failed", reason: "bad_direction" };
  }
  if (typeof p.explanation !== "string") {
    return { kind: "validation_failed", reason: "bad_explanation" };
  }
  const explanation = (p.explanation as string).trim();
  if (explanation.length === 0 || explanation.length > MAX_EXPLANATION) {
    return { kind: "validation_failed", reason: "bad_explanation" };
  }
  if (!Array.isArray(p.driver_ids) || !p.driver_ids.every((x) => typeof x === "string")) {
    return { kind: "validation_failed", reason: "bad_driver_ids_type" };
  }
  const drivers = p.driver_ids as string[];
  if (drivers.length < MIN_DRIVERS || drivers.length > MAX_DRIVERS) {
    return { kind: "validation_failed", reason: "bad_driver_ids_count" };
  }
  const seen = new Set<string>();
  for (const id of drivers) {
    if (seen.has(id)) return { kind: "validation_failed", reason: "duplicate_driver_id" };
    seen.add(id);
    if (!catalog.ids.has(id)) return { kind: "validation_failed", reason: "unknown_driver_id" };
  }
  // Recursive forbidden key scan
  if (containsForbiddenKey(parsed)) return { kind: "validation_failed", reason: "forbidden_key" };
  return {
    kind: "ok",
    value: { direction: p.direction as Direction, explanation, driver_ids: drivers },
  };
}

export function makeAnthropicCaller(apiKey: string): AiCaller {
  return {
    async call(prompt: string, catalog: EvidenceCatalog): Promise<AiReadOutcome> {
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
      return validateAiOutput(rawText, catalog);
    },
  };
}
