// Deterministic closed-set classifier for Catalyst events.
// Input: validated provider title and optional description.
// Output: one event_type label. Descriptive only — never a score.
// Prefer company_news when evidence is insufficient (no forced FDA/biotech).

import type { CatalystEventType } from "./contract.ts";
import { looksLikeLegalShareholderNoticeText } from "./legal-notice.ts";

export { looksLikeLegalShareholderNoticeText } from "./legal-notice.ts";

interface Rule {
  type: CatalystEventType;
  patterns: RegExp[];
}

const FDA_BIOTECH_PATTERNS: RegExp[] = [
  /\bpdufa\b/i,
  /\b(?:new\s+drug\s+application|\bnda\b|\bbla\b)\b/i,
  /\bbiologics?\s+license\b/i,
  /\bemergency\s+use\s+authorization\b/i,
  /\b(?:complete\s+response\s+letter|\bcrl\b)\b/i,
  /\bfda\s+(?:approv|reject|deni|clearance|complete\s+response|clinical\s+hold)/i,
  /\b(?:reject|den(?:y|ies|ied))\s+(?:by\s+)?(?:the\s+)?fda\b/i,
  /\bclinical[-\s]trial\b/i,
  /\b(?:phase\s*(?:iii|3|ii|2|i|1))\b.{0,80}\b(?:trial|study|data|readout|endpoint|patient|pivotal)/i,
  /\b(?:drug|therapy|vaccine|biotech|pharma(?:ceutical)?|oncology)\b.{0,100}\bfda\b/i,
  /\bfda\b.{0,100}\b(?:drug|therapy|vaccine|biotech|pharma(?:ceutical)?|oncology)\b/i,
  /\bdrug\s+(?:approval|decision|application)\b/i,
];

const NON_BIOTECH_FDA_CONTEXT: RegExp[] = [
  /\b(?:smart\s+glasses|ar\s+glasses|ai\s+glasses|wearable|wellness|consumer\s+device)\b/i,
  /\bphase\s*(?:iii|3|ii|2|i|1)\b.{0,60}\b(?:rollout|launch|release|deployment|product|consumer|software|hardware)\b/i,
];

function matchesFdaBiotech(text: string): boolean {
  if (NON_BIOTECH_FDA_CONTEXT.some((p) => p.test(text))) {
    const hasDrugEvidence = /\b(?:drug|therapy|vaccine|biotech|pharma(?:ceutical)?|clinical\s+trial|pdufa|nda\b|bla\b)\b/i
      .test(text);
    if (!hasDrugEvidence) return false;
  }
  return FDA_BIOTECH_PATTERNS.some((p) => p.test(text));
}

// Order matters: first match wins.
const RULES: Rule[] = [
  {
    type: "merger_acquisition",
    patterns: [
      /\bmerger\b/i,
      /\bacquisition\b/i,
      /\bacquire[sd]?\b/i,
      /\bbuyout\b/i,
      /\btakeover\b/i,
      /\btake[-\s]private\b/i,
      /\btender\s+offer\b/i,
    ],
  },
  {
    type: "analyst_action",
    patterns: [
      /\bupgrade[sd]?\b/i,
      /\bdowngrade[sd]?\b/i,
      /\binitiate[sd]?\s+(?:coverage|at)\b/i,
      /\bprice\s+target\b/i,
      /\breiterate[sd]?\s+(?:buy|sell|hold|overweight|underweight|neutral)\b/i,
      /\banalyst\s+(?:rating|action)\b/i,
    ],
  },
  {
    type: "sec_filing_news",
    patterns: [
      /\bform\s+4\b/i,
      /\b8[-\s]?k\b/i,
      /\b10[-\s]?q\b/i,
      /\b10[-\s]?k\b/i,
      /\bs[-\s]?1\b/i,
      /\bsec\s+filing\b/i,
      /\bfiles?\s+with\s+the\s+sec\b/i,
      /\bproxy\s+statement\b/i,
    ],
  },
  {
    type: "corporate_action",
    patterns: [
      /\bstock\s+split\b/i,
      /\breverse\s+split\b/i,
      /\bdividend\b/i,
      /\bbuyback\b/i,
      /\bshare\s+repurchase\b/i,
      /\bsecondary\s+offering\b/i,
      /\bpublic\s+offering\b/i,
      /\bequity\s+offering\b/i,
      /\bbankruptcy\b/i,
      /\bchapter\s+11\b/i,
    ],
  },
  {
    type: "earnings",
    patterns: [
      /\bearnings\b/i,
      /\bquarterly\s+results\b/i,
      /\bfiscal\s+(?:q[1-4]|first|second|third|fourth)\b/i,
      /\brevenue\s+(?:beat|miss|of)\b/i,
      /\bguidance\b/i,
      /\bpreliminary\s+results\b/i,
      /\beps\b/i,
    ],
  },
  {
    type: "product_contract",
    patterns: [
      /\bpartnership\b/i,
      /\bcollaboration\s+agreement\b/i,
      /\bstrategic\s+alliance\b/i,
      /\bcontract\s+(?:award|win)\b/i,
      /\bawarded\s+contract\b/i,
      /\bproduct\s+launch\b/i,
      /\blaunches?\s+(?:new\s+)?product\b/i,
      /\b(?:unveils?|introduces?|debuts?|showcases?)\b.{0,80}\b(?:glasses|headset|device|platform|ai\b)/i,
      /\b(?:smart\s+glasses|ai\s+glasses|ar\s+glasses)\b/i,
      /\bfda\s+clear(?:s|ance|ed)\b.{0,80}\b(?:glasses|wearable|device)\b/i,
      /\bphase\s*(?:iii|3|ii|2|i|1)\b.{0,60}\b(?:rollout|launch|release|deployment|consumer|product|software|hardware)\b/i,
      /\b(?:glasses|headset|wearable)\b.{0,80}\b(?:rollout|launch|unveil|debut)\b/i,
    ],
  },
];

/**
 * Classify a catalyst event given validated title + optional description.
 * Never returns null or throws — the safe fallback is "company_news".
 */
export function classifyCatalyst(
  title: string,
  description?: string | null,
): CatalystEventType {
  const text = `${title} ${description ?? ""}`.trim();
  if (looksLikeLegalShareholderNoticeText(title, description)) {
    return "legal";
  }
  if (matchesFdaBiotech(text)) {
    return "fda_biotech";
  }
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      if (p.test(text)) return rule.type;
    }
  }
  return "company_news";
}
