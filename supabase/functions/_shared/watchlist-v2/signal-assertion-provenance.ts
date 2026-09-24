// Evidence-bounded user-facing copy for watchlist alerts and AI reads.
// Stocksist does not ingest exchange buyer/seller participant counts or 13F
// accumulation metrics in Watchlist V2 — editorial headlines must not read as
// verified institutional order flow.

const BUYERS_AGAINST_SELLERS_RE =
  /\b(\d[\d,]*)\s+buyers?\s+against\s+(\d[\d,]*)\s+sellers?\b/i;

const INSTITUTIONAL_ACCUMULATION_RE =
  /\binstitutions?\s+(?:are\s+)?accumulat/i;

const INSTITUTIONAL_BUYING_RE =
  /\binstitutional\s+(?:buyers?|accumulation|investors?\s+(?:are\s+)?(?:buying|accumulating))/i;

const BUYER_SELLER_OUTNUMBER_RE =
  /\b(?:buyers?\s+outnumber\s+sellers?|sellers?\s+outnumber\s+buyers?)\b/i;

/** True when text asserts order-flow or institutional accumulation we do not verify. */
export function hasUnsupportedInstitutionalOrderFlowClaim(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    BUYERS_AGAINST_SELLERS_RE.test(t)
    || INSTITUTIONAL_ACCUMULATION_RE.test(t)
    || INSTITUTIONAL_BUYING_RE.test(t)
    || BUYER_SELLER_OUTNUMBER_RE.test(t)
  );
}

function normalizeCount(raw: string): string {
  return raw.replace(/,/g, "");
}

function sourceLabel(sourceName: string | null | undefined): string {
  const s = typeof sourceName === "string" ? sourceName.trim() : "";
  return s ? `${s} headline` : "Provider headline";
}

/**
 * Replace unsupported order-flow / institutional assertions with bounded copy.
 * Pass-through when no such claims are detected.
 */
export function boundWatchlistUserFacingText(
  raw: string,
  ctx?: { sourceName?: string | null },
): string {
  const text = raw.trim();
  if (!text || !hasUnsupportedInstitutionalOrderFlowClaim(text)) return text;

  const src = sourceLabel(ctx?.sourceName);
  const pair = BUYERS_AGAINST_SELLERS_RE.exec(text);
  const hasInstitutional =
    INSTITUTIONAL_ACCUMULATION_RE.test(text)
    || INSTITUTIONAL_BUYING_RE.test(text);

  if (pair) {
    const buyers = normalizeCount(pair[1]);
    const sellers = normalizeCount(pair[2]);
    if (hasInstitutional) {
      return (
        `${src} cites ${buyers} buyers vs ${sellers} sellers and institutional `
        + "accumulation (third-party editorial; not verified order flow or holdings)."
      );
    }
    return (
      `${src} cites ${buyers} buyers vs ${sellers} sellers `
      + "(third-party metric; not verified exchange order flow)."
    );
  }

  if (hasInstitutional) {
    return (
      `${src} mentions institutional accumulation `
      + "(provider editorial; not verified holdings or 13F data)."
    );
  }

  return (
    `${src} includes unverified buyer/seller participation language `
    + "(not a Stocksist-verified metric)."
  );
}

/** Alert reasons for company_event and other watchlist alert types. */
export function boundWatchlistAlertReason(
  reason: string,
  alertType: string,
  ctx?: { sourceName?: string | null; providerHeadline?: string | null },
): string {
  if (alertType !== "company_event") return reason.trim();
  const headline = (ctx?.providerHeadline ?? reason).trim();
  return boundWatchlistUserFacingText(headline, { sourceName: ctx?.sourceName });
}
