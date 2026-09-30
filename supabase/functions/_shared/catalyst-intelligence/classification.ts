import type { IntelEventType, NormalizedEventCandidate } from "./types.ts";

export interface Classification {
  eventType: IntelEventType;
  subtype: string | null;
  explicitProductUpdate: boolean;
}

const FAMILIES: readonly (readonly IntelEventType[])[] = [
  ["PRODUCT_STRATEGY_EVENT", "PRODUCT_LAUNCH", "INVESTOR_EVENT", "CONFERENCE"],
  ["EARNINGS", "GUIDANCE"],
  ["FINANCING", "DILUTION"],
  ["CONTRACT", "PARTNERSHIP"],
  ["M_AND_A"],
  ["SEC_FILING"],
  ["EXECUTIVE_CHANGE"],
  ["LEGAL"],
  ["REGULATORY", "FDA_CLINICAL"],
  ["ANALYST_ACTION"],
  ["CORPORATE_ACTION"],
  ["OTHER_MATERIAL_EVENT"],
];

const FORM_CLASS: Record<string, { eventType: IntelEventType; subtype: string }> = {
  "8-K": { eventType: "SEC_FILING", subtype: "8-K" },
  "8-K/A": { eventType: "SEC_FILING", subtype: "8-K" },
  "10-K": { eventType: "SEC_FILING", subtype: "10-K" },
  "10-K/A": { eventType: "SEC_FILING", subtype: "10-K" },
  "10-Q": { eventType: "SEC_FILING", subtype: "10-Q" },
  "10-Q/A": { eventType: "SEC_FILING", subtype: "10-Q" },
  "S-3": { eventType: "FINANCING", subtype: "S-3" },
  "S-3/A": { eventType: "FINANCING", subtype: "S-3" },
  "424B2": { eventType: "FINANCING", subtype: "424B" },
  "424B3": { eventType: "FINANCING", subtype: "424B" },
  "424B4": { eventType: "FINANCING", subtype: "424B" },
  "424B5": { eventType: "FINANCING", subtype: "424B" },
  "424B7": { eventType: "FINANCING", subtype: "424B" },
  "4": { eventType: "SEC_FILING", subtype: "form-4" },
  "4/A": { eventType: "SEC_FILING", subtype: "form-4" },
  "13D": { eventType: "SEC_FILING", subtype: "13D" },
  "13D/A": { eventType: "SEC_FILING", subtype: "13D" },
  "13G": { eventType: "SEC_FILING", subtype: "13G" },
  "13G/A": { eventType: "SEC_FILING", subtype: "13G" },
  "SC 13D": { eventType: "SEC_FILING", subtype: "13D" },
  "SC 13G": { eventType: "SEC_FILING", subtype: "13G" },
  "S-4": { eventType: "M_AND_A", subtype: "S-4" },
  "S-4/A": { eventType: "M_AND_A", subtype: "S-4" },
  "DEFM14A": { eventType: "M_AND_A", subtype: "DEFM14A" },
  "425": { eventType: "M_AND_A", subtype: "425" },
};

const EXPLICIT_PRODUCT_UPDATE =
  /\b(product updates?|strategy updates?|active[- ]traders?|product and strategy)\b/i;

export function sameEventFamily(a: IntelEventType, b: IntelEventType): boolean {
  if (a === b) return true;
  return FAMILIES.some((family) => family.includes(a) && family.includes(b));
}

export function classifyCandidate(candidate: NormalizedEventCandidate): Classification {
  const form = typeof candidate.metadata.formType === "string"
    ? candidate.metadata.formType.toUpperCase()
    : "";
  if (form && FORM_CLASS[form]) {
    return { ...FORM_CLASS[form], explicitProductUpdate: false };
  }
  if (candidate.suggestedType) {
    const text = `${candidate.title} ${candidate.summary ?? ""}`;
    return {
      eventType: candidate.suggestedType,
      subtype: candidate.subtype,
      explicitProductUpdate: EXPLICIT_PRODUCT_UPDATE.test(text),
    };
  }
  return classifyText(`${candidate.title}\n${candidate.summary ?? ""}`, candidate.subtype);
}

export function classifyText(text: string, subtype: string | null = null): Classification {
  const explicitProductUpdate = EXPLICIT_PRODUCT_UPDATE.test(text);
  const rules: Array<{ type: IntelEventType; re: RegExp; subtype?: string }> = [
    { type: "FDA_CLINICAL", re: /\b(fda|clinical trial|phase [123]|pdufa)\b/i },
    { type: "M_AND_A", re: /\b(merger|acquire[sd]?|acquisition|takeover)\b/i },
    { type: "DILUTION", re: /\b(dilution|dilutive)\b/i },
    { type: "FINANCING", re: /\b(public offering|registered direct|prospectus|capital raise)\b/i },
    { type: "GUIDANCE", re: /\b(guidance|outlook|forecast)\b/i },
    { type: "EARNINGS", re: /\b(earnings|quarterly results|financial results)\b/i },
    { type: "EXECUTIVE_CHANGE", re: /\b(chief executive|chief financial|\bceo\b|\bcfo\b|resigns|steps down|appointed)\b/i },
    { type: "LEGAL", re: /\b(lawsuit|litigation|shareholder class)\b/i },
    { type: "ANALYST_ACTION", re: /\b(upgrade[sd]?|downgrade[sd]?|price target|initiates coverage)\b/i },
    { type: "CORPORATE_ACTION", re: /\b(dividend|stock split|buyback|repurchase)\b/i },
    { type: "REGULATORY", re: /\b(regulator|regulatory approval|consent decree)\b/i },
    { type: "PRODUCT_LAUNCH", re: /\b(launches|launch of|unveils|now available)\b/i },
    { type: "PRODUCT_STRATEGY_EVENT", re: /\b(product summit|strategy (event|presentation|update)|investor day|capital markets day|active[- ]trader)\b/i },
    { type: "INVESTOR_EVENT", re: /\b(analyst day|investor presentation|fireside chat)\b/i },
    { type: "CONFERENCE", re: /\b(conference|keynote|webinar|user conference)\b/i },
    { type: "PARTNERSHIP", re: /\b(partnership|collaboration|strategic alliance)\b/i },
    { type: "CONTRACT", re: /\b(awarded a contract|wins contract|contract with)\b/i },
    { type: "SEC_FILING", re: /\b(form 8-k|form 10-k|sec filing)\b/i },
  ];
  for (const rule of rules) {
    if (rule.re.test(text)) {
      return { eventType: rule.type, subtype: subtype ?? rule.subtype ?? null, explicitProductUpdate };
    }
  }
  return { eventType: "OTHER_MATERIAL_EVENT", subtype, explicitProductUpdate };
}
