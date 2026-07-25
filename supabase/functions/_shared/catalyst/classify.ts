// Deterministic closed-set classifier for Catalyst events.
// Input: validated provider title and optional description.
// Output: one of eight event_type labels. Descriptive only — never a score.

import type { CatalystEventType } from "./contract.ts";

interface Rule {
  type: CatalystEventType;
  patterns: RegExp[];
}

// Order matters: first match wins.
const RULES: Rule[] = [
  {
    type: "fda_biotech",
    patterns: [
      /\bfda\b/i,
      /\bpdufa\b/i,
      /\bclinical[-\s]trial\b/i,
      /\bphase\s*(?:i{1,3}|1|2|3|4)\b/i,
      /\bdrug\s+(?:approval|decision|application)\b/i,
      /\bnew\s+drug\s+application\b/i,
      /\bbiologics?\s+license\b/i,
      /\bemergency\s+use\s+authorization\b/i,
    ],
  },
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
      /\bproduct\s+approval\b/i,
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
  const text = `${title} ${description ?? ""}`;
  for (const rule of RULES) {
    for (const p of rule.patterns) {
      if (p.test(text)) return rule.type;
    }
  }
  return "company_news";
}
