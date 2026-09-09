// Evidence / source traceability. Provider facts stay tagged provider_fact.
// V1 never emits ai_interpretation items.

import { sanitizeFacts } from "../catalyst/sanitize.ts";
import type { ClassificationResult } from "./classify.ts";
import type {
  EvidenceItem,
  EvidenceTrail,
  FactState,
  NormalizedCatalystInput,
  ScoreBreakdown,
} from "./types.ts";

export function parseIsoOrNull(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function evidenceAsOfIso(input: NormalizedCatalystInput): string | null {
  return parseIsoOrNull(input.published_at) ??
    parseIsoOrNull(input.event_time) ??
    parseIsoOrNull(input.created_at);
}

export function marketContextAsOfIso(input: NormalizedCatalystInput): string | null {
  return parseIsoOrNull(input.facts?.market_context_as_of);
}

const SEC_FACT_KEYS = [
  "source_kind",
  "form_type",
  "cik",
  "accession_number",
  "filing_date",
  "accepted_at",
  "report_date",
  "primary_document",
  "sec_items",
  "exchange",
] as const;

function scalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    if (t === "number" && !Number.isFinite(value as number)) return null;
    return value as string | number | boolean;
  }
  if (Array.isArray(value)) {
    return value.filter((x) => typeof x === "string").join(", ") || null;
  }
  return null;
}

export function buildEvidenceTrail(
  input: NormalizedCatalystInput,
  classified: ClassificationResult,
  scores: ScoreBreakdown,
): EvidenceTrail {
  const facts = sanitizeFacts(input.facts ?? {});
  const items: EvidenceItem[] = [];
  const isSec = input.provider === "sec_edgar" || input.event_type === "sec_filing_news";
  const providerFactState: FactState = isSec || input.provider === "earnings_calendar"
    ? "provider_fact"
    : "derived";

  if (isSec) {
    for (const key of SEC_FACT_KEYS) {
      if (!(key in facts) && input.facts && key in input.facts) {
        const v = scalar(input.facts[key]);
        items.push({
          field: key,
          value: v,
          fact_state: "provider_fact",
          source_url: input.source_url ?? null,
        });
      } else if (key in facts) {
        items.push({
          field: key,
          value: scalar(facts[key]),
          fact_state: "provider_fact",
          source_url: input.source_url ?? null,
        });
      }
    }
  } else {
    for (const [field, value] of Object.entries(facts)) {
      items.push({
        field,
        value: scalar(value),
        fact_state: field.startsWith("attribution_") ? "derived" : providerFactState,
        source_url: input.source_url ?? null,
      });
    }
    if (classified.fact_state === "provider_fact") {
      items.push({
        field: "title",
        value: input.title,
        fact_state: "provider_fact",
        source_url: input.source_url ?? null,
      });
    }
  }

  items.push({
    field: "classification",
    value: classified.classification,
    fact_state: "derived",
    source_url: null,
  });
  items.push({
    field: "direction",
    value: classified.direction,
    fact_state: "derived",
    source_url: null,
  });
  items.push({
    field: "catalyst_score",
    value: scores.catalyst_score,
    fact_state: "derived",
    source_url: null,
  });

  const evidenceAsOf = evidenceAsOfIso(input);
  const marketContextAsOf = marketContextAsOfIso(input);

  return {
    source_event_id: input.id ?? null,
    source_dedupe_key: input.dedupe_key,
    provider: input.provider,
    source_name: input.source_name,
    source_url: input.source_url ?? null,
    event_type: input.event_type,
    attribution_class: classified.attribution_class,
    ticker_specific: classified.ticker_specific,
    classification_reasons: [...classified.reasons],
    score_breakdown: scores,
    items,
    evidence_as_of: evidenceAsOf,
    market_context_as_of: marketContextAsOf,
  };
}

export function evidenceHasAiInterpretation(trail: EvidenceTrail): boolean {
  return trail.items.some((i) => i.fact_state === "ai_interpretation");
}

export function secProviderFactsIntact(
  trail: EvidenceTrail,
  input: NormalizedCatalystInput,
): boolean {
  if (input.provider !== "sec_edgar") return true;
  const facts = input.facts ?? {};
  for (const key of SEC_FACT_KEYS) {
    if (!(key in facts)) continue;
    const item = trail.items.find((i) => i.field === key);
    if (!item) return false;
    if (item.fact_state !== "provider_fact") return false;
  }
  return trail.provider === "sec_edgar" && trail.event_type === "sec_filing_news";
}
