import {
  boundWatchlistAlertReason,
  boundWatchlistUserFacingText,
  hasUnsupportedInstitutionalOrderFlowClaim,
} from "./signal-assertion-provenance.ts";

const PRODUCTION_LIKE =
  "324 buyers against 93 sellers: the solar manufacturer institutions are accumulating";

Deno.test("detects production-like buyer/seller and institutional accumulation headline", () => {
  if (!hasUnsupportedInstitutionalOrderFlowClaim(PRODUCTION_LIKE)) {
    throw new Error("expected unsupported claim");
  }
});

Deno.test("bounds company_event alert reason without asserting verified institutional flow", () => {
  const out = boundWatchlistAlertReason(PRODUCTION_LIKE, "company_event", {
    sourceName: "Finnhub",
  });
  if (out.includes(PRODUCTION_LIKE)) throw new Error("raw headline leaked");
  if (!out.includes("324 buyers vs 93 sellers")) throw new Error("missing cited counts");
  if (!out.includes("not verified")) throw new Error("missing provenance disclaimer");
  if (/institutions are accumulating/i.test(out)) {
    throw new Error("unbounded institutional assertion");
  }
});

Deno.test("passes through deterministic market_signal labels", () => {
  const label = "Price crossed above VWAP";
  if (boundWatchlistAlertReason(label, "market_signal") !== label) {
    throw new Error("market_signal label mutated");
  }
});

Deno.test("bounds AI-style explanation echoing headline claims", () => {
  const raw = "Bullish Lean: 324 buyers against 93 sellers show institutions accumulating.";
  const out = boundWatchlistUserFacingText(raw);
  if (/institutions?\s+are\s+accumulating/i.test(out)) {
    throw new Error("unbounded institutional assertion remained");
  }
  if (!out.includes("not verified")) throw new Error("missing provenance disclaimer");
});
