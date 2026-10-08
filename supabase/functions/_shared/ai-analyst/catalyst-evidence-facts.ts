/** Deno mirror of src/lib/ai-analyst/catalyst-evidence-facts.ts */

export type CatalystEvidenceVerificationLevel =
  | "official_document"
  | "official_page"
  | "attributed_secondary"
  | "headline_only";

export type CatalystStructuredFactCategory =
  | "revenue_guidance"
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
  + "catalystEvidenceFacts.";

function normalizeFiscalYear(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 4) return digits;
  if (digits.length === 2) return `20${digits}`;
  return null;
}

function amountLabel(value: string, unit: string): string {
  return `$${value}${unit.toUpperCase()}`;
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

export function extractStructuredFactsFromPlainText(
  text: string,
  sourceUrl: string,
  verificationLevel: CatalystEvidenceVerificationLevel,
): CatalystStructuredFact[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const facts: CatalystStructuredFact[] = [];
  const amountBeforeFy =
    /\$(\d+(?:\.\d+)?)\s*([BMTbmt])\b(?:illion)?[^.]{0,200}?\b(?:FY|fiscal year)\s*['']?(\d{2,4})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = amountBeforeFy.exec(normalized)) !== null) {
    const value = match[1];
    const unit = match[2];
    const fiscalYear = normalizeFiscalYear(match[3]);
    if (!value || !unit) continue;
    const label = amountLabel(value, unit);
    facts.push({
      category: "revenue_guidance",
      statement: `Stated revenue target ${label}${fiscalYear ? ` for FY${fiscalYear}` : ""}.`,
      fiscalYear,
      amountLabel: label,
      sourceUrl,
      verificationLevel,
    });
  }

  const fyBeforeAmount =
    /\b(?:FY|fiscal year)\s*['']?(\d{2,4})\b[^.]{0,200}?\$(\d+(?:\.\d+)?)\s*([BMTbmt])\b(?:illion)?/gi;
  while ((match = fyBeforeAmount.exec(normalized)) !== null) {
    const fiscalYear = normalizeFiscalYear(match[1]);
    const value = match[2];
    const unit = match[3];
    if (!value || !unit) continue;
    const label = amountLabel(value, unit);
    facts.push({
      category: "revenue_guidance",
      statement: `Stated revenue target ${label}${fiscalYear ? ` for FY${fiscalYear}` : ""}.`,
      fiscalYear,
      amountLabel: label,
      sourceUrl,
      verificationLevel,
    });
  }

  return dedupeFacts(facts);
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
      const path = resolved.pathname.toLowerCase();
      if (!/\.(?:pdf|htm|html)$/.test(path) && !/(?:presentation|slides|investor-day|press-release)/.test(path)) {
        continue;
      }
      links.push(resolved.toString());
    } catch {
      /* skip */
    }
  }
  return [...new Set(links)];
}
