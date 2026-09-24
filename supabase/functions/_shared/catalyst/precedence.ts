/**
 * Catalyst Intelligence precedence — primary event class vs market-attention content.
 * Ranking/classification layer; does not mutate persisted rows or invent scores.
 * Deno mirror: src/lib/catalyst/precedence.ts
 */

import { EARNINGS_CALENDAR_PROVIDER } from "../pre-market/contract.ts";

export type CatalystPrecedenceTier = "primary" | "secondary";

export type PrimaryCatalystClass =
  | "fda_regulatory"
  | "clinical_results"
  | "earnings_guidance"
  | "acquisition_ma"
  | "contract_award"
  | "sec_material"
  | "financing_capital"
  | "strategic_agreement";

/** Higher rank = higher precedence among primary catalysts. */
export const PRIMARY_CLASS_RANK: Record<PrimaryCatalystClass, number> = {
  fda_regulatory: 90,
  clinical_results: 88,
  earnings_guidance: 85,
  acquisition_ma: 84,
  contract_award: 82,
  sec_material: 80,
  financing_capital: 78,
  strategic_agreement: 76,
};

export interface CatalystPrecedenceInput {
  title: string;
  description?: string | null;
  event_type: string;
  provider: string;
  event_date: string;
  event_time?: string | null;
  published_at?: string | null;
  source_name?: string | null;
  attribution_class?: "direct" | "provider_associated" | "sector_related" | "unverified";
  ticker_specific?: boolean;
}

export interface CatalystPrecedenceResult {
  tier: CatalystPrecedenceTier;
  primaryClass: PrimaryCatalystClass | null;
  classRank: number;
  isMarketAttention: boolean;
}

interface EvidenceRule {
  class: PrimaryCatalystClass;
  patterns: RegExp[];
}

const PRIMARY_EVIDENCE: EvidenceRule[] = [
  {
    class: "fda_regulatory",
    patterns: [
      /\bfda\s+(?:approv|reject|deni|clearance|complete\s+response|clinical\s+hold|issues?\s+complete\s+response)/i,
      /\b(?:complete\s+response\s+letter|crl)\b/i,
      /\bpdufa\b/i,
      /\bbreakthrough\s+therapy\s+(?:designation|granted)\b/i,
      /\bregulatory\s+(?:approval|decision|designat)/i,
      /\b(?:reject|den(?:y|ies|ied))\s+(?:by\s+)?(?:the\s+)?fda\b/i,
    ],
  },
  {
    class: "clinical_results",
    patterns: [
      /\bphase\s*(?:iii|3|ii|2|i|1)\b.{0,80}\b(?:results|data|readout|topline|endpoint)/i,
      /\bprimary\s+endpoint\b/i,
      /\bpivotal\s+(?:trial|study)\b/i,
      /\b(?:trial|study)\s+(?:met|missed|failed|succeed|success|positive|negative)\b/i,
      /\b(?:efficacy|safety)\s+(?:data|results)\b/i,
      /\bclinical\s+(?:trial\s+)?(?:failure|success|results)\b/i,
    ],
  },
  {
    class: "earnings_guidance",
    patterns: [
      /\bearnings\s+(?:beat|miss|results|report|release|preannounce)/i,
      /\b(?:raised|lowered|withdrawn|updates?|cuts?)\s+(?:fy\s+)?guidance\b/i,
      /\b(?:pre(?:-|\s)?announce|preannounce)\s+(?:ment|s?\s+earnings)/i,
      /\bquarterly\s+results\b/i,
      /\beps\s+(?:beat|miss)\b/i,
      /\breports?\s+(?:q[1-4]|first|second|third|fourth)\s+(?:quarter|quarterly)\b/i,
    ],
  },
  {
    class: "acquisition_ma",
    patterns: [
      /\b(?:definitive|signed|entered\s+into)\s+(?:agreement\s+to\s+)?(?:acquire|acquisition|merger)/i,
      /\b(?:to\s+)?acquire[sd]?\b.{0,40}\b(?:for\s+\$|in\s+(?:cash|stock))/i,
      /\bmerger\s+(?:agreement|closed|complete)/i,
      /\btakeover\s+(?:bid|offer|complete)/i,
      /\b(?:terminat(?:ed|es)|abandon(?:ed|s))\s+(?:merger|acquisition|deal)\b/i,
    ],
  },
  {
    class: "contract_award",
    patterns: [
      /\b(?:awarded|wins?|secures?|receives?)\s+(?:a\s+)?(?:\$[\d,.]+[bmk]?\s+)?(?:contract|order|award)/i,
      /\b(?:contract|purchase\s+order)\s+(?:award|win|valued)\b/i,
      /\b(?:nasa|dod|department\s+of\s+defense|federal|government)\s+(?:contract|award|grant)/i,
      /\b(?:loses?|lost|terminated)\s+(?:contract|award)\b/i,
    ],
  },
  {
    class: "sec_material",
    patterns: [
      /\b8[-\s]?k\b.{0,60}\b(?:material|disclos|restructur|executive|ceo|cfo|resign|appoint)/i,
      /\bmaterial\s+(?:8[-\s]?k|disclosure|event)\b/i,
      /\brestructur(?:ing|ed)\b/i,
      /\b(?:ceo|cfo|chief\s+\w+\s+officer)\s+(?:resign|appoint|depart|named)\b/i,
      /\bshareholder\s+(?:action|activist|proposal)\b/i,
    ],
  },
  {
    class: "financing_capital",
    patterns: [
      /\b(?:prices?|announces?|closes?|completes?)\s+(?:\$[\d,.]+[bmk]?\s+)?(?:public|registered|follow-?on|secondary)\s+offering\b/i,
      /\b(?:atm|at-the-market)\s+(?:offering|program|equity)\b/i,
      /\b(?:pipe|private\s+investment\s+in\s+public\s+equity)\b/i,
      /\b(?:convertible|senior\s+notes?|debt\s+financing)\b/i,
      /\bwarrant(?:s|\s+exercise|\s+inducement)\b/i,
      /\bdilut(?:ive|ion)\b/i,
      /\b(?:stock|share)\s+split\b/i,
      /\breverse\s+split\b/i,
    ],
  },
  {
    class: "strategic_agreement",
    patterns: [
      /\b(?:partnership|licensing|license\s+agreement|joint\s+venture|manufacturing\s+agreement|distribution\s+agreement)\b/i,
      /\b(?:collaboration|strategic\s+alliance|co-?development)\s+agreement\b/i,
      /\b(?:terminates?|ended)\s+(?:partnership|alliance|agreement)\b/i,
    ],
  },
];

/** Editorial / recommendation content — never primary without explicit event evidence. */
export const MARKET_ATTENTION_TITLE: RegExp[] = [
  /\bbull\s+of\s+the\s+day\b/i,
  /\bbear\s+of\s+the\s+day\b/i,
  /\bfeatured\s+highlights\b/i,
  /\b(?:top|best)\s+stocks?\s+to\s+(?:buy|watch|own)\b/i,
  /\bstock\s+picks?\b/i,
  /\btop\s+picks?\b/i,
  /\bwhich\s+(?:stock|is)\b/i,
  /\bvs\.?\b/i,
  /\broundup\b/i,
  /\blisticle\b/i,
  /\bstocks?\s+to\s+(?:watch|buy|avoid)\b/i,
  /\banalyst\s+commentary\b/i,
  /\b(?:buy|sell|hold)\s+recommendation\b/i,
  /\b(?:is|are)\s+.{0,80}\bstill\s+a\s+buy\b/i,
  /\bstill\s+a\s+buy\s*\??\s*$/i,
  /\bworth\s+(?:buying|a\s+buy)\b/i,
  /\bshould\s+you\s+(?:buy|sell|hold)\b/i,
  /\bbuy[, ]\s*hold[, ]\s*(?:or\s+)?sell\b/i,
  /\b(?:better|worse)\s+(?:stock|pick|buy)\b/i,
  /\b(?:momentum|value|growth)\s+stock\s+pick\b/i,
  /\b(?:wall\s+street|analyst)\s+(?:says|sees|expects)\b/i,
  /\bwhy\s+.{0,60}\b(?:jumped|rose|fell|sold\s+off|moving|volatile)\b/i,
  /\bstock\s+is\s+moving\b/i,
];

/** Vague market-movement phrasing — insufficient alone to rescue into primary. */
const VAGUE_NON_EVENT: RegExp[] = [
  /\bshares?\s+(?:jump|rise|soar|surge|fall|drop|slide|tumble|rally)\b/i,
  /\bstock\s+jumped\b/i,
  /\bbuy\s+signal\b/i,
  /^company\s+news\b/i,
];

const EVENT_TYPE_PRIMARY: Partial<Record<string, PrimaryCatalystClass>> = {
  merger_acquisition: "acquisition_ma",
  sec_filing_news: "sec_material",
  earnings: "earnings_guidance",
  product_contract: "contract_award",
};

const EVENT_TYPE_SECONDARY = new Set(["analyst_action", "legal"]);

function catalystText(row: CatalystPrecedenceInput): string {
  return `${row.title} ${row.description ?? ""}`.trim();
}

export function looksLikeMarketAttention(title: string, eventType?: string): boolean {
  if (eventType && EVENT_TYPE_SECONDARY.has(eventType)) return true;
  return MARKET_ATTENTION_TITLE.some((p) => p.test(title));
}

export function hasVagueNonEventEvidence(text: string): boolean {
  return VAGUE_NON_EVENT.some((p) => p.test(text));
}

/** Explicit primary event evidence in title/description (rescue path). */
export function detectPrimaryEventClass(
  text: string,
): PrimaryCatalystClass | null {
  for (const rule of PRIMARY_EVIDENCE) {
    for (const p of rule.patterns) {
      if (p.test(text)) return rule.class;
    }
  }
  return null;
}

export function classifyCatalystPrecedence(
  row: CatalystPrecedenceInput,
): CatalystPrecedenceResult {
  const text = catalystText(row);
  const marketAttention = looksLikeMarketAttention(row.title, row.event_type);
  const explicit = detectPrimaryEventClass(text);

  if (row.provider === EARNINGS_CALENDAR_PROVIDER && row.event_type === "earnings") {
    return {
      tier: "primary",
      primaryClass: "earnings_guidance",
      classRank: PRIMARY_CLASS_RANK.earnings_guidance,
      isMarketAttention: false,
    };
  }

  if (explicit) {
    return {
      tier: "primary",
      primaryClass: explicit,
      classRank: PRIMARY_CLASS_RANK[explicit],
      isMarketAttention: marketAttention,
    };
  }

  if (marketAttention || hasVagueNonEventEvidence(text)) {
    return {
      tier: "secondary",
      primaryClass: null,
      classRank: 0,
      isMarketAttention: true,
    };
  }

  if (EVENT_TYPE_SECONDARY.has(row.event_type)) {
    return {
      tier: "secondary",
      primaryClass: null,
      classRank: 0,
      isMarketAttention: true,
    };
  }

  const mapped = EVENT_TYPE_PRIMARY[row.event_type];
  if (mapped) {
    return {
      tier: "primary",
      primaryClass: mapped,
      classRank: PRIMARY_CLASS_RANK[mapped],
      isMarketAttention: false,
    };
  }

  if (row.event_type === "corporate_action") {
    const financing = detectPrimaryEventClass(text) ??
      (/\b(?:offering|atm|pipe|convertible|warrant)\b/i.test(text) ? "financing_capital" : null);
    if (financing) {
      return {
        tier: "primary",
        primaryClass: financing,
        classRank: PRIMARY_CLASS_RANK[financing],
        isMarketAttention: false,
      };
    }
  }

  if (row.event_type === "product_contract") {
    const strategic = /\b(?:partnership|licensing|joint\s+venture|alliance|distribution)\b/i.test(text);
    if (strategic) {
      return {
        tier: "primary",
        primaryClass: "strategic_agreement",
        classRank: PRIMARY_CLASS_RANK.strategic_agreement,
        isMarketAttention: false,
      };
    }
  }

  return {
    tier: "secondary",
    primaryClass: null,
    classRank: 0,
    isMarketAttention: row.event_type === "company_news",
  };
}

function sourceConfidenceRank(row: CatalystPrecedenceInput): number {
  if (row.provider === EARNINGS_CALENDAR_PROVIDER) return 0;
  if (row.event_type === "sec_filing_news") return 1;
  if (row.attribution_class === "direct") return 2;
  if (row.attribution_class === "provider_associated") return 3;
  if (row.attribution_class === "sector_related") return 4;
  return 5;
}

function freshnessMs(row: CatalystPrecedenceInput): number {
  for (const raw of [row.published_at, row.event_time, row.event_date]) {
    if (typeof raw === "string" && Number.isFinite(Date.parse(raw))) {
      return Date.parse(raw);
    }
  }
  return 0;
}

/** Deterministic precedence comparator for Catalyst Intelligence ranking. */
export function compareCatalystPrecedence(
  a: CatalystPrecedenceInput & { symbol: string },
  b: CatalystPrecedenceInput & { symbol: string },
  opts: { owned: ReadonlySet<string>; etDate: string },
): number {
  const pa = classifyCatalystPrecedence(a);
  const pb = classifyCatalystPrecedence(b);

  const tierA = pa.tier === "primary" ? 0 : 1;
  const tierB = pb.tier === "primary" ? 0 : 1;
  if (tierA !== tierB) return tierA - tierB;

  if (pa.tier === "primary" && pb.tier === "primary" && pa.classRank !== pb.classRank) {
    return pb.classRank - pa.classRank;
  }

  const tsA = a.ticker_specific ? 0 : 1;
  const tsB = b.ticker_specific ? 0 : 1;
  if (tsA !== tsB) return tsA - tsB;

  const owA = opts.owned.has(a.symbol) ? 0 : 1;
  const owB = opts.owned.has(b.symbol) ? 0 : 1;
  if (owA !== owB) return owA - owB;

  const scA = sourceConfidenceRank(a);
  const scB = sourceConfidenceRank(b);
  if (scA !== scB) return scA - scB;

  const freshA = freshnessMs(a);
  const freshB = freshnessMs(b);
  if (freshA !== freshB) return freshB - freshA;

  const todayA = a.event_date === opts.etDate ? 0 : 1;
  const todayB = b.event_date === opts.etDate ? 0 : 1;
  if (todayA !== todayB) return todayA - todayB;

  const dateCmp = b.event_date.localeCompare(a.event_date);
  if (dateCmp !== 0) return dateCmp;
  return a.symbol.localeCompare(b.symbol);
}
