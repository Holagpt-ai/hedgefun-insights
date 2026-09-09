// Deterministic Catalyst Intelligence classification.
// Distinct from existing event_type labels (earnings, sec_filing_news, …).
// SEC rows stay provider_fact with unknown direction — no filing meaning invented.

import type {
  AttributionClass,
  CatalystClassification,
  CatalystDirection,
  FactState,
  NormalizedCatalystInput,
} from "./types.ts";
import { providerPolicy } from "./providers.ts";

const COMMENTARY_PATTERNS: RegExp[] = [
  /\bvs\.?\b/i,
  /\bwhich\s+stocks?\b/i,
  /\bis\s+.{0,80}\bstill\s+a\s+buy\b/i,
  /\bstill\s+a\s+buy\s*\??\s*$/i,
  /\bworth\s+(?:buying|a\s+buy)\b/i,
  /\bshould\s+you\s+(?:buy|sell|hold)\b/i,
  /\bbuy[, ]\s*hold[, ]\s*(?:or\s+)?sell\b/i,
  /\b(?:bull|bear)\s+case\b/i,
  /\bhere(?:'s| is)\s+why\b/i,
  /\bwhat\s+(?:investors?|traders?)\s+(?:need\s+)?to\s+know\b/i,
  /\b(?:opinion|editorial|commentary)\b/i,
  /\bwe\s+think\b/i,
  /\bis\s+it\s+(?:time\s+to\s+)?(?:buy|sell)\b/i,
  /\btop\s+\d+\s+stocks?\s+to\s+(?:buy|watch)\b/i,
  /^\s*prediction\s*:/i,
  /\bprediction\s*:/i,
  /\bcould\s+make\s+it\s+one\s+of\s+the\s+best/i,
  /\bbest[- ]performing\b/i,
  /\bthrough\s+20\d{2}\b/i,
  /\btop\s+stock(?:s)?\s+for\s+the\s+long[- ]term\b/i,
  /\bwhy\s+.{1,120}\bis\s+a\s+top\s+stock\b/i,
  /\bsuperior\s+buy\b/i,
  /\bclearly\s+the\s+(?:superior\s+)?buy\b/i,
  /\binvestment\s+thesis\b/i,
];

const EMERGING_NEWS_PATTERNS: RegExp[] = [
  /\bercot\b/i,
  /\bbatch\s+zero\b/i,
  /\breceived\s+conditional\b/i,
  /\bconditional\s+(?:ercot\s+)?(?:batch|classification|approval|interconnection)\b/i,
  /\bgrid\s+interconnection\b/i,
  /\binfrastructure\s+approval\b/i,
];

const LEGAL_NOTICE_PATTERNS: RegExp[] = [
  /\bclass[- ]actions?\b/i,
  /\bsecurities[- ](?:class[- ]action|fraud|litigation)\b/i,
  /\binvestors?\s+(?:who\s+(?:purchased|acquired)|losses?|loss\s+alert)\b/i,
  /\b(?:shareholders?|stockholders?)\s+(?:alert|lawsuit|class[- ]action|investigation)\b/i,
  /\blead\s+plaintiff\b/i,
  /\blaw\s+firm\b/i,
  /\bsecurities\s+law\b/i,
  /\b(?:remind(?:s|er)?|notifies)\s+investors?\b/i,
];

const HARD_NEWS_PATTERNS: RegExp[] = [
  /\bfda\s+approv(?:es|ed|al)\b/i,
  /\bpdufa\b/i,
  /\bemergency\s+use\s+authorization\b/i,
  /\bdefinitive\s+(?:merger|acquisition)\s+agreement\b/i,
  /\b(?:merger|acquisition)\s+(?:agreement|completed|closes?)\b/i,
  /\btake[-\s]private\b/i,
  /\btender\s+offer\b/i,
  /\bchapter\s+11\b/i,
  /\bfiles?\s+for\s+bankruptcy\b/i,
  /\bstock\s+split\b/i,
  /\breverse\s+split\b/i,
];

const BULLISH_PATTERNS: RegExp[] = [
  /\bupgrad(?:e[sd]?|ing)\b/i,
  /\bbeats?\b/i,
  /\brais(?:es?|ed|ing)\s+guidance\b/i,
  /\bfda\s+approv/i,
  /\bprice\s+target\s+(?:raised|increased|hiked)\b/i,
];

const BEARISH_PATTERNS: RegExp[] = [
  /\bdowngrad(?:e[sd]?|ing)\b/i,
  /\bmiss(?:es|ed)?\b/i,
  /\bcuts?\s+guidance\b/i,
  /\blower(?:s|ed|ing)\s+guidance\b/i,
  /\breject(?:s|ed|ion)\b/i,
  /\bbankruptcy\b/i,
  /\bchapter\s+11\b/i,
  /\bprice\s+target\s+(?:cut|lowered|reduced)\b/i,
];

const HARD_SEC_FORMS = new Set([
  "8-K",
  "8-K/A",
  "6-K",
  "6-K/A",
]);

const EMERGING_SEC_FORMS = new Set([
  "S-1",
  "S-1/A",
  "F-1",
  "F-1/A",
  "S-3",
  "S-3/A",
  "424B2",
  "424B3",
  "424B4",
  "424B5",
]);

export interface ClassificationResult {
  classification: CatalystClassification;
  direction: CatalystDirection;
  fact_state: FactState;
  reasons: string[];
  attribution_class: AttributionClass | null;
  ticker_specific: boolean;
}

export function looksLikeCommentaryHeadline(title: string, description?: string | null): boolean {
  const text = `${title} ${description ?? ""}`;
  return COMMENTARY_PATTERNS.some((p) => p.test(text));
}

export function looksLikeLegalNotice(title: string, sourceName?: string | null): boolean {
  const blob = `${title} ${sourceName ?? ""}`;
  return LEGAL_NOTICE_PATTERNS.some((p) => p.test(blob));
}

export function readAttributionClass(facts: Record<string, unknown> | undefined): AttributionClass | null {
  const raw = facts?.attribution_class;
  if (
    raw === "direct" ||
    raw === "provider_associated" ||
    raw === "sector_related" ||
    raw === "unverified"
  ) {
    return raw;
  }
  return null;
}

export function readTickerSpecific(facts: Record<string, unknown> | undefined): boolean | null {
  const raw = facts?.ticker_specific;
  if (typeof raw === "boolean") return raw;
  const cls = readAttributionClass(facts);
  if (cls === "direct") return true;
  if (cls === "provider_associated") return true;
  if (cls === "sector_related" || cls === "unverified") return false;
  return null;
}

function readFormType(input: NormalizedCatalystInput): string | null {
  const raw = input.facts?.form_type;
  if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
  const m = input.title.match(/\bForm\s+([A-Z0-9/-]+)/i);
  return m ? m[1].toUpperCase() : null;
}

function secClassification(formType: string | null): CatalystClassification {
  if (formType && HARD_SEC_FORMS.has(formType)) return "hard";
  if (formType && EMERGING_SEC_FORMS.has(formType)) return "emerging";
  return "context";
}

function inferDirectionFromText(title: string, description?: string | null): CatalystDirection {
  const text = `${title} ${description ?? ""}`;
  const bull = BULLISH_PATTERNS.some((p) => p.test(text));
  const bear = BEARISH_PATTERNS.some((p) => p.test(text));
  if (bull && bear) return "mixed";
  if (bull) return "bullish";
  if (bear) return "bearish";
  return "unknown";
}

function inferDirectionFromEarningsFacts(facts: Record<string, unknown> | undefined): CatalystDirection {
  const surprise = facts?.surprise_percent;
  if (typeof surprise !== "number" || !Number.isFinite(surprise)) return "unknown";
  if (surprise > 0) return "bullish";
  if (surprise < 0) return "bearish";
  return "unknown";
}

export function classifyIntelligence(input: NormalizedCatalystInput): ClassificationResult {
  const reasons: string[] = [];
  const policy = providerPolicy(input.provider);
  const attribution = readAttributionClass(input.facts);
  let tickerSpecific = readTickerSpecific(input.facts);
  if (tickerSpecific === null) {
    tickerSpecific = policy.known &&
      (input.provider === "sec_edgar" || input.provider === "earnings_calendar");
  }

  if (input.provider === "sec_edgar" || input.event_type === "sec_filing_news") {
    const form = readFormType(input);
    const classification = policy.allowHard
      ? secClassification(form)
      : "context";
    reasons.push("sec_provider_fact");
    if (form) reasons.push(`sec_form:${form}`);
    reasons.push(`sec_class:${classification}`);
    reasons.push("direction_unknown_no_filing_meaning");
    return {
      classification,
      direction: "unknown",
      fact_state: "provider_fact",
      reasons,
      attribution_class: attribution ?? "direct",
      ticker_specific: true,
    };
  }

  if (looksLikeLegalNotice(input.title, input.source_name)) {
    reasons.push("legal_shareholder_notice");
    return {
      classification: "commentary",
      direction: "unknown",
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (looksLikeCommentaryHeadline(input.title, input.description)) {
    reasons.push("opinion_headline");
    return {
      classification: "commentary",
      direction: inferDirectionFromText(input.title, input.description),
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (input.provider === "earnings_calendar" && input.event_type === "earnings") {
    reasons.push("earnings_calendar_scheduled");
    return {
      classification: policy.allowHard ? "hard" : "context",
      direction: inferDirectionFromEarningsFacts(input.facts),
      fact_state: "provider_fact",
      reasons,
      attribution_class: attribution ?? "direct",
      ticker_specific: true,
    };
  }

  const text = `${input.title} ${input.description ?? ""}`;
  if (HARD_NEWS_PATTERNS.some((p) => p.test(text))) {
    reasons.push("hard_headline_pattern");
    const classification: CatalystClassification = policy.allowHard ? "hard" : "context";
    if (!policy.allowHard) reasons.push("unknown_provider_downgrade");
    return {
      classification,
      direction: inferDirectionFromText(input.title, input.description),
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (
    input.event_type === "fda_biotech" ||
    input.event_type === "merger_acquisition" ||
    input.event_type === "corporate_action"
  ) {
    reasons.push(`event_type:${input.event_type}`);
    const classification: CatalystClassification = policy.allowHard ? "hard" : "context";
    if (!policy.allowHard) reasons.push("unknown_provider_downgrade");
    return {
      classification,
      direction: inferDirectionFromText(input.title, input.description),
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (
    input.event_type === "analyst_action" ||
    input.event_type === "product_contract" ||
    input.event_type === "earnings"
  ) {
    reasons.push(`event_type:${input.event_type}:emerging`);
    return {
      classification: "emerging",
      direction: inferDirectionFromText(input.title, input.description),
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (EMERGING_NEWS_PATTERNS.some((p) => p.test(text))) {
    reasons.push("emerging_factual_headline");
    return {
      classification: "emerging",
      direction: inferDirectionFromText(input.title, input.description),
      fact_state: "provider_fact",
      reasons,
      attribution_class: attribution ?? "direct",
      ticker_specific: tickerSpecific || input.symbol.length > 0,
    };
  }

  if (attribution === "sector_related") {
    reasons.push("sector_related_context");
    return {
      classification: "context",
      direction: "unknown",
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: false,
    };
  }

  reasons.push("default_context");
  if (!policy.known) reasons.push("unknown_provider_conservative");
  return {
    classification: "context",
    direction: inferDirectionFromText(input.title, input.description),
    fact_state: "derived",
    reasons,
    attribution_class: attribution,
    ticker_specific: tickerSpecific,
  };
}
