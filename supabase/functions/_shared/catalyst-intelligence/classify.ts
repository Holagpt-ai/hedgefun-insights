// Deterministic Catalyst Intelligence classification.
// Distinct from existing event_type labels (earnings, sec_filing_news, …).
// Source event_type is a hint, not proof. Title/facts take precedence.
// SEC rows stay provider_fact with unknown direction — no filing meaning invented.

import type {
  AttributionClass,
  CatalystClassification,
  CatalystDirection,
  FactState,
  NormalizedCatalystInput,
} from "./types.ts";
import { providerPolicy } from "./providers.ts";
import {
  hasIndependentObjectiveEvent,
  hasObjectiveAnalystActionEvidence,
  hasObjectiveAnnouncedDeal,
  hasObjectiveAnnouncedInvestment,
  hasObjectiveContractEvidence,
  hasObjectiveCorporateActionEvidence,
  hasObjectiveEarningsEvidence,
  hasObjectiveFdaEvidence,
  hasMaterialContextEvidence,
  hasObjectiveGuidanceEvidence,
  hasObjectiveMaEvidence,
  isBlockedEditorialFrame,
  isEditorialNonEvent,
  isInsiderActivity,
  isLawFirmSolicitation,
  isObjectiveLegalEvent,
  isRetrospectivePerformanceFrame,
} from "./semantic.ts";

export type ContextActionability = "ordinary" | "material";

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
  /\binvestors?\s+(?:who\s+(?:purchased|acquired)|losses?|loss\s+alert)\b/i,
  /\b(?:shareholders?|stockholders?)\s+(?:alert|lawsuit|investigation)\b/i,
  /\blead\s+plaintiff\b/i,
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
  context_actionability?: ContextActionability | null;
}

export function looksLikeCommentaryHeadline(title: string, description?: string | null): boolean {
  const text = `${title} ${description ?? ""}`;
  return COMMENTARY_PATTERNS.some((p) => p.test(text));
}

export function looksLikeLegalNotice(title: string, sourceName?: string | null): boolean {
  if (isLawFirmSolicitation(title, sourceName)) return true;
  const blob = `${title} ${sourceName ?? ""}`;
  if (isObjectiveLegalEvent(blob)) return false;
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

function commentaryResult(
  reasons: string[],
  attribution: AttributionClass | null,
  tickerSpecific: boolean,
): ClassificationResult {
  return {
    classification: "commentary",
    direction: "unknown",
    fact_state: "derived",
    reasons,
    attribution_class: attribution,
    ticker_specific: tickerSpecific,
  };
}

function decorateContext(
  result: ClassificationResult,
  title: string,
  description?: string | null,
  forceOrdinary = false,
): ClassificationResult {
  if (result.classification !== "context") return result;
  if (forceOrdinary || !hasMaterialContextEvidence(title, description)) {
    if (!result.reasons.includes("ordinary_non_actionable_context")) {
      result.reasons.push("ordinary_non_actionable_context");
    }
    return { ...result, context_actionability: "ordinary" };
  }
  if (!result.reasons.includes("material_context_escape")) {
    result.reasons.push("material_context_escape");
  }
  return { ...result, context_actionability: "material" };
}

function hardOrContext(
  policyAllowHard: boolean,
  reasons: string[],
  direction: CatalystDirection,
  attribution: AttributionClass | null,
  tickerSpecific: boolean,
  factState: FactState = "derived",
  title?: string,
  description?: string | null,
): ClassificationResult {
  const classification: CatalystClassification = policyAllowHard ? "hard" : "context";
  if (!policyAllowHard) reasons.push("unknown_provider_downgrade");
  const result: ClassificationResult = {
    classification,
    direction,
    fact_state: factState,
    reasons,
    attribution_class: attribution,
    ticker_specific: tickerSpecific,
  };
  if (classification === "context" && title) {
    return decorateContext(result, title, description);
  }
  return result;
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

  // Real SEC provider only. Polygon event_type=sec_filing_news is a hint.
  if (input.provider === "sec_edgar") {
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
    return commentaryResult(reasons, attribution, tickerSpecific);
  }

  if (isInsiderActivity(input.title, input.description)) {
    reasons.push("ordinary_insider_activity");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      },
      input.title,
      input.description,
      true,
    );
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

  // Semantic evidence before event_type. Blocked frames cannot be rescued by body copy.
  if (isBlockedEditorialFrame(input.title) || isRetrospectivePerformanceFrame(input.title)) {
    reasons.push(
      isRetrospectivePerformanceFrame(input.title)
        ? "retrospective_performance_frame"
        : "blocked_editorial_frame",
    );
    return commentaryResult(reasons, attribution, tickerSpecific);
  }

  const hasObjective = hasIndependentObjectiveEvent(input.title, input.description);
  if (
    (isEditorialNonEvent(input.title, input.description) ||
      looksLikeCommentaryHeadline(input.title, input.description)) &&
    !hasObjective
  ) {
    reasons.push(
      isEditorialNonEvent(input.title, input.description)
        ? "editorial_non_event"
        : "opinion_headline",
    );
    return commentaryResult(reasons, attribution, tickerSpecific);
  }

  const direction = inferDirectionFromText(input.title, input.description);

  if (hasObjectiveEarningsEvidence(input.title, input.description)) {
    reasons.push("semantic_promotion:earnings_result");
    return {
      classification: "emerging",
      direction,
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (hasObjectiveGuidanceEvidence(input.title, input.description)) {
    reasons.push("semantic_promotion:guidance");
    return {
      classification: "emerging",
      direction,
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (hasObjectiveMaEvidence(input.title, input.description)) {
    reasons.push("semantic_promotion:asset_sale_or_ma");
    return hardOrContext(
      policy.allowHard,
      reasons,
      direction,
      attribution,
      tickerSpecific,
      "derived",
      input.title,
      input.description,
    );
  }

  if (
    hasObjectiveAnnouncedInvestment(input.title, input.description) ||
    hasObjectiveAnnouncedDeal(input.title, input.description)
  ) {
    reasons.push(
      hasObjectiveAnnouncedInvestment(input.title, input.description)
        ? "semantic_promotion:announced_investment"
        : "semantic_promotion:announced_deal",
    );
    return {
      classification: "emerging",
      direction,
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (hasObjectiveFdaEvidence(input.title, input.description)) {
    reasons.push("semantic_promotion:fda_action");
    return hardOrContext(
      policy.allowHard,
      reasons,
      direction,
      attribution,
      tickerSpecific,
      "derived",
      input.title,
      input.description,
    );
  }

  if (hasObjectiveCorporateActionEvidence(input.title, input.description)) {
    reasons.push("semantic_promotion:corporate_action");
    return hardOrContext(
      policy.allowHard,
      reasons,
      direction,
      attribution,
      tickerSpecific,
      "derived",
      input.title,
      input.description,
    );
  }

  if (hasObjectiveContractEvidence(input.title, input.description)) {
    reasons.push("semantic_promotion:product_contract");
    return {
      classification: "emerging",
      direction,
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  if (hasObjectiveAnalystActionEvidence(input.title, input.description)) {
    reasons.push("semantic_promotion:analyst_action");
    return {
      classification: "emerging",
      direction,
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    };
  }

  const text = `${input.title} ${input.description ?? ""}`;
  if (HARD_NEWS_PATTERNS.some((p) => p.test(text))) {
    reasons.push("hard_headline_pattern");
    return hardOrContext(
      policy.allowHard,
      reasons,
      direction,
      attribution,
      tickerSpecific,
      "derived",
      input.title,
      input.description,
    );
  }

  // event_type is a hint and requires matching objective evidence.
  if (input.event_type === "fda_biotech") {
    if (hasObjectiveFdaEvidence(input.title, input.description)) {
      reasons.push("event_type_hint:fda_biotech");
      return hardOrContext(
      policy.allowHard,
      reasons,
      direction,
      attribution,
      tickerSpecific,
      "derived",
      input.title,
      input.description,
    );
    }
    reasons.push("event_type_hint_without_objective_evidence:fda_biotech");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      },
      input.title,
      input.description,
    );
  }

  if (input.event_type === "merger_acquisition") {
    if (hasObjectiveMaEvidence(input.title, input.description)) {
      reasons.push("event_type_hint:merger_acquisition");
      return hardOrContext(
      policy.allowHard,
      reasons,
      direction,
      attribution,
      tickerSpecific,
      "derived",
      input.title,
      input.description,
    );
    }
    reasons.push("event_type_hint_without_objective_evidence:merger_acquisition");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      },
      input.title,
      input.description,
    );
  }

  if (input.event_type === "corporate_action") {
    if (hasObjectiveCorporateActionEvidence(input.title, input.description)) {
      reasons.push("event_type_hint:corporate_action");
      return hardOrContext(
      policy.allowHard,
      reasons,
      direction,
      attribution,
      tickerSpecific,
      "derived",
      input.title,
      input.description,
    );
    }
    reasons.push("event_type_hint_without_objective_evidence:corporate_action");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      },
      input.title,
      input.description,
    );
  }

  if (input.event_type === "analyst_action") {
    if (hasObjectiveAnalystActionEvidence(input.title, input.description)) {
      reasons.push("event_type_hint:analyst_action");
      return {
        classification: "emerging",
        direction,
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      };
    }
    reasons.push("event_type_hint_without_objective_evidence:analyst_action");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      },
      input.title,
      input.description,
    );
  }

  if (input.event_type === "product_contract") {
    if (hasObjectiveContractEvidence(input.title, input.description)) {
      reasons.push("event_type_hint:product_contract");
      return {
        classification: "emerging",
        direction,
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      };
    }
    reasons.push("event_type_hint_without_objective_evidence:product_contract");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      },
      input.title,
      input.description,
    );
  }

  if (input.event_type === "earnings") {
    if (hasObjectiveEarningsEvidence(input.title, input.description)) {
      reasons.push("event_type_hint:earnings");
      return {
        classification: "emerging",
        direction,
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      };
    }
    reasons.push("event_type_hint_without_objective_evidence:earnings");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      },
      input.title,
      input.description,
    );
  }

  if (input.event_type === "sec_filing_news") {
    reasons.push("polygon_sec_label_without_sec_provider");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: tickerSpecific,
      },
      input.title,
      input.description,
    );
  }

  if (EMERGING_NEWS_PATTERNS.some((p) => p.test(text))) {
    reasons.push("emerging_factual_headline");
    return {
      classification: "emerging",
      direction,
      fact_state: "provider_fact",
      reasons,
      attribution_class: attribution ?? "direct",
      ticker_specific: tickerSpecific || input.symbol.length > 0,
    };
  }

  if (attribution === "sector_related") {
    reasons.push("sector_related_context");
    return decorateContext(
      {
        classification: "context",
        direction: "unknown",
        fact_state: "derived",
        reasons,
        attribution_class: attribution,
        ticker_specific: false,
      },
      input.title,
      input.description,
    );
  }

  reasons.push("default_context");
  if (!policy.known) reasons.push("unknown_provider_conservative");
  return decorateContext(
    {
      classification: "context",
      direction,
      fact_state: "derived",
      reasons,
      attribution_class: attribution,
      ticker_specific: tickerSpecific,
    },
    input.title,
    input.description,
  );
}
