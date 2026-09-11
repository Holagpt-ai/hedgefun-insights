// Semantic evidence detectors for Catalyst Intelligence V1B.1.
// Title/description/facts take precedence over provider event_type.
// Combinations only — a single generic keyword is not enough.

export function blobOf(title: string, description?: string | null): string {
  return `${title} ${description ?? ""}`;
}

/** True law-firm investor recruitment, not a court/regulator action. */
export function isLawFirmSolicitation(title: string, sourceName?: string | null): boolean {
  const blob = `${title} ${sourceName ?? ""}`;
  const firm =
    /\b(?:pomerantz|rosen(?:\s+law)?|glancy|robbins\s+llp|bfa\s+law|kirby\s+mcinerney|investor\s+counsel)\b/i
      .test(blob);
  const solicitation = (
    /\breminder\b/i.test(blob) &&
    /\b(?:investors?|shareholders?|stockholders?).{0,80}(?:significant\s+)?losses?\b/i.test(blob)
  ) ||
    /\bmust\s+act\s+by\b/i.test(blob) ||
    /\blead\s+plaintiff(?:\s+deadline)?\b/i.test(blob) ||
    /\bsecurities\s+fraud\s+(?:class\s+action|investigation)\b/i.test(blob) ||
    (/\bcontact\b/i.test(blob) && /\b(?:law\s+firm|llp)\b/i.test(blob)) ||
    /\bencourages?\s+.{0,80}investors?\b/i.test(blob) ||
    /\binvestors?\s+with\s+(?:significant\s+)?losses\b/i.test(blob) ||
    /\blosses?\s+in\s+excess\b/i.test(blob);
  if (!firm && !solicitation) return false;
  if (isObjectiveLegalEvent(blob)) return false;
  return firm || solicitation;
}

export function isObjectiveLegalEvent(blob: string): boolean {
  return (
    /\b(?:doj|department\s+of\s+justice|sec)\s+(?:charges?|sues|sued|settles|settled)\b/i
      .test(blob) ||
    /\bcourt\s+(?:rules?|ruled|injunction|orders?)\b/i.test(blob) ||
    /\b(?:settlement|injunction)\s+(?:announced|approved|reached)\b/i.test(blob) ||
    /\bindictment\b/i.test(blob) ||
    /\bregulatory\s+order\b/i.test(blob) ||
    /\bfiles?\s+(?:a\s+)?(?:material\s+)?lawsuit\b/i.test(blob)
  );
}

const MONTH =
  "(?:january|february|march|april|may|june|july|august|september|october|november|december)";

/** Company operating print dated to a month — not a stock-performance recap. */
export function isContemporaneousPeriodOperatingResult(title: string): boolean {
  return (
    new RegExp(
      `\\b(?:reports?|announces?)\\s+(?:q[1-4]|first|second|third|fourth).{0,40}results\\s+in\\s+${MONTH}\\b`,
      "i",
    ).test(title) ||
    new RegExp(
      `\\b(?:reports?|announces?)\\s+${MONTH}\\s+(?:sales|production|revenue|shipments|deliveries|output)\\b`,
      "i",
    ).test(title) ||
    new RegExp(
      `\\b${MONTH}\\s+(?:sales|production|revenue|shipments|deliveries|output).{0,30}(?:increased|decreased|rose|fell|results)\\b`,
      "i",
    ).test(title)
  );
}

/**
 * Retrospective stock-performance / recap framing in the TITLE.
 * A month name alone is not enough. Body earnings cannot be used here.
 */
export function isRetrospectivePerformanceFrame(title: string): boolean {
  if (isContemporaneousPeriodOperatingResult(title)) return false;
  const patterns: RegExp[] = [
    new RegExp(`\\bwas\\s+so\\s+healthy\\s+in\\s+${MONTH}\\b`, "i"),
    new RegExp(
      `\\bwhy\\s+.{0,100}\\bstock\\s+(?:was\\s+so\\s+healthy|rose|fell|jumped|gained|dropped|soared|rocked|slid|tumbled)\\b.{0,50}(?:in\\s+${MONTH}|last\\s+month|last\\s+quarter|this\\s+past\\s+month)\\b`,
      "i",
    ),
    /\brocked\s+the\s+market\s+last\s+month\b/i,
    new RegExp(
      `\\b(?:popped|gained|rose|fell|jumped|soared|dropped)\\s+\\d+%\\s+(?:in\\s+${MONTH}|last\\s+month)\\b`,
      "i",
    ),
    new RegExp(`\\bwhy\\s+.{0,80}\\bstock\\s+was\\b.{0,40}\\bin\\s+${MONTH}\\b`, "i"),
    /\b(?:gained|rose|fell|dropped|slid)\s+\d+%\s+last\s+month\b/i,
    new RegExp(
      `\\bwhy\\s+.{0,80}\\b(?:rose|fell|jumped)\\s+\\d+%\\s+in\\s+${MONTH}\\b`,
      "i",
    ),
    /\b(?:stock|shares)\s+(?:gained|rose|fell|dropped|slid)\s+\d+%\s+(?:over\s+the\s+(?:past|last)\s+(?:month|30\s+days)|year[- ]to[- ]date|ytd|so\s+far\s+this\s+year|last\s+year)\b/i,
  ];
  return patterns.some((p) => p.test(title));
}

/** Deadline / contact-counsel notice that is not an objective legal event. */
export function isOrdinaryLegalDeadlineNotice(title: string, sourceName?: string | null): boolean {
  const blob = `${title} ${sourceName ?? ""}`;
  if (isObjectiveLegalEvent(blob)) return false;
  return (
    /\bapplication\s+deadline\b/i.test(blob) ||
    /\bclass\s+action\s+deadline\b/i.test(blob) ||
    /\binvestors?\s+may\s+contact\b/i.test(blob) ||
    /\bcontact\s+counsel\b/i.test(blob) ||
    /\bshareholder\s+notice\b/i.test(blob) ||
    (/\bclass[- ]action\b/i.test(blob) && /\b(?:deadline|contact|notice)\b/i.test(blob))
  );
}

/**
 * External development that can keep context above the ordinary-context cap.
 * Ticker mention alone is not enough.
 */
export function hasMaterialContextEvidence(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  const regulatorAction =
    /\b(?:epa|fda|ftc|doj|sec|federal\s+reserve|congress|white\s+house|ofac)\b/i.test(blob) &&
    /\b(?:bans?|tariff|export\s+controls?|sanctions?|order|ruling|mandate|embargo)\b/i.test(blob) &&
    /\b(?:sector|industry|producers?|miners?|airlines?|banks?|exposure|operations?)\b/i.test(blob);
  const commodityShock =
    /\b(?:crude|oil|gold|lithium|copper|natural\s+gas|wheat)\b.{0,40}\b(?:surges?|plunges?|shocks?|spikes?|collapses?)\b/i
      .test(blob) &&
    /\b(?:producer|exposure|operations|reserves|mine|refiner|airline)\b/i.test(blob);
  const geopolitical =
    /\b(?:invasion|sanctions?|war|blockade|geopolitical)\b/i.test(blob) &&
    /\b(?:operations?\s+in|exposure\s+to|facilities\s+in|revenue\s+from)\b/i.test(blob);
  const competitor =
    (/\b(?:competitor|rival|peer)\b/i.test(blob) &&
      /\b(?:bankruptcy|acquisition|recall|fda\s+approv|read[- ]through)\b/i.test(blob)) ||
    (/\bread[- ]through\b/i.test(blob) && /\b(?:competitor|rival|peer)\b/i.test(blob));
  const supplyChain =
    /\bsupply[- ]chain\s+(?:disruption|halt|shock)\b/i.test(blob) &&
    /\b(?:supplier|customer|exposure|operations)\b/i.test(blob);
  const industryWide =
    /\bindustry[- ]wide\b.{0,40}\b(?:ban|tariff|mandate|regulation|action)\b/i.test(blob);
  return regulatorAction || commodityShock || geopolitical || competitor || supplyChain ||
    industryWide;
}

export function isInsiderActivity(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  return (
    /\b(?:director|cfo|ceo|officer|insider|chairman)\s+(?:purchases?|buys?|sells?|sold)\b/i
      .test(blob) ||
    /\b(?:purchases?|buys?|sells?|sold)\s+\d[\d,]*\s+(?:company\s+)?shares?\b/i.test(blob) ||
    /\bform[\s-]?4\b/i.test(blob)
  );
}

export function hasObjectiveEarningsEvidence(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  return (
    /\b(?<!(?:to|will|expect(?:s|ed)?)\s+)(?:report(?:s|ed)?|announce(?:s|d)?)\s+(?:q[1-4]|first|second|third|fourth|full[- ]year|quarterly).{0,60}(?:results|earnings|loss|revenue|sales)\b/i
      .test(blob) ||
    /\bannounce(?:s|d)?\s+.{0,80}(?:unaudited\s+)?financial\s+results\b/i.test(blob) ||
    /\bbeat(?:s|ing)?\s+(?:(?:the|wall\s+street(?:'s)?)\s+)?(?:q[1-4]\s+|consensus\s+)?(?:earnings|revenue|estimates?|eps|sales)\b/i
      .test(blob) ||
    /\bsurpass(?:es|ed)?\s+(?:q[1-4]\s+)?(?:earnings|revenue|estimates|eps|sales)\b/i.test(blob) ||
    /\bmiss(?:es|ed|ing)\s+(?:(?:the|wall\s+street(?:'s)?)\s+)?(?:q[1-4]\s+|consensus\s+)?(?:revenue|earnings|estimates?|eps|sales)\b/i
      .test(blob) ||
    /\b(?:q[1-4])\s+earnings\s+and\s+revenues?\s+surpass/i.test(blob) ||
    /\breport(?:s|ed)?\s+q[1-4]\s+loss\b/i.test(blob) ||
    /\btopp?(?:ed|s|ing)\s+(?:q[1-4]\s+)?(?:revenue|earnings|sales)\s+estimates?\b/i.test(blob) ||
    /\brais(?:es?|ed|ing)\s+(?:its\s+)?(?:full[- ]year|fy|q[1-4])\s+(?:revenue\s+)?(?:and\s+operating\s+income\s+)?(?:guidance|targets?)\b/i
      .test(blob) ||
    /\b(?:disappointing|cut|lowered|lowers)\s+q[1-4]\s+(?:sales\s+)?guidance\b/i.test(blob)
  );
}

export function hasObjectiveGuidanceEvidence(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  return (
    /\brais(?:es?|ed|ing)\s+(?:20\d{2}\s+)?(?:total\s+)?(?:transacting\s+)?(?:volume|guidance|outlook|targets?)\b/i
      .test(blob) ||
    /\b(?:issues?|issued|updates?|updated|reaffirms?|reaffirmed)\s+guidance\b/i.test(blob)
  );
}

export function hasObjectiveCorporateActionEvidence(
  title: string,
  description?: string | null,
): boolean {
  const blob = blobOf(title, description);
  return (
    /\bdeclar(?:es?|ed|ing)\s+(?:a\s+)?(?:special\s+)?dividend\b/i.test(blob) ||
    /\b(?:stock|share)\s+repurchase\s+(?:authorization|program)\b/i.test(blob) ||
    /\b(?:announces?|authorizes?|approved)\s+.{0,40}(?:buyback|repurchase|tender|split|distribution)\b/i
      .test(blob) ||
    /\b(?:reverse\s+)?(?:stock|share)\s+split\b/i.test(blob) ||
    /\btender\s+offer\b/i.test(blob)
  );
}

export function hasObjectiveFdaEvidence(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  return (
    /\bfda\s+(?:approv(?:es|ed|al)|clear(?:s|ed|ance)|accepts?\s+(?:the\s+)?filing)\b/i.test(blob) ||
    /\b(?:complete\s+response\s+letter|crl)\b/i.test(blob) ||
    /\b(?:pdufa|emergency\s+use\s+authorization)\b/i.test(blob) ||
    /\b(?:phase\s+[123]|clinical)\s+(?:trial\s+)?(?:results?|endpoint)\b/i.test(blob) ||
    /\b(?:breakthrough|fast[- ]track|orphan)\s+designation\b/i.test(blob)
  );
}

export function hasObjectiveMaEvidence(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  const definitiveAgreementToAcquire =
    /\b(?:(?:has\s+)?entered|enters)\s+into\s+(?:a\s+)?definitive\s+agreement\s+to\s+acquire\b/i
      .test(blob) ||
    /(?<!(?:may|could|might|should|considering|exploring)\s+)\b(?:announce(?:s|d)?|signs?|signed)\s+(?:a\s+)?definitive\s+agreement\s+to\s+acquire\b/i
      .test(blob);
  return (
    definitiveAgreementToAcquire ||
    /\bdefinitive\s+(?:merger|acquisition)\s+agreement\b/i.test(blob) ||
    /\b(?:announces?|announced|completes?|completed|closes?|closed)\s+(?:the\s+)?(?:acquisition|merger|transaction)\b/i
      .test(blob) ||
    /\bto\s+sell\s+.{0,80}(?:projects?|assets?|mines?|stakes?|business(?:es)?)\b/i.test(blob) ||
    /\b(?:asset|project)s?\s+(?:sale|purchase)\b/i.test(blob) ||
    /\btake[-\s]private\b/i.test(blob) ||
    /\btender\s+offer\b/i.test(blob)
  );
}

export function hasObjectiveContractEvidence(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  return (
    /\b(?:awarded|wins?|won)\s+(?:a\s+)?(?:material\s+)?(?:contract|order)\b/i.test(blob) ||
    /\b(?:signed|signs|enters?)\s+(?:a\s+)?(?:definitive\s+)?(?:agreement|contract|partnership)\b/i
      .test(blob) ||
    /\b(?:product\s+launch|launches?\s+(?:a\s+)?product)\b/i.test(blob) ||
    /\b(?:customer|supply)\s+agreement\b/i.test(blob)
  );
}

export function hasObjectiveAnalystActionEvidence(
  title: string,
  description?: string | null,
): boolean {
  const blob = blobOf(title, description);
  return (
    /\b(?:upgrad(?:e[sd]?|ing)|downgrad(?:e[sd]?|ing)|initiat(?:es?|ed|ion))\b/i.test(blob) ||
    /\b(?:rating|outlook)\s+(?:change[sd]?|raised|lowered|cut)\b/i.test(blob) ||
    /\bprice\s+target\s+(?:raised|increased|hiked|cut|lowered|reduced)\b/i.test(blob)
  );
}

export function hasObjectiveAnnouncedInvestment(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  return /\bannounces?\s+strategic\s+investment\b/i.test(blob);
}

export function hasObjectiveAnnouncedDeal(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  return (
    /\bannounces?\s+.{0,40}(?:deal|partnership|agreement|transaction)\b/i.test(blob) &&
    !/\bcan\b.{0,40}\b(?:deal|partnership)\b.{0,40}\bsupercharge\b/i.test(blob)
  );
}

export function hasIndependentObjectiveEvent(title: string, description?: string | null): boolean {
  return (
    hasObjectiveEarningsEvidence(title, description) ||
    hasObjectiveGuidanceEvidence(title, description) ||
    hasObjectiveCorporateActionEvidence(title, description) ||
    hasObjectiveFdaEvidence(title, description) ||
    hasObjectiveMaEvidence(title, description) ||
    hasObjectiveContractEvidence(title, description) ||
    hasObjectiveAnalystActionEvidence(title, description) ||
    hasObjectiveAnnouncedInvestment(title, description) ||
    hasObjectiveAnnouncedDeal(title, description)
  );
}

/**
 * Strong editorial / non-event copy. Combinations and stock-recap frames,
 * not a lone word such as "why" or "stock".
 */
export function isEditorialNonEvent(title: string, description?: string | null): boolean {
  const blob = blobOf(title, description);
  const patterns: RegExp[] = [
    /^\s*prediction\s*:/i,
    /\bprediction\s*:/i,
    /\bis\s+.{0,80}\b(?:a|the)\s+(?:good\s+)?buy\b/i,
    /\bshould\s+you\s+(?:buy|sell|hold)\b/i,
    /\bbetter\s+(?:value\s+)?(?:stock|buy)\b/i,
    /\bbest\s+stock/i,
    /\btop\s+(?:dividend\s+)?(?:growth\s+)?stock/i,
    /\bgreat\s+dividend\s+stock\b/i,
    /\bhigh[- ]growth\s+dividend\s+stock\b/i,
    /\bgood\s+investment\b/i,
    /\btime\s+to\s+buy\b/i,
    /\bcan\s+it\s+rebound\b/i,
    /\bwill\s+it\s+gain\b/i,
    /\bcould\s+make\s+you\s+rich\b/i,
    /\bthrough\s+20\d{2}\b/i,
    /\bhere(?:'s| is)\s+how\s+much\s+you(?:'d| would)\s+have\b/i,
    /\bhere(?:'s| is)\s+why\b/i,
    /\bgreen\s+flag\b/i,
    /\bred\s+flag\b/i,
    /\bthinking\s+of\s+buying\b/i,
    /\banalysts?\s+think\b.{0,40}\bgood\s+investment\b/i,
    /\bbrokers?\s+suggest\s+investing\b/i,
    /\bzacks\s+investment\s+ideas\b/i,
    /\bdeclines?\s+more\s+than\s+(?:the\s+)?(?:broader\s+)?market\b/i,
    /\brises?\s+as\s+(?:the\s+)?market\s+takes\s+a\s+dip\b/i,
    /\bregisters?\s+a\s+bigger\s+fall\s+than\s+(?:the\s+)?market\b/i,
    /\bdips?\s+more\s+than\s+(?:the\s+)?broader\s+market\b/i,
    /\bmore\s+significant\s+dip\s+than\s+broader\s+market\b/i,
    /\bwhy\s+.{0,80}\bstock\s+(?:is\s+)?(?:up|jumped|soared|crashed|crashing|rocked)\b/i,
    /\brocked\s+the\s+market\s+last\s+month\b/i,
    /\bpopped\s+\d+%\s+in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    /\bimplied\s+volatility\s+surging\b/i,
    /\bsince\s+last\s+earnings\s+report\b/i,
    /\bearnings\s+estimates?\s+(?:rising|moving|higher)\b/i,
    /\bhold\s+forever\b/i,
    /\b6\s+massive\s+reasons\b/i,
    /\bwhat\s+does\s+".+"\s+actually\s+mean\b/i,
    /\b\d+\s+.{0,40}stocks?\s+to\s+watch\b/i,
    /\bcan\b.{0,80}\b(?:deal|partnership)\b.{0,60}\b(?:supercharge|boost|transform)\b/i,
  ];
  return patterns.some((p) => p.test(blob));
}

/**
 * Advice / retrospective frames that stay commentary even if the body
 * mentions an older print or a generic partnership.
 */
export function isBlockedEditorialFrame(title: string): boolean {
  const patterns: RegExp[] = [
    /\bsince\s+last\s+earnings\b/i,
    /\bwhat\s+to\s+expect\b/i,
    /\bahead\s+of(?:\s+(?:the|its))?\s+earnings\b/i,
    /\bearnings\s+preview\b/i,
    /\bbuy\s+before\s+earnings\b/i,
    /\bcan\s+it\s+rebound\b/i,
    /\bearnings\s+estimates?\s+(?:rising|moving|higher)\b/i,
    /\bwill\s+it\s+gain\b/i,
    /\btime\s+to\s+buy\b/i,
    /\bgreat\s+dividend\s+stock\b/i,
    /\bhigh[- ]growth\s+dividend\s+stock\b/i,
    /\bgood\s+investment\b/i,
    /\bbrokers?\s+suggest\s+investing\b/i,
    /\bzacks\s+investment\s+ideas\b/i,
    /\bdeclines?\s+more\s+than\s+(?:the\s+)?(?:broader\s+)?market\b/i,
    /\brises?\s+as\s+(?:the\s+)?market\s+takes\s+a\s+dip\b/i,
    /\bregisters?\s+a\s+bigger\s+fall\s+than\s+(?:the\s+)?market\b/i,
    /\bdips?\s+more\s+than\s+(?:the\s+)?broader\s+market\b/i,
    /\bmore\s+significant\s+dip\s+than\s+broader\s+market\b/i,
    /\brocked\s+the\s+market\s+last\s+month\b/i,
    /\bpopped\s+\d+%\s+in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    /\bimplied\s+volatility\s+surging\b/i,
    /\bthinking\s+of\s+buying\b/i,
    /\bgreen\s+flag\b/i,
    /\bred\s+flag\b/i,
    /\bwhy\s+.{0,80}\bstock\s+(?:is\s+)?(?:up|jumped|soared)\b/i,
    /\b\d+\s+.{0,40}stocks?\s+to\s+watch\b/i,
    /^\s*can\s+/i,
  ];
  return patterns.some((p) => p.test(title));
}
