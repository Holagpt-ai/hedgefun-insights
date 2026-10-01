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

/** Executive speaking at a conference is not an executive-change catalyst. */
export function isExecutiveAppearance(text: string): boolean {
  const appearance =
    /\b(to present|will present|to speak|will speak|to attend|will attend|present at|speak at|participate in|participate at|fireside chat)\b/i;
  const venue = /\b(conference|summit|investor conference|communacopia|webcast|symposium)\b/i;
  const role = /\b(ceo|cfo|chief executive|chief financial|management team|executive team)\b/i;
  return (appearance.test(text) && venue.test(text)) || (role.test(text) && appearance.test(text));
}

const EXECUTIVE_CHANGE =
  /\b(appointed|appoints|names|named|resigns|resigned|steps down|stepped down|retires|retired|succeeds|succeeded|replaces|replaced|departure of|termination of)\b/i;

const EXECUTIVE_ROLE =
  /\b(chief executive|chief financial|\bceo\b|\bcfo\b|chief operating|\bcoo\b)\b/i;

const EARNINGS_RESULTS =
  /\b(reports (its )?(first|second|third|fourth|q[1-4]|quarterly|annual|fiscal|full[- ]year).{0,25}(results|earnings)\b|\b(quarterly|annual|fiscal|q[1-4]|fourth quarter|full[- ]year).{0,20}(results|earnings)\b|\bearnings results\b|\bfinancial results for\b|\bannounced (its )?(q[1-4]|fourth quarter|full[- ]year|fiscal year).{0,20}(results|earnings)\b)/i;

const EARNINGS_SCHEDULE =
  /\b(announces date for|to report (its )?(q[1-4]|fourth quarter|results|earnings)|will report (its )?(q[1-4]|results|earnings)|scheduled to report (its )?(results|earnings|q[1-4]))\b/i;

const GUIDANCE_SPECIFIC =
  /\b(reaffirms|raises|lowers|updates|provides|issues) (its )?(guidance|outlook|forecast)\b|\b(guidance|outlook|forecast) (update|revision)\b/i;

export function sameEventFamily(a: IntelEventType, b: IntelEventType): boolean {
  if (a === b) return true;
  return FAMILIES.some((family) => family.includes(a) && family.includes(b));
}

/** Stable family id for a narrow dedupe lock. Not a content hash. */
export function eventFamilyKey(eventType: IntelEventType): string {
  const index = FAMILIES.findIndex((family) => family.includes(eventType));
  return index >= 0 ? `f${index}` : eventType;
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
  const finish = (eventType: IntelEventType, st: string | null = null): Classification => ({
    eventType,
    subtype: st ?? subtype,
    explicitProductUpdate,
  });

  if (/\b(fda|clinical trial|phase [123]|pdufa)\b/i.test(text)) return finish("FDA_CLINICAL");
  if (/\b(merger|acquire[sd]?|acquisition|takeover)\b/i.test(text)) return finish("M_AND_A");
  if (/\b(dilution|dilutive)\b/i.test(text)) return finish("DILUTION");
  if (/\b(public offering|registered direct|prospectus|capital raise)\b/i.test(text)) return finish("FINANCING");

  if (isExecutiveAppearance(text)) return finish("CONFERENCE");

  if (EARNINGS_RESULTS.test(text) || EARNINGS_SCHEDULE.test(text)) return finish("EARNINGS");

  if (/\b(to host|hosts|hosting|will host) (its )?(investor day|capital markets day|analyst day)\b/i.test(text)) {
    return finish("INVESTOR_EVENT");
  }
  if (/\b(investor day|capital markets day|analyst day)\b/i.test(text)) return finish("INVESTOR_EVENT");

  if (GUIDANCE_SPECIFIC.test(text)) return finish("GUIDANCE");
  if (/\b(guidance|outlook|forecast)\b/i.test(text) && !/\b(results|earnings)\b/i.test(text)) {
    return finish("GUIDANCE");
  }

  if (EXECUTIVE_CHANGE.test(text) && EXECUTIVE_ROLE.test(text)) return finish("EXECUTIVE_CHANGE");

  if (/\b(lawsuit|litigation|shareholder class)\b/i.test(text)) return finish("LEGAL");
  if (/\b(upgrade[sd]?|downgrade[sd]?|price target|initiates coverage)\b/i.test(text)) return finish("ANALYST_ACTION");
  if (/\b(dividend|stock split|buyback|repurchase)\b/i.test(text)) return finish("CORPORATE_ACTION");
  if (/\b(regulator|regulatory approval|consent decree)\b/i.test(text)) return finish("REGULATORY");
  if (/\b(launches|launch of|unveils|now available)\b/i.test(text)) return finish("PRODUCT_LAUNCH");

  if (/\b(analyst day|investor presentation|fireside chat)\b/i.test(text)) return finish("INVESTOR_EVENT");

  if (/\b(product summit|strategy (event|presentation|update)|active[- ]trader)\b/i.test(text)) {
    return finish("PRODUCT_STRATEGY_EVENT");
  }

  if (/\b(conference|keynote|webinar|user conference)\b/i.test(text)) return finish("CONFERENCE");
  if (/\b(partnership|collaboration|strategic alliance)\b/i.test(text)) return finish("PARTNERSHIP");
  if (/\b(awarded a contract|wins contract|contract with)\b/i.test(text)) return finish("CONTRACT");
  if (/\b(form 8-k|form 10-k|sec filing)\b/i.test(text)) return finish("SEC_FILING");

  return finish("OTHER_MATERIAL_EVENT");
}
