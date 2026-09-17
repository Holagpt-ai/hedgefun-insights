/**
 * Homepage / stock-mover list inclusion policy.
 *
 * Uses authoritative ticker_search.type metadata only. Unknown instrument type
 * fails open on classification (eligible when price is valid). Price sanity
 * remains fail-closed.
 */

export type HomepageMoverRejectionReason =
  | "excluded_instrument_type"
  | "invalid_last_price";

/** Authoritative Polygon / ticker_search types excluded from homepage movers. */
export const HOMEPAGE_MOVER_EXCLUDED_TYPES = new Set([
  "WARRANT",
  "RIGHT",
  "UNIT",
]);

/** Explicitly allowed when metadata is present. */
export const HOMEPAGE_MOVER_PREFERRED_TYPES = new Set(["CS", "ADRC"]);

export function isExcludedHomepageMoverInstrument(
  instrumentType: string | null | undefined,
): boolean {
  if (!instrumentType || typeof instrumentType !== "string") return false;
  return HOMEPAGE_MOVER_EXCLUDED_TYPES.has(instrumentType.trim().toUpperCase());
}

export function shouldExcludeHomepageMover(input: {
  symbol: string | null | undefined;
  price: number | null | undefined;
  instrumentType?: string | null;
}): HomepageMoverRejectionReason | null {
  const symbol =
    typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "";
  if (!symbol) return "invalid_last_price";

  const price = input.price;
  if (
    price === null ||
    price === undefined ||
    !Number.isFinite(price) ||
    !(price > 0)
  ) {
    return "invalid_last_price";
  }

  if (isExcludedHomepageMoverInstrument(input.instrumentType)) {
    return "excluded_instrument_type";
  }

  return null;
}
