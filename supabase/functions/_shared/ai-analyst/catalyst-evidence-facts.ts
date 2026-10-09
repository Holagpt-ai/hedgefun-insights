/** Deno mirror of src/lib/ai-analyst/catalyst-evidence-facts.ts */

export type CatalystEvidenceVerificationLevel =
  | "official_document"
  | "official_page"
  | "attributed_secondary"
  | "headline_only";

export type CatalystStructuredFactCategory =
  | "revenue_guidance"
  | "segment_revenue_guidance"
  | "tam_estimate"
  | "cumulative_revenue_target"
  | "eps_guidance"
  | "event_date"
  | "event_summary"
  | "other_metric";

export interface CatalystStructuredFact {
  category: CatalystStructuredFactCategory;
  statement: string;
  fiscalYear: string | null;
  amountLabel: string | null;
  sourceUrl: string;
  verificationLevel: CatalystEvidenceVerificationLevel;
}

export const CATALYST_VERIFIED_VS_INFERRED_GUIDANCE =
  "Use catalystEvidenceFacts for KEY DETAILS when verificationLevel is official_page, official_document, "
  + "or attributed_secondary. Treat headline_only as weak context only — do not state dollar guidance "
  + "from headline_only. Never invent fiscal years, dollar amounts, or guidance changes not present in "
  + "catalystEvidenceFacts. Distinguish total company revenue_guidance from segment_revenue_guidance, "
  + "tam_estimate, and cumulative_revenue_target.";

const FISCAL_YEAR_PROXIMITY_CHARS = 200;

function normalizeFiscalYear(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 4) return digits;
  if (digits.length === 2) return `20${digits}`;
  return null;
}

function unitLetter(unitWord: string): string {
  const u = unitWord.toLowerCase();
  if (u.startsWith("b")) return "B";
  if (u.startsWith("m")) return "M";
  if (u.startsWith("t")) return "T";
  return unitWord.toUpperCase().slice(0, 1);
}

function amountLabel(value: string, unit: string): string {
  return `$${value}${unitLetter(unit)}`;
}

function dedupeFacts(facts: CatalystStructuredFact[]): CatalystStructuredFact[] {
  const seen = new Set<string>();
  const out: CatalystStructuredFact[] = [];
  for (const f of facts) {
    const key = `${f.category}|${f.fiscalYear ?? ""}|${f.amountLabel ?? ""}|${f.statement.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

type ParsedAmount = { index: number; value: string; unit: string; label: string };
type ParsedFy = { index: number; year: string };

const AMOUNT_PATTERNS: RegExp[] = [
  /\$(\d+(?:\.\d+)?)\s*([BMTbmt])\b(?:illion)?/gi,
  /\$(\d+(?:\.\d+)?)\s+(billion|million|trillion)\b/gi,
  /(\d+(?:\.\d+)?)\s+(billion|million|trillion)\s+dollars?\b/gi,
];

const FY_PATTERN =
  /\b(?:FY\s*[''\u2019]?\s*(\d{2,4})|fiscal(?:\s+year)?\s*[''\u2019]?\s*(\d{2,4}))\b/gi;

function collectAmounts(normalized: string): ParsedAmount[] {
  const amounts: ParsedAmount[] = [];
  for (const re of AMOUNT_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized)) !== null) {
      const value = match[1];
      const unitRaw = match[2];
      if (!value || !unitRaw) continue;
      const label = amountLabel(value, unitRaw);
      amounts.push({ index: match.index, value, unit: unitLetter(unitRaw), label });
    }
  }
  return amounts;
}

function collectFiscalYears(normalized: string): ParsedFy[] {
  FY_PATTERN.lastIndex = 0;
  const out: ParsedFy[] = [];
  let match: RegExpExecArray | null;
  while ((match = FY_PATTERN.exec(normalized)) !== null) {
    const raw = match[1] ?? match[2];
    const year = normalizeFiscalYear(raw);
    if (!year) continue;
    out.push({ index: match.index, year });
  }
  return out;
}

function passageForPair(text: string, a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const start = Math.max(0, lo - 40);
  const end = Math.min(text.length, hi + FISCAL_YEAR_PROXIMITY_CHARS);
  return text.slice(start, end);
}

function classifyRevenueMetric(passage: string): CatalystStructuredFactCategory {
  const p = passage.toLowerCase();
  if (/\btam\b|total addressable market/.test(p)) return "tam_estimate";
  if (/\bcumulative\b|multi-?year|over \d+\s+years?/.test(p)) return "cumulative_revenue_target";
  if (/\btotal company\b|\bcompany revenue\b|\btotal revenue\b|\brevenue target\b/.test(p)) {
    return "revenue_guidance";
  }
  if (
    /\bdata[\s-]?center\b|\bsegment\b|\bbusiness unit\b|\bcloud\b|\binfrastructure\b|\bautomotive\b|\bcustom\b/
      .test(p)
    && /\brevenue\b/.test(p)
  ) {
    return "segment_revenue_guidance";
  }
  return "revenue_guidance";
}

function statementForCategory(
  category: CatalystStructuredFactCategory,
  label: string,
  fiscalYear: string | null,
): string {
  const fy = fiscalYear ? ` for FY${fiscalYear}` : "";
  switch (category) {
    case "segment_revenue_guidance":
      return `Stated segment revenue ${label}${fy}.`;
    case "tam_estimate":
      return `Stated TAM or addressable market ${label}${fy}.`;
    case "cumulative_revenue_target":
      return `Stated cumulative revenue target ${label}${fy}.`;
    default:
      return `Stated total company revenue target ${label}${fy}.`;
  }
}

function pairAmountsAndFiscalYears(
  normalized: string,
  sourceUrl: string,
  verificationLevel: CatalystEvidenceVerificationLevel,
): CatalystStructuredFact[] {
  const amounts = collectAmounts(normalized);
  const fys = collectFiscalYears(normalized);
  if (amounts.length === 0) return [];

  const facts: CatalystStructuredFact[] = [];
  const usedPairs = new Set<string>();

  for (const amt of amounts) {
    let bestFy: ParsedFy | null = null;
    let bestDist = FISCAL_YEAR_PROXIMITY_CHARS + 1;
    for (const fy of fys) {
      const dist = Math.abs(amt.index - fy.index);
      if (dist <= FISCAL_YEAR_PROXIMITY_CHARS && dist < bestDist) {
        bestDist = dist;
        bestFy = fy;
      }
    }
    const fiscalYear = bestFy?.year ?? null;
    const passage = bestFy
      ? passageForPair(normalized, amt.index, bestFy.index)
      : normalized.slice(Math.max(0, amt.index - 80), amt.index + 120);
    const metricPassage = normalized.slice(
      Math.max(0, amt.index - 90),
      Math.min(normalized.length, amt.index + 90),
    );
    const category = classifyRevenueMetric(metricPassage || passage);
    const pairKey = `${category}|${fiscalYear}|${amt.label}`;
    if (usedPairs.has(pairKey)) continue;
    usedPairs.add(pairKey);
    facts.push({
      category,
      statement: statementForCategory(category, amt.label, fiscalYear),
      fiscalYear,
      amountLabel: amt.label,
      sourceUrl,
      verificationLevel,
    });
  }
  return facts;
}

export function extractStructuredFactsFromPlainText(
  text: string,
  sourceUrl: string,
  verificationLevel: CatalystEvidenceVerificationLevel,
): CatalystStructuredFact[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return dedupeFacts(pairAmountsAndFiscalYears(normalized, sourceUrl, verificationLevel));
}

export function htmlToPlainText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  return withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120_000);
}

const TRUSTED_SECONDARY_HOST =
  /(?:^|\.)((?:reuters|bloomberg|wsj|cnbc|marketwatch|finance\.yahoo|investing|seekingalpha)\.[a-z.]+)$/i;

export function isTrustedAttributedSecondaryUrl(url: string): boolean {
  try {
    return TRUSTED_SECONDARY_HOST.test(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export type CatalystFetchUrlKind = "fetchable_html" | "pdf_skip" | "rss_skip" | "invalid";

export function classifyCatalystFetchUrl(url: string): CatalystFetchUrlKind {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "invalid";
    const path = parsed.pathname.toLowerCase();
    if (path.endsWith(".pdf")) return "pdf_skip";
    if (/\.(?:rss|xml|atom)$/.test(path) || /\/feeds?\//.test(path)) return "rss_skip";
    return "fetchable_html";
  } catch {
    return "invalid";
  }
}

export function extractOfficialSameHostLinks(html: string, baseUrl: string, max = 3): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const links: string[] = [];
  const hrefRe = /href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null && links.length < max) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const resolved = new URL(raw, base);
      if (resolved.protocol !== "https:") continue;
      if (resolved.hostname !== base.hostname && !resolved.hostname.endsWith(`.${base.hostname}`)) continue;
      if (classifyCatalystFetchUrl(resolved.toString()) !== "fetchable_html") continue;
      const path = resolved.pathname.toLowerCase();
      if (
        !/\.(?:htm|html)$/.test(path)
        && !/(?:presentation|slides|investor-day|press-release|transcript|webcast|event-details)/.test(path)
      ) {
        continue;
      }
      links.push(resolved.toString());
    } catch {
      /* skip */
    }
  }
  return [...new Set(links)];
}
